import React, { useState, useEffect } from 'react';
import { ArrowLeft, Eye, EyeOff, Globe } from 'lucide-react';
import { Article, SiteLanguage } from '../types';
import { formatTimeAgoOrDate } from '../utils/date';
import { formatViews } from '../utils/stats';
import { fetchStatsConfig, trackArticleView, fetchSingleArticleViews } from '../services/stats';
import { ContentRenderer } from './ContentRenderer';
import { getArticleSeoMetadata, resolveArticlePublishedIso, updateDocumentSeo } from '../utils/seo';

interface ArticleViewProps {
  article: Article;
  lang: SiteLanguage;
  onBack: () => void;
  onSwitchLang?: (lang: SiteLanguage) => void;
  onSelectTopic?: (topic: string) => void;
  onSelectCategory?: (category: string) => void;
  onViewsUpdated?: (articleId: string, views: number) => void;
}

export const ArticleView: React.FC<ArticleViewProps> = ({
  article,
  lang,
  onBack,
  onSwitchLang,
  onSelectTopic,
  onSelectCategory,
  onViewsUpdated,
}) => {
  const isEn = lang === 'en';
  const hasEnVersion = Boolean(article.titleEn?.trim() && article.contentEn?.trim());

  const [views, setViews] = useState<number>(article.views ?? 0);

  const isHidden = isEn
    ? article.publishedEn === false || !article.publishedEn
    : article.published === false || String(article.published) === 'false';

  // Автоматичне оновлення унікальних SEO-метаданих та Schema.org JSON-LD статті у DOM
  useEffect(() => {
    const seoData = getArticleSeoMetadata(article, isEn);
    if (isHidden) {
      updateDocumentSeo({ ...seoData, noindex: true, jsonLd: null });
    } else {
      updateDocumentSeo(seoData);
    }
  }, [article, isEn, isHidden]);

  // Оновлюємо стан views при зміні статті
  useEffect(() => {
    setViews(article.views ?? 0);
  }, [article.id, article.views]);

  // Завжди негайно отримуємо актуальну кількість переглядів статті з сервера при відкритті матеріалу,
  // щоб користувач одразу бачив актуальну кількість, а не 0 і не чекав закінчення таймера
  useEffect(() => {
    let isMounted = true;
    fetchSingleArticleViews(article.id).then((serverViews) => {
      if (isMounted && typeof serverViews === 'number') {
        setViews((prev) => {
          const next = Math.max(prev, serverViews);
          if (next !== prev) {
            onViewsUpdated?.(article.id, next);
          }
          return next;
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, [article.id]);

  // Динамічне завантаження порогу зарахування перегляду з адмін-панелі та фіксація читання
  useEffect(() => {
    let thresholdSec = 5;
    try {
      const cached = localStorage.getItem('the_impart_stats_threshold');
      if (cached) {
        const val = parseInt(cached, 10);
        if (val > 0) thresholdSec = val;
      }
    } catch {}

    let isMounted = true;
    fetchStatsConfig().then((cfg) => {
      if (isMounted && cfg && typeof cfg.thresholdSeconds === 'number' && cfg.thresholdSeconds > 0) {
        thresholdSec = cfg.thresholdSeconds;
      }
    });

    const sessionKey = `impart_viewed_${article.id}`;
    let isViewedInSession = false;
    try {
      isViewedInSession = Boolean(sessionStorage.getItem(sessionKey));
    } catch {}

    const sessionId = (() => {
      try {
        let sid = sessionStorage.getItem('impart_session_id');
        if (!sid) {
          sid = `s_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          sessionStorage.setItem('impart_session_id', sid);
        }
        return sid;
      } catch {
        return `s_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      }
    })();

    let activeSeconds = 0;
    let viewRecorded = isViewedInSession;
    let lastFlushSeconds = 0;

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        activeSeconds += 1;

        // Коли активний час читача досягає порогу з адмін-панелі — фіксуємо перегляд
        if (!viewRecorded && activeSeconds >= thresholdSec) {
          viewRecorded = true;
          try {
            sessionStorage.setItem(sessionKey, String(Date.now()));
          } catch {}

          trackArticleView({
            articleId: article.id,
            durationSeconds: activeSeconds - lastFlushSeconds,
            qualifyView: true,
            sessionId,
          }).then((res) => {
            if (isMounted && res && typeof res.views === 'number') {
              setViews(res.views);
              onViewsUpdated?.(article.id, res.views);
            }
          });
          lastFlushSeconds = activeSeconds;
        } else if (viewRecorded && activeSeconds - lastFlushSeconds >= 10) {
          // Періодичне оновлення часу читання для точної статистики тривалості
          const delta = activeSeconds - lastFlushSeconds;
          lastFlushSeconds = activeSeconds;
          trackArticleView({
            articleId: article.id,
            durationSeconds: delta,
            qualifyView: false,
            sessionId,
          });
        }
      }
    }, 1000);

    const handleBeforeUnload = () => {
      const delta = activeSeconds - lastFlushSeconds;
      if (delta > 0) {
        const qualify = !viewRecorded && activeSeconds >= thresholdSec;
        trackArticleView({
          articleId: article.id,
          durationSeconds: delta,
          qualifyView: qualify,
          sessionId,
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMounted = false;
      clearInterval(timer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [article.id]);

  // Вибір даних залежно від обраної мови
  const title = isEn && hasEnVersion ? article.titleEn! : article.title;
  const content = isEn && hasEnVersion ? article.contentEn! : article.content;
  const excerpt = isEn && hasEnVersion ? article.excerptEn : article.excerpt;
  const isExcerptVisible = (val: any, fallback = true): boolean => {
    if (val === undefined || val === null) return fallback;
    if (val === false || val === 'false' || val === 0 || val === '0') return false;
    if (val === true || val === 'true' || val === 1 || val === '1') return true;
    return fallback;
  };

  const showExcerpt = isEn && hasEnVersion
    ? isExcerptVisible(article.showExcerptInArticleEn, isExcerptVisible(article.showExcerptInArticle, true))
    : isExcerptVisible(article.showExcerptInArticle, true);
  const categoriesList = isEn && hasEnVersion
    ? (article.categoriesEn && article.categoriesEn.length > 0
        ? article.categoriesEn
        : article.categoryEn
        ? [article.categoryEn]
        : (article.categories || [article.category])).filter(Boolean)
    : (article.categories && article.categories.length > 0
        ? article.categories
        : article.category ? [article.category] : []).filter(Boolean);
  const topics = isEn && article.topicsEn && article.topicsEn.length > 0 ? article.topicsEn : article.topics;

  const timeDisplay = formatTimeAgoOrDate(article.createdAt, article.date, article.id, lang);
  const publishedIso = resolveArticlePublishedIso(article);
  const coverCaption = isEn && hasEnVersion
    ? (article.coverImageCaptionEn || article.coverImageCaption)
    : article.coverImageCaption;

  return (
    <article className="w-full pt-1.5 sm:pt-3.5 pb-12 sm:pb-20 animate-article-fade-in">
      {/* Верхній блок: Навігація ("Усі матеріали" + рубрики), Метадані та Заголовок статті */}
      <div className="w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] max-w-3xl mx-auto">
        {/* Верхня навігація та рубрики статті */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2 sm:mb-2.5">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <a
              href="/"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                  e.preventDefault();
                  onBack();
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-neutral-500 dark:text-[#a0a0a0] hover:text-black dark:hover:text-white transition-colors cursor-pointer group no-underline shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
              <span>{isEn ? 'All materials' : 'Усі матеріали'}</span>
            </a>

            {categoriesList.length > 0 && (
              <>
                <span className="text-neutral-300 dark:text-neutral-700 select-none">•</span>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs uppercase tracking-wider">
                  {categoriesList.map((cat, idx) => {
                    const lower = cat.trim().toLowerCase();
                    const targetHref =
                      lower === 'новини' || lower === 'новина' || lower === 'news'
                        ? '/news'
                        : ['обзори', 'огляди', 'обзор', 'огляд', 'reviews', 'review'].includes(lower)
                        ? '/reviews'
                        : ['статті', 'стаття', 'articles', 'article'].includes(lower)
                        ? '/articles'
                        : `/search/${encodeURIComponent(cat)}`;
                    return (
                      <a
                        key={`cat_${idx}`}
                        href={targetHref}
                        onClick={(e) => {
                          if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                            e.preventDefault();
                            onSelectCategory?.(cat);
                          }
                        }}
                        className="font-medium text-neutral-800 dark:text-[#cbcbcb] hover:text-black dark:hover:text-white bg-neutral-100 dark:bg-[#1a1a1a] hover:bg-neutral-200 dark:hover:bg-[#252525] border border-transparent dark:border-[#333333] px-2.5 py-0.5 rounded cursor-pointer transition-colors no-underline"
                        title={isEn ? `Go to rubric ${cat}` : `Перейти до рубрики ${cat}`}
                      >
                        {cat}
                      </a>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Якщо користувач перемкнувся на англійську, але стаття ще не перекладена */}
            {isEn && !hasEnVersion && (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 px-2.5 py-1 rounded">
                <Globe className="w-3.5 h-3.5" />
                <span>English version coming soon (showing UA)</span>
              </span>
            )}

            {isHidden && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-[#cbcbcb] bg-neutral-100 dark:bg-[#252525] border border-neutral-200 dark:border-[#333333] px-3 py-1 rounded">
                <EyeOff className="w-3.5 h-3.5 text-neutral-500 dark:text-[#888888]" />
                <span>
                  {isEn ? 'Draft preview' : 'Прихована стаття (попередній перегляд)'}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Автор, дата та перегляди: переміщено між "усі матеріали" та назвою зі зменшеним простором */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs text-neutral-500 dark:text-[#888888] font-sans pt-0.5 pb-2 mb-2 sm:mb-2.5">
          <span className="font-medium text-neutral-700 dark:text-[#b0b0b0]">{article.author}</span>
          <div className="flex items-center gap-2.5">
            {publishedIso ? (
              <time dateTime={publishedIso}>{timeDisplay}</time>
            ) : (
              <span>{timeDisplay}</span>
            )}
            <span className="text-neutral-300 dark:text-neutral-700 select-none">•</span>
            <span
              className="inline-flex items-center gap-1.5 text-neutral-700 dark:text-[#cbcbcb] font-medium"
              title={isEn ? 'Total article views' : 'Загальна кількість переглядів статті'}
            >
              <Eye className="w-3.5 h-3.5 text-neutral-400 dark:text-[#888888]" />
              <span>{formatViews(views, isEn)}</span>
            </span>
          </div>
        </div>

        {/* Заголовок статті */}
        <h1
          className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-sans font-bold tracking-tight text-black dark:text-[#f5f5f5] leading-tight mb-5 sm:mb-7"
        >
          {title}
        </h1>
      </div>

      {/* Головна обкладинка статті:
          - На мобільній версії: займає всю ширину без відступів (w-full edge-to-edge, rounded-none)
          - На планшетах/десктопі: займає 26 пунктів з 34 з відступами по 4 пункти з країв (w-[calc(26/34*100%)] mx-auto, rounded-xl/2xl)
          - Пропорції: 26 на 14.5
      */}
      {article.coverImage && (
        <figure className="mb-8 sm:mb-10 w-full sm:w-[calc(26/34*100%)] mx-auto article-full-mobile">
          <div className="w-full aspect-[26/14.5] overflow-hidden bg-neutral-100 dark:bg-[#181818] rounded-none sm:rounded-xl md:rounded-2xl border-y sm:border border-transparent dark:border-[#2e2e2e] shadow-xs">
            <img
              src={article.coverImage}
              alt={title}
              width={1600}
              height={892}
              fetchPriority="high"
              decoding="async"
              className="w-full h-full object-cover"
            />
          </div>
          {coverCaption && (
            <figcaption className="mt-2.5 sm:mt-3 text-center text-xs sm:text-sm text-neutral-500 dark:text-[#888888] font-sans italic px-4">
              {coverCaption}
            </figcaption>
          )}
        </figure>
      )}

      {/* Основний вміст статті: лід, текст, галереї */}
      <div className="w-[92%] sm:w-[90%] md:max-w-3xl mx-auto">
        {/* Лід / короткий опис */}
        {showExcerpt && excerpt && (
          <p className="text-lg sm:text-xl text-neutral-700 dark:text-[#e0e0e0] leading-relaxed font-sans italic mb-8 border-l-2 border-black dark:border-[#cbcbcb] pl-6">
            {excerpt}
          </p>
        )}

        {/* Рендеринг тексту з медіа */}
        <div className="prose prose-neutral dark:prose-invert max-w-none text-base sm:text-lg leading-relaxed text-neutral-800 dark:text-[#cbcbcb] article-view-content">
          <ContentRenderer content={content} />
        </div>

      {/* Теми статті внизу матеріалу */}
      {topics && topics.length > 0 && (
        <div className="mt-12 pt-6 border-t border-neutral-100 dark:border-[#333333]">
          <div className="text-xs uppercase tracking-wider text-neutral-400 dark:text-[#777777] mb-3 font-sans">
            {isEn ? 'Topics & Themes' : 'Теми статті'}
          </div>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <a
                key={t}
                href={`/search/${encodeURIComponent(t)}`}
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                    e.preventDefault();
                    onSelectTopic?.(t);
                  }
                }}
                className="px-3 py-1 bg-neutral-100 dark:bg-[#1a1a1a] hover:bg-neutral-200 dark:hover:bg-[#252525] text-neutral-700 dark:text-[#cbcbcb] hover:text-black dark:hover:text-white border border-transparent dark:border-[#333333] text-xs rounded-md transition-colors cursor-pointer no-underline"
                title={isEn ? `Search articles on #${t}` : `Шукати матеріали з темою #${t}`}
              >
                #{t}
              </a>
            ))}
          </div>
        </div>
      )}
      </div>
    </article>
  );
};
