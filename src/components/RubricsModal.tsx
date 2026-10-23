import React, { useState, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { SiteLanguage, SiteTheme, NavigationCategory } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { DEFAULT_NAV_CATEGORIES } from '../utils/categories';

interface RubricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSection: string | null;
  onSelectSection: (section: string | null) => void;
  siteLang: SiteLanguage;
  onSwitchLang: (lang: SiteLanguage) => void;
  theme: SiteTheme;
  onToggleTheme: () => void;
  onOpenSearch?: () => void;
  onNavigateToPage?: (page: 'about' | 'contacts') => void;
  navCategories?: NavigationCategory[];
}

export const RubricsModal: React.FC<RubricsModalProps> = ({
  isOpen,
  onClose,
  activeSection,
  onSelectSection,
  siteLang,
  onSwitchLang,
  theme,
  onToggleTheme,
  onOpenSearch,
  onNavigateToPage,
  navCategories = DEFAULT_NAV_CATEGORIES,
}) => {
  const [rendered, setRendered] = useState(isOpen);
  const [isAnimateIn, setIsAnimateIn] = useState(false);

  // Категорії розгорнуті за замовчуванням або якщо обрана якась категорія
  const isAnyCategoryActive = Boolean(
    activeSection &&
    activeSection !== 'news' &&
    activeSection !== 'popular' &&
    navCategories.some((c) => c.slug === activeSection || c.id === activeSection)
  );

  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState<boolean>(true);

  // Плавне монтування, анімація появи та блокування прокрутки фонової сторінки
  useEffect(() => {
    if (isOpen) {
      setRendered(true);
      if (isAnyCategoryActive) {
        setIsCategoriesExpanded(true);
      }
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      const timer = requestAnimationFrame(() => {
        setIsAnimateIn(true);
      });
      return () => {
        cancelAnimationFrame(timer);
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      };
    } else {
      setIsAnimateIn(false);
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      const timer = setTimeout(() => {
        setRendered(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isAnyCategoryActive]);

  // Закриття вікна по клавіші Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!rendered) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Меню рубрик"
      className={`fixed inset-0 z-50 flex flex-col bg-white/95 dark:bg-[#111111]/98 backdrop-blur-md overflow-hidden transition-opacity transition-colors duration-200 ease-out ${
        isAnimateIn ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* 
        Верхня панель модального вікна:
        Використовує контейнер ідентичної ширини, відступів та координат.
        Хрестик закриття розміщено ПРЯМО над кнопкою виклику меню рубрик у шапці.
      */}
      <header className="w-full bg-transparent py-3.5 sm:py-4 shrink-0">
        <div className="relative w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto flex items-center justify-between min-h-[38px]">
          {/* Ліва сторона: хрестик закриття прямо над кнопкою виклику меню */}
          <div className="flex items-center z-20">
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрити меню рубрик"
              className="flex items-center justify-center w-10 h-10 -ml-2 text-black dark:text-[#cbcbcb] hover:opacity-60 active:scale-95 transition-all cursor-pointer focus:outline-none"
            >
              <X className="w-5 h-5 stroke-[1.8]" />
            </button>
          </div>

          {/* По центру: назва сайту The Impart (слугує переходом на головну) */}
          <div className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
            <a
              href="/"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                  e.preventDefault();
                  onSelectSection(null);
                  onClose();
                }
              }}
              aria-label="The Impart — Головна сторінка"
              className="block text-xl font-medium tracking-tight text-black dark:text-[#ffffff] hover:opacity-75 transition-opacity select-none text-center cursor-pointer focus:outline-none whitespace-nowrap"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              The Impart
            </a>
          </div>

          {/* Права сторона: Перемикач теми */}
          <div className="z-20 flex items-center justify-end -mr-1 sm:-mr-2">
            <ThemeToggle
              theme={theme}
              onToggle={onToggleTheme}
              siteLang={siteLang}
            />
          </div>
        </div>
      </header>

      {/* Центральна зона модального вікна: вибір навігації (Новини -> Категорії -> Популярні) */}
      <div className="flex-1 w-full max-w-xl mx-auto px-6 flex flex-col justify-between items-center py-4 sm:py-8 overflow-y-auto">
        <div />

        {/* Список навігації: 1. Новини, 2. Категорії (список), 3. Популярні */}
        <nav
          aria-label="Головна навігація"
          className={`w-full flex flex-col items-center justify-center space-y-4 sm:space-y-6 my-auto transition-all duration-350 ease-out ${
            isAnimateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          {/* 1. Новини */}
          <a
            href="/news"
            onClick={(e) => {
              if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                e.preventDefault();
                onSelectSection('news');
                onClose();
              }
            }}
            className={`group relative text-2xl sm:text-3xl md:text-4xl transition-all duration-200 cursor-pointer focus:outline-none py-1.5 px-4 select-none text-center ${
              activeSection === 'news'
                ? 'text-black dark:text-[#ffffff] font-bold scale-105'
                : 'text-neutral-800 dark:text-[#cbcbcb] hover:text-black dark:hover:text-[#ffffff] font-semibold'
            }`}
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            <span className="relative z-10 transition-transform duration-200 inline-block group-hover:scale-105">
              {siteLang === 'en' ? 'News' : 'Новини'}
            </span>
            <span
              className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-[2.5px] bg-black dark:bg-[#ffffff] transition-all duration-300 ease-out ${
                activeSection === 'news' ? 'w-3/4' : 'w-0 group-hover:w-3/4'
              }`}
            />
          </a>

          {/* 2. Категорії (з розгортанням списку категорій: Статті, Огляди та ін.) */}
          <div className="w-full flex flex-col items-center">
            <button
              type="button"
              onClick={() => setIsCategoriesExpanded((prev) => !prev)}
              className={`group flex items-center justify-center gap-2.5 text-2xl sm:text-3xl md:text-4xl transition-all duration-200 cursor-pointer focus:outline-none py-1.5 px-4 select-none text-center ${
                isAnyCategoryActive
                  ? 'text-black dark:text-[#ffffff] font-bold scale-105'
                  : 'text-neutral-800 dark:text-[#cbcbcb] hover:text-black dark:hover:text-[#ffffff] font-semibold'
              }`}
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              <span className="relative z-10 inline-block">
                {siteLang === 'en' ? 'Categories' : 'Категорії'}
              </span>
              <ChevronDown
                className={`w-6 h-6 transition-transform duration-300 stroke-[2.2] text-neutral-400 dark:text-neutral-500 group-hover:text-black dark:group-hover:text-white ${
                  isCategoriesExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Випадаючий список категорій для мобільних */}
            <div
              className={`w-full flex flex-col items-center overflow-hidden transition-all duration-300 ease-in-out ${
                isCategoriesExpanded
                  ? 'max-h-96 opacity-100 pt-2 pb-1 space-y-2.5'
                  : 'max-h-0 opacity-0 pointer-events-none'
              }`}
            >
              {navCategories.map((cat) => {
                const isCatActive = activeSection === cat.slug || activeSection === cat.id;
                const catTitle = siteLang === 'en' && cat.nameEn ? cat.nameEn : cat.name;

                return (
                  <a
                    key={`modal_cat_${cat.id}`}
                    href={`/${cat.slug}`}
                    onClick={(e) => {
                      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                        e.preventDefault();
                        onSelectSection(cat.slug);
                        onClose();
                      }
                    }}
                    className={`relative text-lg sm:text-xl py-1 px-4 transition-all duration-200 cursor-pointer focus:outline-none select-none text-center ${
                      isCatActive
                        ? 'text-black dark:text-[#ffffff] font-bold'
                        : 'text-neutral-600 dark:text-[#a0a0a0] hover:text-black dark:hover:text-[#ffffff] font-medium'
                    }`}
                  >
                    <span>{catTitle}</span>
                    {isCatActive && (
                      <span className="block mx-auto mt-0.5 w-1.5 h-1.5 rounded-full bg-black dark:bg-white" />
                    )}
                  </a>
                );
              })}
            </div>
          </div>

          {/* 3. Популярні */}
          <a
            href="/popular"
            onClick={(e) => {
              if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                e.preventDefault();
                onSelectSection('popular');
                onClose();
              }
            }}
            className={`group relative text-2xl sm:text-3xl md:text-4xl transition-all duration-200 cursor-pointer focus:outline-none py-1.5 px-4 select-none text-center ${
              activeSection === 'popular'
                ? 'text-black dark:text-[#ffffff] font-bold scale-105'
                : 'text-neutral-800 dark:text-[#cbcbcb] hover:text-black dark:hover:text-[#ffffff] font-semibold'
            }`}
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            <span className="relative z-10 transition-transform duration-200 inline-block group-hover:scale-105">
              {siteLang === 'en' ? 'Popular' : 'Популярні'}
            </span>
            <span
              className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-[2.5px] bg-black dark:bg-[#ffffff] transition-all duration-300 ease-out ${
                activeSection === 'popular' ? 'w-3/4' : 'w-0 group-hover:w-3/4'
              }`}
            />
          </a>
        </nav>

        {/* Низ модального вікна: перемикач мови UA / EN та посилання на сторінки */}
        <div
          className={`pb-4 sm:pb-8 flex flex-col items-center gap-3 transition-all duration-350 delay-75 ease-out shrink-0 ${
            isAnimateIn ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
          }`}
        >
          {/* Посилання на постійні сторінки */}
          <div className="flex items-center gap-3 text-xs font-sans text-neutral-500 dark:text-[#888888]">
            <a
              href="/about"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                  e.preventDefault();
                  onClose();
                  onNavigateToPage?.('about');
                }
              }}
              className="hover:text-black dark:hover:text-[#ffffff] transition-colors cursor-pointer py-1 no-underline"
            >
              {siteLang === 'en' ? 'About Project' : 'Про проєкт'}
            </a>
            <span className="text-neutral-300 dark:text-neutral-700">•</span>
            <a
              href="/contacts"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {
                  e.preventDefault();
                  onClose();
                  onNavigateToPage?.('contacts');
                }
              }}
              className="hover:text-black dark:hover:text-[#ffffff] transition-colors cursor-pointer py-1 no-underline"
            >
              {siteLang === 'en' ? 'Contacts' : 'Контакти'}
            </a>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-neutral-100/90 dark:bg-[#1a1a1a] rounded-full border border-neutral-200/50 dark:border-[#2a2a2a]">
            <button
              type="button"
              onClick={() => onSwitchLang('ua')}
              className={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                siteLang === 'ua'
                  ? 'bg-black text-white dark:bg-[#333333] dark:text-[#ffffff] shadow-xs'
                  : 'text-neutral-600 dark:text-[#888888] hover:text-black dark:hover:text-[#ffffff]'
              }`}
            >
              UA
            </button>
            <button
              type="button"
              onClick={() => onSwitchLang('en')}
              className={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                siteLang === 'en'
                  ? 'bg-black text-white dark:bg-[#333333] dark:text-[#ffffff] shadow-xs'
                  : 'text-neutral-600 dark:text-[#888888] hover:text-black dark:hover:text-[#ffffff]'
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
