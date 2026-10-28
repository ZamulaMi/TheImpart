import fs from 'fs';
import path from 'path';
import { getNeonSql, cleanConnectionString, safeExecuteSql } from './_db.ts';
import { verifyAdminToken, verifyEditorOrAdminToken, extractToken } from './_auth_utils.ts';
import { SEED_ARTICLES } from '../src/data/seedArticles.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';
import { getTotalViews, ensureStatsLoaded } from './stats.ts';
import {
  hasSubstantiveArticleChanges,
  toValidIso8601,
  hasPublishedUkrainianVersion,
  hasPublishedEnglishVersion,
} from '../src/utils/seo.ts';
import { invalidateSitemapCache } from './_sitemap_cache.ts';
import { triggerSitemapAutoUpdate } from './_sitemap_sync.ts';

export { getNeonSql, cleanConnectionString };

export interface Article {
  id: string;
  // Українська версія (основна)
  title: string;
  excerpt: string;
  showExcerptInArticle?: boolean;
  content: string;
  category: string;
  categories?: string[];
  topics?: string[];
  author: string;
  coverImage?: string;
  coverImageCaption?: string;
  coverImageCaptionEn?: string;
  date: string;
  readTime?: string;
  createdAt?: string;
  updatedAt?: string;
  published: boolean;
  views?: number;

  // Англійська версія
  titleEn?: string;
  excerptEn?: string;
  showExcerptInArticleEn?: boolean;
  contentEn?: string;
  categoryEn?: string;
  categoriesEn?: string[];
  topicsEn?: string[];
  publishedEn?: boolean;
}

export const DEFAULT_ARTICLES: Article[] = [];

// Локальне збереження на диску сервера
const DATA_DIR = path.resolve(process.cwd(), 'data');
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');
const ARTICLES_TMP_FILE = '/tmp/impart_articles.json';
const DELETED_ARTICLES_FILE = path.join(DATA_DIR, 'deleted_articles.json');
const DELETED_ARTICLES_TMP_FILE = '/tmp/impart_deleted_articles.json';

export function readDeletedArticleIds(): Set<string> {
  const ids = new Set<string>();
  const paths = [DELETED_ARTICLES_TMP_FILE, DELETED_ARTICLES_FILE];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item) ids.add(String(item).trim());
            }
          }
        }
      }
    } catch {}
  }
  return ids;
}

export function recordDeletedArticleId(id: string): void {
  const cleanId = String(id).trim();
  if (!cleanId) return;
  const current = readDeletedArticleIds();
  current.add(cleanId);
  const payload = JSON.stringify(Array.from(current), null, 2);
  try {
    fs.writeFileSync(DELETED_ARTICLES_TMP_FILE, payload, 'utf-8');
  } catch {}
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DELETED_ARTICLES_FILE, payload, 'utf-8');
  } catch {}
}

export function unrecordDeletedArticleId(id: string): void {
  const cleanId = String(id).trim();
  if (!cleanId) return;
  const current = readDeletedArticleIds();
  if (current.delete(cleanId)) {
    const payload = JSON.stringify(Array.from(current), null, 2);
    try {
      fs.writeFileSync(DELETED_ARTICLES_TMP_FILE, payload, 'utf-8');
    } catch {}
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DELETED_ARTICLES_FILE, payload, 'utf-8');
    } catch {}
  }
}

function readArticlesFromFile(): Article[] | null {
  const deletedIds = readDeletedArticleIds();
  const paths = [ARTICLES_TMP_FILE, ARTICLES_FILE];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            return parsed.filter((a) => a && a.id && !deletedIds.has(String(a.id).trim()));
          }
        }
      }
    } catch (err) {
      console.warn(`Error reading ${p}:`, err);
    }
  }

  return null;
}

function writeArticlesToFile(articles: Article[]): void {
  const deletedIds = readDeletedArticleIds();
  const cleanArticles = articles.filter((a) => a && a.id && !deletedIds.has(String(a.id).trim()));
  const payload = JSON.stringify(cleanArticles, null, 2);

  // 1. Vercel Serverless: запис у /tmp
  try {
    fs.writeFileSync(ARTICLES_TMP_FILE, payload, 'utf-8');
  } catch {}

  // 2. Express сервер: надійний запис у data/articles.json
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(ARTICLES_FILE, payload, 'utf-8');
  } catch (err) {
    console.warn('Failed writing to data/articles.json:', err);
  }
}

// Ініціалізуємо пам'ять з диска або порожнього масиву
const initialArticlesFromFile = readArticlesFromFile();
let inMemoryArticles: Article[] = initialArticlesFromFile !== null ? initialArticlesFromFile : [];
if (inMemoryArticles.length > 0) {
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
        CREATE TABLE IF NOT EXISTS site_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;

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
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;`;
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS show_excerpt_in_article BOOLEAN DEFAULT true;`;
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS show_excerpt_in_article_en BOOLEAN DEFAULT true;`;
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS cover_image_caption TEXT;`;
      await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS cover_image_caption_en TEXT;`;
    }, 4000);

    isTableInitialized = true;
  } catch (error) {
    console.warn('Neon initDb notice (fallback active):', error);
  }
}

export async function getArticles(): Promise<Article[]> {
  try {
    await initDb();
    await ensureStatsLoaded();

    // Завантажуємо список видалених статей із site_settings Neon
    try {
      const deletedSettingRows = await safeExecuteSql(async (sql) => {
        return await sql`SELECT value FROM site_settings WHERE key = 'deleted_articles' LIMIT 1;`;
      }, 2000);
      if (deletedSettingRows && deletedSettingRows.length > 0 && deletedSettingRows[0]?.value) {
        const parsed = typeof deletedSettingRows[0].value === 'string'
          ? JSON.parse(deletedSettingRows[0].value)
          : deletedSettingRows[0].value;
        if (Array.isArray(parsed)) {
          for (const dId of parsed) {
            recordDeletedArticleId(String(dId).trim());
          }
        }
      }
    } catch {}

    const deletedIds = readDeletedArticleIds();

    const rows = await safeExecuteSql(async (sql) => {
      return await sql`
        SELECT 
          a.id, 
          a.title, 
          a.excerpt, 
          a.content, 
          a.category, 
          a.author, 
          a.cover_image as "coverImage", 
          a.date, 
          a.read_time as "readTime", 
          a.created_at as "createdAt",
          a.updated_at as "updatedAt",
          a.published,
          a.title_en as "titleEn",
          a.excerpt_en as "excerptEn",
          a.content_en as "contentEn",
          a.category_en as "categoryEn",
          a.published_en as "publishedEn",
          a.categories,
          a.categories_en as "categoriesEn",
          a.topics,
          a.topics_en as "topicsEn",
          a.show_excerpt_in_article as "showExcerptInArticle",
          a.show_excerpt_in_article_en as "showExcerptInArticleEn",
          a.cover_image_caption as "coverImageCaption",
          a.cover_image_caption_en as "coverImageCaptionEn",
          COALESCE(s.total_views, 0)::int as "views"
        FROM articles a
        LEFT JOIN (
          SELECT article_id, SUM(views) as total_views 
          FROM article_stats_daily 
          GROUP BY article_id
        ) s ON a.id = s.article_id
        ORDER BY a.created_at DESC;
      `;
    }, 4000);

    if (rows && rows.length > 0) {
      const mapped = rows
        .map((r: any) => ({
          id: String(r.id),
          title: String(r.title || ''),
          excerpt: String(r.excerpt || ''),
          showExcerptInArticle: r.showExcerptInArticle !== null && r.showExcerptInArticle !== undefined
            ? (r.showExcerptInArticle === true || String(r.showExcerptInArticle) === 'true' || r.showExcerptInArticle === 1)
            : true,
          content: String(r.content || ''),
          category: String(r.category || 'Загальне'),
          categories: parseJsonArray(r.categories) || (r.category ? r.category.split(',').map((s: string) => s.trim()).filter(Boolean) : ['Загальне']),
          topics: parseJsonArray(r.topics) || [],
          author: String(r.author || 'Редакція The Impart'),
          coverImage: r.coverImage || undefined,
          coverImageCaption: r.coverImageCaption ? String(r.coverImageCaption) : undefined,
          coverImageCaptionEn: r.coverImageCaptionEn ? String(r.coverImageCaptionEn) : undefined,
          date: String(r.date || ''),
          readTime: r.readTime ? String(r.readTime) : undefined,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
          published: r.published === true || String(r.published) === 'true' || r.published === 1,
          titleEn: r.titleEn ? String(r.titleEn) : undefined,
          excerptEn: r.excerptEn ? String(r.excerptEn) : undefined,
          showExcerptInArticleEn: r.showExcerptInArticleEn !== null && r.showExcerptInArticleEn !== undefined
            ? (r.showExcerptInArticleEn === true || String(r.showExcerptInArticleEn) === 'true' || r.showExcerptInArticleEn === 1)
            : undefined,
          contentEn: r.contentEn ? String(r.contentEn) : undefined,
          categoryEn: r.categoryEn ? String(r.categoryEn) : undefined,
          categoriesEn: parseJsonArray(r.categoriesEn) || (r.categoryEn ? r.categoryEn.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined),
          topicsEn: parseJsonArray(r.topicsEn) || [],
          publishedEn: r.publishedEn === true || String(r.publishedEn) === 'true' || r.publishedEn === 1,
          views: Math.max(parseInt(r.views, 10) || 0, getTotalViews(String(r.id))),
        }))
        .filter((a: Article) => !deletedIds.has(String(a.id).trim()));

      inMemoryArticles = mapped;

      // Об'єднуємо статті з БД та локально створеними статтями, АЛЕ ТІЛЬКИ тими, які НЕ видалялися!
      const localArticles = readArticlesFromFile() || [];
      if (Array.isArray(localArticles) && localArticles.length > 0) {
        for (const local of localArticles) {
          const localId = String(local.id).trim();
          if (deletedIds.has(localId)) continue;
          const idx = inMemoryArticles.findIndex((m) => String(m.id).trim() === localId);
          if (idx === -1) {
            inMemoryArticles.push({
              ...local,
              views: Math.max(local.views || 0, getTotalViews(local.id)),
            });
          } else {
            inMemoryArticles[idx].views = Math.max(
              inMemoryArticles[idx].views || 0,
              local.views || 0,
              getTotalViews(local.id)
            );
          }
        }
      }

      // Сортуємо строго хронологічно за датою первинного створення
      inMemoryArticles.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.date || 0).getTime();
        const timeB = new Date(b.createdAt || b.date || 0).getTime();
        return timeB - timeA;
      });

      inMemoryArticles = inMemoryArticles.filter((a) => !deletedIds.has(String(a.id).trim()));
      writeArticlesToFile(inMemoryArticles);
      return inMemoryArticles.map((a) => {
        const statsViews = getTotalViews(a.id);
        const finalViews = Math.max(a.views || 0, statsViews);
        return {
          ...a,
          views: finalViews,
        };
      });
    } else if (rows && rows.length === 0) {
      const localArticles = (readArticlesFromFile() || []).filter((a) => !deletedIds.has(String(a.id).trim()));
      inMemoryArticles = localArticles;
      if (inMemoryArticles.length > 0) {
        for (const a of inMemoryArticles) {
          if (deletedIds.has(String(a.id).trim())) continue;
          try {
            await safeExecuteSql(async (sql) => {
              const catsJson = JSON.stringify(a.categories || (a.category ? [a.category] : ['Загальне']));
              const catsEnJson = a.categoriesEn ? JSON.stringify(a.categoriesEn) : (a.categoryEn ? JSON.stringify([a.categoryEn]) : null);
              const topJson = a.topics && a.topics.length > 0 ? JSON.stringify(a.topics) : '[]';
              const topEnJson = a.topicsEn && a.topicsEn.length > 0 ? JSON.stringify(a.topicsEn) : '[]';
              const showExcerpt = a.showExcerptInArticle !== false && String(a.showExcerptInArticle) !== 'false';
              const showExcerptEn = a.showExcerptInArticleEn !== undefined ? (a.showExcerptInArticleEn !== false && String(a.showExcerptInArticleEn) !== 'false') : showExcerpt;
              await sql`
                INSERT INTO articles (
                  id, title, excerpt, show_excerpt_in_article, content, category, author, cover_image, date, read_time, published,
                  title_en, excerpt_en, show_excerpt_in_article_en, content_en, category_en, published_en,
                  categories, categories_en, topics, topics_en, created_at, updated_at
                )
                VALUES (
                  ${a.id}, ${a.title}, ${a.excerpt}, ${showExcerpt}, ${a.content}, ${a.category}, ${a.author},
                  ${a.coverImage || null}, ${a.date}, ${a.readTime || null}, ${a.published},
                  ${a.titleEn || null}, ${a.excerptEn || null}, ${showExcerptEn}, ${a.contentEn || null},
                  ${a.categoryEn || null}, ${a.publishedEn ?? false},
                  ${catsJson}, ${catsEnJson}, ${topJson}, ${topEnJson},
                  ${a.createdAt ? new Date(a.createdAt) : new Date()},
                  ${a.updatedAt ? new Date(a.updatedAt) : null}
                )
                ON CONFLICT (id) DO NOTHING;
              `;
            }, 3000);
          } catch {}
        }
      }
      writeArticlesToFile(inMemoryArticles);
      return inMemoryArticles.map((a) => ({
        ...a,
        views: getTotalViews(a.id),
      }));
    }
  } catch (error) {
    console.warn('Neon query error in getArticles, loading from disk/memory:', error);
  }

  const deletedIds = readDeletedArticleIds();
  const fromFile = readArticlesFromFile();
  if (fromFile !== null) {
    inMemoryArticles = fromFile.filter((a) => !deletedIds.has(String(a.id).trim()));
  } else {
    inMemoryArticles = inMemoryArticles.filter((a) => !deletedIds.has(String(a.id).trim()));
  }

  return inMemoryArticles.map((a) => ({
    ...a,
    views: getTotalViews(a.id),
  }));
}

export async function saveArticle(article: Article): Promise<Article> {
  const isPub = article.published !== false && String(article.published) !== 'false';
  const isPubEn = article.publishedEn === true || String(article.publishedEn) === 'true' || (article.publishedEn as any) === 1;

  const id = String(article.id || Date.now().toString());

  // 1. Знаходимо, чи існує вже стаття у пам'яті, на диску або в Neon PostgreSQL (важливо для serverless cold start)
  if (inMemoryArticles.length === 0) {
    const fromDisk = readArticlesFromFile();
    if (fromDisk !== null && fromDisk.length > 0) {
      inMemoryArticles = fromDisk;
    }
  }
  const existingIdx = inMemoryArticles.findIndex((a) => String(a.id).trim() === id.trim());
  let existing: Article | undefined = existingIdx >= 0 ? inMemoryArticles[existingIdx] : undefined;

  if (!existing) {
    try {
      await initDb();
      const dbRows = await safeExecuteSql(async (sql) => {
        return await sql`
          SELECT
            id, title, excerpt, content, category, author,
            cover_image as "coverImage", date, read_time as "readTime",
            created_at as "createdAt", updated_at as "updatedAt", published,
            title_en as "titleEn", excerpt_en as "excerptEn", content_en as "contentEn",
            category_en as "categoryEn", published_en as "publishedEn",
            categories, categories_en as "categoriesEn"
          FROM articles
          WHERE id = ${id}
          LIMIT 1;
        `;
      }, 2500);
      if (dbRows && dbRows.length > 0) {
        const r = dbRows[0];
        existing = {
          id: String(r.id),
          title: String(r.title || ''),
          excerpt: String(r.excerpt || ''),
          content: String(r.content || ''),
          category: String(r.category || 'Загальне'),
          categories: parseJsonArray(r.categories),
          author: String(r.author || 'Редакція The Impart'),
          coverImage: r.coverImage || undefined,
          date: String(r.date || ''),
          readTime: r.readTime ? String(r.readTime) : undefined,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
          published: r.published === true || String(r.published) === 'true' || r.published === 1,
          titleEn: r.titleEn ? String(r.titleEn) : undefined,
          excerptEn: r.excerptEn ? String(r.excerptEn) : undefined,
          contentEn: r.contentEn ? String(r.contentEn) : undefined,
          categoryEn: r.categoryEn ? String(r.categoryEn) : undefined,
          categoriesEn: parseJsonArray(r.categoriesEn),
          publishedEn: r.publishedEn === true || String(r.publishedEn) === 'true' || r.publishedEn === 1,
        };
      }
    } catch {}
  }

  const title = String(article.title || '').trim();
  const excerpt = String(article.excerpt || '').trim();
  const content = String(article.content || '').trim();
  const category = String(article.category || 'Загальне').trim();
  const author = String(article.author || 'Редакція The Impart').trim();
  const coverImage = article.coverImage ? String(article.coverImage).trim() : undefined;
  const coverImageCaption = article.coverImageCaption ? String(article.coverImageCaption).trim() : undefined;
  const coverImageCaptionEn = article.coverImageCaptionEn ? String(article.coverImageCaptionEn).trim() : undefined;
  const readTime = article.readTime ? String(article.readTime) : undefined;

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

  // КРИТИЧНО: Первинна дата створення (createdAt) фіксується при першому створенні.
  // Відображувана дата публікації (date) зберігається, якщо не передано нову дату для редагування.
  const createdAt =
    (existing?.createdAt && toValidIso8601(existing.createdAt)) ||
    toValidIso8601(article.createdAt) ||
    new Date().toISOString();
  const date =
    (article.date && String(article.date).trim()) ||
    existing?.date ||
    new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });

  // updated_at (updatedAt) оновлюється ТІЛЬКИ якщо існуюча стаття зазнала справжніх суттєвих змін змісту
  const nextComparable: Partial<Article> = {
    title,
    excerpt,
    content,
    category: categories.join(', ') || category,
    categories,
    author,
    coverImage,
    coverImageCaption,
    coverImageCaptionEn,
    titleEn,
    excerptEn,
    contentEn,
    categoryEn: categoriesEn.length > 0 ? categoriesEn.join(', ') : categoryEn,
    categoriesEn: categoriesEn.length > 0 ? categoriesEn : undefined,
  };
  const updatedAt = existing
    ? hasSubstantiveArticleChanges(existing, nextComparable)
      ? new Date().toISOString()
      : toValidIso8601(existing.updatedAt)
    : undefined;

  const showExcerptInArticle = article.showExcerptInArticle !== undefined
    ? (article.showExcerptInArticle === true || String(article.showExcerptInArticle) === 'true')
    : true;
  const showExcerptInArticleEn = article.showExcerptInArticleEn !== undefined
    ? (article.showExcerptInArticleEn === true || String(article.showExcerptInArticleEn) === 'true')
    : undefined;

  const fullArticle: Article = {
    id,
    title,
    excerpt,
    showExcerptInArticle,
    content,
    category: categories.join(', ') || category,
    categories,
    topics,
    author,
    coverImage,
    coverImageCaption,
    coverImageCaptionEn,
    date,
    readTime,
    createdAt,
    updatedAt,
    published: isPub,
    titleEn,
    excerptEn,
    showExcerptInArticleEn,
    contentEn,
    categoryEn: categoriesEn.length > 0 ? categoriesEn.join(', ') : categoryEn,
    categoriesEn: categoriesEn.length > 0 ? categoriesEn : undefined,
    topicsEn,
    publishedEn: isPubEn,
  };

  // Знімаємо позначку видаленої статті, якщо стаття створюється або оновлюється
  unrecordDeletedArticleId(id);

  // 1. Оновлюємо пам'ять
  if (existingIdx >= 0) {
    inMemoryArticles[existingIdx] = fullArticle;
  } else {
    inMemoryArticles = [fullArticle, ...inMemoryArticles];
  }

  // 2. Сортуємо пам'ять строго за первинною датою створення, щоб редагування не зміщувало статтю у стрічці
  inMemoryArticles.sort((a, b) => {
    const timeA = new Date(a.createdAt || a.date || 0).getTime();
    const timeB = new Date(b.createdAt || b.date || 0).getTime();
    return timeB - timeA;
  });

  // 3. Миттєво записуємо у файл
  writeArticlesToFile(inMemoryArticles);

  // 4. Синхронізуємо з Neon PostgreSQL з безпечним тайм-аутом
  try {
    await initDb();
    const categoriesJson = JSON.stringify(categories);
    const categoriesEnJson = categoriesEn.length > 0 ? JSON.stringify(categoriesEn) : null;
    const topicsJson = JSON.stringify(topics);
    const topicsEnJson = JSON.stringify(topicsEn);
    const allDeleted = Array.from(readDeletedArticleIds());

    await safeExecuteSql(async (sql) => {
      await sql`
        INSERT INTO site_settings (key, value)
        VALUES ('deleted_articles', ${JSON.stringify(allDeleted)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
      `;

      await sql`
        INSERT INTO articles (
          id, title, excerpt, show_excerpt_in_article, content, category, author, cover_image, date, read_time, published,
          title_en, excerpt_en, show_excerpt_in_article_en, content_en, category_en, published_en,
          categories, categories_en, topics, topics_en,
          cover_image_caption, cover_image_caption_en,
          created_at, updated_at
        )
        VALUES (
          ${id}, 
          ${title}, 
          ${excerpt}, 
          ${showExcerptInArticle},
          ${content}, 
          ${category}, 
          ${author}, 
          ${coverImage || null}, 
          ${date}, 
          ${readTime || null}, 
          ${isPub},
          ${titleEn || null},
          ${excerptEn || null},
          ${showExcerptInArticleEn !== undefined ? showExcerptInArticleEn : true},
          ${contentEn || null},
          ${categoryEn || null},
          ${isPubEn},
          ${categoriesJson},
          ${categoriesEnJson},
          ${topicsJson},
          ${topicsEnJson},
          ${coverImageCaption || null},
          ${coverImageCaptionEn || null},
          ${createdAt ? new Date(createdAt) : new Date()},
          ${updatedAt ? new Date(updatedAt) : null}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          excerpt = EXCLUDED.excerpt,
          show_excerpt_in_article = EXCLUDED.show_excerpt_in_article,
          content = EXCLUDED.content,
          category = EXCLUDED.category,
          author = EXCLUDED.author,
          cover_image = EXCLUDED.cover_image,
          cover_image_caption = EXCLUDED.cover_image_caption,
          cover_image_caption_en = EXCLUDED.cover_image_caption_en,
          read_time = EXCLUDED.read_time,
          published = EXCLUDED.published,
          title_en = EXCLUDED.title_en,
          excerpt_en = EXCLUDED.excerpt_en,
          show_excerpt_in_article_en = EXCLUDED.show_excerpt_in_article_en,
          content_en = EXCLUDED.content_en,
          category_en = EXCLUDED.category_en,
          published_en = EXCLUDED.published_en,
          categories = EXCLUDED.categories,
          categories_en = EXCLUDED.categories_en,
          topics = EXCLUDED.topics,
          topics_en = EXCLUDED.topics_en,
          updated_at = EXCLUDED.updated_at;
      `;
    }, 8000);
  } catch (error: any) {
    console.warn('Neon save notice (article is saved locally):', error);
  }

  const currentTotal = getTotalViews(id);
  const preservedViews = Math.max(
    article.views ?? 0,
    currentTotal,
    existing?.views ?? 0
  );
  fullArticle.views = preservedViews;
  invalidateSitemapCache();
  triggerSitemapAutoUpdate();
  return fullArticle;
}

export async function deleteArticle(id: string): Promise<boolean> {
  const targetId = String(id).trim();
  if (!targetId) return true;

  // 1. Фіксуємо видалення у локальному та хмарному tombstone-списку
  recordDeletedArticleId(targetId);

  // 2. Завантажуємо з диска, якщо пам'ять порожня
  if (inMemoryArticles.length === 0) {
    const fromDisk = readArticlesFromFile();
    if (fromDisk !== null) {
      inMemoryArticles = fromDisk;
    }
  }

  // 3. Видаляємо з пам'яті
  inMemoryArticles = inMemoryArticles.filter((a) => String(a.id).trim() !== targetId);

  // 4. Оновлюємо файл на диску та в /tmp
  writeArticlesToFile(inMemoryArticles);
  invalidateSitemapCache();
  triggerSitemapAutoUpdate();

  // 5. Синхронізуємо видалення з Neon (видаляємо рядок та оновлюємо site_settings)
  try {
    await initDb();
    const allDeleted = Array.from(readDeletedArticleIds());
    await safeExecuteSql(async (sql) => {
      await sql`DELETE FROM articles WHERE id = ${targetId};`;
      await sql`
        INSERT INTO site_settings (key, value)
        VALUES ('deleted_articles', ${JSON.stringify(allDeleted)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
      `;
    }, 4000);
  } catch (error) {
    console.warn('Neon delete notice:', error);
  }

  return true;
}

/**
 * Очищує статтю для публічної видачі анонімним користувачам та пошуковим роботам:
 * - приховує чернетки, де не опублікована жодна мовна версія;
 * - видаляє поля неопублікованого перекладу;
 * - замінює великі inline data:image/* обкладинки на кешований публічний маршрут /uploads/cover-:id.
 */
export function sanitizePublicArticle(article: Article): Article | null {
  const pubUa = hasPublishedUkrainianVersion(article);
  const pubEn = hasPublishedEnglishVersion(article);

  if (!pubUa && !pubEn) {
    return null;
  }

  let normalizedCover = article.coverImage;
  if (typeof normalizedCover === 'string' && normalizedCover.trim().startsWith('data:image/')) {
    normalizedCover = `/uploads/cover-${encodeURIComponent(String(article.id).trim())}`;
  }

  const sanitized: Article = {
    ...article,
    coverImage: normalizedCover,
    published: pubUa,
    publishedEn: pubEn,
  };

  if (!pubUa) {
    sanitized.title = '';
    sanitized.excerpt = '';
    sanitized.content = '';
    sanitized.showExcerptInArticle = false;
  }

  if (!pubEn) {
    delete sanitized.titleEn;
    delete sanitized.excerptEn;
    delete sanitized.showExcerptInArticleEn;
    delete sanitized.contentEn;
    delete sanitized.categoryEn;
    delete sanitized.categoriesEn;
    delete sanitized.topicsEn;
  }

  return sanitized;
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
      res.setHeader('Vary', 'Authorization');
      const token = extractToken(req);
      const isAuthorizedStaff = Boolean(token && verifyEditorOrAdminToken(token));
      const articles = await getArticles();

      if (isAuthorizedStaff) {
        res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        return res.status(200).json(articles);
      }

      res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      const publicArticles = articles
        .map(sanitizePublicArticle)
        .filter((item): item is Article => item !== null);
      return res.status(200).json(publicArticles);
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
        showExcerptInArticle: body.showExcerptInArticle !== undefined
          ? (body.showExcerptInArticle === true || String(body.showExcerptInArticle) === 'true')
          : true,
        content: body.content ? String(body.content).trim() : '',
        category: body.category ? String(body.category).trim() : 'Загальне',
        categories: parseJsonArray(body.categories) || (body.category ? body.category.split(',').map((s: string) => s.trim()).filter(Boolean) : ['Загальне']),
        topics: parseJsonArray(body.topics) || [],
        author: body.author ? String(body.author).trim() : 'Редакція The Impart',
        coverImage: body.coverImage ? String(body.coverImage).trim() : undefined,
        date: body.date ? String(body.date).trim() : '',
        readTime: body.readTime ? String(body.readTime) : undefined,
        createdAt: body.createdAt ? String(body.createdAt) : undefined,
        updatedAt: body.updatedAt ? String(body.updatedAt) : undefined,
        published: body.published !== false && String(body.published) !== 'false',
        // Англійські поля
        titleEn: body.titleEn ? String(body.titleEn).trim() : undefined,
        excerptEn: body.excerptEn ? String(body.excerptEn).trim() : undefined,
        showExcerptInArticleEn: body.showExcerptInArticleEn !== undefined
          ? (body.showExcerptInArticleEn === true || String(body.showExcerptInArticleEn) === 'true')
          : undefined,
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

      let id = req.query?.id || req.params?.id;
      if (!id) {
        try {
          const body = await parseRequestBody(req);
          id = body?.id;
        } catch {}
      }
      if (!id && req.url) {
        try {
          const parsedUrl = new URL(req.url, 'http://localhost');
          id = parsedUrl.searchParams.get('id');
        } catch {}
      }

      if (!id || !String(id).trim()) {
        return res.status(400).json({ error: 'Параметр ID є обов\'язковим' });
      }

      const cleanId = String(id).trim();
      await deleteArticle(cleanId);
      return res.status(200).json({ success: true, id: cleanId });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('API /api/articles error:', error);
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      return res.status(500).json({ error: 'Помилка збереження статті на сервері: ' + (error?.message || error) });
    }
    return res.status(200).json(inMemoryArticles);
  }
}
