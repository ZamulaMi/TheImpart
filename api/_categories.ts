import fs from 'fs';
import path from 'path';
import { safeExecuteSql, executeSqlStrict } from './_db.ts';
import { verifyEditorOrAdminToken, extractToken } from './_auth_utils.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';
import { DEFAULT_NAV_CATEGORIES, slugifyCategory } from '../src/utils/categories.ts';
import type { NavigationCategory } from '../src/types.ts';
import { invalidateSitemapCache } from './_sitemap_cache.ts';
import { triggerSitemapAutoUpdate } from './_sitemap_sync.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const TMP_CATEGORIES_FILE = '/tmp/impart_categories.json';

function normalizeNavCategoriesList(raw: any): NavigationCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object' && String(item.name || '').trim())
    .map((item, idx) => {
      const name = String(item.name || '').trim();
      const nameEn = item.nameEn !== undefined && String(item.nameEn).trim() ? String(item.nameEn).trim() : undefined;
      const slug = String(item.slug || '').trim() || slugifyCategory(name);
      return {
        id: String(item.id || `cat-nav-${idx}-${slug}`).trim(),
        slug,
        name,
        nameEn,
        rubrics: Array.isArray(item.rubrics) ? item.rubrics.map((r: any) => String(r).trim()).filter(Boolean) : [],
        rubricsEn: Array.isArray(item.rubricsEn) ? item.rubricsEn.map((r: any) => String(r).trim()).filter(Boolean) : [],
        topics: Array.isArray(item.topics)
          ? item.topics.map((t: any) => String(t).trim().replace(/^#+/, '')).filter(Boolean)
          : [],
        topicsEn: Array.isArray(item.topicsEn)
          ? item.topicsEn.map((t: any) => String(t).trim().replace(/^#+/, '')).filter(Boolean)
          : [],
        order: typeof item.order === 'number' ? item.order : idx,
      };
    });
}

function readCategoriesFromFile(): NavigationCategory[] | null {
  const paths = [TMP_CATEGORIES_FILE, CATEGORIES_FILE];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            return normalizeNavCategoriesList(parsed);
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
let inMemoryCategories: NavigationCategory[] = initialFromFile !== null ? initialFromFile : [...DEFAULT_NAV_CATEGORIES];
if (initialFromFile === null) {
  writeCategoriesToFile(inMemoryCategories);
}

let isCategoriesTableInitialized = false;

async function initCategoriesDb() {
  if (isCategoriesTableInitialized) return;
  try {
    const ok = await safeExecuteSql(async (sql) => {
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
      return true;
    }, 8000);
    if (ok) {
      isCategoriesTableInitialized = true;
    }
  } catch (error) {
    console.warn('Neon nav_categories table init notice:', error);
  }
}

export async function getNavCategories(): Promise<NavigationCategory[]> {
  try {
    let rows = await safeExecuteSql(async (sql) => {
      return await sql`SELECT value FROM site_settings WHERE key = 'nav_categories' LIMIT 1;`;
    }, 9000);

    if (!rows) {
      await initCategoriesDb();
      rows = await safeExecuteSql(async (sql) => {
        return await sql`SELECT value FROM site_settings WHERE key = 'nav_categories' LIMIT 1;`;
      }, 9000);
    }

    if (rows && rows.length > 0 && rows[0]?.value !== undefined && rows[0]?.value !== null) {
      try {
        const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
        if (Array.isArray(parsed)) {
          const normalized = normalizeNavCategoriesList(parsed);
          inMemoryCategories = normalized;
          writeCategoriesToFile(normalized);
          return normalized;
        }
      } catch (err) {
        console.warn('Error parsing nav_categories from DB:', err);
      }
    }
  } catch (err) {
    console.warn('Neon query error in getNavCategories, loading from file/memory:', err);
  }

  const fromFile = readCategoriesFromFile();
  if (fromFile !== null) {
    inMemoryCategories = fromFile;
    return fromFile;
  }

  return inMemoryCategories;
}

export async function saveNavCategories(categories: NavigationCategory[]): Promise<NavigationCategory[]> {
  if (!Array.isArray(categories)) {
    throw new Error('Очікується масив навігаційних категорій');
  }

  const safeData = normalizeNavCategoriesList(categories);
  const jsonStr = JSON.stringify(safeData);

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
      VALUES ('nav_categories', ${jsonStr}, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP;
    `;
    return true;
  }, 10000);
  isCategoriesTableInitialized = true;

  inMemoryCategories = safeData;
  writeCategoriesToFile(safeData);

  invalidateSitemapCache();
  triggerSitemapAutoUpdate();
  return safeData;
}

export default async function handler(req: any, res: any) {
  initResponseHelpers(res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
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
    if (req.method === 'POST' || req.method === 'PUT') {
      return res.status(500).json({
        error: 'Не вдалося зберегти категорії в базі даних: ' + (error?.message || 'помилка сервера'),
      });
    }
    return res.status(200).json(inMemoryCategories);
  }
}

