import fs from 'fs';
import path from 'path';
import { initResponseHelpers } from './_helpers.ts';
import { BUILT_HTML_SHELL } from './_built_shell.ts';
import articleImageHandler from './_article_image.ts';
import { ROBOTS_TXT_BODY } from './_robots_txt.ts';
import sitemapHandler, {
  fetchSitemapSourceData,
  SitemapDatabaseError,
} from './sitemap.ts';
import newsSitemapHandler from './news-sitemap.ts';
import {
  getCachedPublicRenderDataWithStale,
  setCachedPublicRenderData,
  getSitemapCacheVersion,
} from './_sitemap_cache.ts';
import { sanitizePublicArticle } from './articles.ts';
import { getSocialLinks, getTaxonomies } from './settings.ts';
import { getTotalViews, ensureStatsLoaded } from './stats.ts';
import type {
  Article,
  NavigationCategory,
  SitePagesData,
  SiteSocialLinks,
  TaxonomiesData,
} from '../src/types.ts';
import { DEFAULT_PAGES_DATA, DEFAULT_SOCIAL_LINKS } from '../src/types.ts';
import { DEFAULT_NAV_CATEGORIES, matchesNavCategory } from '../src/utils/categories.ts';
import { sortArticlesChronologically } from '../src/utils/date.ts';
import {
  SITE_NAME,
  SITE_DOMAIN,
  DEFAULT_DESCRIPTION_UA,
  DEFAULT_DESCRIPTION_EN,
  DEFAULT_SHARE_IMAGE,
  JSON_LD_SCRIPT_ID,
  getArticleSeoDescription,
  getArticleImageUrl,
  getArticleStructuredImageUrl,
  resolveArticlePublishedIso,
  resolveArticleModifiedIso,
  hasPublishedEnglishVersion,
  hasPublishedUkrainianVersion,
  isArticleExcerptVisible,
  buildArticleJsonLd,
  buildWebSiteJsonLd,
  serializeJsonLd,
  stripHtml,
} from '../src/utils/seo.ts';

export interface PublicRenderBundle {
  articles: Article[];
  navCategories: NavigationCategory[];
  staticPages: SitePagesData;
  socialLinks: SiteSocialLinks;
  taxonomies: TaxonomiesData;
}

export interface RenderedPageResult {
  status: number;
  headers: Record<string, string>;
  html: string;
}

function escapeHtml(input?: string | null): string {
  if (!input) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeInitialDataForHtml(data: PublicRenderBundle): string {
  return JSON.stringify(data)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function getBaseHtmlTemplate(): string {
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (isProd && BUILT_HTML_SHELL && BUILT_HTML_SHELL.includes('<html')) {
    return BUILT_HTML_SHELL;
  }

  const candidatePaths = isProd
    ? [
        path.join(process.cwd(), 'dist', '_shell.html'),
        path.join(process.cwd(), 'dist', 'index.html'),
        path.resolve('dist/index.html'),
        path.join(process.cwd(), 'index.html'),
        path.resolve('index.html'),
      ]
    : [
        path.join(process.cwd(), 'index.html'),
        path.resolve('index.html'),
        path.join(process.cwd(), 'dist', 'index.html'),
        path.resolve('dist/index.html'),
      ];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.includes('<html')) {
          return content;
        }
      }
    } catch {}
  }

  return `<!doctype html>
<html lang="uk" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(SITE_NAME)}</title>
  </head>
  <body class="bg-white text-black dark:bg-[#222222] dark:text-[#cbcbcb] transition-colors duration-200">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
}

function cleanTemplateHead(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<meta\s+name=["'](?:description|robots)["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+property=["'](?:og|article):[^"']*["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']*["'][^>]*>\s*/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, '')
    .replace(/<link\s+rel=["']alternate["'][^>]*hreflang=["'][^"']*["'][^>]*>\s*/gi, '')
    .replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, '')
    .replace(/<script[^>]*id=["']theimpart-initial-data["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');
}

function injectHeadTags(html: string, headBlock: string): string {
  if (html.includes('</head>')) {
    return html.replace('</head>', `${headBlock}\n  </head>`);
  }
  if (html.includes('<body')) {
    return html.replace('<body', `${headBlock}\n  </head>\n  <body`);
  }
  return `${headBlock}\n${html}`;
}

function injectRootAndPayload(
  html: string,
  rootInnerHtml: string,
  initialData?: PublicRenderBundle | null
): string {
  let result = html;
  if (/<div\s+id=["']root["']\s*><\/div>/i.test(result)) {
    result = result.replace(
      /<div\s+id=["']root["']\s*><\/div>/i,
      `<div id="root">${rootInnerHtml}</div>`
    );
  }

  if (initialData && result.includes('</body>')) {
    const scriptTag = `    <script id="theimpart-initial-data">window.__INITIAL_PUBLIC_DATA__=${serializeInitialDataForHtml(initialData)};</script>`;
    result = result.replace('</body>', `${scriptTag}\n  </body>`);
  }

  return result;
}

function sanitizeServerRichHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  return rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<img\b([^>]*)>/gi, (_full, attrs: string) => {
      let updatedAttrs = attrs;
      if (!/\bloading\s*=/i.test(updatedAttrs)) {
        updatedAttrs += ' loading="lazy"';
      }
      if (!/\bdecoding\s*=/i.test(updatedAttrs)) {
        updatedAttrs += ' decoding="async"';
      }
      if (!/\bwidth\s*=/i.test(updatedAttrs)) {
        updatedAttrs += ' width="1200"';
      }
      if (!/\bheight\s*=/i.test(updatedAttrs)) {
        updatedAttrs += ' height="675"';
      }
      return `<img${updatedAttrs}>`;
    });
}

function formatServerInlineText(text: string): string {
  let escaped = escapeHtml(text);
  escaped = escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, (_m, label, url) => {
      return `<a href="${url}">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/\[\/?(?:hl|color|font|u)(?::[^\]]+)?\]/gi, '')
    .replace(/\|\|/g, '')
    .replace(/==/g, '');
  return escaped;
}

function renderArticleBodyServerHtml(rawContent?: string): string {
  if (!rawContent || !rawContent.trim()) return '';

  const isHtml = /<(p|h[1-6]|table|blockquote|ul|ol|figure|div|mark|a)\b[^>]*>/i.test(rawContent);
  if (isHtml) {
    return sanitizeServerRichHtml(rawContent);
  }

  const lines = rawContent.replace(/\r\n/g, '\n').split('\n');
  const htmlBlocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
      continue;
    }

    if (/^(?:---|[*]{3,})$/.test(trimmed)) {
      htmlBlocks.push('<hr />');
      i++;
      continue;
    }

    const h2Match = trimmed.match(/^#{1,2}\s+(.+)$/);
    if (h2Match) {
      htmlBlocks.push(`<h2>${formatServerInlineText(h2Match[1])}</h2>`);
      i++;
      continue;
    }

    const h3Match = trimmed.match(/^#{3,4}\s+(.+)$/);
    if (h3Match) {
      htmlBlocks.push(`<h3>${formatServerInlineText(h3Match[1])}</h3>`);
      i++;
      continue;
    }

    const mdImgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (mdImgMatch) {
      const alt = escapeHtml(mdImgMatch[1]?.trim() || 'Ілюстрація до статті');
      const src = escapeHtml(mdImgMatch[2].trim());
      if (src && !src.startsWith('data:')) {
        htmlBlocks.push(
          `<figure><img src="${src}" alt="${alt}" width="1200" height="675" loading="lazy" decoding="async" />${
            mdImgMatch[1]?.trim() ? `<figcaption>${alt}</figcaption>` : ''
          }</figure>`
        );
      }
      i++;
      continue;
    }

    if (trimmed.startsWith('[carousel')) {
      const carouselLines: string[] = [trimmed];
      i++;
      while (i < lines.length && !lines[i].includes('[/carousel]')) {
        carouselLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].includes('[/carousel]')) {
        carouselLines.push(lines[i]);
        i++;
      }
      const fullText = carouselLines.join('\n');
      const capMatch = fullText.match(/\[carousel(?:\s+caption=["'](.*?)["'])?\]/i);
      const overallCap = capMatch?.[1] ? escapeHtml(capMatch[1]) : '';
      const slides: Array<{ url: string; caption?: string }> = [];
      const slideMatches = fullText.matchAll(
        /\[(?:slide|photo|image):\s*([^\s\]]+)(?:\s+["'](.*?)["'])?\]/gi
      );
      for (const sm of slideMatches) {
        slides.push({ url: sm[1].trim(), caption: sm[2]?.trim() || undefined });
      }
      if (slides.length > 0) {
        const encodedJson = escapeHtml(JSON.stringify(slides));
        const first = slides[0];
        const cap = escapeHtml(first.caption || overallCap || '');
        htmlBlocks.push(
          `<figure class="article-carousel" data-carousel-images="${encodedJson}" data-carousel-caption="${overallCap}"><div class="carousel-container" style="position: relative; max-width: 100%; border-radius: 8px; overflow: hidden;"><img src="${escapeHtml(
            first.url
          )}" alt="${cap}" width="1200" height="675" loading="lazy" decoding="async" /><div class="carousel-counter" style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.65); color: #fff; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-family: monospace;">1 / ${
            slides.length
          }</div></div>${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`
        );
        continue;
      }
    }

    const photoTagMatch = trimmed.match(/^\[(?:photo|image|img):\s*([^\s\]]+)(?:\s+"(.*?)")?\]$/i);
    if (photoTagMatch) {
      const src = escapeHtml(photoTagMatch[1].trim());
      const caption = escapeHtml(photoTagMatch[2]?.trim() || '');
      if (src && !src.startsWith('data:')) {
        htmlBlocks.push(
          `<figure><img src="${src}" alt="${caption || 'Ілюстрація до статті'}" width="1200" height="675" loading="lazy" decoding="async" />${
            caption ? `<figcaption>${caption}</figcaption>` : ''
          }</figure>`
        );
      }
      i++;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      htmlBlocks.push(`<blockquote><p>${formatServerInlineText(quoteLines.join(' '))}</p></blockquote>`);
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(`<li>${formatServerInlineText(lines[i].trim().replace(/^[-*•]\s+/, ''))}</li>`);
        i++;
      }
      htmlBlocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(`<li>${formatServerInlineText(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      htmlBlocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paraLines: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('![') &&
      !lines[i].trim().startsWith('[photo:')
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    htmlBlocks.push(`<p>${formatServerInlineText(paraLines.join(' '))}</p>`);
  }

  return htmlBlocks.join('\n');
}

function matchesHeaderSectionServer(article: Article, section: string): boolean {
  if (section === 'popular') return true;

  const catsUa = (
    article.categories && article.categories.length > 0
      ? article.categories
      : article.category
      ? article.category.split(',').map((s) => s.trim())
      : []
  ).map((c) => c.toLowerCase());

  const catsEn = (
    article.categoriesEn && article.categoriesEn.length > 0
      ? article.categoriesEn
      : article.categoryEn
      ? article.categoryEn.split(',').map((s) => s.trim())
      : []
  ).map((c) => c.toLowerCase());

  const topicsUa = (article.topics || []).map((t) => t.trim().toLowerCase());
  const topicsEn = (article.topicsEn || []).map((t) => t.trim().toLowerCase());

  const allUa = [...catsUa, ...topicsUa];
  const allEn = [...catsEn, ...topicsEn];

  if (section === 'news') {
    return allUa.some((c) => c === 'новини' || c === 'новина') || allEn.some((c) => c === 'news');
  }

  if (section === 'reviews') {
    return (
      allUa.some((c) => ['обзори', 'огляди', 'обзор', 'огляд'].includes(c)) ||
      allEn.some((c) => ['reviews', 'review'].includes(c))
    );
  }

  if (section === 'articles') {
    const hasArticleCat =
      allUa.some((c) =>
        [
          'статті',
          'стаття',
          'есе',
          'essay',
          'філософія',
          'philosophy',
          'архітектура',
          'architecture',
          'естетика',
          'aesthetics',
          'мистецтво',
          'art',
          'дизайн',
          'design',
          'культура',
          'culture',
          'загальне',
        ].includes(c)
      ) ||
      allEn.some((c) =>
        ['articles', 'article', 'essay', 'philosophy', 'architecture', 'aesthetics', 'art', 'design', 'culture'].includes(c)
      );

    if (hasArticleCat) return true;

    const isNews = allUa.some((c) => c === 'новини' || c === 'новина') || allEn.some((c) => c === 'news');
    const isReview =
      allUa.some((c) => ['обзори', 'огляди', 'обзор', 'огляд'].includes(c)) ||
      allEn.some((c) => ['reviews', 'review'].includes(c));

    return !isNews && !isReview;
  }

  return false;
}

let bundleRefreshPromise: Promise<PublicRenderBundle> | null = null;

async function fetchFreshPublicRenderBundle(): Promise<PublicRenderBundle> {
  if (bundleRefreshPromise) {
    return bundleRefreshPromise;
  }

  bundleRefreshPromise = (async () => {
    try {
      const versionBefore = getSitemapCacheVersion();
      const [sitemapData, socialLinks, taxonomies] = await Promise.all([
        fetchSitemapSourceData(),
        getSocialLinks(),
        getTaxonomies(),
        ensureStatsLoaded().catch(() => {}),
      ]);

      const publicArticles = sortArticlesChronologically(
        sitemapData.articles
          .map((art) => {
            const sanitized = sanitizePublicArticle(art as any);
            if (!sanitized) return null;
            return {
              ...sanitized,
              views: getTotalViews(sanitized.id),
            } as Article;
          })
          .filter((item): item is Article => item !== null)
      );

      const navCategories = Array.isArray(sitemapData.categories)
        ? sitemapData.categories
        : DEFAULT_NAV_CATEGORIES;

      const staticPages: SitePagesData = sitemapData.staticPages || DEFAULT_PAGES_DATA;

      const bundle: PublicRenderBundle = {
        articles: publicArticles,
        navCategories,
        staticPages,
        socialLinks,
        taxonomies,
      };

      setCachedPublicRenderData(bundle, versionBefore);
      return bundle;
    } finally {
      bundleRefreshPromise = null;
    }
  })();

  return bundleRefreshPromise;
}

export async function loadPublicRenderBundle(): Promise<PublicRenderBundle> {
  const cachedEntry = getCachedPublicRenderDataWithStale<PublicRenderBundle>();
  if (cachedEntry) {
    if (cachedEntry.isStale) {
      fetchFreshPublicRenderBundle().catch(() => {});
    }
    return cachedEntry.data;
  }

  return fetchFreshPublicRenderBundle();
}

function renderServerHeaderHtml(_navCategories: NavigationCategory[], isEn: boolean): string {
  const langSuffix = isEn ? '?lang=en' : '';

  return `<header class="site-header w-full bg-white dark:bg-[#111111] md:bg-white/95 md:dark:bg-[#111111]/95 md:backdrop-blur-md sticky top-0 z-40 py-3.5 sm:py-4 border-none">
  <div class="relative w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto flex items-center justify-between min-h-[38px]">
    <div class="flex items-center z-20">
      <span aria-hidden="true" class="md:hidden flex items-center justify-center w-9 h-9 text-black dark:text-[#cbcbcb]">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
      </span>
      <div class="hidden md:block overflow-hidden py-0.5">
        <a href="/${langSuffix}" class="block text-xl sm:text-2xl font-medium tracking-tight text-black dark:text-[#ffffff] select-none text-left no-underline" style="font-family: 'Playfair Display', Georgia, serif">${escapeHtml(SITE_NAME)}</a>
      </div>
    </div>
    <div class="md:hidden absolute left-1/2 -translate-x-1/2 z-10">
      <a href="/${langSuffix}" class="block text-xl font-medium tracking-tight text-black dark:text-[#ffffff] select-none text-center whitespace-nowrap no-underline" style="font-family: 'Playfair Display', Georgia, serif">${escapeHtml(SITE_NAME)}</a>
    </div>
    <nav aria-label="${isEn ? 'Site sections' : 'Розділи сайту'}" class="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-6 lg:gap-9 z-10">
      <a href="/news${langSuffix}" class="py-1 text-sm md:text-[15px] text-neutral-800 dark:text-[#cbcbcb] font-semibold no-underline">${isEn ? 'News' : 'Новини'}</a>
      <span class="py-1 flex items-center gap-1.5 text-sm md:text-[15px] text-neutral-800 dark:text-[#cbcbcb] font-semibold select-none">
        <span>${isEn ? 'Categories' : 'Категорії'}</span>
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </span>
      <a href="/popular${langSuffix}" class="py-1 text-sm md:text-[15px] text-neutral-800 dark:text-[#cbcbcb] font-semibold no-underline">${isEn ? 'Popular' : 'Популярні'}</a>
    </nav>
    <div class="z-20 flex items-center justify-end -mr-1 sm:-mr-2">
      <span aria-hidden="true" class="text-black dark:text-[#cbcbcb] flex items-center justify-center w-10 h-10">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </span>
    </div>
  </div>
</header>`;
}

function renderServerFooterHtml(isEn: boolean, socialLinks?: SiteSocialLinks): string {
  const langSuffix = isEn ? '?lang=en' : '';
  const primaryLang = isEn ? 'en' : 'ua';
  const fallbackLang = isEn ? 'ua' : 'en';
  const resolveLink = (key: keyof SiteSocialLinks['ua']): string => {
    const primary = socialLinks?.[primaryLang]?.[key]?.trim();
    if (primary) return primary;
    const secondary = socialLinks?.[fallbackLang]?.[key]?.trim();
    return secondary || '';
  };

  const telegramHref = resolveLink('telegram');
  const instagramHref = resolveLink('instagram');
  const xHref = resolveLink('x');
  const youtubeHref = resolveLink('youtube');
  const threadsHref = resolveLink('threads');
  const facebookHref = resolveLink('facebook');

  const socialIcons: string[] = [];
  if (telegramHref) {
    socialIcons.push(
      `<a href="${escapeHtml(telegramHref)}" target="_blank" rel="noreferrer" aria-label="Telegram" class="footer-social-link text-neutral-400 dark:text-[#888888]"><svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M21.927 3.513a1.498 1.498 0 0 0-1.505-.288L2.348 10.38c-1.048.423-1.042 1.34-.191 1.602l4.639 1.448 10.741-6.777c.507-.308.972-.143.59.196l-8.704 7.854-.319 4.768c.467 0 .673-.214.935-.467l2.247-2.185 4.675 3.453c.861.475 1.482.23 1.696-.8l3.068-14.457c.314-1.26-.481-1.831-1.308-1.442z"/></svg></a>`
    );
  }
  if (instagramHref) {
    socialIcons.push(
      `<a href="${escapeHtml(instagramHref)}" target="_blank" rel="noreferrer" aria-label="Instagram" class="footer-social-link text-neutral-400 dark:text-[#888888]"><svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></a>`
    );
  }
  if (xHref) {
    socialIcons.push(
      `<a href="${escapeHtml(xHref)}" target="_blank" rel="noreferrer" aria-label="X (Twitter)" class="footer-social-link text-neutral-400 dark:text-[#888888]"><svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>`
    );
  }
  if (youtubeHref) {
    socialIcons.push(
      `<a href="${escapeHtml(youtubeHref)}" target="_blank" rel="noreferrer" aria-label="YouTube" class="footer-social-link text-neutral-400 dark:text-[#888888]"><svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>`
    );
  }
  if (threadsHref) {
    socialIcons.push(
      `<a href="${escapeHtml(threadsHref)}" target="_blank" rel="noreferrer" aria-label="Threads" class="footer-social-link text-neutral-400 dark:text-[#888888]"><svg class="w-5 h-5 fill-none stroke-current stroke-[1.8]" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.25 12c0 4.5-3.25 8.25-8 8.25-4.5 0-7.75-3.5-7.75-8.25S6.75 3.75 12 3.75c4.75 0 7.5 3 7.75 7.25M16 11.25c0 3-1.75 4.5-4 4.5s-3.75-1.5-3.75-3.75S9.75 8.25 12 8.25c2.75 0 4 2 4 4.5v1.25c0 1.5-.75 2.5-2 2.5s-2-.75-2-2.25"/></svg></a>`
    );
  }
  if (facebookHref) {
    socialIcons.push(
      `<a href="${escapeHtml(facebookHref)}" target="_blank" rel="noreferrer" aria-label="Facebook" class="footer-social-link text-neutral-400 dark:text-[#888888]"><svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>`
    );
  }

  const socialHtml =
    socialIcons.length > 0
      ? `<div class="mt-3.5 flex items-center gap-4 text-neutral-400 dark:text-[#888888]">${socialIcons.join('')}</div>`
      : '';

  const year = new Date().getFullYear();

  return `<div class="w-full h-16 sm:h-24 bg-gradient-to-b from-white to-neutral-100 dark:from-[#222222] dark:to-[#111111] mt-8 sm:mt-12 pointer-events-none select-none"></div>
<footer class="site-footer w-full bg-white dark:bg-[#111111] py-10 sm:py-12 border-none">
  <div class="w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto flex flex-col sm:flex-row sm:items-end justify-between gap-6">
    <div class="flex flex-col items-start">
      <span class="text-base sm:text-lg font-normal tracking-normal text-black dark:text-[#ffffff] font-sans select-none">${escapeHtml(SITE_NAME)}</span>
      <p class="text-xs text-neutral-400 dark:text-[#777777] mt-1">${escapeHtml(
        isEn ? 'A knowledge space for tech and culture.' : 'Простір знань про технології та культуру.'
      )}</p>
      <div class="mt-2.5 flex items-center gap-3 text-xs font-sans">
        <a href="/about${langSuffix}" class="text-neutral-500 dark:text-[#999999] no-underline">${isEn ? 'About Project' : 'Про проєкт'}</a>
        <span class="text-neutral-300 dark:text-neutral-700">•</span>
        <a href="/contacts${langSuffix}" class="text-neutral-500 dark:text-[#999999] no-underline">${isEn ? 'Contacts' : 'Контакти'}</a>
      </div>
      ${socialHtml}
    </div>
    <div class="flex flex-col sm:items-end gap-3">
      <div class="flex items-center gap-3 text-xs tracking-wider font-sans select-none">
        <span class="w-8 h-8"></span>
        <span class="text-neutral-300 dark:text-neutral-700">|</span>
        <div class="flex items-center">
          <span class="py-1 ${!isEn ? 'font-medium text-black dark:text-[#ffffff]' : 'text-neutral-400 dark:text-[#777777]'}">UA</span>
          <span class="mx-2 text-neutral-300 dark:text-neutral-700">/</span>
          <span class="py-1 ${isEn ? 'font-medium text-black dark:text-[#ffffff]' : 'text-neutral-400 dark:text-[#777777]'}">EN</span>
        </div>
      </div>
      <div class="flex items-center gap-3 text-xs text-neutral-400 dark:text-[#777777] font-sans">
        <span>© ${year} ${escapeHtml(SITE_NAME)}. All rights reserved.</span>
      </div>
    </div>
  </div>
</footer>`;
}

function renderServerArticleCardHtml(
  art: Article,
  isEn: boolean,
  aspectRatio: '26/10.5' | '16/9' | '3/4',
  isHero: boolean,
  eagerLoad: boolean
): string {
  const title = stripHtml(isEn && art.titleEn ? art.titleEn : art.title) || SITE_NAME;
  const rawCategoriesList =
    isEn && art.categoriesEn && art.categoriesEn.length > 0
      ? art.categoriesEn
      : art.categories && art.categories.length > 0
      ? art.categories
      : isEn && art.categoryEn
      ? [art.categoryEn]
      : art.category
      ? [art.category]
      : [];
  const category = rawCategoriesList.map((c) => stripHtml(String(c))).filter(Boolean).join(' / ');
  const pubUa = hasPublishedUkrainianVersion(art);
  const pubEn = hasPublishedEnglishVersion(art);
  const href = `/article/${encodeURIComponent(art.id)}${isEn && pubUa && pubEn ? '?lang=en' : ''}`;
  const publishedIso = resolveArticlePublishedIso(art);

  const aspectClass =
    aspectRatio === '26/10.5'
      ? 'w-full aspect-[16/10] sm:aspect-[21/9] md:aspect-[26/10.5] min-h-[240px] sm:min-h-[340px] md:min-h-[390px]'
      : aspectRatio === '16/9'
      ? 'w-full aspect-[16/10] sm:aspect-[16/9] min-h-[190px]'
      : 'w-full aspect-[16/10] sm:aspect-[4/5] md:aspect-[3/4] min-h-[190px]';

  const titleClass =
    aspectRatio === '26/10.5'
      ? 'text-xl sm:text-2xl md:text-3xl lg:text-4xl'
      : aspectRatio === '16/9'
      ? 'text-base sm:text-lg md:text-xl lg:text-2xl line-clamp-3'
      : 'text-base sm:text-lg lg:text-xl line-clamp-3';

  const imgWidth = aspectRatio === '3/4' ? 900 : 1200;
  const imgHeight = aspectRatio === '26/10.5' ? 485 : aspectRatio === '16/9' ? 675 : 1200;
  const loadingAttr = isHero
    ? 'loading="eager" fetchpriority="high" decoding="async"'
    : eagerLoad
    ? 'loading="eager" decoding="async"'
    : 'loading="lazy" decoding="async"';

  return `<a href="${escapeHtml(href)}" class="block group relative overflow-hidden rounded-xl bg-neutral-900 border border-transparent dark:border-[#333333]/80 shadow-md flex flex-col justify-end no-underline text-inherit ${aspectClass}">
    ${
      art.coverImage
        ? `<img src="${escapeHtml(art.coverImage)}" alt="${escapeHtml(title)}" width="${imgWidth}" height="${imgHeight}" ${loadingAttr} class="absolute inset-0 w-full h-full object-cover" />`
        : `<div class="absolute inset-0 bg-neutral-900 flex items-center justify-center text-white/30 font-serif text-sm">${escapeHtml(SITE_NAME)}</div>`
    }
    <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15"></div>
    <div class="relative z-10 text-white w-full ${isHero ? 'p-5 sm:p-8 md:p-10 lg:p-12 max-w-4xl' : 'p-4 sm:p-5 md:p-6'}">
      <div class="flex items-center flex-wrap gap-2 text-[11px] sm:text-xs uppercase tracking-wider text-white/80 mb-2">
        ${category ? `<span class="font-medium text-white/95">${escapeHtml(category)}</span>` : ''}
        ${
          publishedIso
            ? `${category ? '<span class="text-white/40">•</span>' : ''}<time datetime="${escapeHtml(publishedIso)}" class="text-white/80">${escapeHtml(art.date || publishedIso)}</time>`
            : ''
        }
      </div>
      <h2 class="font-sans font-semibold text-white leading-snug ${titleClass}">${escapeHtml(title)}</h2>
    </div>
  </a>`;
}

function renderFeedListHtml(articles: Article[], isEn: boolean, isHomeFeed = false): string {
  if (articles.length === 0) {
    return `<p class="py-24 text-center text-neutral-400 font-serif italic text-lg sm:text-xl">${escapeHtml(
      isEn ? 'No published articles in this section yet.' : 'У цьому розділі наразі немає опублікованих матеріалів.'
    )}</p>`;
  }

  const visible = articles.slice(0, 10);

  if (isHomeFeed) {
    const row1 = visible.slice(0, 1);
    const row2 = visible.slice(1, 3);
    const row3 = visible.slice(3, 6);
    const row4 = visible.slice(6, 8);
    const row5 = visible.slice(8, 10);

    const rowsHtml: string[] = [];
    if (row1.length > 0) {
      rowsHtml.push(`<div>${row1.map((a) => renderServerArticleCardHtml(a, isEn, '26/10.5', true, true)).join('')}</div>`);
    }
    if (row2.length > 0) {
      rowsHtml.push(
        `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">${row2
          .map((a) => renderServerArticleCardHtml(a, isEn, '16/9', false, true))
          .join('')}</div>`
      );
    }
    if (row3.length > 0) {
      rowsHtml.push(
        `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-5">${row3
          .map((a) => renderServerArticleCardHtml(a, isEn, '3/4', false, false))
          .join('')}</div>`
      );
    }
    if (row4.length > 0) {
      rowsHtml.push(
        `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">${row4
          .map((a) => renderServerArticleCardHtml(a, isEn, '16/9', false, false))
          .join('')}</div>`
      );
    }
    if (row5.length > 0) {
      rowsHtml.push(
        `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">${row5
          .map((a) => renderServerArticleCardHtml(a, isEn, '16/9', false, false))
          .join('')}</div>`
      );
    }

    return `<div class="space-y-4 sm:space-y-6">${rowsHtml.join('\n')}</div>`;
  }

  const catRow1 = visible.slice(0, 2);
  const catRow2 = visible.slice(2, 5);
  const catRow3 = visible.slice(5, 7);
  const catRow4 = visible.slice(7, 10);

  const catRowsHtml: string[] = [];
  if (catRow1.length > 0) {
    catRowsHtml.push(
      `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">${catRow1
        .map((a) => renderServerArticleCardHtml(a, isEn, '16/9', false, true))
        .join('')}</div>`
    );
  }
  if (catRow2.length > 0) {
    catRowsHtml.push(
      `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-5">${catRow2
        .map((a) => renderServerArticleCardHtml(a, isEn, '3/4', false, false))
        .join('')}</div>`
    );
  }
  if (catRow3.length > 0) {
    catRowsHtml.push(
      `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">${catRow3
        .map((a) => renderServerArticleCardHtml(a, isEn, '16/9', false, false))
        .join('')}</div>`
    );
  }
  if (catRow4.length > 0) {
    catRowsHtml.push(
      `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-5">${catRow4
        .map((a) => renderServerArticleCardHtml(a, isEn, '3/4', false, false))
        .join('')}</div>`
    );
  }

  return `<div class="space-y-4 sm:space-y-6">${catRowsHtml.join('\n')}</div>`;
}

function buildHeadMetaBlock(opts: {
  title: string;
  description: string;
  canonicalUrl?: string;
  robots: string;
  ogType?: 'website' | 'article';
  imageUrl?: string;
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  section?: string;
  alternates?: Array<{ lang: string; href: string }>;
  jsonLd?: Record<string, unknown> | null;
}): string {
  const tags: string[] = [
    `<title>${escapeHtml(opts.title)}</title>`,
    `<meta name="description" content="${escapeHtml(opts.description)}" />`,
    `<meta name="robots" content="${escapeHtml(opts.robots)}" />`,
  ];

  if (opts.canonicalUrl) {
    tags.push(`<link rel="canonical" href="${escapeHtml(opts.canonicalUrl)}" />`);
  }

  const image = opts.imageUrl || DEFAULT_SHARE_IMAGE;
  tags.push(
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:type" content="${escapeHtml(opts.ogType || 'website')}" />`,
    `<meta property="og:title" content="${escapeHtml(opts.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(opts.description)}" />`
  );

  if (opts.canonicalUrl) {
    tags.push(`<meta property="og:url" content="${escapeHtml(opts.canonicalUrl)}" />`);
  }
  tags.push(`<meta property="og:image" content="${escapeHtml(image)}" />`);

  if (opts.ogType === 'article') {
    if (opts.publishedTime) {
      tags.push(`<meta property="article:published_time" content="${escapeHtml(opts.publishedTime)}" />`);
    }
    if (opts.modifiedTime) {
      tags.push(`<meta property="article:modified_time" content="${escapeHtml(opts.modifiedTime)}" />`);
    }
    if (opts.author) {
      tags.push(`<meta property="article:author" content="${escapeHtml(opts.author)}" />`);
    }
    if (opts.section) {
      tags.push(`<meta property="article:section" content="${escapeHtml(opts.section)}" />`);
    }
  }

  tags.push(
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(opts.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(opts.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`
  );

  if (opts.alternates && opts.alternates.length > 0) {
    for (const alt of opts.alternates) {
      tags.push(`<link rel="alternate" hreflang="${escapeHtml(alt.lang)}" href="${escapeHtml(alt.href)}" />`);
    }
  }

  if (opts.jsonLd) {
    tags.push(
      `<script id="${JSON_LD_SCRIPT_ID}" type="application/ld+json">\n${serializeJsonLd(opts.jsonLd)}\n    </script>`
    );
  }

  return `    ${tags.join('\n    ')}`;
}

function parseRequestTarget(req: any): { pathname: string; searchParams: URLSearchParams } {
  const rawUrl = typeof req?.originalUrl === 'string' && req.originalUrl
    ? req.originalUrl
    : typeof req?.url === 'string' && req.url
    ? req.url
    : '/';

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl, SITE_DOMAIN);
  } catch {
    parsedUrl = new URL('/', SITE_DOMAIN);
  }

  const searchParams = new URLSearchParams(parsedUrl.search);

  // Якщо запит перенаправлено через Vercel rewrite (/api/render-page?pathname=...) або (/api/article-meta?id=...)
  let pathname = parsedUrl.pathname;
  const queryPathname = req?.query?.pathname ?? searchParams.get('pathname');
  if (typeof queryPathname === 'string' && queryPathname.trim()) {
    const cleanP = queryPathname.trim();
    pathname = cleanP.startsWith('/') ? cleanP : `/${cleanP}`;
    searchParams.delete('pathname');
  } else if (
    (pathname === '/api/article-meta' ||
      pathname.startsWith('/api/article-meta/') ||
      pathname === '/api/render-page' ||
      pathname.startsWith('/api/render-page/')) &&
    (req?.query?.id || searchParams.get('id'))
  ) {
    const idVal = String(req?.query?.id || searchParams.get('id')).trim();
    pathname = `/article/${encodeURIComponent(idVal)}`;
    searchParams.delete('id');
  } else if (pathname === '/api/render-page' || pathname.startsWith('/api/render-page/')) {
    pathname = '/';
  }

  if (req?.params?.id && (pathname === '/api/article-meta' || pathname.startsWith('/article/'))) {
    const subMatch = pathname.match(/^\/article\/[^/]+\/(.+)$/i);
    if (!subMatch) {
      pathname = `/article/${encodeURIComponent(String(req.params.id).trim())}`;
    }
  }

  // Merge any remaining req.query keys (for Vercel serverless query parsing)
  if (req?.query && typeof req.query === 'object') {
    for (const [k, v] of Object.entries(req.query)) {
      if (k === 'pathname' || k === 'id') continue;
      if (typeof v === 'string' && !searchParams.has(k)) {
        searchParams.set(k, v);
      }
    }
  }

  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  return { pathname: normalizedPath, searchParams };
}

function buildNotFoundResponse(baseTemplate: string, isEn: boolean, navCategories: NavigationCategory[] = DEFAULT_NAV_CATEGORIES): RenderedPageResult {
  const lang = isEn ? 'en' : 'uk';
  const title = isEn ? `Page not found — ${SITE_NAME}` : `Сторінку не знайдено — ${SITE_NAME}`;
  const description = isEn
    ? 'The requested page or article does not exist or is an unpublished draft.'
    : 'Запитувану сторінку або статтю не знайдено, або матеріал є неопублікованою чернеткою.';

  const headBlock = buildHeadMetaBlock({
    title,
    description,
    robots: 'noindex, nofollow',
  });

  const rootHtml = `<div class="min-h-screen w-full bg-white dark:bg-[#222222] text-black dark:text-[#cbcbcb] flex flex-col justify-between">
  ${renderServerHeaderHtml(navCategories, isEn)}
  <main class="flex-1 flex items-center justify-center">
    <div class="w-[92%] sm:w-[90%] md:max-w-3xl mx-auto py-16 sm:py-24 text-center space-y-4">
      <h1 class="font-serif italic text-xl sm:text-2xl text-neutral-500 dark:text-[#888888]">${escapeHtml(
        isEn ? 'Page or article not found.' : 'Сторінку або статтю не знайдено.'
      )}</h1>
      <p class="text-sm text-neutral-500 dark:text-[#888888]">${escapeHtml(description)}</p>
      <a href="${isEn ? '/?lang=en' : '/'}" class="inline-block text-xs uppercase tracking-wider text-black dark:text-[#ffffff] underline underline-offset-4">${escapeHtml(
        isEn ? 'Return to all materials' : 'Повернутися до всіх матеріалів'
      )}</a>
    </div>
  </main>
  ${renderServerFooterHtml(isEn)}
</div>`;

  let html = cleanTemplateHead(baseTemplate).replace(/<html[^>]*lang=["'][^"']*["']/i, `<html lang="${lang}"`);
  html = injectHeadTags(html, headBlock);
  html = injectRootAndPayload(html, rootHtml, null);

  return {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
    },
    html,
  };
}

function buildServiceUnavailableResponse(baseTemplate: string): RenderedPageResult {
  const title = `Тимчасова технічна перерва — ${SITE_NAME}`;
  const description = 'Сервер тимчасово не може отримати дані з бази даних. Спробуйте оновити сторінку за хвилину.';
  const headBlock = buildHeadMetaBlock({
    title,
    description,
    robots: 'noindex, nofollow',
  });

  const rootHtml = `<main class="min-h-screen flex items-center justify-center p-8 text-center">
  <div class="max-w-lg space-y-3">
    <h1 class="text-2xl font-semibold">${escapeHtml(title)}</h1>
    <p class="text-sm text-neutral-500">${escapeHtml(description)}</p>
  </div>
</main>`;

  let html = cleanTemplateHead(baseTemplate);
  html = injectHeadTags(html, headBlock);
  html = injectRootAndPayload(html, rootHtml, null);

  return {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Retry-After': '60',
    },
    html,
  };
}

export async function generatePageResponse(
  req: any,
  customBaseTemplate?: string
): Promise<RenderedPageResult> {
  const baseTemplate = customBaseTemplate || getBaseHtmlTemplate();
  const { pathname, searchParams } = parseRequestTarget(req);
  const lowerPath = pathname.toLowerCase();
  const requestedEn = searchParams.get('lang') === 'en';

  // 1. Приватні службові маршрути (/login, /admin, /editor): noindex, без публічного кешування
  if (
    lowerPath === '/login' ||
    lowerPath.startsWith('/login/') ||
    lowerPath === '/admin' ||
    lowerPath.startsWith('/admin/') ||
    lowerPath === '/editor' ||
    lowerPath.startsWith('/editor/')
  ) {
    const headBlock = buildHeadMetaBlock({
      title: `Адміністрування — ${SITE_NAME}`,
      description: 'Панель керування публікаціями The Impart.',
      robots: 'noindex, nofollow',
    });
    let html = cleanTemplateHead(baseTemplate).replace(/<html[^>]*lang=["'][^"']*["']/i, '<html lang="uk"');
    html = injectHeadTags(html, headBlock);
    return {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      },
      html,
    };
  }

  let bundle: PublicRenderBundle;
  try {
    bundle = await loadPublicRenderBundle();
  } catch (err) {
    console.warn('[render-page] Notice loading bundle, falling back to local defaults:', err);
    bundle = {
      articles: [],
      navCategories: DEFAULT_NAV_CATEGORIES,
      staticPages: DEFAULT_PAGES_DATA,
      socialLinks: DEFAULT_SOCIAL_LINKS,
      taxonomies: { categories: [], topics: [] },
    };
  }

  // 2. Сторінки внутрішнього пошуку (/search, /search/:query): 200 OK, але строго noindex
  const searchPathMatch = pathname.match(/^\/search(?:\/(.+))?$/i);
  if (searchPathMatch || (pathname === '/' && (searchParams.has('q') || searchParams.has('search')))) {
    const rawQuery = searchPathMatch?.[1]
      ? decodeURIComponent(searchPathMatch[1]).trim()
      : (searchParams.get('q') || searchParams.get('search') || '').trim();
    const lang = requestedEn ? 'en' : 'uk';
    const title = rawQuery
      ? requestedEn
        ? `Search: "${rawQuery}" — ${SITE_NAME}`
        : `Пошук: «${rawQuery}» — ${SITE_NAME}`
      : requestedEn
      ? `Search — ${SITE_NAME}`
      : `Пошук — ${SITE_NAME}`;
    const description = rawQuery
      ? requestedEn
        ? `Search results for "${rawQuery}" on ${SITE_NAME}.`
        : `Результати пошуку матеріалів за запитом «${rawQuery}» на ${SITE_NAME}.`
      : DEFAULT_DESCRIPTION_UA;

    const headBlock = buildHeadMetaBlock({
      title,
      description,
      robots: 'noindex, follow',
    });

    const rootHtml = `<div class="min-h-screen w-full bg-white dark:bg-[#222222] text-black dark:text-[#cbcbcb] flex flex-col justify-between">
  ${renderServerHeaderHtml(bundle.navCategories, requestedEn)}
  <main class="flex-1 w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto py-8">
    <h1 class="text-2xl sm:text-3xl font-medium mb-6">${escapeHtml(title)}</h1>
  </main>
  ${renderServerFooterHtml(requestedEn, bundle.socialLinks)}
</div>`;

    let html = cleanTemplateHead(baseTemplate).replace(/<html[^>]*lang=["'][^"']*["']/i, `<html lang="${lang}"`);
    html = injectHeadTags(html, headBlock);
    html = injectRootAndPayload(html, rootHtml, bundle);

    return {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, must-revalidate, max-age=0',
      },
      html,
    };
  }

  // 3. Прямі сторінки статей (/article/:id)
  if (lowerPath === '/article') {
    return buildNotFoundResponse(baseTemplate, requestedEn, bundle.navCategories);
  }

  const articleRouteMatch = pathname.match(/^\/article\/([^/]+)$/i);
  if (lowerPath.startsWith('/article/')) {
    if (!articleRouteMatch) {
      return buildNotFoundResponse(baseTemplate, requestedEn, bundle.navCategories);
    }

    let articleId = '';
    try {
      articleId = decodeURIComponent(articleRouteMatch[1]).trim();
    } catch {
      return buildNotFoundResponse(baseTemplate, requestedEn, bundle.navCategories);
    }

    const article = bundle.articles.find((a) => String(a.id) === articleId);
    const pubUa = article ? hasPublishedUkrainianVersion(article) : false;
    const pubEn = article ? hasPublishedEnglishVersion(article) : false;

    if (!article || (!pubUa && !pubEn)) {
      return buildNotFoundResponse(baseTemplate, requestedEn, bundle.navCategories);
    }

    const effectiveIsEn = (requestedEn && pubEn) || (!pubUa && pubEn);
    const lang = effectiveIsEn ? 'en' : 'uk';
    const cleanTitle = stripHtml(effectiveIsEn ? article.titleEn : article.title) || SITE_NAME;
    const fullTitle = `${cleanTitle} — ${SITE_NAME}`;
    const description = getArticleSeoDescription(article, effectiveIsEn);
    const baseArticleUrl = `${SITE_DOMAIN}/article/${encodeURIComponent(article.id)}`;
    const canonicalUrl = effectiveIsEn && pubUa ? `${baseArticleUrl}?lang=en` : baseArticleUrl;
    const ogImageUrl = getArticleImageUrl(article);
    const structuredImageUrl = getArticleStructuredImageUrl(article);
    const publishedTime = resolveArticlePublishedIso(article);
    const modifiedTime = resolveArticleModifiedIso(article, publishedTime);
    const cleanAuthor = stripHtml(article.author);
    const section =
      stripHtml(effectiveIsEn ? article.categoryEn || article.category : article.category) ||
      (effectiveIsEn ? 'Articles' : 'Статті');

    const alternates =
      pubUa && pubEn
        ? [
            { lang: 'uk', href: baseArticleUrl },
            { lang: 'en', href: `${baseArticleUrl}?lang=en` },
            { lang: 'x-default', href: baseArticleUrl },
          ]
        : undefined;

    const articleJsonLd = buildArticleJsonLd(article, effectiveIsEn);

    const headBlock = buildHeadMetaBlock({
      title: fullTitle,
      description,
      canonicalUrl,
      robots: 'index, follow',
      ogType: 'article',
      imageUrl: ogImageUrl,
      publishedTime,
      modifiedTime,
      author: cleanAuthor,
      section,
      alternates,
      jsonLd: articleJsonLd,
    });

    const rawBody = effectiveIsEn ? article.contentEn : article.content;
    const rawExcerpt = effectiveIsEn ? article.excerptEn : article.excerpt;
    const showExcerpt = isArticleExcerptVisible(article, effectiveIsEn);
    const cleanExcerpt = showExcerpt ? stripHtml(rawExcerpt) : '';
    const renderedBodyHtml = renderArticleBodyServerHtml(rawBody);
    const displayTopics =
      effectiveIsEn && article.topicsEn && article.topicsEn.length > 0
        ? article.topicsEn
        : article.topics || [];

    const coverSrc = article.coverImage || structuredImageUrl;
    const coverCaption = effectiveIsEn
      ? (article.coverImageCaptionEn || article.coverImageCaption)
      : article.coverImageCaption;

    const rootHtml = `<div class="min-h-screen w-full bg-white dark:bg-[#222222] text-black dark:text-[#cbcbcb] flex flex-col justify-between">
  ${renderServerHeaderHtml(bundle.navCategories, effectiveIsEn)}
  <main class="flex-1">
    <article class="w-full pt-1.5 sm:pt-3.5 pb-12 sm:pb-20">
      <div class="w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] max-w-3xl mx-auto">
        <div class="mb-2 sm:mb-2.5 text-xs uppercase tracking-wider text-neutral-500 dark:text-[#a0a0a0]">
          <a href="${effectiveIsEn ? '/?lang=en' : '/'}" class="no-underline">${effectiveIsEn ? '← All materials' : '← Усі матеріали'}</a>
          ${section ? ` <span>•</span> <span>${escapeHtml(section)}</span>` : ''}
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2.5 text-xs text-neutral-500 dark:text-[#888888] font-sans pt-0.5 pb-2 mb-2 sm:mb-2.5">
          ${cleanAuthor ? `<span class="font-medium text-neutral-700 dark:text-[#b0b0b0]">${escapeHtml(cleanAuthor)}</span>` : ''}
          ${
            publishedTime
              ? `<time datetime="${escapeHtml(publishedTime)}">${escapeHtml(article.date || publishedTime)}</time>`
              : article.date
              ? `<span>${escapeHtml(article.date)}</span>`
              : ''
          }
        </div>
        <h1 class="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-sans font-bold tracking-tight text-black dark:text-[#f5f5f5] leading-tight mb-5 sm:mb-7">${escapeHtml(cleanTitle)}</h1>
      </div>
      ${
        coverSrc
          ? `<figure class="mb-8 sm:mb-10 w-full sm:w-[calc(26/34*100%)] mx-auto article-full-mobile">
        <div class="w-full aspect-[26/14.5] overflow-hidden bg-neutral-100 dark:bg-[#181818] rounded-none sm:rounded-xl md:rounded-2xl border-y sm:border border-transparent dark:border-[#2e2e2e] shadow-xs">
          <img src="${escapeHtml(coverSrc)}" alt="${escapeHtml(cleanTitle)}" width="1600" height="892" fetchpriority="high" decoding="async" class="w-full h-full object-cover" />
        </div>
        ${
          coverCaption
            ? `<figcaption class="mt-2.5 sm:mt-3 text-center text-xs sm:text-sm text-neutral-500 dark:text-[#888888] font-sans italic px-4">${escapeHtml(coverCaption)}</figcaption>`
            : ''
        }
      </figure>`
          : ''
      }
      <div class="w-[92%] sm:w-[90%] md:max-w-3xl mx-auto">
        ${
          cleanExcerpt
            ? `<p class="text-lg sm:text-xl text-neutral-700 dark:text-[#e0e0e0] leading-relaxed font-sans italic mb-8 border-l-2 border-black dark:border-[#cbcbcb] pl-6">${escapeHtml(cleanExcerpt)}</p>`
            : ''
        }
        <div class="prose prose-neutral dark:prose-invert max-w-none text-base sm:text-lg leading-relaxed text-neutral-800 dark:text-[#cbcbcb] space-y-6 article-view-content">
          ${renderedBodyHtml}
        </div>
        ${
          displayTopics.length > 0
            ? `<div class="mt-12 pt-6 border-t border-neutral-100 dark:border-[#333333] flex flex-wrap gap-2">
          ${displayTopics
            .map(
              (t) =>
                `<a href="/search/${encodeURIComponent(t)}" class="px-3 py-1 text-xs rounded-md bg-neutral-100 dark:bg-[#1a1a1a] no-underline">#${escapeHtml(t)}</a>`
            )
            .join('')}
        </div>`
            : ''
        }
      </div>
    </article>
  </main>
  ${renderServerFooterHtml(effectiveIsEn, bundle.socialLinks)}
</div>`;

    let html = cleanTemplateHead(baseTemplate).replace(/<html[^>]*lang=["'][^"']*["']/i, `<html lang="${lang}"`);
    html = injectHeadTags(html, headBlock);
    html = injectRootAndPayload(html, rootHtml, bundle);

    return {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, must-revalidate, max-age=0',
      },
      html,
    };
  }

  // 4. Публічні статичні сторінки (/about, /contacts)
  if (lowerPath === '/about' || lowerPath === '/contacts') {
    const slug = lowerPath === '/about' ? 'about' : 'contacts';
    const pageObj = bundle.staticPages[slug] || DEFAULT_PAGES_DATA[slug];
    const hasEnContent = Boolean(pageObj.titleEn?.trim() && stripHtml(pageObj.contentEn).length > 0);
    const effectiveIsEn = requestedEn && hasEnContent;
    const lang = effectiveIsEn ? 'en' : 'uk';

    const pageTitle =
      stripHtml(effectiveIsEn ? pageObj.titleEn : pageObj.title) ||
      (slug === 'about'
        ? effectiveIsEn
          ? 'About Us'
          : 'Про нас'
        : effectiveIsEn
        ? 'Contacts'
        : 'Контакти');

    const rawPageContent = effectiveIsEn ? pageObj.contentEn : pageObj.content;
    const cleanBodySummary = stripHtml(rawPageContent);
    const defaultPageDesc =
      slug === 'about'
        ? effectiveIsEn
          ? 'About The Impart — independent online publication focusing on technology, society, and modern culture.'
          : 'Про видання The Impart — незалежний простір знань про технології, суспільство та сучасну культуру.'
        : effectiveIsEn
        ? 'Contact editorial board, advertising, and partnership channels of The Impart.'
        : "Контактна інформація, зв'язок з редакцією, пропозиції та співпраця з The Impart.";

    const description = cleanBodySummary
      ? cleanBodySummary.length > 160
        ? cleanBodySummary.slice(0, 157).trim() + '...'
        : cleanBodySummary
      : defaultPageDesc;

    const baseStaticUrl = `${SITE_DOMAIN}/${slug}`;
    const canonicalUrl = effectiveIsEn ? `${baseStaticUrl}?lang=en` : baseStaticUrl;
    const alternates = hasEnContent
      ? [
          { lang: 'uk', href: baseStaticUrl },
          { lang: 'en', href: `${baseStaticUrl}?lang=en` },
          { lang: 'x-default', href: baseStaticUrl },
        ]
      : undefined;

    const headBlock = buildHeadMetaBlock({
      title: `${pageTitle} — ${SITE_NAME}`,
      description,
      canonicalUrl,
      robots: 'index, follow',
      ogType: 'website',
      alternates,
    });

    const rootHtml = `<div class="min-h-screen w-full bg-white dark:bg-[#222222] text-black dark:text-[#cbcbcb] flex flex-col justify-between">
  ${renderServerHeaderHtml(bundle.navCategories, effectiveIsEn)}
  <main class="flex-1">
    <article class="w-[92%] sm:w-[90%] md:max-w-3xl mx-auto py-8 sm:py-16 space-y-6">
      <h1 class="text-3xl sm:text-4xl font-medium tracking-tight text-black dark:text-[#ffffff]">${escapeHtml(pageTitle)}</h1>
      <div class="prose prose-neutral dark:prose-invert max-w-none leading-relaxed">
        ${renderArticleBodyServerHtml(rawPageContent)}
      </div>
    </article>
  </main>
  ${renderServerFooterHtml(effectiveIsEn, bundle.socialLinks)}
</div>`;

    let html = cleanTemplateHead(baseTemplate).replace(/<html[^>]*lang=["'][^"']*["']/i, `<html lang="${lang}"`);
    html = injectHeadTags(html, headBlock);
    html = injectRootAndPayload(html, rootHtml, bundle);

    return {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, must-revalidate, max-age=0',
      },
      html,
    };
  }

  // 5. Головна сторінка (/)
  if (pathname === '/') {
    const uaArticles = bundle.articles.filter((a) => hasPublishedUkrainianVersion(a));
    const enArticles = bundle.articles.filter((a) => hasPublishedEnglishVersion(a));
    const hasAnyEn = enArticles.length > 0;
    const effectiveIsEn = requestedEn && hasAnyEn;
    const lang = effectiveIsEn ? 'en' : 'uk';
    const feedArticles = effectiveIsEn ? enArticles : uaArticles;

    const title = effectiveIsEn
      ? `${SITE_NAME} — Knowledge space for tech and culture`
      : `${SITE_NAME} — Простір знань про технології та культуру`;
    const description = effectiveIsEn ? DEFAULT_DESCRIPTION_EN : DEFAULT_DESCRIPTION_UA;
    const canonicalUrl = effectiveIsEn ? `${SITE_DOMAIN}/?lang=en` : `${SITE_DOMAIN}/`;
    const alternates = hasAnyEn
      ? [
          { lang: 'uk', href: `${SITE_DOMAIN}/` },
          { lang: 'en', href: `${SITE_DOMAIN}/?lang=en` },
          { lang: 'x-default', href: `${SITE_DOMAIN}/` },
        ]
      : undefined;

    const headBlock = buildHeadMetaBlock({
      title,
      description,
      canonicalUrl,
      robots: 'index, follow',
      ogType: 'website',
      alternates,
      jsonLd: buildWebSiteJsonLd(lang),
    });

    const rootHtml = `<div class="min-h-screen w-full bg-white dark:bg-[#222222] text-black dark:text-[#cbcbcb] flex flex-col justify-between">
  ${renderServerHeaderHtml(bundle.navCategories, effectiveIsEn)}
  <main class="flex-1 flex flex-col justify-between">
    <div class="w-full">
      <div class="w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto pt-2 sm:pt-3.5 pb-10 sm:pb-14">
        <h1 class="sr-only">${escapeHtml(title)}</h1>
        ${renderFeedListHtml(feedArticles, effectiveIsEn, true)}
      </div>
    </div>
  </main>
  ${renderServerFooterHtml(effectiveIsEn, bundle.socialLinks)}
</div>`;

    let html = cleanTemplateHead(baseTemplate).replace(/<html[^>]*lang=["'][^"']*["']/i, `<html lang="${lang}"`);
    html = injectHeadTags(html, headBlock);
    html = injectRootAndPayload(html, rootHtml, bundle);

    return {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, must-revalidate, max-age=0',
      },
      html,
    };
  }

  // 6. Сторінки дійсних категорій та рубрик (/news, /popular, /articles, /reviews, або з налаштувань navCategories)
  let candidateSlug: string | null = null;
  const categoryPrefixMatch = pathname.match(/^\/category\/([^/]+)$/i);
  const singleSegmentMatch = pathname.match(/^\/([^/]+)$/);

  if (categoryPrefixMatch) {
    try {
      candidateSlug = decodeURIComponent(categoryPrefixMatch[1]).trim().toLowerCase();
    } catch {
      return buildNotFoundResponse(baseTemplate, requestedEn, bundle.navCategories);
    }
  } else if (singleSegmentMatch) {
    try {
      candidateSlug = decodeURIComponent(singleSegmentMatch[1]).trim().toLowerCase();
    } catch {
      return buildNotFoundResponse(baseTemplate, requestedEn, bundle.navCategories);
    }
  }

  if (candidateSlug) {
    const builtInSections = new Set(['news', 'popular', 'articles', 'reviews']);
    const matchedNav = bundle.navCategories.find(
      (c) => c.slug.trim().toLowerCase() === candidateSlug || c.id.trim().toLowerCase() === candidateSlug
    );

    if (builtInSections.has(candidateSlug) || matchedNav) {
      const canonicalSlug = matchedNav ? matchedNav.slug.trim().toLowerCase() : candidateSlug;

      const matchingAllLangs = bundle.articles.filter((art) => {
        if (canonicalSlug === 'news') return matchesHeaderSectionServer(art, 'news');
        if (canonicalSlug === 'popular') return true;
        if (matchedNav) return matchesNavCategory(art, matchedNav);
        return matchesHeaderSectionServer(art, canonicalSlug);
      });

      const enInSection = matchingAllLangs.filter((a) => hasPublishedEnglishVersion(a));
      const uaInSection = matchingAllLangs.filter((a) => hasPublishedUkrainianVersion(a));
      const hasEnInSection = enInSection.length > 0;
      const effectiveIsEn = requestedEn && hasEnInSection;
      const lang = effectiveIsEn ? 'en' : 'uk';

      let sectionArticles = effectiveIsEn ? enInSection : uaInSection;
      if (canonicalSlug === 'popular') {
        sectionArticles = [...sectionArticles].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
      }

      const totalPages = Math.max(1, Math.ceil(sectionArticles.length / 10));
      const rawPageParam = searchParams.get('page');
      let currentPage = 1;
      if (rawPageParam !== null) {
        if (!/^\d+$/.test(rawPageParam)) {
          return buildNotFoundResponse(baseTemplate, effectiveIsEn, bundle.navCategories);
        }
        currentPage = parseInt(rawPageParam, 10);
        if (currentPage < 1 || currentPage > totalPages) {
          return buildNotFoundResponse(baseTemplate, effectiveIsEn, bundle.navCategories);
        }
      }

      const pageSlice = sectionArticles.slice((currentPage - 1) * 10, currentPage * 10);

      let catTitle = canonicalSlug;
      if (canonicalSlug === 'news') catTitle = effectiveIsEn ? 'News' : 'Новини';
      else if (canonicalSlug === 'popular') catTitle = effectiveIsEn ? 'Popular' : 'Популярні матеріали';
      else if (matchedNav) {
        catTitle = effectiveIsEn && matchedNav.nameEn ? matchedNav.nameEn : matchedNav.name;
      } else if (canonicalSlug === 'articles') catTitle = effectiveIsEn ? 'Articles' : 'Статті';
      else if (canonicalSlug === 'reviews') catTitle = effectiveIsEn ? 'Reviews' : 'Огляди';

      const baseCatUrl = `${SITE_DOMAIN}/${encodeURIComponent(canonicalSlug)}`;
      const queryParts: string[] = [];
      if (effectiveIsEn) queryParts.push('lang=en');
      if (currentPage > 1) queryParts.push(`page=${currentPage}`);
      const canonicalUrl = queryParts.length > 0 ? `${baseCatUrl}?${queryParts.join('&')}` : baseCatUrl;

      const pageSuffixTitle =
        currentPage > 1 ? (effectiveIsEn ? ` (Page ${currentPage})` : ` (Сторінка ${currentPage})`) : '';
      const fullTitle = `${catTitle}${pageSuffixTitle} — ${SITE_NAME}`;
      const description = effectiveIsEn
        ? `Browse the latest materials, articles, and reviews in "${catTitle}" on ${SITE_NAME}.`
        : `Читайте актуальні матеріали, аналітику та новини у розділі «${catTitle}» на ${SITE_NAME}.`;

      const alternates =
        hasEnInSection && currentPage === 1
          ? [
              { lang: 'uk', href: baseCatUrl },
              { lang: 'en', href: `${baseCatUrl}?lang=en` },
              { lang: 'x-default', href: baseCatUrl },
            ]
          : undefined;

      const headBlock = buildHeadMetaBlock({
        title: fullTitle,
        description,
        canonicalUrl,
        robots: 'index, follow',
        ogType: 'website',
        alternates,
      });

      const paginationLinks =
        totalPages > 1
          ? `<nav aria-label="${effectiveIsEn ? 'Pagination' : 'Нумерація сторінок'}" class="mt-10 flex items-center justify-center gap-2">
          ${Array.from({ length: totalPages }, (_, idx) => idx + 1)
            .map((p) => {
              const pParams: string[] = [];
              if (effectiveIsEn) pParams.push('lang=en');
              if (p > 1) pParams.push(`page=${p}`);
              const pHref = `/${encodeURIComponent(canonicalSlug)}${pParams.length > 0 ? `?${pParams.join('&')}` : ''}`;
              return `<a href="${escapeHtml(pHref)}" ${p === currentPage ? 'aria-current="page"' : ''} class="px-3 py-1 text-sm no-underline">${p}</a>`;
            })
            .join('')}
        </nav>`
          : '';

      const rootHtml = `<div class="min-h-screen w-full bg-white dark:bg-[#222222] text-black dark:text-[#cbcbcb] flex flex-col justify-between">
  ${renderServerHeaderHtml(bundle.navCategories, effectiveIsEn)}
  <main class="flex-1 flex flex-col justify-between">
    <div class="w-full">
      <div class="w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto pt-2 sm:pt-3.5 pb-10 sm:pb-14">
        <div class="space-y-6 sm:space-y-8">
          <div class="flex items-baseline justify-between border-b border-neutral-100 dark:border-[#333333] pb-3">
            <h1 class="text-2xl sm:text-3xl font-medium tracking-tight text-black dark:text-[#ffffff]" style="font-family: 'Playfair Display', Georgia, serif">${escapeHtml(catTitle)}</h1>
          </div>
          ${renderFeedListHtml(pageSlice, effectiveIsEn, false)}
          ${paginationLinks}
        </div>
      </div>
    </div>
  </main>
  ${renderServerFooterHtml(effectiveIsEn, bundle.socialLinks)}
</div>`;

      let html = cleanTemplateHead(baseTemplate).replace(/<html[^>]*lang=["'][^"']*["']/i, `<html lang="${lang}"`);
      html = injectHeadTags(html, headBlock);
      html = injectRootAndPayload(html, rootHtml, bundle);

      return {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, must-revalidate, max-age=0',
        },
        html,
      };
    }
  }

  // 7. Будь-який невідомий маршрут -> чесний HTTP 404 Not Found
  return buildNotFoundResponse(baseTemplate, requestedEn, bundle.navCategories);
}

export default async function handler(req: any, res: any) {
  const rawReqUrl = typeof req?.url === 'string' ? req.url : '';
  if (
    req?.query?.__asset === 'cover' ||
    /^\/uploads\/cover-/i.test(rawReqUrl) ||
    /^\/api\/article-image\b/i.test(rawReqUrl) ||
    /[?&]__asset=cover\b/.test(rawReqUrl)
  ) {
    return articleImageHandler(req, res);
  }

  // Захист від випадкового потрапляння robots.txt до HTML-рендерера
  if (
    /^\/robots\.txt\b/i.test(rawReqUrl) ||
    req?.query?.pathname === '/robots.txt' ||
    req?.query?.pathname === 'robots.txt'
  ) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(ROBOTS_TXT_BODY);
  }

  // Захист від випадкового потрапляння sitemap.xml до HTML-рендерера
  if (
    /^\/sitemap(?:-[^/]+)?\.xml\b/i.test(rawReqUrl) ||
    req?.query?.pathname === '/sitemap.xml' ||
    req?.query?.pathname === 'sitemap.xml' ||
    typeof req?.query?.part === 'string'
  ) {
    return sitemapHandler(req, res);
  }

  // Захист від випадкового потрапляння news-sitemap.xml до HTML-рендерера
  if (
    /^\/news-sitemap(?:-[^/]+)?\.xml\b/i.test(rawReqUrl) ||
    req?.query?.pathname === '/news-sitemap.xml' ||
    req?.query?.pathname === 'news-sitemap.xml' ||
    typeof req?.query?.lang === 'string'
  ) {
    return newsSitemapHandler(req, res);
  }

  // Обслуговування favicon.svg та favicon.ico (якщо запит надійшов через Vercel rewrite)
  if (
    /^\/favicon\.svg\b/i.test(rawReqUrl) ||
    req?.query?.pathname === '/favicon.svg' ||
    req?.query?.pathname === 'favicon.svg'
  ) {
    const filePath = path.resolve(process.cwd(), 'public', 'favicon.svg');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (req.method === 'HEAD') return res.status(200).end();
      return res.status(200).send(fs.readFileSync(filePath, 'utf-8'));
    }
  }

  if (
    /^\/favicon\.ico\b/i.test(rawReqUrl) ||
    req?.query?.pathname === '/favicon.ico' ||
    req?.query?.pathname === 'favicon.ico'
  ) {
    const filePath = path.resolve(process.cwd(), 'public', 'favicon.ico');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'image/x-icon');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (req.method === 'HEAD') return res.status(200).end();
      return res.status(200).send(fs.readFileSync(filePath));
    }
  }

  initResponseHelpers(res);

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const result = await generatePageResponse(req);
    for (const [headerName, headerValue] of Object.entries(result.headers)) {
      res.setHeader(headerName, headerValue);
    }

    if (req.method === 'HEAD') {
      return res.status(result.status).end();
    }
    return res.status(result.status).send(result.html);
  } catch (err) {
    console.error('[render-page] Unexpected error:', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(503).send('Service Unavailable');
  }
}
