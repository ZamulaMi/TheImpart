import fs from 'fs';
import path from 'path';
import { getNeonSql, safeExecuteSql } from './_db.ts';
import { verifyAdminToken, extractToken } from './_auth_utils.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';

export interface SocialLinksSet {
  telegram?: string;
  instagram?: string;
  x?: string;
  youtube?: string;
  threads?: string;
}

export interface SiteSocialLinks {
  ua: SocialLinksSet;
  en: SocialLinksSet;
}

export const DEFAULT_SOCIAL_LINKS: SiteSocialLinks = {
  ua: {
    telegram: 'https://t.me/impart',
    instagram: 'https://instagram.com/impart',
    x: 'https://x.com/impart_ua',
    youtube: 'https://youtube.com/@impart_ua',
    threads: 'https://threads.net/@impart_ua',
  },
  en: {
    telegram: 'https://t.me/impart_en',
    instagram: 'https://instagram.com/impart_en',
    x: 'https://x.com/impart_en',
    youtube: 'https://youtube.com/@impart_en',
    threads: 'https://threads.net/@impart_en',
  },
};

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
          return {
            ua: { ...DEFAULT_SOCIAL_LINKS.ua, ...(parsed.ua || {}) },
            en: { ...DEFAULT_SOCIAL_LINKS.en, ...(parsed.en || {}) },
          };
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
let inMemorySocialLinks: SiteSocialLinks = initialFromFile || { ...DEFAULT_SOCIAL_LINKS };

let isSettingsTableInitialized = false;

async function initSettingsDb() {
  if (isSettingsTableInitialized) return;
  try {
    await safeExecuteSql(async (sql) => {
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
    }, 2500);
    isSettingsTableInitialized = true;
  } catch (err) {
    console.warn('Database initialization warning for site_settings (fallback active):', err);
  }
}

export async function getSocialLinks(): Promise<SiteSocialLinks> {
  // 1. Спроба завантажити з PostgreSQL з безпечним тайм-аутом
  try {
    await initSettingsDb();
    const rows = await safeExecuteSql(async (sql) => {
      return await sql`SELECT value FROM site_settings WHERE key = 'social_links' LIMIT 1;`;
    }, 2500);

    if (rows && rows.length > 0 && rows[0].value) {
      const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      const combined: SiteSocialLinks = {
        ua: { ...DEFAULT_SOCIAL_LINKS.ua, ...(parsed.ua || {}) },
        en: { ...DEFAULT_SOCIAL_LINKS.en, ...(parsed.en || {}) },
      };
      inMemorySocialLinks = combined;
      writeSettingsToFile(combined);
      return combined;
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

  const uaInput = links?.ua || (!links?.en && (links?.telegram || links?.instagram || links?.x || links?.youtube || links?.threads) ? links : {});
  const enInput = links?.en || {};

  const cleaned: SiteSocialLinks = {
    ua: {
      telegram: uaInput.telegram !== undefined ? String(uaInput.telegram).trim() : (current.ua?.telegram || ''),
      instagram: uaInput.instagram !== undefined ? String(uaInput.instagram).trim() : (current.ua?.instagram || ''),
      x: uaInput.x !== undefined ? String(uaInput.x).trim() : (current.ua?.x || ''),
      youtube: uaInput.youtube !== undefined ? String(uaInput.youtube).trim() : (current.ua?.youtube || ''),
      threads: uaInput.threads !== undefined ? String(uaInput.threads).trim() : (current.ua?.threads || ''),
    },
    en: {
      telegram: enInput.telegram !== undefined ? String(enInput.telegram).trim() : (current.en?.telegram || ''),
      instagram: enInput.instagram !== undefined ? String(enInput.instagram).trim() : (current.en?.instagram || ''),
      x: enInput.x !== undefined ? String(enInput.x).trim() : (current.en?.x || ''),
      youtube: enInput.youtube !== undefined ? String(enInput.youtube).trim() : (current.en?.youtube || ''),
      threads: enInput.threads !== undefined ? String(enInput.threads).trim() : (current.en?.threads || ''),
    },
  };

  // 1. Оновлюємо пам'ять
  inMemorySocialLinks = cleaned;

  // 2. Зберігаємо у файл
  writeSettingsToFile(cleaned);

  // 3. Синхронізація з PostgreSQL з тайм-аутом
  try {
    await initSettingsDb();
    await safeExecuteSql(async (sql) => {
      const jsonStr = JSON.stringify(cleaned);
      await sql`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('social_links', ${jsonStr}, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE
        SET value = ${jsonStr}, updated_at = CURRENT_TIMESTAMP;
      `;
    }, 3000);
  } catch (err) {
    console.warn('Postgres sync notice: settings saved locally:', err);
  }

  return cleaned;
}

export default async function handler(req: any, res: any) {
  initResponseHelpers(res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  try {
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      const data = await getSocialLinks();
      return res.status(200).json(data);
    }

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

      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Недійсні дані запиту' });
      }

      const saved = await saveSocialLinks(body);
      return res.status(200).json(saved);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error: any) {
    console.error('Social links handler unexpected error:', error);
    return res.status(200).json(inMemorySocialLinks);
  }
}
