import React, { useState, useEffect } from 'react';
import { Article, SiteLanguage } from '../types';
import { formatArticlePublicationDate } from '../utils/date';

export interface EmbeddedArticlePayload {
  id: string;
  title: string;
  titleEn?: string;
  rubric: string;
  rubricEn?: string;
  date: string;
  createdAt?: string;
  coverImage?: string;
  href?: string;
}

function escapeAttr(val?: string): string {
  if (!val) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unescapeAttr(val?: string | null): string {
  if (!val) return '';
  return String(val)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Витягує ID статті з URL на сайті (наприклад, https://www.theimpart.com/article/1727..., /article/1727...)
 * або з прямого рядка.
 */
export function extractArticleIdFromInput(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. /article/<id> у повному або відносному посиланні
  const pathMatch = trimmed.match(/(?:^|\/)article\/([^/?#&\s]+)/i);
  if (pathMatch && pathMatch[1]) {
    try {
      return decodeURIComponent(pathMatch[1]);
    } catch {
      return pathMatch[1];
    }
  }

  // 2. ?article=<id> або #article-<id>
  const queryMatch = trimmed.match(/[?&]article=([^&#\s]+)/i);
  if (queryMatch && queryMatch[1]) {
    try {
      return decodeURIComponent(queryMatch[1]);
    } catch {
      return queryMatch[1];
    }
  }

  const hashMatch = trimmed.match(/#article-([^&#\s]+)/i);
  if (hashMatch && hashMatch[1]) {
    try {
      return decodeURIComponent(hashMatch[1]);
    } catch {
      return hashMatch[1];
    }
  }

  return null;
}

export function resolveArticlePrimaryRubric(article: Article, lang: SiteLanguage = 'ua'): string {
  if (lang === 'en') {
    if (article.categoriesEn && article.categoriesEn.length > 0 && article.categoriesEn[0]?.trim()) {
      return article.categoriesEn[0].trim();
    }
    if (article.categoryEn?.trim()) {
      return article.categoryEn.split(',')[0].trim();
    }
  }

  if (article.categories && article.categories.length > 0 && article.categories[0]?.trim()) {
    return article.categories[0].trim();
  }
  if (article.category?.trim()) {
    return article.category.split(',')[0].trim();
  }
  return lang === 'en' ? 'Article' : 'Статті';
}

export function buildEmbeddedArticlePayload(article: Article): EmbeddedArticlePayload {
  const rubricUa = resolveArticlePrimaryRubric(article, 'ua');
  const rubricEn =
    (article.categoriesEn && article.categoriesEn.length > 0 && article.categoriesEn[0]?.trim()) ||
    article.categoryEn?.split(',')[0]?.trim() ||
    undefined;

  const formattedDateUa = formatArticlePublicationDate(
    article.createdAt,
    article.date,
    article.id,
    'ua'
  );

  return {
    id: String(article.id),
    title: article.title?.trim() || 'Без назви',
    titleEn: article.titleEn?.trim() || undefined,
    rubric: rubricUa,
    rubricEn,
    date: formattedDateUa || article.date || '',
    createdAt: article.createdAt || undefined,
    coverImage: article.coverImage?.trim() || undefined,
    href: `/article/${encodeURIComponent(String(article.id))}`,
  };
}

/**
 * Генерує чистий HTML блоку для візуального редактора (WYSIWYG) та серверного рендерингу.
 * Усі дочірні елементи всередині <a> є <span>, тому зовнішній <div class="article-embed-wrapper">
 * не має вкладених <div> і безпомилково парситься регулярними виразами.
 */
export function buildArticleEmbedHtml(
  payload: EmbeddedArticlePayload,
  lang: SiteLanguage = 'ua'
): string {
  const isEn = lang === 'en';
  const displayTitle =
    isEn && payload.titleEn?.trim() ? payload.titleEn.trim() : payload.title || 'Без назви';
  const displayRubric =
    isEn && payload.rubricEn?.trim()
      ? payload.rubricEn.trim()
      : payload.rubric || (isEn ? 'Article' : 'Статті');
  const displayDate = formatArticlePublicationDate(
    payload.createdAt,
    payload.date,
    payload.id,
    lang
  );
  const href = payload.id
    ? `/article/${encodeURIComponent(payload.id)}`
    : payload.href || '#';
  const cover = payload.coverImage?.trim() || '';

  const mediaInner = cover
    ? `<img class="article-embed-img" src="${escapeAttr(cover)}" alt="${escapeAttr(displayTitle)}" loading="lazy" decoding="async" />`
    : `<span class="article-embed-fallback">The Impart</span>`;

  return `<div class="article-embed-wrapper" contenteditable="false" data-article-embed="true" data-article-id="${escapeAttr(payload.id)}" data-article-title="${escapeAttr(payload.title)}" data-article-title-en="${escapeAttr(payload.titleEn)}" data-article-rubric="${escapeAttr(payload.rubric)}" data-article-rubric-en="${escapeAttr(payload.rubricEn)}" data-article-date="${escapeAttr(payload.date)}" data-article-created-at="${escapeAttr(payload.createdAt)}" data-article-cover="${escapeAttr(cover)}"><a class="article-embed-card" href="${escapeAttr(href)}"><span class="article-embed-media">${mediaInner}</span><span class="article-embed-body"><span class="article-embed-rubric">${escapeAttr(displayRubric)}</span><span class="article-embed-title">${escapeAttr(displayTitle)}</span>${displayDate ? `<span class="article-embed-date">${escapeAttr(displayDate)}</span>` : ''}</span></a></div>`;
}

export function buildArticleEmbedShortcode(payload: EmbeddedArticlePayload): string {
  const attrs: string[] = [`id="${escapeAttr(payload.id)}"`];
  if (payload.title) attrs.push(`title="${escapeAttr(payload.title)}"`);
  if (payload.titleEn) attrs.push(`titleEn="${escapeAttr(payload.titleEn)}"`);
  if (payload.rubric) attrs.push(`rubric="${escapeAttr(payload.rubric)}"`);
  if (payload.rubricEn) attrs.push(`rubricEn="${escapeAttr(payload.rubricEn)}"`);
  if (payload.date) attrs.push(`date="${escapeAttr(payload.date)}"`);
  if (payload.createdAt) attrs.push(`createdAt="${escapeAttr(payload.createdAt)}"`);
  if (payload.coverImage) attrs.push(`cover="${escapeAttr(payload.coverImage)}"`);
  return `[article-card ${attrs.join(' ')}]`;
}

export function parseArticleEmbedShortcode(tag: string): EmbeddedArticlePayload | null {
  const trimmed = tag.trim();
  if (!/^\[article-card\b/i.test(trimmed)) return null;

  const getAttr = (name: string): string => {
    const regex = new RegExp(`\\b${name}=["']([^"']*)["']`, 'i');
    const m = trimmed.match(regex);
    return m ? unescapeAttr(m[1]) : '';
  };

  const id = getAttr('id');
  const title = getAttr('title');
  if (!id && !title) return null;

  return {
    id,
    title: title || 'Стаття',
    titleEn: getAttr('titleEn') || undefined,
    rubric: getAttr('rubric') || 'Статті',
    rubricEn: getAttr('rubricEn') || undefined,
    date: getAttr('date') || '',
    createdAt: getAttr('createdAt') || undefined,
    coverImage: getAttr('cover') || undefined,
    href: id ? `/article/${encodeURIComponent(id)}` : '#',
  };
}

export function parseArticleEmbedFromHtml(wrapperHtml: string): EmbeddedArticlePayload | null {
  if (!wrapperHtml) return null;

  const getDataAttr = (attrName: string): string => {
    const regex = new RegExp(`${attrName}=["']([^"']*)["']`, 'i');
    const m = wrapperHtml.match(regex);
    return m ? unescapeAttr(m[1]) : '';
  };

  let id = getDataAttr('data-article-id');
  const hrefMatch = wrapperHtml.match(/<a\b[^>]*\bhref=["']([^"']*)["']/i);
  const href = hrefMatch ? unescapeAttr(hrefMatch[1]) : '';
  if (!id && href) {
    id = extractArticleIdFromInput(href) || '';
  }

  const stripTags = (s: string) => unescapeAttr(s.replace(/<[^>]*>/g, '').trim());

  let title = getDataAttr('data-article-title');
  if (!title) {
    const titleMatch = wrapperHtml.match(
      /class=["'][^"']*\barticle-embed-title\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i
    );
    if (titleMatch) title = stripTags(titleMatch[1]);
  }

  let rubric = getDataAttr('data-article-rubric');
  if (!rubric) {
    const rubricMatch = wrapperHtml.match(
      /class=["'][^"']*\barticle-embed-rubric\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i
    );
    if (rubricMatch) rubric = stripTags(rubricMatch[1]);
  }

  let date = getDataAttr('data-article-date');
  if (!date) {
    const dateMatch = wrapperHtml.match(
      /class=["'][^"']*\barticle-embed-date\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i
    );
    if (dateMatch) date = stripTags(dateMatch[1]);
  }

  let coverImage = getDataAttr('data-article-cover');
  if (!coverImage) {
    const imgMatch = wrapperHtml.match(/<img\b[^>]*\bsrc=["']([^"']*)["']/i);
    if (imgMatch) coverImage = unescapeAttr(imgMatch[1]);
  }

  if (!id && !title) return null;

  return {
    id,
    title: title || 'Без назви',
    titleEn: getDataAttr('data-article-title-en') || undefined,
    rubric: rubric || 'Статті',
    rubricEn: getDataAttr('data-article-rubric-en') || undefined,
    date: date || '',
    createdAt: getDataAttr('data-article-created-at') || undefined,
    coverImage: coverImage || undefined,
    href: id ? `/article/${encodeURIComponent(id)}` : href || '#',
  };
}

interface ArticleEmbedCardProps {
  payload: EmbeddedArticlePayload;
  articles?: Article[];
  lang?: SiteLanguage;
  onSelectArticle?: (articleId: string) => void;
  isPreview?: boolean;
}

export const ArticleEmbedCard: React.FC<ArticleEmbedCardProps> = ({
  payload,
  articles,
  lang = 'ua',
  onSelectArticle,
  isPreview = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const liveArticle = articles?.find((a) => String(a.id) === String(payload.id));
  const isEn = lang === 'en';

  const resolvedCover = liveArticle
    ? liveArticle.coverImage?.trim() || payload.coverImage
    : payload.coverImage;

  useEffect(() => {
    setImgFailed(false);
  }, [resolvedCover]);

  const resolvedTitle = (() => {
    if (liveArticle) {
      if (isEn && liveArticle.titleEn?.trim()) return liveArticle.titleEn.trim();
      if (liveArticle.title?.trim()) return liveArticle.title.trim();
    }
    if (isEn && payload.titleEn?.trim()) return payload.titleEn.trim();
    return payload.title || (isEn ? 'Untitled' : 'Без назви');
  })();

  const resolvedRubric = (() => {
    if (liveArticle) {
      return resolveArticlePrimaryRubric(liveArticle, lang);
    }
    if (isEn && payload.rubricEn?.trim()) return payload.rubricEn.trim();
    return payload.rubric || (isEn ? 'Article' : 'Статті');
  })();

  const resolvedDate = (() => {
    if (liveArticle) {
      return formatArticlePublicationDate(
        liveArticle.createdAt,
        liveArticle.date,
        liveArticle.id,
        lang
      );
    }
    return formatArticlePublicationDate(
      payload.createdAt,
      payload.date,
      payload.id,
      lang
    );
  })();

  const targetHref = payload.id
    ? `/article/${encodeURIComponent(payload.id)}`
    : payload.href || '#';

  return (
    <div className="article-embed-wrapper not-prose">
      <a
        href={targetHref}
        onClick={(e) => {
          if (isPreview) {
            e.preventDefault();
            return;
          }
          if (
            onSelectArticle &&
            payload.id &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.shiftKey &&
            !e.altKey &&
            e.button === 0
          ) {
            e.preventDefault();
            onSelectArticle(payload.id);
          }
        }}
        className="article-embed-card group"
      >
        <span className="article-embed-media">
          {resolvedCover && !imgFailed ? (
            <img
              src={resolvedCover}
              alt={resolvedTitle}
              loading="lazy"
              decoding="async"
              onError={() => setImgFailed(true)}
              className="article-embed-img"
            />
          ) : (
            <span className="article-embed-fallback">The Impart</span>
          )}
        </span>

        <span className="article-embed-body">
          {resolvedRubric && (
            <span className="article-embed-rubric">{resolvedRubric}</span>
          )}
          <span className="article-embed-title">{resolvedTitle}</span>
          {resolvedDate && (
            <span className="article-embed-date">{resolvedDate}</span>
          )}
        </span>
      </a>
    </div>
  );
};
