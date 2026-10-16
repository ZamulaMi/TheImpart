import React from 'react';
import { ArrowLeft, EyeOff, Globe } from 'lucide-react';
import { Article, SiteLanguage } from '../types';
import { formatTimeAgoOrDate } from '../utils/date';
import { ContentRenderer } from './ContentRenderer';

interface ArticleViewProps {
  article: Article;
  lang: SiteLanguage;
  onBack: () => void;
  onSwitchLang?: (lang: SiteLanguage) => void;
  onSelectTopic?: (topic: string) => void;
  onSelectCategory?: (category: string) => void;
}

export const ArticleView: React.FC<ArticleViewProps> = ({
  article,
  lang,
  onBack,
  onSwitchLang,
  onSelectTopic,
  onSelectCategory,
}) => {
  const isEn = lang === 'en';
  const hasEnVersion = Boolean(article.titleEn?.trim() && article.contentEn?.trim());

  // Вибір даних залежно від обраної мови
  const title = isEn && hasEnVersion ? article.titleEn! : article.title;
  const content = isEn && hasEnVersion ? article.contentEn! : article.content;
  const excerpt = isEn && hasEnVersion ? article.excerptEn : article.excerpt;
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

  const isHidden = isEn
    ? article.publishedEn === false || !article.publishedEn
    : article.published === false || String(article.published) === 'false';

  const timeDisplay = formatTimeAgoOrDate(article.createdAt, article.date, article.id, lang);

  return (
    <article className="w-[92%] sm:w-[90%] md:max-w-3xl mx-auto py-8 sm:py-16 animate-article-fade-in">
      {/* Верхня навігація та індикатор прихованості */}
      <div className="flex items-center justify-between mb-8 sm:mb-10">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 dark:text-[#a0a0a0] hover:text-black dark:hover:text-white transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
          <span>{isEn ? 'All articles' : 'Усі статті'}</span>
        </button>

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

      {/* Рубрики, теми та час публікації */}
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 dark:text-[#888888] mb-4">
        {categoriesList.map((cat, idx) => (
          <button
            key={`cat_${idx}`}
            type="button"
            onClick={() => onSelectCategory?.(cat)}
            className="font-medium text-neutral-800 dark:text-[#cbcbcb] hover:text-black dark:hover:text-white bg-neutral-100 dark:bg-[#1a1a1a] hover:bg-neutral-200 dark:hover:bg-[#252525] border border-transparent dark:border-[#333333] px-2.5 py-0.5 rounded cursor-pointer transition-colors"
            title={isEn ? `Go to rubric ${cat}` : `Перейти до рубрики ${cat}`}
          >
            {cat}
          </button>
        ))}
        {topics &&
          topics.map((t, idx) => (
            <button
              key={`top_${idx}`}
              type="button"
              onClick={() => onSelectTopic?.(t)}
              className="text-neutral-500 dark:text-[#9e9e9e] hover:text-black dark:hover:text-white bg-neutral-50 dark:bg-[#181818] hover:bg-neutral-100 dark:hover:bg-[#222222] border border-neutral-200/60 dark:border-[#2e2e2e] px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer"
              title={isEn ? `Search articles on #${t}` : `Шукати матеріали з темою #${t}`}
            >
              #{t}
            </button>
          ))}
        {timeDisplay && (
          <>
            <span className="text-neutral-300 dark:text-neutral-700">•</span>
            <span>{timeDisplay}</span>
          </>
        )}
      </div>

      {/* Заголовок */}
      <h1
        className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-black dark:text-[#f5f5f5] leading-tight mb-6"
        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
      >
        {title}
      </h1>

      {/* Автор та дата */}
      <div className="flex items-center justify-between py-4 border-y border-neutral-100 dark:border-[#333333] mb-8 text-xs text-neutral-500 dark:text-[#888888]">
        <span>{article.author}</span>
        <span>{timeDisplay}</span>
      </div>

      {/* Обкладинка статті */}
      {article.coverImage && (
        <div className="mb-10 aspect-[16/9] w-full overflow-hidden bg-neutral-100 dark:bg-[#181818] rounded-lg border border-transparent dark:border-[#2e2e2e]">
          <img
            src={article.coverImage}
            alt={title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Лід / короткий опис */}
      {excerpt && (
        <p className="text-lg sm:text-xl text-neutral-700 dark:text-[#e0e0e0] leading-relaxed font-serif italic mb-8 border-l-2 border-black dark:border-[#cbcbcb] pl-6">
          {excerpt}
        </p>
      )}

      {/* Рендеринг тексту з медіа */}
      <div className="prose prose-neutral dark:prose-invert max-w-none text-base sm:text-lg leading-relaxed text-neutral-800 dark:text-[#cbcbcb]">
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
              <button
                key={t}
                type="button"
                onClick={() => onSelectTopic?.(t)}
                className="px-3 py-1 bg-neutral-100 dark:bg-[#1a1a1a] hover:bg-neutral-200 dark:hover:bg-[#252525] text-neutral-700 dark:text-[#cbcbcb] hover:text-black dark:hover:text-white border border-transparent dark:border-[#333333] text-xs rounded-md transition-colors cursor-pointer"
                title={isEn ? `Search articles on #${t}` : `Шукати матеріали з темою #${t}`}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
};
