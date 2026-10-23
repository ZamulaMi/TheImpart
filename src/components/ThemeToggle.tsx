import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { SiteLanguage, SiteTheme } from '../types';

interface ThemeToggleProps {
  theme: SiteTheme;
  onToggle: () => void;
  siteLang: SiteLanguage;
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  theme,
  onToggle,
  siteLang,
  className = '',
}) => {
  const isDark = theme === 'dark';
  const isEn = siteLang === 'en';

  const label = isDark
    ? isEn
      ? 'Switch to light theme'
      : 'Увімкнути світлу тему'
    : isEn
    ? 'Switch to dark theme'
    : 'Увімкнути темну тему';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className={`relative flex items-center justify-center w-10 h-10 text-black dark:text-[#cbcbcb] hover:opacity-60 active:scale-95 transition-all cursor-pointer focus:outline-none ${className}`}
    >
      <div className="relative w-5 h-5 flex items-center justify-center">
        {isDark ? (
          <Sun className="w-5 h-5 stroke-[1.8] text-current transition-transform duration-300 rotate-0 scale-100" />
        ) : (
          <Moon className="w-5 h-5 stroke-[1.8] text-current transition-transform duration-300 rotate-0 scale-100" />
        )}
      </div>
    </button>
  );
};

