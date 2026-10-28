import type { NavigationCategory, Article } from '../types.ts';

export const NAV_CATEGORIES_STORAGE_KEY = 'the_impart_nav_categories_v1';

export const DEFAULT_NAV_CATEGORIES: NavigationCategory[] = [
  {
    id: 'cat-nav-articles',
    slug: 'articles',
    name: 'Статті',
    nameEn: 'Articles',
    rubrics: [
      'Статті',
      'Стаття',
      'Есе',
      'Філософія',
      'Архітектура',
      'Естетика',
      'Мистецтво',
      'Дизайн',
      'Культура',
      'Загальне',
    ],
    rubricsEn: [
      'Articles',
      'Article',
      'Essays',
      'Essay',
      'Philosophy',
      'Architecture',
      'Aesthetics',
      'Art',
      'Design',
      'Culture',
    ],
    topics: [],
    topicsEn: [],
    order: 0,
  },
  {
    id: 'cat-nav-reviews',
    slug: 'reviews',
    name: 'Огляди',
    nameEn: 'Reviews',
    rubrics: ['Огляди', 'Огляд', 'Обзори', 'Обзор'],
    rubricsEn: ['Reviews', 'Review'],
    topics: [],
    topicsEn: [],
    order: 1,
  },
];

export function slugifyCategory(text: string): string {
  const cyrillicMap: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z',
    и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
    р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
    ь: '', ю: 'yu', я: 'ya',
  };

  const lower = text.toLowerCase().trim();
  let result = '';
  for (const char of lower) {
    if (cyrillicMap[char] !== undefined) {
      result += cyrillicMap[char];
    } else if (/[a-z0-9]/.test(char)) {
      result += char;
    } else if (/[\s\-_]/.test(char)) {
      result += '-';
    }
  }

  return result.replace(/-+/g, '-').replace(/^-+|-+$/g, '') || `cat-${Date.now()}`;
}

export function getStoredNavCategories(): NavigationCategory[] {
  if (typeof window === 'undefined') return DEFAULT_NAV_CATEGORIES;
  try {
    const raw = localStorage.getItem(NAV_CATEGORIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((c, idx) => ({
          ...c,
          rubrics: Array.isArray(c.rubrics) ? c.rubrics : [],
          rubricsEn: Array.isArray(c.rubricsEn) ? c.rubricsEn : [],
          topics: Array.isArray(c.topics) ? c.topics : [],
          topicsEn: Array.isArray(c.topicsEn) ? c.topicsEn : [],
          order: typeof c.order === 'number' ? c.order : idx,
        }));
      }
    }
  } catch (e) {
    console.warn('Error reading stored navigation categories:', e);
  }
  return DEFAULT_NAV_CATEGORIES;
}

export function saveStoredNavCategories(categories: NavigationCategory[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NAV_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
  } catch (e) {
    console.error('Error saving navigation categories to storage:', e);
  }
}

/**
 * Перевіряє, чи підходить стаття під навігаційну категорію.
 * Категорія опирається на вибрані рубрики та теми (приховані від кінцевого читача).
 */
export function matchesNavCategory(article: Article, category: NavigationCategory): boolean {
  if (!article || !category) return false;

  const targetRubrics = (category.rubrics || []).map((r) => r.trim().toLowerCase()).filter(Boolean);
  const targetRubricsEn = (category.rubricsEn || []).map((r) => r.trim().toLowerCase()).filter(Boolean);
  const allTargetRubrics = new Set([...targetRubrics, ...targetRubricsEn]);

  const targetTopics = (category.topics || [])
    .map((t) => t.trim().replace(/^#+/, '').toLowerCase())
    .filter(Boolean);
  const targetTopicsEn = (category.topicsEn || [])
    .map((t) => t.trim().replace(/^#+/, '').toLowerCase())
    .filter(Boolean);
  const allTargetTopics = new Set([...targetTopics, ...targetTopicsEn]);

  // Якщо ні рубрик, ні тем не обрано - нічого не підходить
  if (allTargetRubrics.size === 0 && allTargetTopics.size === 0) {
    return false;
  }

  // Збираємо рубрики статті
  const artCatsUa = (
    article.categories && article.categories.length > 0
      ? article.categories
      : (article.category ? article.category.split(',').map((s) => s.trim()) : [])
  ).map((c) => String(c).trim().toLowerCase());

  const artCatsEn = (
    article.categoriesEn && article.categoriesEn.length > 0
      ? article.categoriesEn
      : (article.categoryEn ? article.categoryEn.split(',').map((s) => s.trim()) : [])
  ).map((c) => String(c).trim().toLowerCase());

  const artRubrics = [...artCatsUa, ...artCatsEn];

  // Збираємо теми статті
  const artTopicsUa = (article.topics || []).map((t) => String(t).trim().replace(/^#+/, '').toLowerCase());
  const artTopicsEn = (article.topicsEn || []).map((t) => String(t).trim().replace(/^#+/, '').toLowerCase());
  const artTopics = [...artTopicsUa, ...artTopicsEn];

  // Перевірка збігу рубрик
  const matchesRubric = artRubrics.some((r) => allTargetRubrics.has(r));
  if (matchesRubric) return true;

  // Перевірка збігу тем
  const matchesTopic = artTopics.some((t) => allTargetTopics.has(t));
  if (matchesTopic) return true;

  return false;
}
