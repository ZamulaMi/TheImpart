import fs from 'fs';
import path from 'path';
import { safeExecuteSql } from './_db.ts';
import { verifyEditorOrAdminToken, extractToken } from './_auth_utils.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';
import { DEFAULT_NAV_CATEGORIES } from '../src/utils/categories.ts';
import type { NavigationCategory } from '../src/types.ts';
import { invalidateSitemapCache } from './_sitemap_cache.ts';
import { triggerSitemapAutoUpdate } from './_sitemap_sync.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const TMP_CATEGORIES_FILE = '/tmp/impart_categories.json';

function readCategoriesFromFile(): NavigationCategory[] | null {
  const paths = [TMP_CATEGORIES_FILE, CATEGORIES_FILE];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed as NavigationCategory[];
          }
        }
      }
    } catch {}
  }
  return null;
}

function writeCategoriesToFile(data: NavigationCategory[]): void {
  const payload = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(TMP_CATEGORIES_FILE, payload, 'utf-8');
  } catch {}
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CATEGORIES_FILE, payload, 'utf-8');
  } catch {}
}

const initialFromFile = readCategoriesFromFile();
let inMemoryCategories: NavigationCategory[] = initialFromFile || [...DEFAULT_NAV_CATEGORIES];
if (!initialFromFile) {
  writeCategoriesToFile(inMemoryCategories);
}

let isCategoriesTableInitialized = false;

async function initCategoriesDb() {
  if (isCategoriesTableInitialized) return;
  try {
    await safeExecuteSql(async (sql) => {
      await sql`
        CREATE TABLE IF NOT EXISTS site_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;

      const existing = await sql`SELECT value FROM site_settings WHERE key = 'nav_categories' LIMIT 1;`;
      if (!existing || existing.length === 0) {
        await sql`
          INSERT INTO site_settings (key, value)
          VALUES ('nav_categories', ${JSON.stringify(inMemoryCategories)})
          ON CONFLICT (key) DO NOTHING;
        `;
      }
    }, 2500);
    isCategoriesTableInitialized = true;
  } catch (error) {
    console.warn('Neon nav_categories table init notice:', error);
  }
}

export async function getNavCategories(): Promise<NavigationCategory[]> {
  try {
    await initCategoriesDb();
    const rows = await safeExecuteSql(async (sql) => {
      return await sql`SELECT value FROM site_settings WHERE key = 'nav_categories' LIMIT 1;`;
    }, 2500);

    if (rows && rows.length > 0 && rows[0]?.value) {
      try {
        const parsed = JSON.parse(rows[0].value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryCategories = parsed;
          writeCategoriesToFile(parsed);
          return parsed;
        }
      } catch (err) {
        console.warn('Error parsing nav_categories from DB:', err);
      }
    }
  } catch (err) {
    console.warn('Neon query error in getNavCategories, loading from file/memory:', err);
  }

  const fromFile = readCategoriesFromFile();
  if (fromFile) {
    inMemoryCategories = fromFile;
    return fromFile;
  }

  return inMemoryCategories;
}

export async function saveNavCategories(categories: NavigationCategory[]): Promise<NavigationCategory[]> {
  const safeData: NavigationCategory[] = Array.isArray(categories) && categories.length > 0
    ? categories
    : DEFAULT_NAV_CATEGORIES;

  inMemoryCategories = safeData;
  writeCategoriesToFile(safeData);

  try {
    await initCategoriesDb();
    await safeExecuteSql(async (sql) => {
      await sql`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('nav_categories', ${JSON.stringify(safeData)}, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP;
      `;
    }, 3000);
  } catch (err) {
    console.warn('Neon save notice for nav_categories (saved locally):', err);
  }

  invalidateSitemapCache();
  triggerSitemapAutoUpdate();
  return safeData;
}

export default async function handler(req: any, res: any) {
  initResponseHelpers(res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
      const data = await getNavCategories();
      return res.status(200).json(data);
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      const token = extractToken(req);
      if (!verifyEditorOrAdminToken(token)) {
        return res.status(401).json({ error: 'Потрібна авторизація для оновлення категорій' });
      }

      let body = await parseRequestBody(req);
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: 'Недійсний JSON' });
        }
      }

      if (!Array.isArray(body)) {
        return res.status(400).json({ error: 'Тіло запиту повинно бути масивом категорій' });
      }

      const saved = await saveNavCategories(body as NavigationCategory[]);
      return res.status(200).json(saved);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('API /api/categories error:', error);
    return res.status(200).json(inMemoryCategories);
  }
}
