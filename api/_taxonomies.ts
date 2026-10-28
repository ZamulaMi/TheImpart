import fs from 'fs';
import path from 'path';
import { safeExecuteSql } from './_db.ts';
import { verifyEditorOrAdminToken, extractToken } from './_auth_utils.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';
import { invalidateSitemapCache } from './_sitemap_cache.ts';
import { DEFAULT_TAXONOMIES } from '../src/utils/taxonomies.ts';
import type { TaxonomiesData } from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const TAXONOMIES_FILE = path.join(DATA_DIR, 'taxonomies.json');
const TMP_TAXONOMIES_FILE = '/tmp/impart_taxonomies.json';

function readTaxonomiesFromFile(): TaxonomiesData | null {
  const paths = [TMP_TAXONOMIES_FILE, TAXONOMIES_FILE];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.topics)) {
            return parsed as TaxonomiesData;
          }
        }
      }
    } catch {}
  }
  return null;
}

function writeTaxonomiesToFile(data: TaxonomiesData): void {
  const payload = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(TMP_TAXONOMIES_FILE, payload, 'utf-8');
  } catch {}
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(TAXONOMIES_FILE, payload, 'utf-8');
  } catch {}
}

const initialFromFile = readTaxonomiesFromFile();
let inMemoryTaxonomies: TaxonomiesData = initialFromFile || { ...DEFAULT_TAXONOMIES };
if (!initialFromFile) {
  writeTaxonomiesToFile(inMemoryTaxonomies);
}

let isTaxonomiesTableInitialized = false;

async function initTaxonomiesDb() {
  if (isTaxonomiesTableInitialized) return;
  try {
    await safeExecuteSql(async (sql) => {
      await sql`
        CREATE TABLE IF NOT EXISTS site_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;

      const existing = await sql`SELECT value FROM site_settings WHERE key = 'taxonomies' LIMIT 1;`;
      if (!existing || existing.length === 0) {
        await sql`
          INSERT INTO site_settings (key, value)
          VALUES ('taxonomies', ${JSON.stringify(inMemoryTaxonomies)})
          ON CONFLICT (key) DO NOTHING;
        `;
      }
    }, 2500);
    isTaxonomiesTableInitialized = true;
  } catch (error) {
    console.warn('Neon taxonomies table init notice:', error);
  }
}

export async function getTaxonomies(): Promise<TaxonomiesData> {
  try {
    await initTaxonomiesDb();
    const rows = await safeExecuteSql(async (sql) => {
      return await sql`SELECT value FROM site_settings WHERE key = 'taxonomies' LIMIT 1;`;
    }, 2500);

    if (rows && rows.length > 0 && rows[0]?.value) {
      try {
        const parsed = JSON.parse(rows[0].value);
        if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.topics)) {
          inMemoryTaxonomies = parsed;
          writeTaxonomiesToFile(parsed);
          return parsed;
        }
      } catch (err) {
        console.warn('Error parsing taxonomies from DB:', err);
      }
    }
  } catch (err) {
    console.warn('Neon query error in getTaxonomies, loading from file/memory:', err);
  }

  const fromFile = readTaxonomiesFromFile();
  if (fromFile) {
    inMemoryTaxonomies = fromFile;
    return fromFile;
  }

  return inMemoryTaxonomies;
}

export async function saveTaxonomies(taxonomies: TaxonomiesData): Promise<TaxonomiesData> {
  const safeData: TaxonomiesData = {
    categories: Array.isArray(taxonomies?.categories) ? taxonomies.categories : DEFAULT_TAXONOMIES.categories,
    topics: Array.isArray(taxonomies?.topics) ? taxonomies.topics : DEFAULT_TAXONOMIES.topics,
  };

  inMemoryTaxonomies = safeData;
  writeTaxonomiesToFile(safeData);

  try {
    await initTaxonomiesDb();
    await safeExecuteSql(async (sql) => {
      await sql`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('taxonomies', ${JSON.stringify(safeData)}, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP;
      `;
    }, 3000);
  } catch (err) {
    console.warn('Neon save notice for taxonomies (saved locally):', err);
  }

  invalidateSitemapCache();
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
      const data = await getTaxonomies();
      return res.status(200).json(data);
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      const token = extractToken(req);
      if (!verifyEditorOrAdminToken(token)) {
        return res.status(401).json({ error: 'Потрібна авторизація для оновлення таксономій' });
      }

      let body = await parseRequestBody(req);
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: 'Недійсний JSON' });
        }
      }

      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Тіло запиту повинно бути об\'єктом' });
      }

      const saved = await saveTaxonomies(body as TaxonomiesData);
      return res.status(200).json(saved);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('API /api/taxonomies error:', error);
    return res.status(200).json(inMemoryTaxonomies);
  }
}
