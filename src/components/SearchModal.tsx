import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ArrowRight, Sparkles } from 'lucide-react';
import { Article, SiteLanguage } from '../types';
import { formatTimeAgoOrDate } from '../utils/date';
import { searchArticlesWithFuzzy, getHighlightedChunks } from '../utils/search';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: Article[];
  lang: SiteLanguage;
  onSelectArticle: (id: string) => void;
  onShowAllSearchResults: (query: string, results: Article[]) => void;
}

const HighlightedText: React.FC<{ text: string; query: string; className?: string }> = ({
  text,
  query,
  className,
}) => {
  const chunks = useMemo(() => getHighlightedChunks(text, query), [text, query]);

  return (
    <span className={className}>
      {chunks.map((chunk, i) =>
        chunk.isMatch ? (
          <mark
            key={i}
            className="bg-neutral-200/90 dark:bg-neutral-700 text-neutral-950 dark:text-neutral-100 font-semibold px-0.5 rounded-xs not-italic"
          >
            {chunk.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{chunk.text}</React.Fragment>
        )
      )}
    </span>
  );
};

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  articles,
  lang,
  onSelectArticle,
  onShowAllSearchResults,
}) => {
  const [query, setQuery] = useState('');
  const [rendered, setRendered] = useState(isOpen);
  const [isAnimateIn, setIsAnimateIn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Плавне монтування та розмонтування анімацією, блокування скролу фонової сторінки
  useEffect(() => {
    if (isOpen) {
      setRendered(true);
      setQuery('');
      document.body.style.overflow = 'hidden';
      const timer = requestAnimationFrame(() => {
        setIsAnimateIn(true);
      });
      const focusTimer = setTimeout(() => {
        const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
        if (!isTouch) {
          inputRef.current?.focus({ preventScroll: true });
        }
      }, 150);
      return () => {
        cancelAnimationFrame(timer);
        clearTimeout(focusTimer);
        document.body.style.overflow = '';
      };
    } else {
      setIsAnimateIn(false);
      document.body.style.overflow = '';
      const timer = setTimeout(() => {
        setRendered(false);
      }, 650);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const isEn = lang === 'en';
  const cleanQuery = query.trim();

  // Розумний пошук з урахуванням одруківок, відмінків та транслітерації
  const searchResults = useMemo(() => {
    if (!cleanQuery) return [];
    return searchArticlesWithFuzzy(articles, cleanQuery, lang);
  }, [articles, cleanQuery, lang]);

  const matchingArticles = useMemo(() => {
    return searchResults.map((r) => r.article);
  }, [searchResults]);

  const hasTypoMatches = useMemo(() => {
    return searchResults.some((r) => r.hasFuzzyMatch);
  }, [searchResults]);

  const isMouseDownOnBackdropRef = useRef(false);

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    // Не закривати, якщо клік припав на вертикальну смугу прокрутки (scrollbar)
    const rect = e.currentTarget.getBoundingClientRect();
    const isScrollbar = e.clientX > rect.left + e.currentTarget.clientWidth;
    if (isScrollbar) {
      isMouseDownOnBackdropRef.current = false;
      return;
    }
    isMouseDownOnBackdropRef.current = true;
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLElement>) => {
    if (isMouseDownOnBackdropRef.current) {
      onClose();
    }
    isMouseDownOnBackdropRef.current = false;
  };

  const handleOpenAll = () => {
    if (cleanQuery) {
      onShowAllSearchResults(cleanQuery, matchingArticles);
      onClose();
    }
  };

  const handleItemClick = (id: string) => {
    onSelectArticle(id);
    onClose();
  };

  if (!rendered) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 z-50 flex flex-col bg-white/40 sm:bg-white/45 dark:bg-black/60 dark:sm:bg-black/65 backdrop-blur-xl overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] select-none ${
        isAnimateIn ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* 
        Верхня панель модального вікна (Header):
        Натискання на область header НЕ закриває пошук (закриття тільки хрестиком або в області body)
      */}
      <header
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-transparent py-3.5 sm:py-4 border-none cursor-default"
      >
        <div className="relative w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto flex items-center justify-between min-h-[38px]">
          {/* Ліва сторона:
              - На мобільних (< md): порожній контейнер для збереження відступів
              - На десктопі (>= md): логотип The Impart
          */}
          <div className="flex items-center z-20">
            <div className="md:hidden w-10 h-10 -ml-2" />
            <div className="hidden md:block overflow-hidden py-0.5 -my-0.5">
              <span
                className="block text-xl sm:text-2xl font-medium tracking-tight text-black dark:text-[#ffffff] select-none cursor-default text-left"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                The Impart
              </span>
            </div>
          </div>

          {/* Мобільний логотип по центру — точне співпадіння позиції з основною шапкою сайту */}
          <div className="md:hidden absolute left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
            <a
              href="/"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                  e.preventDefault();
                  onClose();
                }
              }}
              aria-label="The Impart — Головна сторінка"
              className="block text-xl font-medium tracking-tight text-black dark:text-[#ffffff] hover:opacity-75 transition-opacity select-none text-center cursor-pointer focus:outline-none whitespace-nowrap no-underline"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              The Impart
            </a>
          </div>

          {/* Кнопка-хрестик: закриває вікно пошуку, розміщена прямо над іконкою пошуку в шапці */}
          <div className="z-20 flex items-center justify-end -mr-1 sm:-mr-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label="Закрити пошук"
              className="text-black dark:text-[#cbcbcb] hover:opacity-60 active:scale-95 transition-all cursor-pointer focus:outline-none flex items-center justify-center w-10 h-10"
            >
              <X className="w-5 h-5 stroke-[1.8]" />
            </button>
          </div>
        </div>
      </header>

      {/* Центральна частина (Body): клік на напівпрозоре тло тут закриває модальне вікно */}
      <div
        className="flex-1 w-full overflow-y-auto"
        onMouseDown={handleBackdropMouseDown}
        onClick={handleBackdropClick}
      >
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-8 flex flex-col justify-start pt-6 sm:pt-12 pb-12 min-h-full">
          {/* Поле вводу та зона під ним — напівпрозора картка з пошуком (клік сюди НЕ закриває вікно) */}
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={`w-full bg-white/80 sm:bg-white/85 dark:bg-[#1a1a1a]/85 backdrop-blur-xl rounded-2xl p-5 sm:p-7 shadow-[0_16px_45px_rgb(0,0,0,0.08)] dark:shadow-[0_16px_45px_rgb(0,0,0,0.5)] border border-neutral-200/80 dark:border-[#333333]/80 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] select-text cursor-default ${
              isAnimateIn ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-6 opacity-0 scale-[0.97]'
            }`}
          >
            {/* Поле вводу з контрастним текстом */}
            <div className="w-full relative flex items-center bg-neutral-50/70 hover:bg-neutral-50/90 focus-within:bg-white/90 dark:bg-[#141414]/75 dark:hover:bg-[#161616]/85 dark:focus-within:bg-[#111111]/90 border-2 border-neutral-200/80 dark:border-[#333333] focus-within:border-black dark:focus-within:border-[#85c1ff] rounded-xl px-4 py-3 sm:py-3.5 transition-all shadow-2xs backdrop-blur-xs">
              <Search className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-500 dark:text-[#888888] mr-3 shrink-0 stroke-[2]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanQuery) {
                    e.preventDefault();
                    handleOpenAll();
                  }
                }}
                placeholder={isEn ? 'Search articles...' : 'Пошук серед статей...'}
                className="w-full text-base sm:text-xl font-serif text-neutral-900 dark:text-[#cbcbcb] placeholder:text-neutral-400 dark:placeholder:text-[#666666] placeholder:font-serif focus:outline-none bg-transparent leading-relaxed"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className="text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-[#999999] hover:text-black dark:hover:text-white bg-neutral-200/70 hover:bg-neutral-300 dark:bg-[#252525] dark:hover:bg-[#333333] px-2.5 py-1 rounded transition-colors cursor-pointer shrink-0 ml-2"
                >
                  {isEn ? 'Clear' : 'Очистити'}
                </button>
              )}
            </div>

            {/* Зона трошки нижче поля вводу: коротка лаконічна підказка */}
            {!cleanQuery && (
              <div className="mt-3.5 pt-3 border-t border-neutral-100 dark:border-[#282828]">
                <p className="text-xs sm:text-sm text-neutral-500 dark:text-[#888888] font-sans tracking-wide text-center">
                  {isEn
                    ? 'Search by title, description or content'
                    : 'Пошук за заголовком, описом або текстом'}
                </p>
              </div>
            )}
          </div>

          {/* Результати пошуку (клік сюди також НЕ закриває модальне вікно без вибору статті) */}
          {cleanQuery && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="w-full mt-6 space-y-3 animate-page-fade-in select-text"
            >
              {/* Панель з кількістю, розумною підказкою та кнопкою "Відкрити всі результати" */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200/80 dark:border-[#333333] gap-2.5 px-1">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-xs uppercase tracking-wider text-neutral-800 dark:text-[#cbcbcb] font-semibold font-sans">
                    {isEn
                      ? `Found ${matchingArticles.length} ${matchingArticles.length === 1 ? 'article' : 'articles'}`
                      : `Знайдено матеріалів: ${matchingArticles.length}`}
                  </span>
                  {hasTypoMatches && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-600 dark:text-[#a0a0a0] bg-neutral-100/90 dark:bg-[#222222] border border-neutral-200/70 dark:border-[#333333] px-2 py-0.5 rounded-full font-sans">
                      <Sparkles className="w-3 h-3 text-neutral-500 dark:text-[#888888]" />
                      <span>{isEn ? 'Typo-tolerant' : 'З урахуванням одруківок'}</span>
                    </span>
                  )}
                </div>

                {matchingArticles.length > 0 && (
                  <a
                    href={`/search/${encodeURIComponent(cleanQuery)}`}
                    onClick={(e) => {
                      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                        e.preventDefault();
                        handleOpenAll();
                      }
                    }}
                    className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-white hover:bg-neutral-800 bg-black dark:bg-[#333333] dark:hover:bg-[#444444] active:scale-95 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer group shadow-2xs no-underline"
                  >
                    <span>{isEn ? 'Open all found articles' : 'Відкрити всі знайдені статті'}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </a>
                )}
              </div>

              {/* Список знайдених статей */}
              {matchingArticles.length > 0 ? (
                <div className="space-y-2.5">
                  {matchingArticles.map((article) => {
                    const title = isEn && article.titleEn ? article.titleEn : article.title;
                    const excerpt = isEn && article.excerptEn ? article.excerptEn : article.excerpt;
                    const category = isEn && article.categoryEn ? article.categoryEn : article.category;
                    const timeAgo = formatTimeAgoOrDate(article.createdAt, article.date, article.id, lang);

                    const pubUa = Boolean(article.published && article.title?.trim());
                    const pubEn = Boolean(article.publishedEn && article.titleEn?.trim());
                    const articleHref = `/article/${encodeURIComponent(article.id)}${isEn && pubUa && pubEn ? '?lang=en' : ''}`;

                    return (
                      <a
                        key={article.id}
                        href={articleHref}
                        onClick={(e) => {
                          if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                            e.preventDefault();
                            handleItemClick(article.id);
                          }
                        }}
                        className="group cursor-pointer p-4 sm:p-4.5 rounded-xl border border-neutral-200/80 dark:border-[#2e2e2e]/80 bg-white/70 dark:bg-[#191919]/70 backdrop-blur-xs hover:border-black/50 dark:hover:border-[#555555] hover:bg-neutral-50/90 dark:hover:bg-[#202020]/90 transition-all duration-200 flex items-center justify-between gap-4 shadow-2xs hover:shadow-xs no-underline text-inherit"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider mb-1">
                            <span className="font-semibold text-neutral-700 dark:text-[#cbcbcb] bg-neutral-100/80 dark:bg-[#252525]/80 px-2 py-0.5 rounded">
                              {category}
                            </span>
                            <span className="text-neutral-400 dark:text-neutral-600">•</span>
                            <span className="text-neutral-500 dark:text-[#888888] font-medium">{timeAgo}</span>
                          </div>
                          <h4
                            className="text-base sm:text-lg font-serif font-medium text-neutral-900 dark:text-[#f0f0f0] group-hover:text-neutral-700 dark:group-hover:text-white transition-colors line-clamp-1"
                            style={{ fontFamily: "'Playfair Display', serif" }}
                          >
                            <HighlightedText text={title} query={cleanQuery} />
                          </h4>
                          {excerpt && (
                            <p className="text-xs text-neutral-600 dark:text-[#9e9e9e] line-clamp-2 mt-1 font-sans leading-relaxed">
                              <HighlightedText text={excerpt} query={cleanQuery} />
                            </p>
                          )}
                        </div>

                        {article.coverImage && (
                          <div className="w-16 h-12 sm:w-20 sm:h-14 shrink-0 rounded-lg overflow-hidden bg-neutral-100 dark:bg-[#222222] border border-neutral-200/60 dark:border-[#333333] shadow-2xs">
                            <img
                              src={article.coverImage}
                              alt=""
                              width={160}
                              height={112}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        )}
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 px-6 text-center bg-white/70 dark:bg-[#191919]/70 backdrop-blur-xs rounded-xl border border-neutral-200/80 dark:border-[#2e2e2e]/80 shadow-2xs">
                  <p className="text-neutral-700 dark:text-[#cbcbcb] font-serif italic text-base sm:text-lg">
                    {isEn ? 'No articles match your query.' : 'За вашим запитом нічого не знайдено.'}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-[#888888] mt-1.5 font-sans">
                    {isEn
                      ? 'Try another keyword or shorten your search.'
                      : 'Спробуйте спростити запит або використати інші ключові слова.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
