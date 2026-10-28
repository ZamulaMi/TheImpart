import type { Article } from '../types.ts';

export const SITE_NAME = 'The Impart';
export const SITE_BRAND_COMPACT = 'TheImpart';
export const SITE_DOMAIN = 'https://www.theimpart.com';
export const DEFAULT_DESCRIPTION_UA =
  'Простір знань про технології та культуру. Актуальні статті, новини, огляди та есе від редакції The Impart.';
export const DEFAULT_DESCRIPTION_EN =
  'A knowledge space for tech and culture. In-depth articles, news, reviews, and essays by The Impart.';
export const DEFAULT_SHARE_IMAGE = `${SITE_DOMAIN}/favicon.svg`;
export const JSON_LD_SCRIPT_ID = 'theimpart-structured-data';

export interface SeoOptions {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType?: 'website' | 'article';
  imageUrl?: string;
  lang?: 'uk' | 'en' | 'ua';
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  section?: string;
  noindex?: boolean;
  alternates?: Array<{ lang: string; href: string }>;
  jsonLd?: Record<string, unknown> | null;
}

const UKRAINIAN_MONTHS: Record<string, number> = {
  січня: 0,
  лютого: 1,
  березня: 2,
  квітня: 3,
  травня: 4,
  червня: 5,
  липня: 6,
  серпня: 7,
  вересня: 8,
  жовтня: 9,
  листопада: 10,
  грудня: 11,
};

/**
 * Очищення HTML-розмітки та кастомних тегів редактора для отримання чистого видимого тексту
 */
export function stripHtml(input?: string): string {
  if (!input) return '';
  return input
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<(?:\/?[a-zA-Z!?][^>]*)>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[carousel[\s\S]*?\[\/carousel\]/gi, ' ')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/|mailto:|tel:)[^)]+\)/g, '$1')
    .replace(/\[\/?(?:hl|color|font|u)(?::[^\]]+)?\]/gi, '')
    .replace(/\|\|/g, '')
    .replace(/==/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Перевірка булевого прапорця видимості короткого опису на сторінці статті
 */
export function isArticleExcerptVisible(article: Article, effectiveIsEn = false): boolean {
  const parseFlag = (val: unknown, fallback = true): boolean => {
    if (val === undefined || val === null) return fallback;
    if (val === false || val === 'false' || val === 0 || val === '0') return false;
    if (val === true || val === 'true' || val === 1 || val === '1') return true;
    return fallback;
  };
  const baseVisible = parseFlag(article.showExcerptInArticle, true);
  if (effectiveIsEn) {
    return parseFlag(article.showExcerptInArticleEn, baseVisible);
  }
  return baseVisible;
}

function truncateAtWordBoundary(text: string, maxLen = 160): string {
  if (text.length <= maxLen) return text;
  const sliceLen = Math.max(40, maxLen - 3);
  const truncated = text.slice(0, sliceLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > Math.floor(maxLen * 0.5) ? truncated.slice(0, lastSpace) : truncated).trim() + '...';
}

/**
 * Перевіряє, чи має стаття повноцінну опубліковану англійську версію
 */
export function hasPublishedEnglishVersion(article: Article): boolean {
  const isPubEn =
    article.publishedEn === true ||
    String(article.publishedEn) === 'true' ||
    (article.publishedEn as unknown) === 1;
  return Boolean(isPubEn && article.titleEn?.trim() && article.contentEn?.trim());
}

/**
 * Перевіряє, чи опублікована основна українська версія статті
 */
export function hasPublishedUkrainianVersion(article: Article): boolean {
  const isPub =
    article.published === true ||
    String(article.published) === 'true' ||
    (article.published as unknown) === 1;
  return Boolean(isPub && article.title?.trim());
}

/**
 * Фактичний опис статті на основі реальних полів БД та видимого тексту на сторінці (без вигаданих шаблонів)
 */
export function getArticleStructuredDescription(article: Article, effectiveIsEn = false): string | undefined {
  const showExcerpt = isArticleExcerptVisible(article, effectiveIsEn);
  const rawExcerpt = effectiveIsEn ? article.excerptEn : article.excerpt;
  const rawContent = effectiveIsEn ? article.contentEn : article.content;

  const cleanExcerpt = showExcerpt ? stripHtml(rawExcerpt) : '';
  const cleanContent = stripHtml(rawContent);

  const chosen = cleanExcerpt || cleanContent;
  if (!chosen) return undefined;

  return truncateAtWordBoundary(chosen, 160);
}

/**
 * Отримання стислого опису статті для HTML meta description (до 160 символів)
 */
export function getArticleSeoDescription(article: Article, isEn = false): string {
  const effectiveIsEn = isEn && hasPublishedEnglishVersion(article);
  const structuredDesc = getArticleStructuredDescription(article, effectiveIsEn);
  if (structuredDesc) {
    return structuredDesc;
  }

  const fallbackExcerpt = stripHtml(effectiveIsEn ? (article.excerptEn || article.excerpt) : article.excerpt);
  if (fallbackExcerpt) {
    return truncateAtWordBoundary(fallbackExcerpt, 160);
  }

  const cat = effectiveIsEn
    ? (article.categoryEn || article.category || 'Materials')
    : (article.category || 'Матеріали');
  const title = effectiveIsEn ? (article.titleEn || article.title) : article.title;
  return effectiveIsEn
    ? `Read ${title} on ${SITE_NAME} in ${cat}.`
    : `Читайте матеріал «${title}» на ${SITE_NAME} у рубриці «${cat}».`;
}

/**
 * Повертає валідне абсолютне HTTPS-посилання на головне зображення статті,
 * АБО undefined, якщо обкладинка відсутня чи не є доступним HTTPS URL.
 * Не підставляє іконку сайту замість відсутньої обкладинки для JSON-LD.
 */
export function getArticleStructuredImageUrl(article: Article): string | undefined {
  if (!article.coverImage || typeof article.coverImage !== 'string') {
    return undefined;
  }
  const clean = article.coverImage.trim();
  if (!clean || clean.startsWith('blob:')) {
    return undefined;
  }

  if (clean.startsWith('data:image/')) {
    const cleanId = String(article.id || '').trim();
    if (!cleanId) return undefined;
    return `${SITE_DOMAIN}/uploads/cover-${encodeURIComponent(cleanId)}`;
  }

  if (clean.startsWith('data:')) {
    return undefined;
  }

  if (clean.startsWith('https://')) {
    try {
      const parsed = new URL(clean);
      return parsed.protocol === 'https:' ? parsed.toString() : undefined;
    } catch {
      return undefined;
    }
  }

  if (clean.startsWith('http://')) {
    try {
      const parsed = new URL(clean);
      if (parsed.hostname === 'www.theimpart.com' || parsed.hostname === 'theimpart.com') {
        parsed.protocol = 'https:';
        parsed.hostname = 'www.theimpart.com';
        return parsed.toString();
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  if (clean.startsWith('/')) {
    return `${SITE_DOMAIN}${clean}`;
  }

  return `${SITE_DOMAIN}/${clean}`;
}

/**
 * Отримання абсолютного посилання на зображення для OpenGraph / Twitter карток (із fallback на логотип сайту)
 */
export function getArticleImageUrl(article: Article): string {
  return getArticleStructuredImageUrl(article) || DEFAULT_SHARE_IMAGE;
}

/**
 * Перевірка та нормалізація дати у суворий формат ISO 8601 (UTC DateTime).
 * Ніколи не підставляє поточний час, якщо вхідне значення порожнє або некоректне.
 */
export function toValidIso8601(dateInput?: string | null): string | undefined {
  if (!dateInput || typeof dateInput !== 'string') return undefined;
  const trimmed = dateInput.trim();
  if (!trimmed) return undefined;

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime()) || parsed.getTime() <= 0) {
    return undefined;
  }
  return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Безпечний розбір текстової календарної дати (напр. "24 жовтня 2026 р.") у формат ISO 8601 YYYY-MM-DD,
 * виключно якщо createdAt відсутній у записі БД.
 */
export function parseCalendarDateToIso(dateStr?: string | null): string | undefined {
  if (!dateStr || typeof dateStr !== 'string') return undefined;
  const trimmed = dateStr.trim();
  if (!trimmed) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const uaMatch = trimmed
    .toLowerCase()
    .match(/^(\d{1,2})\s+([а-яіїєґ']+)\s+(\d{4})/i);
  if (uaMatch) {
    const day = parseInt(uaMatch[1], 10);
    const monthIdx = UKRAINIAN_MONTHS[uaMatch[2].toLowerCase()];
    const year = parseInt(uaMatch[3], 10);
    if (monthIdx !== undefined && day >= 1 && day <= 31 && year >= 1970 && year <= 2100) {
      const mm = String(monthIdx + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }

  return toValidIso8601(trimmed);
}

/**
 * Визначає фактичну дату першої публікації у форматі ISO 8601 без генерації поточної дати
 */
export function resolveArticlePublishedIso(article: Article): string | undefined {
  return toValidIso8601(article.createdAt) || parseCalendarDateToIso(article.date);
}

/**
 * Визначає фактичну дату останньої суттєвої зміни у форматі ISO 8601.
 * Повертає значення лише якщо updated_at / updatedAt реально зафіксовано в БД.
 */
export function resolveArticleModifiedIso(
  article: Article,
  publishedIso?: string
): string | undefined {
  const updatedIso = toValidIso8601(article.updatedAt);
  if (!updatedIso) return undefined;

  if (publishedIso) {
    const pubTime = new Date(publishedIso).getTime();
    const modTime = new Date(updatedIso).getTime();
    if (!isNaN(pubTime) && !isNaN(modTime) && modTime < pubTime) {
      return publishedIso;
    }
  }

  return updatedIso;
}

/**
 * Перевіряє, чи відбулися суттєві змістовні зміни статті під час редагування
 * (заголовок, опис, основний текст, обкладинка, автор або рубрики)
 */
export function hasSubstantiveArticleChanges(
  prev: Partial<Article>,
  next: Partial<Article>
): boolean {
  const norm = (val?: string | null) => String(val || '').trim();
  const normList = (arr?: string[], fallback?: string) => {
    const list =
      Array.isArray(arr) && arr.length > 0
        ? arr
        : fallback
        ? fallback.split(',')
        : [];
    return list
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join('|');
  };

  if (norm(prev.title) !== norm(next.title)) return true;
  if (norm(prev.excerpt) !== norm(next.excerpt)) return true;
  if (norm(prev.content) !== norm(next.content)) return true;
  if (norm(prev.author) !== norm(next.author)) return true;
  if (norm(prev.coverImage) !== norm(next.coverImage)) return true;
  if (normList(prev.categories, prev.category) !== normList(next.categories, next.category)) return true;

  if (norm(prev.titleEn) !== norm(next.titleEn)) return true;
  if (norm(prev.excerptEn) !== norm(next.excerptEn)) return true;
  if (norm(prev.contentEn) !== norm(next.contentEn)) return true;
  if (normList(prev.categoriesEn, prev.categoryEn) !== normList(next.categoriesEn, next.categoryEn)) return true;

  return false;
}

/**
 * Визначає, чи є матеріал саме новинною статтею (NewsArticle) за фактичними рубриками БД
 */
export function isNewsArticle(article: Article, effectiveIsEn = false): boolean {
  const rawUa =
    Array.isArray(article.categories) && article.categories.length > 0
      ? article.categories
      : article.category
      ? article.category.split(',')
      : [];
  const rawEn =
    Array.isArray(article.categoriesEn) && article.categoriesEn.length > 0
      ? article.categoriesEn
      : article.categoryEn
      ? article.categoryEn.split(',')
      : [];

  const listToCheck = effectiveIsEn && rawEn.length > 0 ? [...rawEn, ...rawUa] : rawUa;
  return listToCheck.some((cat) => {
    const normalized = String(cat || '').trim().toLowerCase();
    return normalized === 'новини' || normalized === 'новина' || normalized === 'news';
  });
}

/**
 * Формує коректного автора для Schema.org:
 * - Organization, якщо матеріал підписано редакцією або брендом The Impart;
 * - Person, якщо вказано реальне ім'я автора;
 * - undefined, якщо поле автора порожнє (не вигадує журналістів).
 */
export function buildStructuredAuthor(
  rawAuthor?: string | null
): Record<string, unknown> | undefined {
  if (!rawAuthor || typeof rawAuthor !== 'string') return undefined;
  const cleanAuthor = stripHtml(rawAuthor).trim();
  if (!cleanAuthor) return undefined;

  const isEditorial =
    /(редакція|editorial|the\s*impart|^редактор$|^адміністратор$|редактор\s+the\s*impart)/i.test(
      cleanAuthor
    );

  if (isEditorial) {
    return {
      '@type': 'Organization',
      name: cleanAuthor,
      url: `${SITE_DOMAIN}/`,
    };
  }

  return {
    '@type': 'Person',
    name: cleanAuthor,
  };
}

/**
 * Схема видавця TheImpart / The Impart
 */
export function buildPublisherSchema(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    name: SITE_NAME,
    alternateName: SITE_BRAND_COMPACT,
    url: `${SITE_DOMAIN}/`,
    logo: {
      '@type': 'ImageObject',
      url: DEFAULT_SHARE_IMAGE,
    },
  };
}

/**
 * Схема WebSite для головної сторінки
 */
export function buildWebSiteJsonLd(lang: 'uk' | 'en' = 'uk'): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: SITE_BRAND_COMPACT,
    url: `${SITE_DOMAIN}/`,
    description: lang === 'en' ? DEFAULT_DESCRIPTION_EN : DEFAULT_DESCRIPTION_UA,
    inLanguage: lang,
    publisher: buildPublisherSchema(),
  };
}

/**
 * Формує валідний об'єкт Schema.org JSON-LD (NewsArticle для новин, Article для інших публікацій).
 * Повертає undefined, якщо матеріал не є публічно опублікованим або не має заголовка.
 */
export function buildArticleJsonLd(
  article: Article,
  isEn = false
): Record<string, unknown> | undefined {
  if (!article || !article.id) return undefined;

  const pubUa = hasPublishedUkrainianVersion(article);
  const pubEn = hasPublishedEnglishVersion(article);

  if (!pubUa && !pubEn) {
    return undefined;
  }

  const effectiveIsEn = (isEn && pubEn) || (!pubUa && pubEn);
  const rawHeadline = effectiveIsEn ? article.titleEn : article.title;
  const headline = stripHtml(rawHeadline);
  if (!headline) {
    return undefined;
  }

  const baseArticleUrl = `${SITE_DOMAIN}/article/${encodeURIComponent(article.id)}`;
  const canonicalUrl = effectiveIsEn && pubUa ? `${baseArticleUrl}?lang=en` : baseArticleUrl;
  const schemaType = isNewsArticle(article, effectiveIsEn) ? 'NewsArticle' : 'Article';

  const description = getArticleStructuredDescription(article, effectiveIsEn);
  const imageUrl = getArticleStructuredImageUrl(article);
  const datePublished = resolveArticlePublishedIso(article);
  const dateModified = resolveArticleModifiedIso(article, datePublished);
  const authorSchema = buildStructuredAuthor(article.author);
  const inLanguage = effectiveIsEn ? 'en' : 'uk';

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
    url: canonicalUrl,
    headline,
  };

  if (description) {
    jsonLd.description = description;
  }

  if (imageUrl) {
    jsonLd.image = [imageUrl];
  }

  if (datePublished) {
    jsonLd.datePublished = datePublished;
  }

  if (dateModified) {
    jsonLd.dateModified = dateModified;
  }

  if (authorSchema) {
    jsonLd.author = authorSchema;
  }

  jsonLd.publisher = buildPublisherSchema();
  jsonLd.inLanguage = inLanguage;

  return jsonLd;
}

/**
 * Безпечна серіалізація JSON-LD для вбудовування у <script type="application/ld+json">
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Формування структури метаданих та JSON-LD для конкретної публікації
 */
export function getArticleSeoMetadata(article: Article, isEn = false): SeoOptions {
  const pubUa = hasPublishedUkrainianVersion(article);
  const pubEn = hasPublishedEnglishVersion(article);
  const effectiveIsEn = (isEn && pubEn) || (!pubUa && pubEn);
  const isPubliclyVisible = pubUa || pubEn;

  const cleanTitle = stripHtml(effectiveIsEn ? article.titleEn : article.title) || SITE_NAME;
  const description = getArticleSeoDescription(article, effectiveIsEn);
  const baseArticleUrl = `${SITE_DOMAIN}/article/${encodeURIComponent(article.id)}`;
  const canonicalUrl = effectiveIsEn && pubUa ? `${baseArticleUrl}?lang=en` : baseArticleUrl;
  const imageUrl = getArticleImageUrl(article);
  const publishedTime = resolveArticlePublishedIso(article);
  const modifiedTime = resolveArticleModifiedIso(article, publishedTime);
  const cleanAuthor = stripHtml(article.author) || undefined;
  const section =
    stripHtml(effectiveIsEn ? (article.categoryEn || article.category) : article.category) ||
    (effectiveIsEn ? 'Articles' : 'Статті');

  const alternates: Array<{ lang: string; href: string }> = [];
  if (pubUa && pubEn) {
    alternates.push({ lang: 'uk', href: baseArticleUrl });
    alternates.push({ lang: 'en', href: `${baseArticleUrl}?lang=en` });
    alternates.push({ lang: 'x-default', href: baseArticleUrl });
  }

  return {
    title: `${cleanTitle} — ${SITE_NAME}`,
    description,
    canonicalUrl,
    ogType: 'article',
    imageUrl,
    lang: effectiveIsEn ? 'en' : 'uk',
    publishedTime,
    modifiedTime,
    author: cleanAuthor,
    section,
    noindex: !isPubliclyVisible,
    alternates,
    jsonLd: isPubliclyVisible ? buildArticleJsonLd(article, effectiveIsEn) || null : null,
  };
}

/**
 * Динамічне оновлення мета-тегів та єдиного блоку JSON-LD у DOM клієнтського документа (Head)
 */
export function updateDocumentSeo(options: SeoOptions): void {
  if (typeof document === 'undefined') return;

  // 1. Title
  document.title = options.title;

  // 2. Lang атрибут <html> (ISO 639-1 стандарт uk або en)
  if (options.lang) {
    document.documentElement.lang = options.lang === 'en' ? 'en' : 'uk';
  }

  // Helpers для додавання, оновлення або видалення <meta>
  const setMeta = (nameOrProperty: string, value?: string, isProperty = false) => {
    const attr = isProperty ? 'property' : 'name';
    let el = document.querySelector(`meta[${attr}="${nameOrProperty}"]`) as HTMLMetaElement | null;
    if (!value) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, nameOrProperty);
      document.head.appendChild(el);
    }
    el.content = value;
  };

  // 3. Meta Description
  setMeta('description', options.description);

  // 4. Canonical
  let canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonicalEl) {
    canonicalEl = document.createElement('link');
    canonicalEl.rel = 'canonical';
    document.head.appendChild(canonicalEl);
  }
  canonicalEl.href = options.canonicalUrl;

  // 5. Robots
  setMeta('robots', options.noindex ? 'noindex, nofollow' : 'index, follow');

  // 6. Open Graph
  setMeta('og:site_name', SITE_NAME, true);
  setMeta('og:type', options.ogType || 'website', true);
  setMeta('og:title', options.title, true);
  setMeta('og:description', options.description, true);
  setMeta('og:url', options.canonicalUrl, true);
  setMeta('og:image', options.imageUrl || DEFAULT_SHARE_IMAGE, true);

  // Мета-теги статті: оновлюємо або очищаємо при переході з матеріалу на інші сторінки
  const isArticlePage = options.ogType === 'article' && !options.noindex;
  setMeta('article:published_time', isArticlePage ? options.publishedTime : undefined, true);
  setMeta('article:modified_time', isArticlePage ? options.modifiedTime : undefined, true);
  setMeta('article:author', isArticlePage ? options.author : undefined, true);
  setMeta('article:section', isArticlePage ? options.section : undefined, true);

  // 7. Twitter Card
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', options.title);
  setMeta('twitter:description', options.description);
  setMeta('twitter:image', options.imageUrl || DEFAULT_SHARE_IMAGE);

  // 8. Hreflang alternates
  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
  if (options.alternates && options.alternates.length > 0) {
    for (const alt of options.alternates) {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = alt.lang;
      link.href = alt.href;
      document.head.appendChild(link);
    }
  }

  // 9. Schema.org JSON-LD (гарантія відсутності дубльованих блоків)
  const existingScripts = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]')
  );

  if (options.jsonLd && !options.noindex) {
    let targetScript = document.getElementById(JSON_LD_SCRIPT_ID) as HTMLScriptElement | null;
    for (const scriptEl of existingScripts) {
      if (scriptEl !== targetScript) {
        scriptEl.remove();
      }
    }
    if (!targetScript) {
      targetScript = document.createElement('script');
      targetScript.id = JSON_LD_SCRIPT_ID;
      targetScript.type = 'application/ld+json';
      document.head.appendChild(targetScript);
    }
    targetScript.textContent = JSON.stringify(options.jsonLd, null, 2);
  } else {
    existingScripts.forEach((el) => el.remove());
  }
}
