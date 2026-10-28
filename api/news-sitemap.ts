import { initResponseHelpers } from './_helpers.ts';
import {
  escapeXml,
  fetchArticlesStrict,
  SitemapDatabaseError,
} from './sitemap.ts';
import {
  getCachedNewsSitemap,
  setCachedNewsSitemap,
  getSitemapCacheVersion,
  type NewsSitemapCacheKey,
} from './_sitemap_cache.ts';
import type { Article } from '../src/types.ts';
import {
  SITE_DOMAIN,
  SITE_NAME,
  hasPublishedUkrainianVersion,
  hasPublishedEnglishVersion,
  resolveArticlePublishedIso,
  stripHtml,
} from '../src/utils/seo.ts';

export const NEWS_SITEMAP_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // 48 годин згідно з рекомендаціями Google News
export const MAX_NEWS_SITEMAP_URLS = 1000; // Ліміт Google News Sitemap (до 1000 URL у новинній карті)
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // Допуск 5 хв на розбіжність годинників серверів

export type NewsLanguageCode = 'uk' | 'en';

export interface NewsSitemapEntry {
  loc: string;
  publicationName: string;
  language: NewsLanguageCode;
  publicationDate: string;
  title: string;
}

export interface CollectNewsSitemapOptions {
  nowMs?: number;
  windowMs?: number;
  languageFilter?: NewsLanguageCode | null;
  publicationName?: string;
  maxUrls?: number;
}

export { SitemapDatabaseError };

/**
 * Перевіряє, чи належить конкретна мовна версія матеріалу саме до рубрики новин
 * («Новини», «Новина», «News»), виключаючи статті, огляди, есе тощо.
 */
export function isNewsRubricForLanguage(
  article: Article,
  version: NewsLanguageCode
): boolean {
  const rawUa =
    Array.isArray(article.categories) && article.categories.length > 0
      ? article.categories
      : article.category
      ? article.category.split(',')
      : [];

  const rawEn =
    Array.isArray(article.categoriesEn) && article.categoriesEn.length > 0
      ? article.categoriesEn
      : article.categoryEn
      ? article.categoryEn.split(',')
      : [];

  const listToCheck = version === 'en' ? (rawEn.length > 0 ? rawEn : rawUa) : rawUa;

  return listToCheck.some((cat) => {
    const normalized = String(cat || '').trim().toLowerCase();
    return normalized === 'новини' || normalized === 'новина' || normalized === 'news';
  });
}

/**
 * Визначає фактичну мову тексту статті (ISO 639-1: 'uk' або 'en') на основі реального вмісту заголовка і тексту,
 * щоб ніколи не позначити англомовний матеріал як український або український як англійський.
 */
export function detectActualArticleLanguage(
  title: string,
  content: string,
  declaredVersion: NewsLanguageCode
): NewsLanguageCode {
  const sample = `${stripHtml(title)} ${stripHtml(content)}`.trim();
  const cyrMatches = sample.match(/[а-яіїєґА-ЯІЇЄҐ]/g);
  const latMatches = sample.match(/[a-zA-Z]/g);
  const cyrCount = cyrMatches ? cyrMatches.length : 0;
  const latCount = latMatches ? latMatches.length : 0;

  if (declaredVersion === 'uk') {
    // Якщо в основних полях відсутня кирилиця, але присутній змістовний латинський текст — матеріал фактично англійською
    if (cyrCount === 0 && latCount >= 3) {
      return 'en';
    }
    return 'uk';
  }

  // declaredVersion === 'en'
  // Якщо в англійській вкладці немає латиниці або кирилиця переважає латиницю — текст фактично українською
  if ((latCount === 0 && cyrCount >= 3) || (cyrCount > latCount && cyrCount >= 5)) {
    return 'uk';
  }
  return 'en';
}

/**
 * Перевіряє, чи потрапляє дата першої фактичної публікації статті у 48-годинне вікно Google News.
 * Використовує ВИКЛЮЧНО дату першої публікації (createdAt / date), ніколи не використовує updatedAt.
 */
export function isWithinNewsPublicationWindow(
  publishedIso: string | undefined,
  nowMs: number = Date.now(),
  windowMs: number = NEWS_SITEMAP_WINDOW_MS
): boolean {
  if (!publishedIso) return false;

  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(publishedIso);
  const parsedMs = isDateOnly
    ? new Date(`${publishedIso}T00:00:00.000Z`).getTime()
    : new Date(publishedIso).getTime();

  if (isNaN(parsedMs) || parsedMs <= 0) {
    return false;
  }

  // Для дати без часу допускаємо добу зсуву часового поясу, для повного ISO timestamp — до 5 хвилин розбіжності годинника
  const maxFutureTolerance = isDateOnly ? 24 * 60 * 60 * 1000 : CLOCK_SKEW_TOLERANCE_MS;
  if (parsedMs > nowMs + maxFutureTolerance) {
    return false;
  }

  const ageMs = nowMs - parsedMs;
  return ageMs <= windowMs;
}

/**
 * Формує відсортований за спаданням часу першої публікації список новинних записів для news-sitemap.xml
 */
export function collectNewsSitemapEntries(
  articles: Article[],
  options?: CollectNewsSitemapOptions
): NewsSitemapEntry[] {
  const nowMs = options?.nowMs ?? Date.now();
  const windowMs = options?.windowMs ?? NEWS_SITEMAP_WINDOW_MS;
  const languageFilter = options?.languageFilter ?? null;
  const publicationName = (options?.publicationName || SITE_NAME).trim() || SITE_NAME;
  const maxUrls = options?.maxUrls ?? MAX_NEWS_SITEMAP_URLS;

  if (!Array.isArray(articles) || articles.length === 0) {
    return [];
  }

  interface CandidateItem {
    entry: NewsSitemapEntry;
    sortTimeMs: number;
    articleId: string;
  }

  const candidates: CandidateItem[] = [];
  const seenLocs = new Set<string>();

  for (const article of articles) {
    if (!article || typeof article !== 'object') continue;
    const cleanId = String(article.id || '').trim();
    if (!cleanId) continue;

    // Дата першої фактичної публікації (createdAt, без використання updatedAt та без штучного new Date())
    const publishedIso = resolveArticlePublishedIso(article);
    if (!publishedIso || !isWithinNewsPublicationWindow(publishedIso, nowMs, windowMs)) {
      continue;
    }

    const sortTimeMs = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(publishedIso)
        ? `${publishedIso}T00:00:00.000Z`
        : publishedIso
    ).getTime();

    const pubUa = hasPublishedUkrainianVersion(article);
    const pubEn = hasPublishedEnglishVersion(article);

    if (!pubUa && !pubEn) {
      continue;
    }

    const baseArticleUrl = `${SITE_DOMAIN}/article/${encodeURIComponent(cleanId)}`;
    let emittedUkrainianText = false;

    // 1. Основна (українська) опублікована версія статті
    if (pubUa && isNewsRubricForLanguage(article, 'uk')) {
      const cleanTitleUa = stripHtml(article.title);
      const cleanBodyUa = stripHtml(article.content);
      if (cleanTitleUa && cleanBodyUa) {
        const actualLang = detectActualArticleLanguage(article.title, article.content, 'uk');
        if (!languageFilter || actualLang === languageFilter) {
          if (!seenLocs.has(baseArticleUrl)) {
            seenLocs.add(baseArticleUrl);
            candidates.push({
              entry: {
                loc: baseArticleUrl,
                publicationName,
                language: actualLang,
                publicationDate: publishedIso,
                title: cleanTitleUa,
              },
              sortTimeMs,
              articleId: cleanId,
            });
          }
        }
        if (actualLang === 'uk') {
          emittedUkrainianText = true;
        }
      }
    }

    // 2. Англійська опублікована версія статті (окремий канонічний URL ?lang=en при двомовності або базовий URL для EN-only)
    if (pubEn && isNewsRubricForLanguage(article, 'en')) {
      const cleanTitleEn = stripHtml(article.titleEn);
      const cleanBodyEn = stripHtml(article.contentEn);
      if (cleanTitleEn && cleanBodyEn) {
        const actualLangEn = detectActualArticleLanguage(
          article.titleEn || '',
          article.contentEn || '',
          'en'
        );

        // Якщо в EN-версію випадково скопіювали неперекладений український текст, коли UA-версія вже опублікована — не створюємо дублікат
        if (actualLangEn === 'uk' && (pubUa || emittedUkrainianText)) {
          continue;
        }

        const canonicalEnUrl = pubUa ? `${baseArticleUrl}?lang=en` : baseArticleUrl;
        if (!languageFilter || actualLangEn === languageFilter) {
          if (!seenLocs.has(canonicalEnUrl)) {
            seenLocs.add(canonicalEnUrl);
            candidates.push({
              entry: {
                loc: canonicalEnUrl,
                publicationName,
                language: actualLangEn,
                publicationDate: publishedIso,
                title: cleanTitleEn,
              },
              sortTimeMs,
              articleId: cleanId,
            });
          }
        }
      }
    }
  }

  candidates.sort((a, b) => {
    if (b.sortTimeMs !== a.sortTimeMs) {
      return b.sortTimeMs - a.sortTimeMs;
    }
    if (b.articleId !== a.articleId) {
      return b.articleId.localeCompare(a.articleId);
    }
    return a.entry.loc.localeCompare(b.entry.loc);
  });

  return candidates.slice(0, maxUrls).map((c) => c.entry);
}

function renderNewsUrlItemXml(entry: NewsSitemapEntry): string {
  return [
    '  <url>',
    `    <loc>${escapeXml(entry.loc)}</loc>`,
    '    <news:news>',
    '      <news:publication>',
    `        <news:name>${escapeXml(entry.publicationName)}</news:name>`,
    `        <news:language>${escapeXml(entry.language)}</news:language>`,
    '      </news:publication>',
    `      <news:publication_date>${escapeXml(entry.publicationDate)}</news:publication_date>`,
    `      <news:title>${escapeXml(entry.title)}</news:title>`,
    '    </news:news>',
    '  </url>',
  ].join('\n');
}

/**
 * Генерує валідний XML-документ відповідно до Sitemap Protocol 0.9 та Google News Sitemap 0.9
 */
export function renderNewsSitemapXml(entries: NewsSitemapEntry[]): string {
  const body = entries.map(renderNewsUrlItemXml).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
    ...(body ? [body] : []),
    '</urlset>',
    '',
  ].join('\n');
}

function parseRequestedLanguageFilter(
  req: any
): { valid: true; filter: NewsLanguageCode | null } | { valid: false } {
  let rawLang: string | undefined;

  if (req?.query?.lang !== undefined && req?.query?.lang !== null) {
    rawLang = String(req.query.lang).trim().toLowerCase();
  } else if (req?.params?.lang !== undefined && req?.params?.lang !== null) {
    rawLang = String(req.params.lang).trim().toLowerCase();
  } else if (typeof req?.url === 'string') {
    const pathMatch = req.url.match(/\/news-sitemap-([a-zA-Z-]+)\.xml/i);
    if (pathMatch) {
      rawLang = pathMatch[1].trim().toLowerCase();
    } else if (req.url.includes('?')) {
      try {
        const parsed = new URL(req.url, SITE_DOMAIN);
        const qLang = parsed.searchParams.get('lang');
        if (qLang !== null) {
          rawLang = qLang.trim().toLowerCase();
        }
      } catch {}
    }
  }

  if (rawLang === undefined || rawLang === '') {
    return { valid: true, filter: null };
  }

  if (rawLang === 'uk' || rawLang === 'ua') {
    return { valid: true, filter: 'uk' };
  }

  if (rawLang === 'en') {
    return { valid: true, filter: 'en' };
  }

  return { valid: false };
}

export interface NewsSitemapHandlerOptions {
  loadArticles?: () => Promise<Article[]>;
  now?: () => number;
  windowMs?: number;
  disableCache?: boolean;
}

export function createNewsSitemapHandler(options?: NewsSitemapHandlerOptions) {
  return async function newsSitemapRequestHandler(req: any, res: any) {
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

    const parsedLang = parseRequestedLanguageFilter(req);
    if (!parsedLang.valid) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res
        .status(400)
        .send('Invalid language filter. Supported ISO 639-1 values: uk, en');
    }

    const cacheKey: NewsSitemapCacheKey = parsedLang.filter ?? 'all';
    const useCache =
      !options?.disableCache &&
      !options?.loadArticles &&
      !options?.now &&
      options?.windowMs === undefined;

    try {
      let xmlToSend = useCache ? getCachedNewsSitemap(cacheKey)?.xml ?? null : null;

      if (xmlToSend === null) {
        const versionBeforeFetch = getSitemapCacheVersion();
        const loader = options?.loadArticles ?? fetchArticlesStrict;
        const articles = await loader();
        const nowMs = options?.now ? options.now() : Date.now();
        const entries = collectNewsSitemapEntries(articles, {
          nowMs,
          windowMs: options?.windowMs,
          languageFilter: parsedLang.filter,
        });
        xmlToSend = renderNewsSitemapXml(entries);

        if (useCache) {
          setCachedNewsSitemap(cacheKey, xmlToSend, versionBeforeFetch);
        }
      }

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      // Коротке кешування (30 с на CDN edge, 0 с у браузері), щоб свіжі новини оперативно потрапляли до Google News
      res.setHeader(
        'Cache-Control',
        'public, max-age=0, s-maxage=30, stale-while-revalidate=30'
      );

      if (req.method === 'HEAD') {
        return res.status(200).end();
      }

      return res.status(200).send(xmlToSend);
    } catch (err: any) {
      console.warn('News sitemap generation error, falling back to cached or empty news XML:', err);
      const cached = getCachedNewsSitemap(cacheKey)?.xml;
      const xmlFallback = cached || renderNewsSitemapXml([]);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=30');
      if (req.method === 'HEAD') {
        return res.status(200).end();
      }
      return res.status(200).send(xmlFallback);
    }
  };
}

const defaultNewsSitemapHandler = createNewsSitemapHandler();
export default defaultNewsSitemapHandler;
