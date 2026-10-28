import React, { useState, useEffect, useMemo } from 'react';
import {
  Eye,
  Clock,
  Timer,
  BarChart2,
  Search,
  Filter,
  Calendar,
  RotateCcw,
  Check,
  ChevronDown,
  ArrowUpDown,
  ExternalLink,
  Edit3,
  TrendingUp,
  FileText,
  Sliders,
  Sparkles,
  Info,
  X,
} from 'lucide-react';
import {
  TaxonomiesData,
  StatsSummaryResponse,
  ArticleStatsSummaryItem,
  StatsTimeSeriesPoint,
} from '../types';
import { formatViews, formatDuration, formatDurationCompact } from '../utils/stats';
import { fetchStatsConfig, saveStatsConfig, fetchStatsSummary } from '../services/stats';

interface StatsManagerProps {
  taxonomies?: TaxonomiesData;
  onViewArticleOnSite: (id: string) => void;
  onEditArticle: (id: string) => void;
}

type PeriodType = 'day' | 'week' | 'month' | '3months' | 'halfyear' | 'year' | 'all';
type SortField = 'viewsInPeriod' | 'totalViews' | 'durationInPeriod' | 'avgDuration' | 'title' | 'date';

export const StatsManager: React.FC<StatsManagerProps> = ({
  taxonomies = { categories: [], topics: [] },
  onViewArticleOnSite,
  onEditArticle,
}) => {
  const [period, setPeriod] = useState<PeriodType>('month');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');

  const [sortField, setSortField] = useState<SortField>('viewsInPeriod');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [chartMetric, setChartMetric] = useState<'views' | 'time'>('views');

  // Поріг часу зарахування перегляду
  const [thresholdSeconds, setThresholdSeconds] = useState<number>(() => {
    try {
      const cached = localStorage.getItem('the_impart_stats_threshold');
      if (cached) {
        const val = parseInt(cached, 10);
        if (val > 0) return val;
      }
    } catch {}
    return 5;
  });
  const [thresholdInput, setThresholdInput] = useState<string>(() => {
    try {
      const cached = localStorage.getItem('the_impart_stats_threshold');
      if (cached) {
        const val = parseInt(cached, 10);
        if (val > 0) return String(val);
      }
    } catch {}
    return '5';
  });
  const [isSavingThreshold, setIsSavingThreshold] = useState<boolean>(false);
  const [thresholdNotice, setThresholdNotice] = useState<string | null>(null);

  // Дані статистики із сервера
  const [loading, setLoading] = useState<boolean>(true);
  const [summaryData, setSummaryData] = useState<StatsSummaryResponse | null>(null);
  const [refreshIndex, setRefreshIndex] = useState<number>(0);

  // Завантаження початкового порогу часу з сервера
  useEffect(() => {
    fetchStatsConfig().then((cfg) => {
      if (cfg && cfg.thresholdSeconds > 0) {
        setThresholdSeconds(cfg.thresholdSeconds);
        setThresholdInput(String(cfg.thresholdSeconds));
      }
    });
  }, []);

  // Завантаження зведеної статистики при зміні фільтрів або періоду
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    fetchStatsSummary({
      period,
      year: period === 'year' ? selectedYear : undefined,
      search: searchQuery.trim() || undefined,
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
      topic: selectedTopic !== 'all' ? selectedTopic : undefined,
    }).then((data) => {
      if (!isCancelled) {
        if (data) {
          setSummaryData(data);
          if (data.config && data.config.thresholdSeconds) {
            setThresholdSeconds(data.config.thresholdSeconds);
          }
        }
        setLoading(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [period, selectedYear, searchQuery, selectedCategory, selectedTopic, refreshIndex]);

  // Збереження нового порогу зарахування перегляду
  const handleSaveThreshold = async (newVal?: number) => {
    const val = newVal !== undefined ? newVal : parseInt(thresholdInput, 10);
    if (isNaN(val) || val < 1 || val > 600) {
      alert('Будь ласка, вкажіть число секунд від 1 до 600.');
      return;
    }

    setIsSavingThreshold(true);
    const success = await saveStatsConfig(val);
    setIsSavingThreshold(false);

    if (success) {
      setThresholdSeconds(val);
      setThresholdInput(String(val));
      setThresholdNotice(`Поріг успішно встановлено: ${val} сек`);
      setTimeout(() => setThresholdNotice(null), 3500);
    } else {
      alert('Помилка при збереженні налаштувань на сервері.');
    }
  };

  // Сортування списку статей
  const sortedArticles = useMemo(() => {
    if (!summaryData || !summaryData.articles) return [];
    const list = [...summaryData.articles];

    list.sort((a, b) => {
      let res = 0;
      switch (sortField) {
        case 'viewsInPeriod':
          res = b.viewsInPeriod - a.viewsInPeriod;
          break;
        case 'totalViews':
          res = b.totalViews - a.totalViews;
          break;
        case 'durationInPeriod':
          res = b.durationSecondsInPeriod - a.durationSecondsInPeriod;
          break;
        case 'avgDuration':
          res = b.avgDurationSecondsInPeriod - a.avgDurationSecondsInPeriod;
          break;
        case 'title':
          res = a.title.localeCompare(b.title);
          break;
        case 'date': {
          const tA = new Date(a.createdAt || a.date || 0).getTime();
          const tB = new Date(b.createdAt || b.date || 0).getTime();
          res = tB - tA;
          break;
        }
      }
      return sortAsc ? -res : res;
    });

    return list;
  }, [summaryData, sortField, sortAsc]);

  const maxViewsInPeriod = useMemo(() => {
    if (!sortedArticles.length) return 1;
    return Math.max(1, ...sortedArticles.map((a) => a.viewsInPeriod));
  }, [sortedArticles]);

  const maxChartValue = useMemo(() => {
    if (!summaryData?.timeSeries || summaryData.timeSeries.length === 0) return 1;
    if (chartMetric === 'views') {
      return Math.max(1, ...summaryData.timeSeries.map((p) => p.views));
    }
    return Math.max(1, ...summaryData.timeSeries.map((p) => p.durationSeconds));
  }, [summaryData, chartMetric]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedTopic('all');
  };

  const hasActiveFilters = Boolean(
    searchQuery.trim() || selectedCategory !== 'all' || selectedTopic !== 'all'
  );

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      {/* Заголовок сторінки та швидке оновлення */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-neutral-100 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-serif font-medium text-black">
              Аналітика та статистика
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Серверна аналітика</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Фіксація переглядів, читацького часу та поведінки аудиторії за днями, тижнями, місяцями, роками та за весь час
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setRefreshIndex((v) => v + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 hover:text-black transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
            title="Оновити статистику"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Оновити</span>
          </button>
        </div>
      </div>

      {/* Картка налаштування порогу зарахування перегляду */}
      <div className="p-5 sm:p-6 bg-gradient-to-br from-neutral-50 to-white border border-neutral-200 rounded-xl shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center shrink-0">
                <Timer className="w-4 h-4" />
              </div>
              <h2 className="text-sm sm:text-base font-medium text-black">
                Час для зарахування перегляду
              </h2>
            </div>
            <p className="text-xs text-neutral-500 pl-10 max-w-2xl leading-relaxed">
              Перегляд статті фіксується на сервері лише тоді, коли користувач відкрив сторінку статті та залишався на ній не менше вказаної кількості секунд. Поточне значення: <strong>{thresholdSeconds} сек</strong>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 shrink-0 pl-10 md:pl-0">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="600"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="w-20 px-3 py-1.5 text-sm bg-white border border-neutral-300 rounded-lg text-center font-semibold focus:outline-none focus:border-black"
                placeholder="10"
              />
              <span className="text-xs font-medium text-neutral-500">сек.</span>
            </div>

            <button
              type="button"
              disabled={isSavingThreshold}
              onClick={() => handleSaveThreshold()}
              className="px-4 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
            >
              {isSavingThreshold && (
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              <span>{isSavingThreshold ? 'Збереження...' : 'Зберегти поріг'}</span>
            </button>
          </div>
        </div>

        {/* Швидкі пресети */}
        <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-neutral-100 text-xs">
          <span className="text-neutral-400">Швидкий вибір:</span>
          {[3, 5, 10, 15, 30, 45, 60].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => {
                setThresholdInput(String(sec));
                handleSaveThreshold(sec);
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                thresholdSeconds === sec
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
              }`}
            >
              {sec} сек {sec === 5 ? '(поточний)' : ''}
            </button>
          ))}
          {thresholdNotice && (
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200 ml-auto animate-fade-in font-medium">
              <Check className="w-3 h-3" />
              <span>{thresholdNotice}</span>
            </span>
          )}
        </div>
      </div>

      {/* Градація періодів */}
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Градація періоду
        </div>
        <div className="flex items-center flex-wrap gap-2">
          {[
            { id: 'day', label: 'Сьогодні (День)' },
            { id: 'week', label: 'Тиждень (7 днів)' },
            { id: 'month', label: 'Місяць (30 днів)' },
            { id: '3months', label: '3 місяці (90 днів)' },
            { id: 'halfyear', label: 'Пів року (180 днів)' },
            { id: 'year', label: 'По роках' },
            { id: 'all', label: 'За весь час' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriod(item.id as PeriodType)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                period === item.id
                  ? 'bg-black text-white border-black shadow-xs ring-1 ring-black'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400 hover:text-black'
              }`}
            >
              {item.label}
            </button>
          ))}

          {/* Вибір конкретного року якщо вибрано "По роках" */}
          {period === 'year' && (
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-xs text-neutral-500">Рік:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="text-xs font-semibold bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-black cursor-pointer"
              >
                {[2026, 2025, 2024, 2023].map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Панель фільтрів: Пошук за будь-якими словами, рубриками та темами */}
      <div className="p-4 sm:p-5 bg-neutral-50/70 border border-neutral-200 rounded-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" />
            <span>Фільтри матеріалів</span>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-red-600 cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Скинути всі фільтри</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Пошук за будь-якими словами */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Фільтр за словами, назвою, автором..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-white border border-neutral-200 pl-8.5 pr-8 py-2 rounded-lg focus:outline-none focus:border-black"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Фільтр за рубриками */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full text-xs bg-white border border-neutral-200 px-3 py-2 rounded-lg focus:outline-none focus:border-black cursor-pointer"
            >
              <option value="all">Усі рубрики</option>
              {taxonomies.categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name} {c.nameEn ? `(${c.nameEn})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Фільтр за темами */}
          <div>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-full text-xs bg-white border border-neutral-200 px-3 py-2 rounded-lg focus:outline-none focus:border-black cursor-pointer"
            >
              <option value="all">Усі теми / теги</option>
              {taxonomies.topics.map((t) => (
                <option key={t.id} value={t.name}>
                  #{t.name} {t.nameEn ? `(#${t.nameEn})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Зведені картки KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Загальні перегляди */}
        <div className="p-5 bg-white border border-neutral-200 rounded-xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs uppercase tracking-wider font-semibold">Перегляди за період</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-black">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-serif font-semibold text-black">
            {summaryData ? summaryData.summary.totalViews.toLocaleString('uk-UA') : '—'}
          </div>
          <p className="text-[11px] text-neutral-400">
            Зарахованих переглядів (&gt;{thresholdSeconds}с)
          </p>
        </div>

        {/* Загальний час читання */}
        <div className="p-5 bg-white border border-neutral-200 rounded-xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs uppercase tracking-wider font-semibold">Загальний час читання</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-black">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-serif font-semibold text-black">
            {summaryData ? formatDuration(summaryData.summary.totalDurationSeconds) : '—'}
          </div>
          <p className="text-[11px] text-neutral-400">
            Сумарний час перебування користувачів
          </p>
        </div>

        {/* Середній час на статтю */}
        <div className="p-5 bg-white border border-neutral-200 rounded-xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs uppercase tracking-wider font-semibold">Середній час на перегляд</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-black">
              <Timer className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-serif font-semibold text-black">
            {summaryData ? formatDuration(summaryData.summary.avgDurationSeconds) : '—'}
          </div>
          <p className="text-[11px] text-neutral-400">
            Середня глибина читання 1 перегляду
          </p>
        </div>

        {/* Кількість статей у вибірці */}
        <div className="p-5 bg-white border border-neutral-200 rounded-xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs uppercase tracking-wider font-semibold">Матеріалів у вибірці</span>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-black">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-serif font-semibold text-black">
            {summaryData ? summaryData.summary.articlesCount : '—'}
          </div>
          <p className="text-[11px] text-neutral-400">
            {hasActiveFilters ? 'Відфільтровано за критеріями' : 'Усі доступні статті'}
          </p>
        </div>
      </div>

      {/* Інтерактивний часовий графік активності */}
      {summaryData?.timeSeries && summaryData.timeSeries.length > 0 && (
        <div className="p-5 sm:p-6 bg-white border border-neutral-200 rounded-xl shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-black uppercase tracking-wider flex items-center gap-2">
                <BarChart2 className="w-4 h-4" />
                <span>Динаміка за обраний період</span>
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Розподіл {chartMetric === 'views' ? 'переглядів' : 'часу читання'} по датах
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg self-start sm:self-auto text-xs">
              <button
                type="button"
                onClick={() => setChartMetric('views')}
                className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  chartMetric === 'views' ? 'bg-black text-white shadow-2xs' : 'text-neutral-600 hover:text-black'
                }`}
              >
                Кількість переглядів
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('time')}
                className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  chartMetric === 'time' ? 'bg-black text-white shadow-2xs' : 'text-neutral-600 hover:text-black'
                }`}
              >
                Час читання
              </button>
            </div>
          </div>

          {/* Візуалізація стовпчиків графіка */}
          <div className="pt-6 pb-2">
            <div className="h-44 sm:h-52 flex items-end gap-1.5 sm:gap-2.5 overflow-x-auto pb-4 pt-4 px-2">
              {summaryData.timeSeries.map((pt, idx) => {
                const val = chartMetric === 'views' ? pt.views : pt.durationSeconds;
                const pct = Math.max(4, Math.round((val / maxChartValue) * 100));
                return (
                  <div
                    key={`${pt.date}_${idx}`}
                    className="flex-1 min-w-[28px] sm:min-w-[36px] max-w-[56px] h-full flex flex-col justify-end items-center group relative cursor-pointer"
                  >
                    {/* Тултіп при наведенні */}
                    <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center pointer-events-none whitespace-nowrap bg-black text-white text-[10px] px-2.5 py-1 rounded shadow-lg">
                      <span className="font-semibold">{pt.label}</span>
                      <span>
                        {pt.views} переглядів • {formatDuration(pt.durationSeconds)}
                      </span>
                    </div>

                    {/* Стовпчик */}
                    <div
                      style={{ height: `${pct}%` }}
                      className={`w-full rounded-t transition-all duration-300 ${
                        chartMetric === 'views'
                          ? 'bg-neutral-800 group-hover:bg-black'
                          : 'bg-emerald-700 group-hover:bg-emerald-900'
                      }`}
                    />

                    {/* Підпис дати */}
                    <span className="text-[10px] text-neutral-400 mt-2 truncate w-full text-center select-none">
                      {pt.label.split(' ')[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Детальна таблиця статей зі статистикою */}
      <div className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-serif font-medium text-black">
              Статистика за окремими статтями
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Показники переглядів та витраченого читацького часу ({sortedArticles.length} статей)
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>Сортування:</span>
            <select
              value={sortField}
              onChange={(e) => {
                setSortField(e.target.value as SortField);
                setSortAsc(false);
              }}
              className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1 text-xs font-medium text-black focus:outline-none cursor-pointer"
            >
              <option value="viewsInPeriod">Перегляди за період</option>
              <option value="totalViews">Всього переглядів (весь час)</option>
              <option value="durationInPeriod">Час читання за період</option>
              <option value="avgDuration">Середній час на перегляд</option>
              <option value="title">Назва (А-Я)</option>
              <option value="date">Дата публікації</option>
            </select>
            <button
              type="button"
              onClick={() => setSortAsc(!sortAsc)}
              className="p-1 rounded hover:bg-neutral-100 text-neutral-600 hover:text-black cursor-pointer"
              title={sortAsc ? 'Сортувати спадно' : 'Сортувати зростаюче'}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Список / таблиця */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <div className="w-6 h-6 border-2 border-neutral-300 border-t-black rounded-full animate-spin" />
            <span className="text-xs text-neutral-500">Завантаження аналітики з сервера...</span>
          </div>
        ) : sortedArticles.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm text-neutral-500">Статей за вказаними фільтрами не знайдено.</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 text-xs font-medium bg-black text-white px-3.5 py-1.5 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Скинути фільтри</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {sortedArticles.map((article, idx) => {
              const viewPct = Math.round((article.viewsInPeriod / maxViewsInPeriod) * 100);
              return (
                <div
                  key={article.id}
                  className="p-4 sm:p-5 hover:bg-neutral-50/70 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Ліва колонка: фото та метадані */}
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <span className="text-xs font-serif font-bold text-neutral-300 w-5 text-right shrink-0 pt-1">
                      {idx + 1}
                    </span>

                    {article.coverImage ? (
                      <img
                        src={article.coverImage}
                        alt=""
                        className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg shrink-0 bg-neutral-100 border border-neutral-200"
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-neutral-100 border border-neutral-200 shrink-0 flex items-center justify-center text-xs font-serif text-neutral-400">
                        The Impart
                      </div>
                    )}

                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center flex-wrap gap-1.5">
                        {(article.categories || [article.category]).map((c, i) => (
                          <span
                            key={i}
                            className="text-[10px] uppercase tracking-wider font-semibold bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded"
                          >
                            {c}
                          </span>
                        ))}
                        {article.topics && article.topics.slice(0, 2).map((t, i) => (
                          <span
                            key={i}
                            className="text-[10px] text-neutral-500 bg-neutral-50 border border-neutral-200 px-1.5 py-0.5 rounded"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>

                      <h3 className="text-sm sm:text-base font-serif font-medium text-black line-clamp-2 leading-snug">
                        {article.title}
                      </h3>

                      {article.titleEn && (
                        <p className="text-xs text-neutral-400 font-serif italic truncate">
                          EN: {article.titleEn}
                        </p>
                      )}

                      <div className="text-[11px] text-neutral-400 flex items-center gap-2">
                        <span>{article.author}</span>
                        <span>•</span>
                        <span>{article.date}</span>
                      </div>
                    </div>
                  </div>

                  {/* Права колонка: показники та шкала переглядів */}
                  <div className="flex items-center justify-between sm:justify-end gap-6 sm:gap-8 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0">
                    {/* Перегляди */}
                    <div className="text-right min-w-[90px]">
                      <div className="text-xs text-neutral-400 uppercase tracking-wider flex items-center justify-end gap-1">
                        <Eye className="w-3 h-3 text-neutral-400" />
                        <span>Перегляди</span>
                      </div>
                      <div className="text-base sm:text-lg font-serif font-bold text-black mt-0.5">
                        {article.viewsInPeriod.toLocaleString('uk-UA')}
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        Всього: {article.totalViews.toLocaleString('uk-UA')}
                      </div>
                      {/* Шкала відсотка */}
                      <div className="w-full bg-neutral-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                        <div
                          style={{ width: `${Math.max(5, viewPct)}%` }}
                          className="bg-black h-full rounded-full"
                        />
                      </div>
                    </div>

                    {/* Час читання */}
                    <div className="text-right min-w-[100px]">
                      <div className="text-xs text-neutral-400 uppercase tracking-wider flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3 text-neutral-400" />
                        <span>Час читання</span>
                      </div>
                      <div className="text-sm sm:text-base font-serif font-bold text-black mt-0.5">
                        {formatDuration(article.durationSecondsInPeriod)}
                      </div>
                      <div className="text-[10px] text-neutral-400" title="Середній час перебування на 1 перегляд">
                        Сер.: {formatDuration(article.avgDurationSecondsInPeriod)}
                      </div>
                    </div>

                    {/* Дії: Відкрити або Редагувати */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onViewArticleOnSite(article.id)}
                        className="p-2 text-neutral-400 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
                        title="Переглянути статтю на сайті"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditArticle(article.id)}
                        className="p-2 text-neutral-400 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
                        title="Редагувати матеріал"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
