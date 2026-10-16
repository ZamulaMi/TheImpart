import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { HeaderSection, NAV_SECTIONS } from '../App';
import { SiteLanguage, SiteTheme } from '../types';
import { ThemeToggle } from './ThemeToggle';

interface RubricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSection: HeaderSection | null;
  onSelectSection: (section: HeaderSection | null) => void;
  siteLang: SiteLanguage;
  onSwitchLang: (lang: SiteLanguage) => void;
  theme: SiteTheme;
  onToggleTheme: () => void;
  onOpenSearch?: () => void;
  onNavigateToPage?: (page: 'about' | 'contacts') => void;
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
}) => {
  const [rendered, setRendered] = useState(isOpen);
  const [isAnimateIn, setIsAnimateIn] = useState(false);

  // Плавне монтування, анімація появи та блокування прокрутки фонової сторінки
  useEffect(() => {
    if (isOpen) {
      setRendered(true);
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
  }, [isOpen]);

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
      className={`fixed inset-0 z-50 flex flex-col bg-white/95 dark:bg-[#111111]/98 backdrop-blur-md overflow-hidden transition-opacity duration-300 ease-out ${
        isAnimateIn ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* 
        Верхня панель модального вікна:
        Використовує контейнер ідентичної ширини, відступів та координат.
        Хрестик закриття розміщено ПРЯМО над кнопкою виклику меню рубрик у шапці.
        Вимога: після відкриття меню перемикач теми має займати місце пошуку!
      */}
      <header className="w-full bg-transparent py-3.5 sm:py-4">
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
                e.preventDefault();
                onSelectSection(null);
                onClose();
              }}
              aria-label="The Impart — Головна сторінка"
              className="block text-xl font-medium tracking-tight text-black dark:text-[#ffffff] hover:opacity-75 transition-opacity select-none text-center cursor-pointer focus:outline-none whitespace-nowrap"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              The Impart
            </a>
          </div>

          {/* Права сторона: Перемикач теми, що займає місце кнопки пошуку в мобільному меню */}
          <div className="z-20 flex items-center justify-end -mr-2">
            <ThemeToggle
              theme={theme}
              onToggle={onToggleTheme}
              siteLang={siteLang}
            />
          </div>
        </div>
      </header>

      {/* Центральна зона модального вікна: вибір рубрик */}
      <div className="flex-1 w-full max-w-xl mx-auto px-6 flex flex-col justify-between items-center py-6 sm:py-12">
        <div />

        {/* Список рубрик: великий, виразний, жирніший шрифт */}
        <nav
          aria-label="Рубрики журналу"
          className={`flex flex-col items-center justify-center space-y-6 sm:space-y-8 my-auto transition-all duration-350 ease-out ${
            isAnimateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          {NAV_SECTIONS.map((sec) => {
            const isActive = activeSection === sec.id;
            const title = siteLang === 'en' ? sec.titleEn : sec.titleUa;
            return (
              <a
                key={`modal_rubric_${sec.id}`}
                href={`/${sec.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onSelectSection(sec.id);
                  onClose();
                }}
                className={`group relative text-2xl sm:text-3xl md:text-4xl transition-all duration-200 cursor-pointer focus:outline-none py-2 px-4 select-none text-center ${
                  isActive
                    ? 'text-black dark:text-[#ffffff] font-bold scale-105'
                    : 'text-neutral-800 dark:text-[#cbcbcb] hover:text-black dark:hover:text-[#ffffff] font-semibold'
                }`}
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                <span className="relative z-10 transition-transform duration-200 inline-block group-hover:scale-105">
                  {title}
                </span>
                {/* Елегантна лінія-підкреслення активної рубрики */}
                <span
                  className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-[2.5px] bg-black dark:bg-[#ffffff] transition-all duration-300 ease-out ${
                    isActive ? 'w-3/4' : 'w-0 group-hover:w-3/4'
                  }`}
                />
              </a>
            );
          })}
        </nav>

        {/* Низ модального вікна: перемикач мови UA / EN та посилання на сторінки */}
        <div
          className={`pb-4 sm:pb-8 flex flex-col items-center gap-3 transition-all duration-350 delay-75 ease-out ${
            isAnimateIn ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
          }`}
        >
          {/* Посилання на постійні сторінки */}
          <div className="flex items-center gap-3 text-xs font-sans text-neutral-500 dark:text-[#888888]">
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToPage?.('about');
              }}
              className="hover:text-black dark:hover:text-[#ffffff] transition-colors cursor-pointer py-1"
            >
              {siteLang === 'en' ? 'About Project' : 'Про проєкт'}
            </button>
            <span className="text-neutral-300 dark:text-neutral-700">•</span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToPage?.('contacts');
              }}
              className="hover:text-black dark:hover:text-[#ffffff] transition-colors cursor-pointer py-1"
            >
              {siteLang === 'en' ? 'Contacts' : 'Контакти'}
            </button>
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
