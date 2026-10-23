import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Clock,
  Calendar,
  Filter,
  RotateCcw,
  ChevronDown,
  Tag,
  FolderTree,
  Eye,
  Check,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { Article, SiteLanguage, TaxonomiesData } from '../types';
import { ArticleCard } from '../App';
import { fetchStatsSummary } from '../services/stats';
import { formatViews } from '../utils/stats';

export type PopularPeriod = 'all' | 'day' | 'week' | 'month' | 'year';

interface PopularArticlesViewProps {
  articles: Article[];
  siteLang: SiteLanguage;
  taxonomies?: TaxonomiesData;
  onSelectArticle: (id: string) => void;
  onSelectCategory?: (category: string) => void;
  onSelectTopic?: (topic: string) => void;
  onBackToMain?: () => void;
}

export const PopularArticlesView: React.FC<PopularArticlesViewProps> = ({
  articles,
  siteLang,
  taxonomies = { categories: [], topics: [] },
  onSelectArticle,
  onSelectCategory,
  onSelectTopic,
  onBackToMain,
}) => {
  const isEn = siteLang === 'en';

  const [period, setPeriod] = useState<PopularPeriod>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(false);

  // Статистика за обраний період (якщо обрано не 'all')
  const [periodStats, setPeriodStats] = useState<Record<string, number>>({});
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);

  // Скидаємо сторінку пагінації при зміні фільтрів
  useEffect(() => {
    setPage(1);
  }, [period, selectedCategory, selectedTopic]);

  // Завантажуємо показники за період, коли обрано будь-який проміжок часу (включаючи 'all')
  useEffect(() => {
    let isMounted = true;
    setIsLoadingStats(true);

    fetchStatsSummary({ period }).then((res) => {
      if (isMounted) {
        if (res && Array.isArray(res.articles)) {
          const map: Record<string, number> = {};
          for (const item of res.articles) {
            map[item.id] = period === 'all' ? (item.totalViews || item.viewsInPeriod || 0) : (item.viewsInPeriod || 0);
          }
          setPeriodStats(map);
        }
        setIsLoadingStats(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [period]);

  // Список доступних рубрик для фільтрації
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    // З таксономій
    taxonomies.categories.forEach((c) => {
      const name = isEn && c.nameEn ? c.nameEn : c.name;
      if (name && name.trim()) set.add(name.trim());
    });
    // Зі статей
    articles.forEach((a) => {
      const cats = isEn && a.categoriesEn && a.categoriesEn.length > 0
        ? a.categoriesEn
        : a.categories && a.categories.length > 0
        ? a.categories
        : isEn && a.categoryEn
        ? [a.categoryEn]
        : a.category
        ? [a.category]
        : [];
      cats.forEach((c: any) => {
        const val = typeof c === 'string' ? c : c?.name || String(c);
        if (val && val.trim()) set.add(val.trim());
      });
    });
    return Array.from(set).sort();
  }, [articles, taxonomies.categories, isEn]);

  // Список доступних тем для фільтрації
  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    // З таксономій
    taxonomies.topics.forEach((t) => {
      const name = isEn && t.nameEn ? t.nameEn : t.name;
      const clean = name.trim().replace(/^#+/, '');
      if (clean) set.add(clean);
    });
    // Зі статей
    articles.forEach((a) => {
      const tops = isEn && a.topicsEn && a.topicsEn.length > 0 ? a.topicsEn : a.topics || [];
      tops.forEach((t: string) => {
        const clean = String(t).trim().replace(/^#+/, '');
        if (clean) set.add(clean);
      });
    });
    return Array.from(set).sort();
  }, [articles, taxonomies.topics, isEn]);

  // Отримання точної кількості переглядів статті за вибраний період
  const getArticleViews = (art: Article): number => {
    if (typeof periodStats[art.id] === 'number') {
      return periodStats[art.id];
    }
    return art.views ?? 0;
  };

  // Фільтрація статей
  const filteredArticles = useMemo(() => {
    return articles.filter((art) => {
      // 1. Прихована стаття?
      const isHidden = isEn
        ? art.publishedEn === false || !art.publishedEn
        : art.published === false || String(art.published) === 'false';
      if (isHidden) return false;

      // 2. Якщо обрано конкретний проміжок часу — показуємо лише статті, які читалися у цей період
      const viewsCount = getArticleViews(art);
      if (period !== 'all' && viewsCount <= 0) {
        return false;
      }

      // 3. Фільтр за рубрикою
      if (selectedCategory !== 'all') {
        const artCats = (
          isEn && art.categoriesEn && art.categoriesEn.length > 0
            ? art.categoriesEn
            : art.categories && art.categories.length > 0
            ? art.categories
            : isEn && art.categoryEn
            ? [art.categoryEn]
            : art.category
            ? [art.category]
            : []
        ).map((c: any) => (typeof c === 'string' ? c : c?.name || String(c)).trim().toLowerCase());

        const target = selectedCategory.trim().toLowerCase();
        if (!artCats.includes(target)) {
          return false;
        }
      }

      // 4. Фільтр за темою
      if (selectedTopic !== 'all') {
        const artTopics = (
          isEn && art.topicsEn && art.topicsEn.length > 0
            ? art.topicsEn
            : art.topics || []
        ).map((t: any) => String(t).trim().replace(/^#+/, '').toLowerCase());

        const target = selectedTopic.trim().replace(/^#+/, '').toLowerCase();
        if (!artTopics.includes(target)) {
          return false;
        }
      }

      return true;
    });
  }, [articles, isEn, period, periodStats, selectedCategory, selectedTopic]);

  // Сортування статей за кількістю переглядів за обраний період (найбільше зверху)
  const sortedArticles = useMemo(() => {
    const list = [...filteredArticles];
    list.sort((a, b) => {
      const viewsA = getArticleViews(a);
      const viewsB = getArticleViews(b);

      if (viewsB !== viewsA) {
        return viewsB - viewsA; // Більше переглядів зверху!
      }

      // Якщо переглядів однаково — за датою публікації (новіші зверху)
      const timeA = new Date(a.createdAt || a.date || 0).getTime();
      const timeB = new Date(b.createdAt || b.date || 0).getTime();
      return timeB - timeA;
    });
    return list;
  }, [filteredArticles, period, periodStats]);

  // Пагінація: 10 статей на сторінку
  const totalPages = Math.max(1, Math.ceil(sortedArticles.length / 10));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * 10;
  const pageArticles = sortedArticles.slice(startIndex, startIndex + 10);

  // Розбивка по рядах для відповідності дизайну видання:
  // Ряд 1: 2 горизонтальні (16:9)
  // Ряд 2: 3 вертикальні (3:4)
  // Ряд 3: 2 горизонтальні (16:9)
  // Ряд 4: 3 вертикальні (3:4)
  const row1 = pageArticles.slice(0, 2);
  const row2 = pageArticles.slice(2, 5);
  const row3 = pageArticles.slice(5, 7);
  const row4 = pageArticles.slice(7, 10);

  // Підпис проміжку часу для бейджа переглядів
  const getPeriodViewsLabel = (): string | undefined => {
    if (period === 'day') return isEn ? 'today' : 'сьогодні';
    if (period === 'week') return isEn ? 'this week' : 'за 7 днів';
    if (period === 'month') return isEn ? 'this month' : 'за місяць';
    if (period === 'year') return isEn ? 'this year' : 'за рік';
    return undefined; // для 'all' показується стандартно
  };

  const periodButtons: Array<{ id: PopularPeriod; labelUa: string; labelEn: string }> = [
    { id: 'all', labelUa: 'За весь час', labelEn: 'All time' },
    { id: 'day', labelUa: 'Сьогодні', labelEn: 'Today' },
    { id: 'week', labelUa: 'За 7 днів', labelEn: 'Last 7 days' },
    { id: 'month', labelUa: 'За місяць', labelEn: 'This month' },
    { id: 'year', labelUa: 'За рік', labelEn: 'This year' },
  ];

  const hasActiveFilters = selectedCategory !== 'all' || selectedTopic !== 'all' || period !== 'all';

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (period !== 'all') count++;
    if (selectedCategory !== 'all') count++;
    if (selectedTopic !== 'all') count++;
    return count;
  }, [period, selectedCategory, selectedTopic]);

  const handleResetFilters = () => {
    setPeriod('all');
    setSelectedCategory('all');
    setSelectedTopic('all');
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto pt-2 sm:pt-3.5 pb-10 sm:pb-14 animate-article-fade-in">
      <div className="space-y-6 sm:space-y-8 animate-fade-in">
        {/* Верхній блок: Заголовок розділу Популярні та посилання повернення */}
        <div className="flex items-baseline justify-between border-b border-neutral-100 dark:border-[#333333] pb-3">
          <div className="flex items-baseline gap-3">
            <h1
              className="text-2xl sm:text-3xl font-medium tracking-tight text-black dark:text-[#ffffff]"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              {isEn ? 'Popular' : 'Популярні'}
            </h1>
            <span className="text-xs text-neutral-400 dark:text-[#777777] font-light tracking-wide">
              {sortedArticles.length}{' '}
              {isEn
                ? sortedArticles.length === 1
                  ? 'article'
                  : 'articles'
                : sortedArticles.length === 1
                ? 'стаття'
                : [2, 3, 4].includes(sortedArticles.length % 10) && ![12, 13, 14].includes(sortedArticles.length % 100)
                ? 'статті'
                : 'статей'}
            </span>
          </div>

          <a
            href="/"
            onClick={(e) => {
              if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                e.preventDefault();
                onBackToMain?.();
              }
            }}
            className="text-xs text-neutral-500 dark:text-[#888888] hover:text-black dark:hover:text-[#ffffff] transition-colors cursor-pointer underline underline-offset-4 no-underline"
          >
            {isEn ? 'All materials' : 'Всі матеріали'}
          </a>
        </div>

        {/* Кнопка «Фільтри», що розгортається у вибір проміжку часу, рубрик та тем */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsFiltersOpen((prev) => !prev)}
                aria-expanded={isFiltersOpen}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer select-none border ${
                  isFiltersOpen || hasActiveFilters
                    ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-xs'
                    : 'bg-neutral-50 dark:bg-[#1f1f1f] text-neutral-800 dark:text-[#cbcbcb] hover:bg-neutral-100 dark:hover:bg-[#282828] border-neutral-200/90 dark:border-[#383838]'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 stroke-[2]" />
                <span>{isEn ? 'Filters' : 'Фільтри'}</span>
                {activeFiltersCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isFiltersOpen || hasActiveFilters
                        ? 'bg-white/20 text-white dark:bg-black/20 dark:text-black'
                        : 'bg-black text-white dark:bg-white dark:text-black'
                    }`}
                  >
                    {activeFiltersCount}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 stroke-[2.2] ${
                    isFiltersOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Активні чіпи фільтрів для миттєвого орієнтування читача */}
              {period !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-neutral-100 dark:bg-[#252525] text-neutral-800 dark:text-[#cbcbcb] border border-neutral-200/70 dark:border-[#383838] rounded-md">
                  <Calendar className="w-3 h-3 text-neutral-500" />
                  <span>{periodButtons.find((p) => p.id === period)?.[isEn ? 'labelEn' : 'labelUa']}</span>
                  <button
                    type="button"
                    onClick={() => setPeriod('all')}
                    className="hover:text-black dark:hover:text-white cursor-pointer ml-0.5"
                    title={isEn ? 'Clear period filter' : 'Скинути фільтр часу'}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedCategory !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-neutral-100 dark:bg-[#252525] text-neutral-800 dark:text-[#cbcbcb] border border-neutral-200/70 dark:border-[#383838] rounded-md">
                  <FolderTree className="w-3 h-3 text-neutral-500" />
                  <span>{selectedCategory}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className="hover:text-black dark:hover:text-white cursor-pointer ml-0.5"
                    title={isEn ? 'Clear rubric filter' : 'Скинути фільтр рубрики'}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedTopic !== 'all' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-neutral-100 dark:bg-[#252525] text-neutral-800 dark:text-[#cbcbcb] border border-neutral-200/70 dark:border-[#383838] rounded-md">
                  <Tag className="w-3 h-3 text-neutral-500" />
                  <span>#{selectedTopic}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedTopic('all')}
                    className="hover:text-black dark:hover:text-white cursor-pointer ml-0.5"
                    title={isEn ? 'Clear topic filter' : 'Скинути фільтр теми'}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-[#888888] hover:text-black dark:hover:text-white transition-colors cursor-pointer py-1"
                title={isEn ? 'Reset all filters' : 'Скинути всі фільтри'}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{isEn ? 'Reset all' : 'Скинути все'}</span>
              </button>
            )}
          </div>

          {/* Розгорнута область вибору фільтрів */}
          {isFiltersOpen && (
            <div className="bg-neutral-50/90 dark:bg-[#1a1a1a] border border-neutral-200/80 dark:border-[#333333] rounded-xl p-4 sm:p-5 space-y-4 shadow-xs animate-page-fade-in">
              {/* Ряд 1: Вибір проміжку часу */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 dark:text-[#888888] font-medium shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-neutral-400 dark:text-[#777777]" />
                  <span>{isEn ? 'Time Period:' : 'Проміжок часу:'}</span>
                </div>

                {/* Кнопки перемикання проміжку часу */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {periodButtons.map((btn) => {
                    const isActive = period === btn.id;
                    return (
                      <button
                        key={btn.id}
                        type="button"
                        onClick={() => setPeriod(btn.id)}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium ${
                          isActive
                            ? 'bg-black dark:bg-[#333333] text-white dark:text-[#ffffff] shadow-xs'
                            : 'bg-white dark:bg-[#252525] text-neutral-600 dark:text-[#a0a0a0] hover:text-black dark:hover:text-white border border-neutral-200/80 dark:border-[#383838]'
                        }`}
                      >
                        {isEn ? btn.labelEn : btn.labelUa}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ряд 2: Випадаючі списки для фільтрації за рубрикою та темою */}
              <div className="pt-3 border-t border-neutral-200/60 dark:border-[#2e2e2e] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
                  {/* Фільтр за рубрикою */}
                  <div className="relative flex-1 min-w-[160px]">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                      <FolderTree className="w-3.5 h-3.5" />
                    </div>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full pl-8 pr-8 py-2 text-xs bg-white dark:bg-[#252525] text-black dark:text-[#cbcbcb] border border-neutral-200/80 dark:border-[#383838] rounded-lg focus:outline-none focus:border-black dark:focus:border-white transition-colors cursor-pointer appearance-none"
                      aria-label={isEn ? 'Filter by rubric' : 'Фільтр за рубрикою'}
                    >
                      <option value="all">{isEn ? 'All rubrics' : 'Всі рубрики'}</option>
                      {availableCategories.map((cat) => (
                        <option key={`opt_cat_${cat}`} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-neutral-400">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Фільтр за темою */}
                  <div className="relative flex-1 min-w-[160px]">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                      <Tag className="w-3.5 h-3.5" />
                    </div>
                    <select
                      value={selectedTopic}
                      onChange={(e) => setSelectedTopic(e.target.value)}
                      className="w-full pl-8 pr-8 py-2 text-xs bg-white dark:bg-[#252525] text-black dark:text-[#cbcbcb] border border-neutral-200/80 dark:border-[#383838] rounded-lg focus:outline-none focus:border-black dark:focus:border-white transition-colors cursor-pointer appearance-none"
                      aria-label={isEn ? 'Filter by topic' : 'Фільтр за темою'}
                    >
                      <option value="all">{isEn ? 'All topics' : 'Всі теми'}</option>
                      {availableTopics.map((top) => (
                        <option key={`opt_top_${top}`} value={top}>
                          #{top}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-neutral-400">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                {/* Кнопка скидання фільтрів усередині розгорнутої панелі */}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-600 dark:text-[#a0a0a0] hover:text-black dark:hover:text-white bg-white dark:bg-[#252525] border border-neutral-200 dark:border-[#383838] rounded-lg transition-colors cursor-pointer shrink-0"
                    title={isEn ? 'Reset all filters' : 'Скинути всі фільтри'}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{isEn ? 'Reset' : 'Скинути'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Стан завантаження показників періоду */}
        {isLoadingStats ? (
          <div className="py-24 text-center">
            <div className="inline-block w-6 h-6 border-2 border-neutral-300 dark:border-neutral-700 border-t-black dark:border-t-white rounded-full animate-spin" />
            <p className="text-xs text-neutral-400 dark:text-[#888888] mt-3">
              {isEn ? 'Calculating popular articles for the period...' : 'Підраховуємо популярні статті за період...'}
            </p>
          </div>
        ) : sortedArticles.length === 0 ? (
          /* Повідомлення, якщо статей немає */
          <div className="py-20 text-center max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-neutral-100 dark:bg-[#252525] flex items-center justify-center text-neutral-400">
              <Eye className="w-6 h-6" />
            </div>
            <p className="text-neutral-500 dark:text-[#888888] font-serif italic text-lg sm:text-xl">
              {period !== 'all'
                ? isEn
                  ? 'No article views recorded during this selected period.'
                  : 'У цей період переглядів статей ще не зафіксовано.'
                : isEn
                ? 'No articles match the selected filters.'
                : 'Немає статей, що відповідають обраним фільтрам.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-black dark:text-[#ffffff] underline underline-offset-4 hover:opacity-70 transition-opacity cursor-pointer font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isEn ? 'Show all time popular' : 'Показати популярні за весь час'}</span>
              </button>
            )}
          </div>
        ) : (
          /* Відображення карток популярних статей */
          <div className="space-y-6 sm:space-y-8">
            {/* Ряд 1: 2 горизонтальні картки (16:9) */}
            {row1.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {row1.map((article) => {
                  const itemViews = getArticleViews(article);

                  return (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      siteLang={siteLang}
                      aspectRatio="16/9"
                      viewsOverride={itemViews}
                      viewsLabel={getPeriodViewsLabel()}
                      onSelect={onSelectArticle}
                    />
                  );
                })}
              </div>
            )}

            {/* Ряд 2: 3 вертикальні картки (3:4) */}
            {row2.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                {row2.map((article) => {
                  const itemViews = getArticleViews(article);

                  return (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      siteLang={siteLang}
                      aspectRatio="3/4"
                      viewsOverride={itemViews}
                      viewsLabel={getPeriodViewsLabel()}
                      onSelect={onSelectArticle}
                    />
                  );
                })}
              </div>
            )}

            {/* Ряд 3: 2 горизонтальні картки (16:9) */}
            {row3.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {row3.map((article) => {
                  const itemViews = getArticleViews(article);

                  return (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      siteLang={siteLang}
                      aspectRatio="16/9"
                      viewsOverride={itemViews}
                      viewsLabel={getPeriodViewsLabel()}
                      onSelect={onSelectArticle}
                    />
                  );
                })}
              </div>
            )}

            {/* Ряд 4: 3 вертикальні картки (3:4) */}
            {row4.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                {row4.map((article) => {
                  const itemViews = getArticleViews(article);

                  return (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      siteLang={siteLang}
                      aspectRatio="3/4"
                      viewsOverride={itemViews}
                      viewsLabel={getPeriodViewsLabel()}
                      onSelect={onSelectArticle}
                    />
                  );
                })}
              </div>
            )}

            {/* Пагінація популярних матеріалів */}
            {totalPages > 1 && (
              <nav
                role="navigation"
                aria-label={isEn ? 'Popular articles pagination' : 'Пагінація популярних статей'}
                className="flex items-center justify-center gap-2 pt-8 sm:pt-10 border-t border-neutral-100 dark:border-[#333333]"
              >
                <button
                  type="button"
                  onClick={() => handlePageChange(safePage - 1)}
                  disabled={safePage <= 1}
                  className={`px-3 py-1.5 text-xs sm:text-sm tracking-wider transition-colors cursor-pointer focus:outline-none ${
                    safePage <= 1
                      ? 'text-neutral-300 dark:text-neutral-700 pointer-events-none'
                      : 'text-neutral-600 dark:text-[#cbcbcb] hover:text-black dark:hover:text-white'
                  }`}
                >
                  ←
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                  const isCurrent = p === safePage;
                  return (
                    <button
                      key={`popular-page-${p}`}
                      type="button"
                      onClick={() => handlePageChange(p)}
                      className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-xs sm:text-sm transition-all duration-200 cursor-pointer focus:outline-none ${
                        isCurrent
                          ? 'bg-black dark:bg-[#333333] text-white dark:text-[#ffffff] font-medium shadow-xs'
                          : 'text-neutral-600 dark:text-[#cbcbcb] hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#252525]'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => handlePageChange(safePage + 1)}
                  disabled={safePage >= totalPages}
                  className={`px-3 py-1.5 text-xs sm:text-sm tracking-wider transition-colors cursor-pointer focus:outline-none ${
                    safePage >= totalPages
                      ? 'text-neutral-300 dark:text-neutral-700 pointer-events-none'
                      : 'text-neutral-600 dark:text-[#cbcbcb] hover:text-black dark:hover:text-white'
                  }`}
                >
                  →
                </button>
              </nav>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
