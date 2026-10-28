import fs from 'fs';
import path from 'path';
import { safeExecuteSql, executeSqlStrict } from './_db.ts';
import { verifyAdminToken, extractToken } from './_auth_utils.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';
import { invalidateSitemapCache } from './_sitemap_cache.ts';
import categoriesHandler, { getNavCategories, saveNavCategories } from './_categories.ts';
import taxonomiesHandler, { getTaxonomies, saveTaxonomies } from './_taxonomies.ts';
import pagesHandler, { getPages, savePages } from './_pages.ts';

export {
  getNavCategories,
  saveNavCategories,
  getTaxonomies,
  saveTaxonomies,
  getPages,
  savePages,
};

export interface SocialLinksSet {
  telegram?: string;
  instagram?: string;
  x?: string;
  youtube?: string;
  threads?: string;
  facebook?: string;
}

export interface SiteSocialLinks {
  ua: SocialLinksSet;
  en: SocialLinksSet;
}

export const DEFAULT_SOCIAL_LINKS: SiteSocialLinks = {
  ua: {
    telegram: '',
    instagram: '',
    x: '',
    youtube: '',
    threads: '',
    facebook: '',
  },
  en: {
    telegram: '',
    instagram: '',
    x: '',
    youtube: '',
    threads: '',
    facebook: '',
  },
};

function sanitizeSocialSet(raw: any): SocialLinksSet {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    telegram: typeof obj.telegram === 'string' ? obj.telegram.trim() : '',
    instagram: typeof obj.instagram === 'string' ? obj.instagram.trim() : '',
    x: typeof obj.x === 'string' ? obj.x.trim() : '',
    youtube: typeof obj.youtube === 'string' ? obj.youtube.trim() : '',
    threads: typeof obj.threads === 'string' ? obj.threads.trim() : '',
    facebook: typeof obj.facebook === 'string' ? obj.facebook.trim() : '',
  };
}

// Каталоги для локального збереження на сервері
const DATA_DIR = path.resolve(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const TMP_SETTINGS_FILE = '/tmp/impart_settings.json';

function readSettingsFromFile(): SiteSocialLinks | null {
  const paths = [TMP_SETTINGS_FILE, SETTINGS_FILE];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return {
              ua: sanitizeSocialSet(parsed.ua),
              en: sanitizeSocialSet(parsed.en),
            };
          }
        }
      }
    } catch {}
  }
  return null;
}

function writeSettingsToFile(data: SiteSocialLinks): void {
  const payload = JSON.stringify(data, null, 2);

  // Vercel Serverless: запис у /tmp
  try {
    fs.writeFileSync(TMP_SETTINGS_FILE, payload, 'utf-8');
  } catch {}

  // Express сервер: запис у data/settings.json
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, payload, 'utf-8');
  } catch {}
}

// Ініціалізація початкового кешу в пам'яті
const initialFromFile = readSettingsFromFile();
let inMemorySocialLinks: SiteSocialLinks = initialFromFile || {
  ua: { ...DEFAULT_SOCIAL_LINKS.ua },
  en: { ...DEFAULT_SOCIAL_LINKS.en },
};

let isSettingsTableInitialized = false;

async function initSettingsDb() {
  if (isSettingsTableInitialized) return;
  try {
    const ok = await safeExecuteSql(async (sql) => {
      await sql`
        CREATE TABLE IF NOT EXISTS site_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;

      const existing = await sql`SELECT value FROM site_settings WHERE key = 'social_links' LIMIT 1;`;
      if (!existing || existing.length === 0) {
        await sql`
          INSERT INTO site_settings (key, value)
          VALUES ('social_links', ${JSON.stringify(inMemorySocialLinks)})
          ON CONFLICT (key) DO NOTHING;
        `;
      }
      return true;
    }, 8000);
    if (ok) {
      isSettingsTableInitialized = true;
    }
  } catch (err) {
    console.warn('Database initialization warning for site_settings (fallback active):', err);
  }
}

export async function getSocialLinks(): Promise<SiteSocialLinks> {
  // 1. Спроба завантажити з PostgreSQL з достатнім тайм-аутом для холодного старту Neon
  try {
    await initSettingsDb();
    const rows = await safeExecuteSql(async (sql) => {
      return await sql`SELECT value FROM site_settings WHERE key = 'social_links' LIMIT 1;`;
    }, 8000);

    if (rows && rows.length > 0 && rows[0].value) {
      const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const combined: SiteSocialLinks = {
          ua: sanitizeSocialSet(parsed.ua),
          en: sanitizeSocialSet(parsed.en),
        };
        inMemorySocialLinks = combined;
        writeSettingsToFile(combined);
        return combined;
      }
    }
  } catch (err) {
    console.warn('Database query error in getSocialLinks, falling back to disk/memory:', err);
  }

  // 2. Якщо база спить або недоступна — читаємо з локального файлу
  const fromFile = readSettingsFromFile();
  if (fromFile) {
    inMemorySocialLinks = fromFile;
    return fromFile;
  }

  // 3. Резервне повернення з пам'яті
  return inMemorySocialLinks;
}

export async function saveSocialLinks(links: any): Promise<SiteSocialLinks> {
  const current = inMemorySocialLinks;

  const uaInput =
    links?.ua && typeof links.ua === 'object'
      ? links.ua
      : !links?.en &&
        links &&
        typeof links === 'object' &&
        !Array.isArray(links) &&
        ('telegram' in links ||
          'instagram' in links ||
          'x' in links ||
          'youtube' in links ||
          'threads' in links ||
          'facebook' in links)
      ? links
      : {};
  const enInput = links?.en && typeof links.en === 'object' ? links.en : {};

  const cleaned: SiteSocialLinks = {
    ua: {
      telegram: uaInput.telegram !== undefined ? String(uaInput.telegram).trim() : (current.ua?.telegram || ''),
      instagram: uaInput.instagram !== undefined ? String(uaInput.instagram).trim() : (current.ua?.instagram || ''),
      x: uaInput.x !== undefined ? String(uaInput.x).trim() : (current.ua?.x || ''),
      youtube: uaInput.youtube !== undefined ? String(uaInput.youtube).trim() : (current.ua?.youtube || ''),
      threads: uaInput.threads !== undefined ? String(uaInput.threads).trim() : (current.ua?.threads || ''),
      facebook: uaInput.facebook !== undefined ? String(uaInput.facebook).trim() : (current.ua?.facebook || ''),
    },
    en: {
      telegram: enInput.telegram !== undefined ? String(enInput.telegram).trim() : (current.en?.telegram || ''),
      instagram: enInput.instagram !== undefined ? String(enInput.instagram).trim() : (current.en?.instagram || ''),
      x: enInput.x !== undefined ? String(enInput.x).trim() : (current.en?.x || ''),
      youtube: enInput.youtube !== undefined ? String(enInput.youtube).trim() : (current.en?.youtube || ''),
      threads: enInput.threads !== undefined ? String(enInput.threads).trim() : (current.en?.threads || ''),
      facebook: enInput.facebook !== undefined ? String(enInput.facebook).trim() : (current.en?.facebook || ''),
    },
  };

  // 1. Синхронізація з PostgreSQL із гарантією запису (якщо БД підключена)
  const jsonStr = JSON.stringify(cleaned);
  await executeSqlStrict(async (sql) => {
    await sql`
      CREATE TABLE IF NOT EXISTS site_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES ('social_links', ${jsonStr}, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE
      SET value = ${jsonStr}, updated_at = CURRENT_TIMESTAMP;
    `;
    return true;
  }, 10000);
  isSettingsTableInitialized = true;

  // 2. Оновлюємо пам'ять та локальний файл після успішного збереження
  inMemorySocialLinks = cleaned;
  writeSettingsToFile(cleaned);

  invalidateSitemapCache();
  return cleaned;
}

export default async function handler(req: any, res: any) {
  initResponseHelpers(res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Content-Type', 'application/json');

  const rawUrl = typeof req?.originalUrl === 'string' && req.originalUrl
    ? req.originalUrl
    : typeof req?.url === 'string'
    ? req.url
    : '';
  let queryEndpoint = '';
  try {
    queryEndpoint = new URL(rawUrl || '/', 'http://localhost').searchParams.get('__endpoint') || '';
  } catch {}
  const endpoint = String(req?.query?.__endpoint || queryEndpoint || '').toLowerCase();

  if (endpoint === 'categories' || /\/api\/categories\b/i.test(rawUrl)) {
    return categoriesHandler(req, res);
  }
  if (endpoint === 'taxonomies' || /\/api\/taxonomies\b/i.test(rawUrl)) {
    return taxonomiesHandler(req, res);
  }
  if (endpoint === 'pages' || /\/api\/pages\b/i.test(rawUrl)) {
    return pagesHandler(req, res);
  }

  try {
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      const data = await getSocialLinks();
      return res.status(200).json(data);
    }

    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    if (req.method === 'POST' || req.method === 'PUT') {
      const token = extractToken(req);
      if (!verifyAdminToken(token)) {
        return res.status(401).json({ error: 'Потрібна авторизація адміністратора для зміни налаштувань' });
      }

      let body = await parseRequestBody(req);

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: 'Недійсний JSON у запиті' });
        }
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'Недійсні дані запиту для соціальних мереж' });
      }

      const saved = await saveSocialLinks(body);
      return res.status(200).json(saved);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error: any) {
    console.error('Social links handler unexpected error:', error);
    if (req.method === 'POST' || req.method === 'PUT') {
      return res.status(500).json({
        error: 'Не вдалося зберегти посилання в базі даних: ' + (error?.message || 'помилка сервера'),
      });
    }
    return res.status(200).json(inMemorySocialLinks);
  }
}

