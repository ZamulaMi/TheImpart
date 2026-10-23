import fs from 'fs';
import path from 'path';
import { getNeonSql, safeExecuteSql } from './_db.ts';
import { verifyEditorOrAdminToken, extractToken } from './_auth_utils.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';
import { getArticles } from './articles.ts';
import { SEED_ARTICLES } from '../src/data/seedArticles.ts';

export interface DailyArticleStat {
  articleId: string;
  date: string; // YYYY-MM-DD
  views: number;
  durationSeconds: number;
}

export interface StatsConfig {
  thresholdSeconds: number; // default: 10
}

export interface StatsStoreData {
  config: StatsConfig;
  records: DailyArticleStat[];
  totals: Record<string, { views: number; durationSeconds: number }>;
}

export interface ArticleStatsSummaryItem {
  id: string;
  title: string;
  titleEn?: string;
  category: string;
  categories?: string[];
  topics?: string[];
  author?: string;
  coverImage?: string;
  published: boolean;
  publishedEn?: boolean;
  date: string;
  createdAt?: string;
  viewsInPeriod: number;
  totalViews: number;
  durationSecondsInPeriod: number;
  avgDurationSecondsInPeriod: number;
  totalDurationSeconds: number;
}

export interface StatsTimeSeriesPoint {
  date: string;
  label: string;
  views: number;
  durationSeconds: number;
}

export interface StatsSummaryResponse {
  config: StatsConfig;
  period: 'day' | 'week' | 'month' | '3months' | 'halfyear' | 'year' | 'all';
  year?: number;
  summary: {
    totalViews: number;
    totalDurationSeconds: number;
    avgDurationSeconds: number;
    articlesCount: number;
  };
  timeSeries: StatsTimeSeriesPoint[];
  articles: ArticleStatsSummaryItem[];
}

const DEFAULT_CONFIG: StatsConfig = {
  thresholdSeconds: 5,
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const STATS_TMP_FILE = '/tmp/impart_stats.json';

// Отримання поточної дати за київським часом (YYYY-MM-DD)
export function getKyivDateString(date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

// Допоміжна функція для отримання дати N днів тому (YYYY-MM-DD)
function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getKyivDateString(d);
}

// Початкові статистичні дані (порожні після очищення)
function generateSeedStats(): StatsStoreData {
  return {
    config: { ...DEFAULT_CONFIG },
    records: [],
    totals: {},
  };
}

function readStatsFromFile(): StatsStoreData | null {
  const paths = [STATS_FILE, STATS_TMP_FILE];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === 'object') {
            return {
              config: {
                thresholdSeconds:
                  typeof parsed.config?.thresholdSeconds === 'number' && parsed.config.thresholdSeconds > 0
                    ? parsed.config.thresholdSeconds
                    : DEFAULT_CONFIG.thresholdSeconds,
              },
              records: Array.isArray(parsed.records) ? parsed.records : [],
              totals: parsed.totals && typeof parsed.totals === 'object' ? parsed.totals : {},
            };
          }
        }
      }
    } catch {}
  }
  return null;
}

function writeStatsToFile(data: StatsStoreData): void {
  const payload = JSON.stringify(data, null, 2);

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATS_FILE, payload, 'utf-8');
  } catch {}

  try {
    fs.writeFileSync(STATS_TMP_FILE, payload, 'utf-8');
  } catch {}
}

// Ініціалізація пам'яті
const initialStatsFromFile = readStatsFromFile();
let inMemoryStats: StatsStoreData = initialStatsFromFile || generateSeedStats();
if (!initialStatsFromFile) {
  writeStatsToFile(inMemoryStats);
}

// Кеш для запобігання дублюванню зарахування перегляду в межах однієї сесії/сторінки
const sessionViewCache = new Set<string>();

let isStatsDbInitialized = false;
let lastStatsDbLoadedAt = 0;
let statsLoadPromise: Promise<void> | null = null;
const STATS_CACHE_TTL_MS = 15000; // 15 секунд кешування для високої швидкодії та актуальності

export async function ensureStatsLoaded(forceRefresh = false): Promise<void> {
  const isFresh = isStatsDbInitialized && Date.now() - lastStatsDbLoadedAt < STATS_CACHE_TTL_MS;
  if (isFresh && !forceRefresh) return;
  if (statsLoadPromise && !forceRefresh) return statsLoadPromise;

  statsLoadPromise = (async () => {
    try {
      await safeExecuteSql(async (sql) => {
        // Створення таблиць якщо вони ще не існують
        await sql`
          CREATE TABLE IF NOT EXISTS site_stats_config (
            key VARCHAR(100) PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS article_stats_daily (
            article_id VARCHAR(255) NOT NULL,
            date VARCHAR(20) NOT NULL,
            views INTEGER DEFAULT 0,
            duration_seconds INTEGER DEFAULT 0,
            PRIMARY KEY (article_id, date)
          );
        `;

        // 1. Завантаження конфігурації
        const cfgRows = await sql`SELECT key, value FROM site_stats_config;`;
        if (cfgRows && Array.isArray(cfgRows)) {
          for (const row of cfgRows) {
            if (row.key === 'threshold_seconds' && row.value) {
              const val = parseInt(row.value, 10);
              if (!isNaN(val) && val > 0) {
                inMemoryStats.config.thresholdSeconds = val;
              }
            }
          }
        }

        // 2. Завантаження всіх збережених показників із PostgreSQL
        const rows = await sql`
          SELECT article_id, date, views, duration_seconds 
          FROM article_stats_daily;
        `;

        if (rows && Array.isArray(rows)) {
          for (const r of rows) {
            const articleId = String(r.article_id);
            const date = String(r.date);
            const views = Math.max(0, parseInt(r.views, 10) || 0);
            const durationSeconds = Math.max(0, parseInt(r.duration_seconds, 10) || 0);

            const existing = inMemoryStats.records.find((rec) => rec.articleId === articleId && rec.date === date);
            if (existing) {
              existing.views = Math.max(existing.views, views);
              existing.durationSeconds = Math.max(existing.durationSeconds, durationSeconds);
            } else {
              inMemoryStats.records.push({
                articleId,
                date,
                views,
                durationSeconds,
              });
            }
          }
        }

        // 3. Синхронізація локальних записів до PostgreSQL (якщо в пам'яті були новіші значення)
        for (const rec of inMemoryStats.records) {
          const matchingDbRow = rows && Array.isArray(rows) 
            ? rows.find((r: any) => String(r.article_id) === rec.articleId && String(r.date) === rec.date)
            : null;
          const dbViews = matchingDbRow ? parseInt(matchingDbRow.views, 10) || 0 : 0;
          const dbDuration = matchingDbRow ? parseInt(matchingDbRow.duration_seconds, 10) || 0 : 0;

          if (!matchingDbRow || rec.views > dbViews || rec.durationSeconds > dbDuration) {
            await sql`
              INSERT INTO article_stats_daily (article_id, date, views, duration_seconds)
              VALUES (${rec.articleId}, ${rec.date}, ${rec.views}, ${rec.durationSeconds})
              ON CONFLICT (article_id, date) DO UPDATE
              SET views = GREATEST(article_stats_daily.views, ${rec.views}),
                  duration_seconds = GREATEST(article_stats_daily.duration_seconds, ${rec.durationSeconds});
            `;
          }
        }

        // 4. Повний перерахунок загальних агрегованих показників (totals)
        const newTotals: Record<string, { views: number; durationSeconds: number }> = {};
        for (const r of inMemoryStats.records) {
          if (!newTotals[r.articleId]) {
            newTotals[r.articleId] = { views: 0, durationSeconds: 0 };
          }
          newTotals[r.articleId].views += Number(r.views) || 0;
          newTotals[r.articleId].durationSeconds += Number(r.durationSeconds) || 0;
        }
        inMemoryStats.totals = newTotals;

        // 5. Запис у локальний кеш на диску для миттєвого читання
        writeStatsToFile(inMemoryStats);
      }, 6000);
      isStatsDbInitialized = true;
      lastStatsDbLoadedAt = Date.now();
    } catch (err) {
      console.warn('Neon stats DB load notice (fallback active):', err);
    } finally {
      statsLoadPromise = null;
    }
  })();

  return statsLoadPromise;
}

// Запускаємо фонове завантаження при старті
ensureStatsLoaded().catch(() => {});

export async function getStatsConfig(): Promise<StatsConfig> {
  await ensureStatsLoaded();
  return inMemoryStats.config;
}

export async function saveStatsConfig(thresholdSeconds: number): Promise<StatsConfig> {
  const cleanSec = Math.max(1, Math.min(600, Math.round(Number(thresholdSeconds) || 10)));
  inMemoryStats.config.thresholdSeconds = cleanSec;
  writeStatsToFile(inMemoryStats);

  try {
    await ensureStatsLoaded();
    await safeExecuteSql(async (sql) => {
      await sql`
        INSERT INTO site_stats_config (key, value, updated_at)
        VALUES ('threshold_seconds', ${String(cleanSec)}, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE
        SET value = ${String(cleanSec)}, updated_at = CURRENT_TIMESTAMP;
      `;
    }, 3000);
  } catch (err) {
    console.warn('Neon saveStatsConfig notice:', err);
  }

  return inMemoryStats.config;
}

export function getArticleViewsMap(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of inMemoryStats.records) {
    map[r.articleId] = (map[r.articleId] || 0) + (Number(r.views) || 0);
  }
  for (const [id, tot] of Object.entries(inMemoryStats.totals)) {
    map[id] = Math.max(map[id] || 0, tot.views || 0);
  }
  return map;
}

export function getTotalViews(articleId: string): number {
  const totViews = inMemoryStats.totals[articleId]?.views || 0;
  let recordsSum = 0;
  for (const r of inMemoryStats.records) {
    if (r.articleId === articleId) {
      recordsSum += Number(r.views) || 0;
    }
  }
  return Math.max(totViews, recordsSum);
}

export async function recordVisit(payload: {
  articleId: string;
  durationSeconds?: number;
  qualifyView?: boolean;
  sessionId?: string;
}): Promise<{ views: number; totalDurationSeconds: number }> {
  const articleId = String(payload.articleId || '').trim();
  if (!articleId) {
    throw new Error('articleId is required');
  }

  // Обов'язково підтягуємо збережені дані з бази даних
  await ensureStatsLoaded();

  const today = getKyivDateString();
  const sessionId = payload.sessionId ? String(payload.sessionId).trim() : '';
  const qualifyView = Boolean(payload.qualifyView);
  const addSeconds = Math.max(0, Math.min(180, Math.round(Number(payload.durationSeconds) || 0)));

  // Перевірка чи зараховувати перегляд
  let shouldIncrementView = false;
  if (qualifyView) {
    const sessionKey = `${sessionId}_${articleId}`;
    if (!sessionId || !sessionViewCache.has(sessionKey)) {
      if (sessionId) {
        sessionViewCache.add(sessionKey);
        // Обмежуємо розмір кешу
        if (sessionViewCache.size > 20000) {
          const arr = Array.from(sessionViewCache);
          sessionViewCache.clear();
          for (let i = arr.length - 10000; i < arr.length; i++) {
            sessionViewCache.add(arr[i]);
          }
        }
      }
      shouldIncrementView = true;
    }
  }

  // Оновлюємо або створюємо щоденний запис
  let record = inMemoryStats.records.find((r) => r.articleId === articleId && r.date === today);
  if (!record) {
    record = {
      articleId,
      date: today,
      views: 0,
      durationSeconds: 0,
    };
    inMemoryStats.records.push(record);
  }

  if (shouldIncrementView) {
    record.views += 1;
  }
  if (addSeconds > 0) {
    record.durationSeconds += addSeconds;
  }

  // Оновлюємо загальні показники статті (totals)
  if (!inMemoryStats.totals[articleId]) {
    inMemoryStats.totals[articleId] = { views: 0, durationSeconds: 0 };
  }
  if (shouldIncrementView) {
    inMemoryStats.totals[articleId].views += 1;
  }
  if (addSeconds > 0) {
    inMemoryStats.totals[articleId].durationSeconds += addSeconds;
  }

  // Зберігаємо у локальний файл
  writeStatsToFile(inMemoryStats);

  // Синхронізуємо з Neon PostgreSQL
  const vInc = shouldIncrementView ? 1 : 0;
  if (vInc > 0 || addSeconds > 0) {
    safeExecuteSql(async (sql) => {
      await sql`
        INSERT INTO article_stats_daily (article_id, date, views, duration_seconds)
        VALUES (${articleId}, ${today}, ${vInc}, ${addSeconds})
        ON CONFLICT (article_id, date) DO UPDATE
        SET views = article_stats_daily.views + ${vInc},
            duration_seconds = article_stats_daily.duration_seconds + ${addSeconds};
      `;
    }, 4000).catch((err) => {
      console.warn('Neon recordVisit sync notice:', err);
    });
  }

  return {
    views: getTotalViews(articleId),
    totalDurationSeconds: inMemoryStats.totals[articleId]?.durationSeconds || 0,
  };
}

export async function getStatsSummary(options: {
  period?: string;
  year?: number;
  search?: string;
  category?: string;
  topic?: string;
}): Promise<StatsSummaryResponse> {
  await ensureStatsLoaded();
  const period = (options.period || 'all') as StatsSummaryResponse['period'];
  const today = getKyivDateString();
  const currentYear = new Date().getFullYear();
  const selectedYear = options.year || currentYear;

  // Отримуємо актуальні статті для метаданих
  let articlesList: any[] = [];
  try {
    articlesList = await getArticles();
  } catch {
    articlesList = SEED_ARTICLES || [];
  }

  // Визначаємо початкову дату фільтрації за періодом
  let filterFn: (dateStr: string) => boolean;

  if (period === 'day') {
    filterFn = (d) => d === today;
  } else if (period === 'week') {
    const weekAgo = getDateDaysAgo(7);
    filterFn = (d) => d >= weekAgo && d <= today;
  } else if (period === 'month') {
    const monthAgo = getDateDaysAgo(30);
    filterFn = (d) => d >= monthAgo && d <= today;
  } else if (period === '3months') {
    const threeAgo = getDateDaysAgo(90);
    filterFn = (d) => d >= threeAgo && d <= today;
  } else if (period === 'halfyear') {
    const halfAgo = getDateDaysAgo(180);
    filterFn = (d) => d >= halfAgo && d <= today;
  } else if (period === 'year') {
    filterFn = (d) => d.startsWith(String(selectedYear));
  } else {
    // all
    filterFn = () => true;
  }

  // Агрегуємо показники за обраний період для кожної статті
  const periodStatsByArticle: Record<string, { views: number; durationSeconds: number }> = {};
  const timeSeriesMap: Record<string, { views: number; durationSeconds: number }> = {};

  for (const rec of inMemoryStats.records) {
    if (filterFn(rec.date)) {
      if (!periodStatsByArticle[rec.articleId]) {
        periodStatsByArticle[rec.articleId] = { views: 0, durationSeconds: 0 };
      }
      periodStatsByArticle[rec.articleId].views += rec.views;
      periodStatsByArticle[rec.articleId].durationSeconds += rec.durationSeconds;

      if (!timeSeriesMap[rec.date]) {
        timeSeriesMap[rec.date] = { views: 0, durationSeconds: 0 };
      }
      timeSeriesMap[rec.date].views += rec.views;
      timeSeriesMap[rec.date].durationSeconds += rec.durationSeconds;
    }
  }

  // Фільтрація статей за пошуковими словами, рубрикою та темою
  const cleanSearch = (options.search || '').trim().toLowerCase();
  const cleanCat = (options.category || '').trim().toLowerCase();
  const cleanTopic = (options.topic || '').trim().toLowerCase();

  const filteredArticles = articlesList.filter((art) => {
    // Фільтр за рубрикою
    if (cleanCat && cleanCat !== 'all' && cleanCat !== 'всі') {
      const catsUa = (art.categories && art.categories.length > 0
        ? art.categories
        : art.category ? art.category.split(',').map((s: string) => s.trim()) : []
      ).map((c: string) => c.toLowerCase());
      const catsEn = (art.categoriesEn && art.categoriesEn.length > 0
        ? art.categoriesEn
        : art.categoryEn ? art.categoryEn.split(',').map((s: string) => s.trim()) : []
      ).map((c: string) => c.toLowerCase());

      const matchCat = [...catsUa, ...catsEn].some((c) => c === cleanCat || c.includes(cleanCat));
      if (!matchCat) return false;
    }

    // Фільтр за темою
    if (cleanTopic && cleanTopic !== 'all' && cleanTopic !== 'всі') {
      const topUa = (art.topics || []).map((t: string) => t.trim().toLowerCase());
      const topEn = (art.topicsEn || []).map((t: string) => t.trim().toLowerCase());

      const matchTopic = [...topUa, ...topEn].some((t) => t === cleanTopic || t.includes(cleanTopic));
      if (!matchTopic) return false;
    }

    // Пошук за будь-якими словами
    if (cleanSearch) {
      const textCorpus = [
        art.title,
        art.titleEn,
        art.excerpt,
        art.excerptEn,
        art.content,
        art.contentEn,
        art.author,
        art.category,
        art.categoryEn,
        ...(art.categories || []),
        ...(art.categoriesEn || []),
        ...(art.topics || []),
        ...(art.topicsEn || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!textCorpus.includes(cleanSearch)) {
        return false;
      }
    }

    return true;
  });

  // Формуємо масив статей з показниками
  const articleSummaries: ArticleStatsSummaryItem[] = filteredArticles.map((art) => {
    const artId = String(art.id);
    const pStat = periodStatsByArticle[artId] || { views: 0, durationSeconds: 0 };
    const tot = inMemoryStats.totals[artId] || { views: 0, durationSeconds: 0 };

    const avgDuration = pStat.views > 0 ? Math.round(pStat.durationSeconds / pStat.views) : 0;

    return {
      id: artId,
      title: art.title || 'Без назви',
      titleEn: art.titleEn,
      category: art.category || 'Загальне',
      categories: art.categories || (art.category ? [art.category] : ['Загальне']),
      topics: art.topics || [],
      author: art.author,
      coverImage: art.coverImage,
      published: art.published !== false,
      publishedEn: art.publishedEn === true,
      date: art.date || '',
      createdAt: art.createdAt,
      viewsInPeriod: pStat.views,
      totalViews: tot.views,
      durationSecondsInPeriod: pStat.durationSeconds,
      avgDurationSecondsInPeriod: avgDuration,
      totalDurationSeconds: tot.durationSeconds,
    };
  });

  // Сортуємо за переглядами за період спадно за замовчуванням
  articleSummaries.sort((a, b) => {
    if (b.viewsInPeriod !== a.viewsInPeriod) {
      return b.viewsInPeriod - a.viewsInPeriod;
    }
    return b.durationSecondsInPeriod - a.durationSecondsInPeriod;
  });

  // Загальні показники за період для відфільтрованого набору
  let totalPeriodViews = 0;
  let totalPeriodDuration = 0;
  const filteredIds = new Set(filteredArticles.map((a) => String(a.id)));

  for (const art of articleSummaries) {
    totalPeriodViews += art.viewsInPeriod;
    totalPeriodDuration += art.durationSecondsInPeriod;
  }

  const avgPeriodDuration =
    totalPeriodViews > 0 ? Math.round(totalPeriodDuration / totalPeriodViews) : 0;

  // Побудова часового графіка (timeSeries)
  const timeSeries: StatsTimeSeriesPoint[] = [];

  // Якщо період - це конкретний день або тиждень або місяць: будуємо точки за днями
  if (period === 'day') {
    const pt = timeSeriesMap[today] || { views: 0, durationSeconds: 0 };
    timeSeries.push({
      date: today,
      label: 'Сьогодні',
      views: pt.views,
      durationSeconds: pt.durationSeconds,
    });
  } else if (period === 'week' || period === 'month' || period === '3months' || period === 'halfyear') {
    const daysCount = period === 'week' ? 7 : period === 'month' ? 30 : period === '3months' ? 90 : 180;
    const step = daysCount <= 30 ? 1 : daysCount === 90 ? 3 : 7; // групування для більших періодів

    const ukrMonths = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

    for (let i = daysCount; i >= 0; i -= step) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getKyivDateString(d);

      let vSum = 0;
      let dSum = 0;

      if (step === 1) {
        const pt = timeSeriesMap[dateStr] || { views: 0, durationSeconds: 0 };
        vSum = pt.views;
        dSum = pt.durationSeconds;
      } else {
        // підсумовуємо діапазон кількох днів
        for (let sub = 0; sub < step; sub++) {
          const subD = new Date(d);
          subD.setDate(subD.getDate() + sub);
          const subDateStr = getKyivDateString(subD);
          const pt = timeSeriesMap[subDateStr];
          if (pt) {
            vSum += pt.views;
            dSum += pt.durationSeconds;
          }
        }
      }

      const dayNum = d.getDate();
      const monthName = ukrMonths[d.getMonth()];
      const label = `${dayNum} ${monthName}`;

      timeSeries.push({
        date: dateStr,
        label,
        views: vSum,
        durationSeconds: dSum,
      });
    }
  } else if (period === 'year') {
    // 12 місяців року
    const ukrMonths = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
    for (let m = 0; m < 12; m++) {
      const mStr = String(m + 1).padStart(2, '0');
      const prefix = `${selectedYear}-${mStr}`;

      let vSum = 0;
      let dSum = 0;

      for (const [dateStr, pt] of Object.entries(timeSeriesMap)) {
        if (dateStr.startsWith(prefix)) {
          vSum += pt.views;
          dSum += pt.durationSeconds;
        }
      }

      timeSeries.push({
        date: prefix,
        label: `${ukrMonths[m]} ${selectedYear}`,
        views: vSum,
        durationSeconds: dSum,
      });
    }
  } else {
    // all time - групуємо за місяцями з усіх наявних записів
    const monthsSet = new Set<string>();
    for (const r of inMemoryStats.records) {
      if (r.date && r.date.length >= 7) {
        monthsSet.add(r.date.slice(0, 7));
      }
    }
    const sortedMonths = Array.from(monthsSet).sort();
    const ukrMonths = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

    for (const ym of sortedMonths) {
      const [y, m] = ym.split('-');
      const mIdx = parseInt(m, 10) - 1;
      const label = `${ukrMonths[mIdx] || m} ${y}`;

      let vSum = 0;
      let dSum = 0;

      for (const [dateStr, pt] of Object.entries(timeSeriesMap)) {
        if (dateStr.startsWith(ym)) {
          vSum += pt.views;
          dSum += pt.durationSeconds;
        }
      }

      timeSeries.push({
        date: ym,
        label,
        views: vSum,
        durationSeconds: dSum,
      });
    }
  }

  return {
    config: inMemoryStats.config,
    period,
    year: selectedYear,
    summary: {
      totalViews: totalPeriodViews,
      totalDurationSeconds: totalPeriodDuration,
      avgDurationSeconds: avgPeriodDuration,
      articlesCount: filteredArticles.length,
    },
    timeSeries,
    articles: articleSummaries,
  };
}

export default async function handler(req: any, res: any) {
  initResponseHelpers(res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url || '';
  const parsedUrl = new URL(url, 'http://localhost');
  const actionParam = parsedUrl.searchParams.get('action');

  try {
    if (req.method === 'GET') {
      await ensureStatsLoaded();

      // 1. Отримання налаштування порогу зарахування перегляду
      if (actionParam === 'config' || url.includes('/config')) {
        const cfg = await getStatsConfig();
        return res.status(200).json(cfg);
      }

      // 2. Отримання мапи загальних переглядів усіх статей
      if (actionParam === 'totals' || url.includes('/totals')) {
        await ensureStatsLoaded();
        const totals = getArticleViewsMap();
        return res.status(200).json(totals);
      }

      // 3. Отримання переглядів однієї конкретної статті
      if (actionParam === 'article' || url.includes('/article')) {
        const artId = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('articleId');
        if (!artId) {
          return res.status(400).json({ error: 'Параметр id статті обов\'язковий' });
        }
        await ensureStatsLoaded();
        const views = getTotalViews(artId);
        const duration = inMemoryStats.totals[artId]?.durationSeconds || 0;
        return res.status(200).json({
          articleId: artId,
          views,
          durationSeconds: duration,
        });
      }

      // 4. За замовчуванням — повний звіт статистики з фільтрами
      const period = parsedUrl.searchParams.get('period') || 'all';
      const year = parsedUrl.searchParams.get('year') ? parseInt(parsedUrl.searchParams.get('year')!, 10) : undefined;
      const search = parsedUrl.searchParams.get('search') || undefined;
      const category = parsedUrl.searchParams.get('category') || undefined;
      const topic = parsedUrl.searchParams.get('topic') || undefined;

      const summary = await getStatsSummary({
        period,
        year,
        search,
        category,
        topic,
      });

      return res.status(200).json(summary);
    }

    if (req.method === 'POST') {
      const body = await parseRequestBody(req);
      const action = body.action || actionParam;

      // 1. Збереження порогу часу зарахування перегляду (доступно адміністраторам та редакторам)
      if (action === 'config' || url.includes('/config')) {
        const token = extractToken(req);
        if (!verifyEditorOrAdminToken(token)) {
          return res.status(401).json({ error: 'Потрібна авторизація для зміни налаштувань аналітики' });
        }

        const newSec = parseInt(body.thresholdSeconds, 10);
        if (isNaN(newSec) || newSec < 1 || newSec > 600) {
          return res.status(400).json({ error: 'Пороговий час має бути числом від 1 до 600 секунд' });
        }

        const updated = await saveStatsConfig(newSec);
        return res.status(200).json({ success: true, config: updated });
      }

      // 2. Фіксація перегляду або часу перебування на статті (публічний запит від читача)
      if (action === 'track' || url.includes('/track')) {
        const { articleId, durationSeconds, qualifyView, sessionId } = body;
        if (!articleId) {
          return res.status(400).json({ error: 'Не вказано articleId статті' });
        }

        const result = await recordVisit({
          articleId,
          durationSeconds: Number(durationSeconds) || 0,
          qualifyView: Boolean(qualifyView),
          sessionId,
        });

        return res.status(200).json({
          success: true,
          views: result.views,
          totalDurationSeconds: result.totalDurationSeconds,
        });
      }

      return res.status(400).json({ error: 'Невідома дія (action)' });
    }

    return res.status(405).json({ error: 'Метод не підтримується' });
  } catch (err: any) {
    console.error('API /api/stats error:', err);
    return res.status(500).json({ error: 'Помилка сервера статистики: ' + (err?.message || err) });
  }
}
