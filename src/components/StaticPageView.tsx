import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { StaticPageData, SiteLanguage, SiteSocialLinks } from '../types';
import { ContentRenderer } from './ContentRenderer';

interface StaticPageViewProps {
  page: StaticPageData;
  lang: SiteLanguage;
  socialLinks?: SiteSocialLinks;
  onBack: () => void;
  onSwitchLang?: (lang: SiteLanguage) => void;
  onNavigateToPage?: (pageSlug: 'about' | 'contacts') => void;
}

export const StaticPageView: React.FC<StaticPageViewProps> = ({
  page,
  lang,
  onBack,
  onNavigateToPage,
}) => {
  const isEn = lang === 'en';
  const rawTitle = isEn && page.titleEn ? page.titleEn : page.title;
  const title = typeof rawTitle === 'string' ? rawTitle : (rawTitle as any)?.name || String(rawTitle || '');
  const content = isEn && page.contentEn ? page.contentEn : page.content;

  return (
    <article className="w-[92%] sm:w-[90%] md:max-w-3xl mx-auto py-8 sm:py-16 animate-article-fade-in">
      {/* Верхня навігація та швидкий перехід між сторінками */}
      <div className="flex items-center justify-between mb-8 sm:mb-12">
        <a
          href="/"
          onClick={(e) => {
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
              e.preventDefault();
              onBack();
            }
          }}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 dark:text-[#a0a0a0] hover:text-black dark:hover:text-white transition-colors cursor-pointer group focus:outline-none no-underline"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
          <span>{isEn ? 'All materials' : 'Усі матеріали'}</span>
        </a>

        <div className="flex items-center gap-3 text-xs font-sans">
          <a
            href="/about"
            onClick={(e) => {
              if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                e.preventDefault();
                onNavigateToPage?.('about');
              }
            }}
            className={`transition-colors cursor-pointer no-underline ${
              page.id === 'about'
                ? 'font-medium text-black dark:text-white underline underline-offset-4'
                : 'text-neutral-400 dark:text-[#777777] hover:text-black dark:hover:text-white'
            }`}
          >
            {isEn ? 'About Project' : 'Про проєкт'}
          </a>
          <span className="text-neutral-300 dark:text-neutral-700">•</span>
          <a
            href="/contacts"
            onClick={(e) => {
              if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                e.preventDefault();
                onNavigateToPage?.('contacts');
              }
            }}
            className={`transition-colors cursor-pointer no-underline ${
              page.id === 'contacts'
                ? 'font-medium text-black dark:text-white underline underline-offset-4'
                : 'text-neutral-400 dark:text-[#777777] hover:text-black dark:hover:text-white'
            }`}
          >
            {isEn ? 'Contacts' : 'Контакти'}
          </a>
        </div>
      </div>

      {/* Заголовок сторінки — чистий, без рамок, смуг та фонових блоків */}
      <h1
        className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-black dark:text-[#f5f5f5] leading-tight mb-8 border-none outline-none"
        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
      >
        {title}
      </h1>

      {/* Текстовий зміст */}
      <div className="prose prose-neutral dark:prose-invert max-w-none text-base sm:text-lg leading-relaxed text-neutral-800 dark:text-[#cbcbcb]">
        <ContentRenderer content={content} />
      </div>

      {/* Кнопка повернення внизу сторінки */}
      <div className="mt-16 pt-8 border-t border-neutral-100 dark:border-[#333333] flex items-center justify-between">
        <a
          href="/"
          onClick={(e) => {
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
              e.preventDefault();
              onBack();
            }
          }}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-black dark:text-[#ffffff] hover:opacity-60 transition-opacity cursor-pointer font-medium no-underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isEn ? 'Back to all articles' : 'Повернутися до статей'}</span>
        </a>

        <span className="text-xs text-neutral-400 dark:text-[#777777] font-sans">
          {isEn ? 'The Impart Knowledge Space' : 'Простір знань The Impart'}
        </span>
      </div>
    </article>
  );
};

