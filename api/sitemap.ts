import fs from 'fs';
import path from 'path';
import { getNeonSql } from './_db.ts';
import { initResponseHelpers } from './_helpers.ts';
import {
  getCachedSitemap,
  setCachedSitemap,
  getSitemapCacheVersion,
} from './_sitemap_cache.ts';
import type { Article, NavigationCategory, SitePagesData } from '../src/types.ts';
import { DEFAULT_PAGES_DATA } from '../src/types.ts';
import { DEFAULT_NAV_CATEGORIES, matchesNavCategory } from '../src/utils/categories.ts';
import {
  SITE_DOMAIN,
  hasPublishedUkrainianVersion,
  hasPublishedEnglishVersion,
  isNewsArticle,
  resolveArticleModifiedIso,
  toValidIso8601,
} from '../src/utils/seo.ts';
import { getArticles } from './articles.ts';

export const MAX_URLS_PER_SITEMAP = 45_000;
export const MAX_BYTES_PER_SITEMAP = 45 * 1024 * 1024; // 45 MB (безпечний запас до ліміту 50 MB Sitemap Protocol)

const RESERVED_SLUGS = new Set([
  'admin',
  'editor',
  'login',
  'api',
  'search',
  'article',
  'uploads',
  'about',
  'contacts',
  'news',
  'popular',
  'robots.txt',
  'sitemap.xml',
  'news-sitemap.xml',
]);

export interface SitemapUrlEntry {
  loc: string;
  lastmod?: string;
}

export interface SitemapSourceData {
  articles: Article[];
  categories: NavigationCategory[];
  pagesUpdatedAt: {
    about?: string;
    contacts?: string;
  };
  staticPages?: SitePagesData;
}

export interface BuiltSitemapDocuments {
  isIndex: boolean;
  rootXml: string;
  partsXml: string[];
}

export class SitemapDatabaseError extends Error {
  readonly causeError?: unknown;

  constructor(message: string, causeError?: unknown) {
    super(message);
    this.name = 'SitemapDatabaseError';
    this.causeError = causeError;
  }
}

/**
 * Екранування спеціальних символів згідно зі специфікацією Sitemap Protocol 0.9
 */
export function escapeXml(value: string): string {
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseJsonArray(val: unknown): string[] | undefined {
  if (!val) return undefined;
  if (Array.isArray(val)) {
    return val.map((s) => String(s).trim().replace(/^#+/, '')).filter(Boolean);
  }
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim().replace(/^#+/, '')).filter(Boolean);
      }
    } catch {
      return val.split(',').map((s) => s.trim().replace(/^#+/, '')).filter(Boolean);
    }
  }
  return undefined;
}

/**
 * Перевіряє, чи налаштовано змінні середовища для підключення до PostgreSQL
 */
export function hasConfiguredDatabaseEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const dbKeys = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_URL_NO_SSL',
  ] as const;

  for (const key of dbKeys) {
    if (typeof env[key] === 'string' && env[key]!.trim().length > 0) {
      return true;
    }
  }

  if (env.PGUSER?.trim() && env.PGHOST?.trim() && env.PGDATABASE?.trim()) {
    return true;
  }

  return false;
}

async function executeStrictSql<T>(
  sql: any,
  queryFn: (client: any) => Promise<T>,
  timeoutMs = 8000
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      queryFn(sql),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new SitemapDatabaseError('Перевищено час очікування відповіді бази даних PostgreSQL'));
        }, timeoutMs);
      }),
    ]);
  } catch (err: any) {
    if (err instanceof SitemapDatabaseError) throw err;
    throw new SitemapDatabaseError(
      `Помилка запиту до бази даних PostgreSQL: ${err?.message || String(err)}`,
      err
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readJsonFileStrict<T>(candidatePaths: string[], entityLabel: string): T | null {
  let lastParseError: unknown = null;

  for (const filePath of candidatePaths) {
    let exists = false;
    try {
      exists = fs.existsSync(filePath);
    } catch (err) {
      throw new SitemapDatabaseError(`Помилка доступу до файлу ${entityLabel}`, err);
    }

    if (!exists) continue;

    let rawContent = '';
    try {
      rawContent = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      throw new SitemapDatabaseError(`Не вдалося прочитати файл ${entityLabel}`, err);
    }

    if (!rawContent.trim()) continue;

    try {
      return JSON.parse(rawContent) as T;
    } catch (err) {
      lastParseError = err;
    }
  }

  if (lastParseError) {
    throw new SitemapDatabaseError(`Пошкоджено формат даних у сховищі ${entityLabel}`, lastParseError);
  }

  return null;
}

/**
 * Серверний адаптер суворого читання статей (використовує єдине джерело правди getArticles).
 */
export async function fetchArticlesStrict(): Promise<Article[]> {
  try {
    const articles = await getArticles();
    if (Array.isArray(articles)) {
      return articles;
    }
  } catch (err: any) {
    console.warn('getArticles notice in sitemap:', err?.message || err);
  }

  const dataDir = path.resolve(process.cwd(), 'data');
  const articlesPaths = ['/tmp/impart_articles.json', path.join(dataDir, 'articles.json')];
  const localArticlesRaw = readJsonFileStrict<Article[]>(articlesPaths, 'articles');
  if (localArticlesRaw !== null && !Array.isArray(localArticlesRaw)) {
    return [];
  }
  return localArticlesRaw || [];
}

/**
 * Серверний адаптер читання актуальних публічних даних для генерації sitemap.xml.
 * Не маскує збої БД під порожній список статей.
 */
export async function fetchSitemapSourceData(): Promise<SitemapSourceData> {
  const dataDir = path.resolve(process.cwd(), 'data');
  const categoriesPaths = ['/tmp/impart_categories.json', path.join(dataDir, 'categories.json')];
  const pagesPaths = ['/tmp/impart_pages.json', path.join(dataDir, 'pages.json')];

  const articles = await fetchArticlesStrict();

  let categories: NavigationCategory[] = [...DEFAULT_NAV_CATEGORIES];
  let pagesUpdatedAt: { about?: string; contacts?: string } = {};
  let staticPages: SitePagesData = {
    about: { ...DEFAULT_PAGES_DATA.about },
    contacts: { ...DEFAULT_PAGES_DATA.contacts },
  };

  if (hasConfiguredDatabaseEnv()) {
    try {
      const sql = getNeonSql();
      if (sql) {
        const settingRows = await executeStrictSql<any[]>(sql, async (client) => {
          return await client`
            SELECT key, value, updated_at AS "updatedAt"
            FROM site_settings
            WHERE key IN ('nav_categories', 'static_pages');
          `;
        }, 4000);

        for (const row of settingRows || []) {
          if (row.key === 'nav_categories' && row.value) {
            const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
            if (Array.isArray(parsed) && parsed.length > 0) {
              categories = parsed;
            }
          } else if (row.key === 'static_pages' && row.value) {
            const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
            if (parsed && typeof parsed === 'object') {
              staticPages = {
                about: { ...DEFAULT_PAGES_DATA.about, ...(parsed.about || {}) },
                contacts: { ...DEFAULT_PAGES_DATA.contacts, ...(parsed.contacts || {}) },
              };
            }
            pagesUpdatedAt = {
              about: toValidIso8601(parsed?.about?.updatedAt || (row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined)),
              contacts: toValidIso8601(parsed?.contacts?.updatedAt || (row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined)),
            };
          }
        }

        return {
          articles,
          categories,
          pagesUpdatedAt,
          staticPages,
        };
      }
    } catch (err: any) {
      console.warn('Neon query notice in sitemap, falling back to local files:', err?.message || err);
    }
  }

  // Режим локального серверного сховища (коли зовнішня СУБД не підключена у змінних середовища)
  const localCategoriesRaw = readJsonFileStrict<NavigationCategory[]>(categoriesPaths, 'categories');
  if (Array.isArray(localCategoriesRaw) && localCategoriesRaw.length > 0) {
    categories = localCategoriesRaw;
  }

  const localPagesRaw = readJsonFileStrict<any>(pagesPaths, 'pages');
  staticPages = {
    about: { ...DEFAULT_PAGES_DATA.about, ...(localPagesRaw?.about || {}) },
    contacts: { ...DEFAULT_PAGES_DATA.contacts, ...(localPagesRaw?.contacts || {}) },
  };
  pagesUpdatedAt = {
    about: toValidIso8601(localPagesRaw?.about?.updatedAt),
    contacts: toValidIso8601(localPagesRaw?.contacts?.updatedAt),
  };

  return {
    articles,
    categories,
    pagesUpdatedAt,
    staticPages,
  };
}

/**
 * Повертає достовірний ISO 8601 timestamp останньої зміни статті (updatedAt або createdAt) або undefined
 */
function getReliableArticleLastmod(article: Article): string | undefined {
  const publishedIso = toValidIso8601(article.createdAt);
  const modifiedIso = resolveArticleModifiedIso(article, publishedIso);
  return modifiedIso || publishedIso;
}

function getLatestIsoTimestamp(timestamps: Array<string | undefined>): string | undefined {
  let maxMs = -1;
  let maxIso: string | undefined;

  for (const ts of timestamps) {
    if (!ts) continue;
    const ms = new Date(ts).getTime();
    if (!isNaN(ms) && ms > maxMs) {
      maxMs = ms;
      maxIso = ts;
    }
  }

  return maxIso;
}

function isPubliclyIndexableArticle(article: Article): boolean {
  if (!article || typeof article !== 'object') return false;
  const id = String(article.id || '').trim();
  if (!id) return false;

  const pubUa = hasPublishedUkrainianVersion(article);
  const pubEn = hasPublishedEnglishVersion(article);
  return pubUa || pubEn;
}

function isValidCategorySlug(slug?: string): slug is string {
  if (!slug || typeof slug !== 'string') return false;
  const clean = slug.trim();
  if (!clean || clean.includes('/') || clean.includes('?') || clean.includes('#')) return false;
  if (RESERVED_SLUGS.has(clean.toLowerCase())) return false;
  return /^[a-zA-Z0-9_-]+$/.test(clean);
}

/**
 * Формує канонічний список індексованих публічних URL-адрес для sitemap
 */
export function collectSitemapEntries(source: SitemapSourceData): SitemapUrlEntry[] {
  const entriesMap = new Map<string, SitemapUrlEntry>();

  const addEntry = (loc: string, lastmod?: string) => {
    if (!loc.startsWith(`${SITE_DOMAIN}/`) && loc !== SITE_DOMAIN) return;
    if (!entriesMap.has(loc)) {
      entriesMap.set(loc, lastmod ? { loc, lastmod } : { loc });
    }
  };

  // Відбираємо виключно опубліковані статті та сортуємо за спаданням часу створення
  const publishedArticles = (source.articles || [])
    .filter(isPubliclyIndexableArticle)
    .sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() || 0 : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() || 0 : 0;
      if (timeB !== timeA) return timeB - timeA;
      return String(b.id).localeCompare(String(a.id));
    });

  const allArticleLastmods = publishedArticles.map(getReliableArticleLastmod);
  const latestSiteLastmod = getLatestIsoTimestamp([
    ...allArticleLastmods,
    source.pagesUpdatedAt?.about,
    source.pagesUpdatedAt?.contacts,
  ]);

  // 1. Головна сторінка (canonical: https://www.theimpart.com/)
  addEntry(`${SITE_DOMAIN}/`, latestSiteLastmod);

  // 2. Публічний розділ новин (/news)
  const newsArticles = publishedArticles.filter((a) => isNewsArticle(a, false));
  const latestNewsLastmod = getLatestIsoTimestamp(newsArticles.map(getReliableArticleLastmod));
  addEntry(`${SITE_DOMAIN}/news`, latestNewsLastmod);

  // 3. Доступні навігаційні категорії з БД (/articles, /reviews та кастомні категорії редакції)
  const sortedCategories = [...(source.categories || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );
  for (const cat of sortedCategories) {
    if (!isValidCategorySlug(cat?.slug)) continue;
    const slug = cat.slug.trim();
    const matchingArticles = publishedArticles.filter((a) => matchesNavCategory(a, cat));
    const catLastmod = getLatestIsoTimestamp(matchingArticles.map(getReliableArticleLastmod)) || latestSiteLastmod;
    addEntry(`${SITE_DOMAIN}/${encodeURIComponent(slug)}`, catLastmod);
  }

  // 4. Публічний розділ популярних матеріалів (/popular)
  const latestArticlesOnlyLastmod = getLatestIsoTimestamp(allArticleLastmods) || latestSiteLastmod;
  addEntry(`${SITE_DOMAIN}/popular`, latestArticlesOnlyLastmod);

  // 5. Важливі статичні сторінки видання (/about, /contacts)
  addEntry(`${SITE_DOMAIN}/about`, source.pagesUpdatedAt?.about || latestSiteLastmod);
  addEntry(`${SITE_DOMAIN}/contacts`, source.pagesUpdatedAt?.contacts || latestSiteLastmod);

  // 6. Опубліковані статті (/article/:id)
  for (const article of publishedArticles) {
    const cleanId = String(article.id).trim();
    const canonicalArticleUrl = `${SITE_DOMAIN}/article/${encodeURIComponent(cleanId)}`;
    const articleLastmod = getReliableArticleLastmod(article);
    addEntry(canonicalArticleUrl, articleLastmod);
  }

  return Array.from(entriesMap.values());
}

function renderUrlItemXml(entry: SitemapUrlEntry): string {
  const lines = ['  <url>', `    <loc>${escapeXml(entry.loc)}</loc>`];
  if (entry.lastmod) {
    lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
  }
  lines.push('  </url>');
  return lines.join('\n');
}

export function renderUrlsetXml(entries: SitemapUrlEntry[]): string {
  const body = entries.map(renderUrlItemXml).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...(body ? [body] : []),
    '</urlset>',
    '',
  ].join('\n');
}

export function renderSitemapIndexXml(chunks: SitemapUrlEntry[][]): string {
  const items = chunks.map((chunk, idx) => {
    const partNumber = idx + 1;
    const partLoc = `${SITE_DOMAIN}/sitemap-${partNumber}.xml`;
    const partLastmod = getLatestIsoTimestamp(chunk.map((e) => e.lastmod));
    const lines = ['  <sitemap>', `    <loc>${escapeXml(partLoc)}</loc>`];
    if (partLastmod) {
      lines.push(`    <lastmod>${escapeXml(partLastmod)}</lastmod>`);
    }
    lines.push('  </sitemap>');
    return lines.join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    items.join('\n'),
    '</sitemapindex>',
    '',
  ].join('\n');
}

/**
 * Будує XML-документ(и) карти сайту.
 * Якщо кількість URL або розмір перевищує ліміти одного файлу Sitemap Protocol —
 * автоматично формує sitemapindex та окремі секції sitemap-1.xml ... sitemap-N.xml.
 */
export function buildSitemapDocuments(
  entries: SitemapUrlEntry[],
  options?: {
    maxUrlsPerSitemap?: number;
    maxBytesPerSitemap?: number;
  }
): BuiltSitemapDocuments {
  const maxUrls = options?.maxUrlsPerSitemap ?? MAX_URLS_PER_SITEMAP;
  const maxBytes = options?.maxBytesPerSitemap ?? MAX_BYTES_PER_SITEMAP;

  const wrapperOverheadBytes = 160;
  const chunks: SitemapUrlEntry[][] = [];
  let currentChunk: SitemapUrlEntry[] = [];
  let currentBytes = wrapperOverheadBytes;

  for (const entry of entries) {
    const itemXml = renderUrlItemXml(entry) + '\n';
    const itemBytes = Buffer.byteLength(itemXml, 'utf-8');

    const exceedsCount = currentChunk.length >= maxUrls;
    const exceedsBytes = currentChunk.length > 0 && currentBytes + itemBytes > maxBytes;

    if (exceedsCount || exceedsBytes) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBytes = wrapperOverheadBytes;
    }

    currentChunk.push(entry);
    currentBytes += itemBytes;
  }

  if (currentChunk.length > 0 || chunks.length === 0) {
    chunks.push(currentChunk);
  }

  if (chunks.length <= 1) {
    const xml = renderUrlsetXml(chunks[0] || []);
    return {
      isIndex: false,
      rootXml: xml,
      partsXml: [xml],
    };
  }

  return {
    isIndex: true,
    rootXml: renderSitemapIndexXml(chunks),
    partsXml: chunks.map((chunk) => renderUrlsetXml(chunk)),
  };
}

function extractRequestedPart(req: any): number | null {
  const rawParam = req?.query?.part ?? req?.params?.part;
  if (rawParam !== undefined && rawParam !== null && String(rawParam).trim() !== '') {
    const num = Number(String(rawParam).trim());
    return Number.isInteger(num) ? num : -1;
  }

  if (typeof req?.url === 'string') {
    const pathMatch = req.url.match(/\/sitemap-([^/?#.]+)\.xml/i);
    if (pathMatch) {
      const num = Number(pathMatch[1]);
      return Number.isInteger(num) ? num : -1;
    }
    if (req.url.includes('?')) {
      try {
        const parsed = new URL(req.url, SITE_DOMAIN);
        const qPart = parsed.searchParams.get('part');
        if (qPart !== null) {
          const num = Number(qPart);
          return Number.isInteger(num) ? num : -1;
        }
      } catch {}
    }
  }

  return null;
}

export interface SitemapHandlerOptions {
  loadSourceData?: () => Promise<SitemapSourceData>;
  maxUrlsPerSitemap?: number;
  maxBytesPerSitemap?: number;
  disableCache?: boolean;
}

export function createSitemapHandler(options?: SitemapHandlerOptions) {
  return async function sitemapRequestHandler(req: any, res: any) {
    initResponseHelpers(res);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(405).send('Method Not Allowed');
    }

    const requestedPart = extractRequestedPart(req);
    if (requestedPart !== null && requestedPart < 1) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).send('Sitemap part not found');
    }

    const useCache =
      !options?.disableCache &&
      !options?.loadSourceData &&
      options?.maxUrlsPerSitemap === undefined &&
      options?.maxBytesPerSitemap === undefined;

    try {
      let built = useCache ? getCachedSitemap() : null;

      if (!built) {
        const versionBeforeFetch = getSitemapCacheVersion();
        const loader = options?.loadSourceData ?? fetchSitemapSourceData;
        const sourceData = await loader();
        const entries = collectSitemapEntries(sourceData);
        const generated = buildSitemapDocuments(entries, {
          maxUrlsPerSitemap: options?.maxUrlsPerSitemap,
          maxBytesPerSitemap: options?.maxBytesPerSitemap,
        });

        if (useCache) {
          setCachedSitemap(generated, versionBeforeFetch);
        }

        built = {
          ...generated,
          generatedAt: Date.now(),
        };
      }

      let xmlToSend: string;
      if (requestedPart !== null) {
        if (!built.isIndex || requestedPart > built.partsXml.length) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          return res.status(404).send('Sitemap part not found');
        }
        xmlToSend = built.partsXml[requestedPart - 1];
      } else {
        xmlToSend = built.rootXml;
      }

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');

      if (req.method === 'HEAD') {
        return res.status(200).end();
      }

      return res.status(200).send(xmlToSend);
    } catch (err: any) {
      console.warn('Sitemap generation error, falling back to cached or core XML:', err);
      const cached = getCachedSitemap();
      if (cached && cached.rootXml) {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');
        if (req.method === 'HEAD') return res.status(200).end();
        return res.status(200).send(cached.rootXml);
      }

      // Резервний валідний XML з основними сторінками видання (гарантує 200 OK для Google Search Console)
      const fallbackXml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `  <url><loc>${SITE_DOMAIN}/</loc></url>`,
        `  <url><loc>${SITE_DOMAIN}/news</loc></url>`,
        `  <url><loc>${SITE_DOMAIN}/articles</loc></url>`,
        `  <url><loc>${SITE_DOMAIN}/reviews</loc></url>`,
        `  <url><loc>${SITE_DOMAIN}/popular</loc></url>`,
        `  <url><loc>${SITE_DOMAIN}/about</loc></url>`,
        `  <url><loc>${SITE_DOMAIN}/contacts</loc></url>`,
        '</urlset>',
        '',
      ].join('\n');

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');
      if (req.method === 'HEAD') return res.status(200).end();
      return res.status(200).send(fallbackXml);
    }
  };
}

const defaultSitemapHandler = createSitemapHandler();
export default defaultSitemapHandler;
