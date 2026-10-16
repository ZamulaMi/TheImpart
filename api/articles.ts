import fs from 'fs';
import path from 'path';
import { getNeonSql, cleanConnectionString, safeExecuteSql } from './_db.ts';
import { verifyAdminToken, verifyEditorOrAdminToken, extractToken } from './_auth_utils.ts';
import { SEED_ARTICLES } from '../src/data/seedArticles.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';

export { getNeonSql, cleanConnectionString };

export interface Article {
  id: string;
  // Українська версія (основна)
  title: string;
  excerpt: string;
  content: string;
  category: string;
  categories?: string[];
  topics?: string[];
  author: string;
  coverImage?: string;
  date: string;
  readTime?: string;
  createdAt?: string;
  published: boolean;

  // Англійська версія
  titleEn?: string;
  excerptEn?: string;
  contentEn?: string;
  categoryEn?: string;
  categoriesEn?: string[];
  topicsEn?: string[];
  publishedEn?: boolean;
}

// Початкові статті за замовчуванням
export const DEFAULT_ARTICLES: Article[] = SEED_ARTICLES;

// Локальне збереження на диску сервера
const DATA_DIR = path.resolve(process.cwd(), 'data');
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');
const ARTICLES_TMP_FILE = '/tmp/impart_articles.json';

function readArticlesFromFile(): Article[] | null {
  const paths = [ARTICLES_TMP_FILE, ARTICLES_FILE];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch {}
  }
  return null;
}

function writeArticlesToFile(articles: Article[]): void {
  const payload = JSON.stringify(articles, null, 2);

  // Vercel Serverless: безпечний запис у /tmp
  try {
    fs.writeFileSync(ARTICLES_TMP_FILE, payload, 'utf-8');
  } catch {}

  // Express сервер: запис у data/articles.json
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(ARTICLES_FILE, payload, 'utf-8');
  } catch {}
}

// Ініціалізуємо пам'ять з диска або початкових статей
const initialArticlesFromFile = readArticlesFromFile();
let inMemoryArticles: Article[] = initialArticlesFromFile || [...DEFAULT_ARTICLES];
if (!initialArticlesFromFile) {
  writeArticlesToFile(inMemoryArticles);
}

function parseJsonArray(val: any): string[] | undefined {
  if (!val) return undefined;
  if (Array.isArray(val)) return val.map((s) => String(s).trim().replace(/^#+/, '')).filter(Boolean);
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

let isTableInitialized = false;

export async function initDb() {
  if (isTableInitialized) return;

  try {
    await safeExecuteSql(async (sql) => {
      await sql`
        CREATE TABLE IF NOT EXISTS articles (
          id VARCHAR(255) PRIMARY KEY,
          title TEXT NOT NULL,
          excerpt TEXT,
          content TEXT NOT NULL,
          category VARCHAR(100) DEFAULT 'Загальне',
          author VARCHAR(255) DEFAULT 'Редакція The Impart',
          cover_image TEXT,
          date VARCHAR(100),
          read_time VARCHAR(100),
          published BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;

      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS title_en TEXT;`;
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS excerpt_en TEXT;`;
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_en TEXT;`;
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS category_en VARCHAR(100);`;
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS published_en BOOLEAN DEFAULT false;`;
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS categories TEXT;`;
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS categories_en TEXT;`;
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS topics TEXT;`;
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS topics_en TEXT;`;

      const rows = await sql`SELECT count(*) as count FROM articles;`;
      if (parseInt(rows[0]?.count || '0', 10) === 0) {
        const toSeed = inMemoryArticles.length > 0 ? inMemoryArticles : DEFAULT_ARTICLES;
        for (const a of toSeed) {
          const catsJson = JSON.stringify(a.categories || (a.category ? [a.category] : ['Загальне']));
          const catsEnJson = a.categoriesEn ? JSON.stringify(a.categoriesEn) : (a.categoryEn ? JSON.stringify([a.categoryEn]) : null);
          const topJson = a.topics && a.topics.length > 0 ? JSON.stringify(a.topics) : '[]';
          const topEnJson = a.topicsEn && a.topicsEn.length > 0 ? JSON.stringify(a.topicsEn) : '[]';

          await sql`
            INSERT INTO articles (
              id, title, excerpt, content, category, author, cover_image, date, read_time, published,
              title_en, excerpt_en, content_en, category_en, published_en,
              categories, categories_en, topics, topics_en
            )
            VALUES (
              ${a.id}, 
              ${a.title}, 
              ${a.excerpt}, 
              ${a.content}, 
              ${a.category}, 
              ${a.author}, 
              ${a.coverImage || null}, 
              ${a.date}, 
              ${a.readTime || null}, 
              ${a.published},
              ${a.titleEn || null},
              ${a.excerptEn || null},
              ${a.contentEn || null},
              ${a.categoryEn || null},
              ${a.publishedEn ?? false},
              ${catsJson},
              ${catsEnJson},
              ${topJson},
              ${topEnJson}
            )
            ON CONFLICT (id) DO NOTHING;
          `;
        }
      }
    }, 3000);

    isTableInitialized = true;
  } catch (error) {
    console.warn('Neon initDb notice (fallback active):', error);
  }
}

export async function getArticles(): Promise<Article[]> {
  try {
    await initDb();
    const rows = await safeExecuteSql(async (sql) => {
      return await sql`
        SELECT 
          id, 
          title, 
          excerpt, 
          content, 
          category, 
          author, 
          cover_image as "coverImage", 
          date, 
          read_time as "readTime", 
          created_at as "createdAt",
          published,
          title_en as "titleEn",
          excerpt_en as "excerptEn",
          content_en as "contentEn",
          category_en as "categoryEn",
          published_en as "publishedEn",
          categories,
          categories_en as "categoriesEn",
          topics,
          topics_en as "topicsEn"
        FROM articles 
        ORDER BY created_at DESC;
      `;
    }, 3000);

    if (rows && rows.length > 0) {
      const mapped = rows.map((r: any) => ({
        id: String(r.id),
        title: String(r.title || ''),
        excerpt: String(r.excerpt || ''),
        content: String(r.content || ''),
        category: String(r.category || 'Загальне'),
        categories: parseJsonArray(r.categories) || (r.category ? r.category.split(',').map((s: string) => s.trim()).filter(Boolean) : ['Загальне']),
        topics: parseJsonArray(r.topics) || [],
        author: String(r.author || 'Редакція The Impart'),
        coverImage: r.coverImage || undefined,
        date: String(r.date || ''),
        readTime: r.readTime ? String(r.readTime) : undefined,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
        published: r.published === true || String(r.published) === 'true' || r.published === 1,
        titleEn: r.titleEn ? String(r.titleEn) : undefined,
        excerptEn: r.excerptEn ? String(r.excerptEn) : undefined,
        contentEn: r.contentEn ? String(r.contentEn) : undefined,
        categoryEn: r.categoryEn ? String(r.categoryEn) : undefined,
        categoriesEn: parseJsonArray(r.categoriesEn) || (r.categoryEn ? r.categoryEn.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined),
        topicsEn: parseJsonArray(r.topicsEn) || [],
        publishedEn: r.publishedEn === true || String(r.publishedEn) === 'true' || r.publishedEn === 1,
      }));

      inMemoryArticles = mapped;
      writeArticlesToFile(mapped);
      return mapped;
    }
  } catch (error) {
    console.warn('Neon query error in getArticles, loading from disk/memory:', error);
  }

  const fromFile = readArticlesFromFile();
  if (fromFile && fromFile.length > 0) {
    inMemoryArticles = fromFile;
    return fromFile;
  }

  return inMemoryArticles;
}

export async function saveArticle(article: Article): Promise<Article> {
  const isPub = article.published !== false && String(article.published) !== 'false';
  const isPubEn = article.publishedEn === true || String(article.publishedEn) === 'true' || (article.publishedEn as any) === 1;

  const id = String(article.id || Date.now().toString());
  const title = String(article.title || '').trim();
  const excerpt = String(article.excerpt || '').trim();
  const content = String(article.content || '').trim();
  const category = String(article.category || 'Загальне').trim();
  const author = String(article.author || 'Редакція The Impart').trim();
  const coverImage = article.coverImage ? String(article.coverImage).trim() : undefined;
  const date = String(article.date || new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }));
  const readTime = article.readTime ? String(article.readTime) : undefined;
  const createdAt = article.createdAt || new Date().toISOString();

  const titleEn = article.titleEn ? String(article.titleEn).trim() : undefined;
  const excerptEn = article.excerptEn ? String(article.excerptEn).trim() : undefined;
  const contentEn = article.contentEn ? String(article.contentEn).trim() : undefined;
  const categoryEn = article.categoryEn ? String(article.categoryEn).trim() : undefined;

  const categories = Array.isArray(article.categories) && article.categories.length > 0
    ? article.categories.map((c) => String(c).trim()).filter(Boolean)
    : (category ? [category] : ['Загальне']);
  const categoriesEn = Array.isArray(article.categoriesEn) && article.categoriesEn.length > 0
    ? article.categoriesEn.map((c) => String(c).trim()).filter(Boolean)
    : (categoryEn ? [categoryEn] : []);
  const topics = Array.isArray(article.topics)
    ? article.topics.map((t) => String(t).trim().replace(/^#+/, '')).filter(Boolean)
    : [];
  const topicsEn = Array.isArray(article.topicsEn)
    ? article.topicsEn.map((t) => String(t).trim().replace(/^#+/, '')).filter(Boolean)
    : [];

  const fullArticle: Article = {
    id,
    title,
    excerpt,
    content,
    category: categories.join(', ') || category,
    categories,
    topics,
    author,
    coverImage,
    date,
    readTime,
    createdAt,
    published: isPub,
    titleEn,
    excerptEn,
    contentEn,
    categoryEn: categoriesEn.length > 0 ? categoriesEn.join(', ') : categoryEn,
    categoriesEn: categoriesEn.length > 0 ? categoriesEn : undefined,
    topicsEn,
    publishedEn: isPubEn,
  };

  // 1. Миттєво оновлюємо пам'ять
  const existingIdx = inMemoryArticles.findIndex((a) => a.id === id);
  if (existingIdx >= 0) {
    inMemoryArticles[existingIdx] = fullArticle;
  } else {
    inMemoryArticles = [fullArticle, ...inMemoryArticles];
  }

  // 2. Миттєво записуємо у файл
  writeArticlesToFile(inMemoryArticles);

  // 3. Синхронізуємо з Neon PostgreSQL з безпечним тайм-аутом
  try {
    await initDb();
    const categoriesJson = JSON.stringify(categories);
    const categoriesEnJson = categoriesEn.length > 0 ? JSON.stringify(categoriesEn) : null;
    const topicsJson = JSON.stringify(topics);
    const topicsEnJson = JSON.stringify(topicsEn);

    await safeExecuteSql(async (sql) => {
      await sql`
        INSERT INTO articles (
          id, title, excerpt, content, category, author, cover_image, date, read_time, published,
          title_en, excerpt_en, content_en, category_en, published_en,
          categories, categories_en, topics, topics_en
        )
        VALUES (
          ${id}, 
          ${title}, 
          ${excerpt}, 
          ${content}, 
          ${category}, 
          ${author}, 
          ${coverImage || null}, 
          ${date}, 
          ${readTime || null}, 
          ${isPub},
          ${titleEn || null},
          ${excerptEn || null},
          ${contentEn || null},
          ${categoryEn || null},
          ${isPubEn},
          ${categoriesJson},
          ${categoriesEnJson},
          ${topicsJson},
          ${topicsEnJson}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          excerpt = EXCLUDED.excerpt,
          content = EXCLUDED.content,
          category = EXCLUDED.category,
          author = EXCLUDED.author,
          cover_image = EXCLUDED.cover_image,
          date = EXCLUDED.date,
          read_time = EXCLUDED.read_time,
          published = EXCLUDED.published,
          title_en = EXCLUDED.title_en,
          excerpt_en = EXCLUDED.excerpt_en,
          content_en = EXCLUDED.content_en,
          category_en = EXCLUDED.category_en,
          published_en = EXCLUDED.published_en,
          categories = EXCLUDED.categories,
          categories_en = EXCLUDED.categories_en,
          topics = EXCLUDED.topics,
          topics_en = EXCLUDED.topics_en;
      `;
    }, 3500);
  } catch (error: any) {
    console.warn('Neon save notice (article is saved locally):', error);
  }

  return fullArticle;
}

export async function deleteArticle(id: string): Promise<boolean> {
  const targetId = String(id);

  // 1. Видаляємо з пам'яті
  inMemoryArticles = inMemoryArticles.filter((a) => a.id !== targetId);

  // 2. Оновлюємо файл на диску
  writeArticlesToFile(inMemoryArticles);

  // 3. Синхронізуємо видалення з Neon
  try {
    await initDb();
    await safeExecuteSql(async (sql) => {
      await sql`DELETE FROM articles WHERE id = ${targetId};`;
    }, 2500);
  } catch (error) {
    console.warn('Neon delete notice:', error);
  }

  return true;
}

export default async function handler(req: any, res: any) {
  initResponseHelpers(res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const articles = await getArticles();
      return res.status(200).json(articles);
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const token = extractToken(req);
      if (!verifyEditorOrAdminToken(token)) {
        return res.status(401).json({ error: 'Потрібна авторизація для збереження статей' });
      }

      let body = await parseRequestBody(req);

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e: any) {
          return res.status(400).json({ error: 'Помилка валідації JSON: ' + e.message });
        }
      }

      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Тіло запиту повинно бути об\'єктом' });
      }

      if (!body.title || !String(body.title).trim()) {
        return res.status(400).json({ error: 'Заголовок статті обов\'язковий' });
      }

      const saved = await saveArticle({
        id: body.id ? String(body.id) : Date.now().toString(),
        title: String(body.title).trim(),
        excerpt: body.excerpt ? String(body.excerpt).trim() : '',
        content: body.content ? String(body.content).trim() : '',
        category: body.category ? String(body.category).trim() : 'Загальне',
        categories: parseJsonArray(body.categories) || (body.category ? body.category.split(',').map((s: string) => s.trim()).filter(Boolean) : ['Загальне']),
        topics: parseJsonArray(body.topics) || [],
        author: body.author ? String(body.author).trim() : 'Редакція The Impart',
        coverImage: body.coverImage ? String(body.coverImage).trim() : undefined,
        date: body.date ? String(body.date) : new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }),
        readTime: body.readTime ? String(body.readTime) : undefined,
        createdAt: body.createdAt ? String(body.createdAt) : undefined,
        published: body.published !== false && String(body.published) !== 'false',
        // Англійські поля
        titleEn: body.titleEn ? String(body.titleEn).trim() : undefined,
        excerptEn: body.excerptEn ? String(body.excerptEn).trim() : undefined,
        contentEn: body.contentEn ? String(body.contentEn).trim() : undefined,
        categoryEn: body.categoryEn ? String(body.categoryEn).trim() : undefined,
        categoriesEn: parseJsonArray(body.categoriesEn) || (body.categoryEn ? body.categoryEn.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined),
        topicsEn: parseJsonArray(body.topicsEn) || [],
        publishedEn: body.publishedEn === true || String(body.publishedEn) === 'true',
      });

      return res.status(200).json(saved);
    }

    if (req.method === 'DELETE') {
      const token = extractToken(req);
      if (!verifyAdminToken(token)) {
        return res.status(401).json({ error: 'Потрібна авторизація адміністратора для видалення статей' });
      }

      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Параметр ID є обов\'язковим' });
      }
      await deleteArticle(id.toString());
      return res.status(200).json({ success: true, id: id.toString() });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('API /api/articles error:', error);
    return res.status(200).json(inMemoryArticles);
  }
}
