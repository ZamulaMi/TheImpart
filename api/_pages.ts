import fs from 'fs';
import path from 'path';
import { safeExecuteSql } from './_db.ts';
import { verifyAdminToken, extractToken } from './_auth_utils.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';
import { type SitePagesData, DEFAULT_PAGES_DATA } from '../src/types.ts';
import { invalidateSitemapCache } from './_sitemap_cache.ts';
import { triggerSitemapAutoUpdate } from './_sitemap_sync.ts';

// Каталоги для локального збереження на сервері
const DATA_DIR = path.resolve(process.cwd(), 'data');
const PAGES_FILE = path.join(DATA_DIR, 'pages.json');
const TMP_PAGES_FILE = '/tmp/impart_pages.json';

function readPagesFromFile(): SitePagesData | null {
  const paths = [TMP_PAGES_FILE, PAGES_FILE];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === 'object') {
            return {
              about: { ...DEFAULT_PAGES_DATA.about, ...(parsed.about || {}) },
              contacts: { ...DEFAULT_PAGES_DATA.contacts, ...(parsed.contacts || {}) },
            };
          }
        }
      }
    } catch {}
  }
  return null;
}

function writePagesToFile(data: SitePagesData): void {
  const payload = JSON.stringify(data, null, 2);

  try {
    fs.writeFileSync(TMP_PAGES_FILE, payload, 'utf-8');
  } catch {}

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(PAGES_FILE, payload, 'utf-8');
  } catch {}
}

const initialFromFile = readPagesFromFile();
let inMemoryPages: SitePagesData = initialFromFile || { ...DEFAULT_PAGES_DATA };
let isPagesTableInitialized = false;

async function initPagesDb() {
  if (isPagesTableInitialized) return;
  try {
    await safeExecuteSql(async (sql) => {
      await sql`
        CREATE TABLE IF NOT EXISTS site_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;

      const existing = await sql`SELECT value FROM site_settings WHERE key = 'static_pages' LIMIT 1;`;
      if (!existing || existing.length === 0) {
        await sql`
          INSERT INTO site_settings (key, value)
          VALUES ('static_pages', ${JSON.stringify(inMemoryPages)})
          ON CONFLICT (key) DO NOTHING;
        `;
      }
    }, 2500);
    isPagesTableInitialized = true;
  } catch (err) {
    console.warn('Database initialization warning for static_pages (fallback active):', err);
  }
}

export async function getPages(): Promise<SitePagesData> {
  // 1. Спроба завантажити з PostgreSQL
  try {
    await initPagesDb();
    const rows = await safeExecuteSql(async (sql) => {
      return await sql`SELECT value FROM site_settings WHERE key = 'static_pages' LIMIT 1;`;
    }, 2500);

    if (rows && rows.length > 0 && rows[0].value) {
      const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      const combined: SitePagesData = {
        about: { ...DEFAULT_PAGES_DATA.about, ...(parsed.about || {}) },
        contacts: { ...DEFAULT_PAGES_DATA.contacts, ...(parsed.contacts || {}) },
      };
      inMemoryPages = combined;
      writePagesToFile(combined);
      return combined;
    }
  } catch (err) {
    console.warn('Database query error in getPages, falling back to disk/memory:', err);
  }

  // 2. Якщо база спить або недоступна — читаємо з файлу
  const fromFile = readPagesFromFile();
  if (fromFile) {
    inMemoryPages = fromFile;
    return fromFile;
  }

  // 3. Резервне повернення з пам'яті
  return inMemoryPages;
}

export async function savePages(pagesInput: any): Promise<SitePagesData> {
  const current = inMemoryPages;

  const aboutInput = pagesInput?.about || {};
  const contactsInput = pagesInput?.contacts || {};

  const cleaned: SitePagesData = {
    about: {
      id: 'about',
      slug: 'about',
      title: aboutInput.title ? String(aboutInput.title).trim() : current.about.title,
      titleEn: aboutInput.titleEn ? String(aboutInput.titleEn).trim() : current.about.titleEn,
      content: aboutInput.content !== undefined ? String(aboutInput.content) : current.about.content,
      contentEn: aboutInput.contentEn !== undefined ? String(aboutInput.contentEn) : current.about.contentEn,
      updatedAt: new Date().toISOString(),
    },
    contacts: {
      id: 'contacts',
      slug: 'contacts',
      title: contactsInput.title ? String(contactsInput.title).trim() : current.contacts.title,
      titleEn: contactsInput.titleEn ? String(contactsInput.titleEn).trim() : current.contacts.titleEn,
      content: contactsInput.content !== undefined ? String(contactsInput.content) : current.contacts.content,
      contentEn: contactsInput.contentEn !== undefined ? String(contactsInput.contentEn) : current.contacts.contentEn,
      updatedAt: new Date().toISOString(),
    },
  };

  // Оновлюємо стан у пам'яті та записуємо на диск
  inMemoryPages = cleaned;
  writePagesToFile(cleaned);

  // Синхронізуємо з PostgreSQL
  try {
    await initPagesDb();
    await safeExecuteSql(async (sql) => {
      const jsonStr = JSON.stringify(cleaned);
      await sql`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('static_pages', ${jsonStr}, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE
        SET value = ${jsonStr}, updated_at = CURRENT_TIMESTAMP;
      `;
    }, 3000);
  } catch (err) {
    console.warn('Postgres sync notice: static pages saved locally:', err);
  }

  invalidateSitemapCache();
  triggerSitemapAutoUpdate();
  return cleaned;
}

export default async function handler(req: any, res: any) {
  initResponseHelpers(res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
      const data = await getPages();
      return res.status(200).json(data);
    }

    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    if (req.method === 'POST' || req.method === 'PUT') {
      // Редагування сторінок доступне лише головному адміністратору
      const token = extractToken(req);
      if (!verifyAdminToken(token)) {
        return res.status(401).json({
          error: 'Потрібна авторизація адміністратора. Редагування сторінок доступне лише в панелі керування адміністратора.',
        });
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

      const saved = await savePages(body);
      return res.status(200).json(saved);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error: any) {
    console.error('Static pages handler unexpected error:', error);
    return res.status(200).json(inMemoryPages);
  }
}
