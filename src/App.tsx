/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { Search, X, Menu, ChevronRight, Sparkles } from 'lucide-react';
import {
  Article,
  SiteLanguage,
  SiteSocialLinks,
  TaxonomiesData,
  ArticleDraft,
  UserRole,
  SitePagesData,
  DEFAULT_PAGES_DATA,
  SiteTheme,
} from './types';
import { ThemeToggle } from './components/ThemeToggle';
import { AdminPanel } from './components/AdminPanel';
import { AdminLogin } from './components/AdminLogin';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ArticleView } from './components/ArticleView';
import { StaticPageView } from './components/StaticPageView';
import { SearchModal } from './components/SearchModal';
import { RubricsModal } from './components/RubricsModal';
import { formatTimeAgoOrDate } from './utils/date';
import { getStoredTaxonomies, saveStoredTaxonomies } from './utils/taxonomies';
import { searchArticlesWithFuzzy } from './utils/search';
import {
  getAuthToken,
  getAuthHeaders,
  verifyAdminSession,
  logoutAdmin,
  getUserRole,
  getUserDisplayName,
  getUsername,
} from './services/auth';
import {
  fetchSocialLinksFromCloud,
  saveSocialLinksToCloud,
  fetchArticlesFromCloud,
  saveArticleToCloud,
  deleteArticleFromCloud,
  fetchPagesFromCloud,
  savePagesToCloud,
  fetchTaxonomiesFromCloud,
  saveTaxonomiesToCloud,
} from './services/db';
import {
  fetchDraftsFromCloud,
  saveDraftToCloud,
  deleteDraftFromCloud,
  approveDraftOnCloud,
  rejectDraftOnCloud,
} from './services/drafts';
import { SEED_ARTICLES } from './data/seedArticles';

const STORAGE_KEY = 'the_impart_articles_v1';
const LANG_STORAGE_KEY = 'the_impart_lang_v1';
const SOCIAL_STORAGE_KEY = 'the_impart_social_links_v1';
const PAGES_STORAGE_KEY = 'the_impart_static_pages_v1';
const THEME_STORAGE_KEY = 'the_impart_theme_v1';

const DEFAULT_SOCIAL_LINKS: SiteSocialLinks = {
  ua: {
    telegram: 'https://t.me',
    instagram: 'https://instagram.com',
    x: 'https://x.com',
    youtube: 'https://youtube.com',
    threads: 'https://threads.net',
  },
  en: {
    telegram: 'https://t.me',
    instagram: 'https://instagram.com',
    x: 'https://x.com',
    youtube: 'https://youtube.com',
    threads: 'https://threads.net',
  },
};

export type HeaderSection = 'news' | 'articles' | 'reviews';

export interface NavSectionItem {
  id: HeaderSection;
  titleUa: string;
  titleEn: string;
}

export const NAV_SECTIONS: NavSectionItem[] = [
  { id: 'news', titleUa: 'Новини', titleEn: 'News' },
  { id: 'articles', titleUa: 'Статті', titleEn: 'Articles' },
  { id: 'reviews', titleUa: 'Огляди', titleEn: 'Reviews' },
];

export function matchesHeaderSection(article: Article, section: HeaderSection): boolean {
  const catsUa = (
    article.categories && article.categories.length > 0
      ? article.categories
      : (article.category ? article.category.split(',').map((s) => s.trim()) : [])
  ).map((c) => c.toLowerCase());

  const catsEn = (
    article.categoriesEn && article.categoriesEn.length > 0
      ? article.categoriesEn
      : (article.categoryEn ? article.categoryEn.split(',').map((s) => s.trim()) : [])
  ).map((c) => c.toLowerCase());

  const topicsUa = (article.topics || []).map((t) => t.trim().toLowerCase());
  const topicsEn = (article.topicsEn || []).map((t) => t.trim().toLowerCase());

  const allUa = [...catsUa, ...topicsUa];
  const allEn = [...catsEn, ...topicsEn];

  if (section === 'news') {
    return (
      allUa.some((c) => c === 'новини' || c === 'новина') ||
      allEn.some((c) => c === 'news')
    );
  }
  if (section === 'reviews') {
    return (
      allUa.some((c) => ['обзори', 'огляди', 'обзор', 'огляд'].includes(c)) ||
      allEn.some((c) => ['reviews', 'review'].includes(c))
    );
  }
  if (section === 'articles') {
    const hasArticleCat =
      allUa.some((c) =>
        ['статті', 'стаття', 'есе', 'essay', 'філософія', 'philosophy', 'архітектура', 'architecture', 'естетика', 'aesthetics', 'мистецтво', 'art', 'дизайн', 'design', 'культура', 'culture', 'загальне'].includes(c)
      ) ||
      allEn.some((c) =>
        ['articles', 'article', 'essay', 'philosophy', 'architecture', 'aesthetics', 'art', 'design', 'culture'].includes(c)
      );

    if (hasArticleCat) return true;

    const isNews =
      allUa.some((c) => c === 'новини' || c === 'новина') ||
      allEn.some((c) => c === 'news');
    const isReview =
      allUa.some((c) => ['обзори', 'огляди', 'обзор', 'огляд'].includes(c)) ||
      allEn.some((c) => ['reviews', 'review'].includes(c));

    if (isNews || isReview) return false;

    return true;
  }
  return false;
}

interface ArticleCardProps {
  article: Article;
  siteLang: SiteLanguage;
  aspectRatio: '26/10.5' | '16/9' | '3/4';
  isHero?: boolean;
  onSelect: (id: string) => void;
}

function ArticleCard({ article, siteLang, aspectRatio, isHero = false, onSelect }: ArticleCardProps) {
  const isEn = siteLang === 'en';
  const rawTitle = isEn && article.titleEn ? article.titleEn : article.title;
  const title = typeof rawTitle === 'string' ? rawTitle : (rawTitle as any)?.name || String(rawTitle || '');
  const rawExcerpt = isEn && article.excerptEn ? article.excerptEn : article.excerpt;
  const excerpt = typeof rawExcerpt === 'string' ? rawExcerpt : String(rawExcerpt || '');

  const rawCategoriesList =
    isEn && article.categoriesEn && article.categoriesEn.length > 0
      ? article.categoriesEn
      : article.categories && article.categories.length > 0
      ? article.categories
      : (isEn && article.categoryEn ? [article.categoryEn] : (article.category ? [article.category] : []));
  const category = Array.isArray(rawCategoriesList)
    ? rawCategoriesList.map((c: any) => typeof c === 'string' ? c : c?.name || String(c)).join(' / ')
    : '';
  const timeAgo = formatTimeAgoOrDate(article.createdAt, article.date, article.id, siteLang);

  // Класи пропорцій для фото:
  // - 26/10.5: для головної статті першого ряду
  // - 16/9: для 2 горизонтальних фото
  // - 3/4: для 3 вертикальних фото (на мобільних 16/10 для комфорту)
  const aspectClass =
    aspectRatio === '26/10.5'
      ? 'w-full aspect-[16/10] sm:aspect-[21/9] md:aspect-[26/10.5] min-h-[240px] sm:min-h-[340px] md:min-h-[390px]'
      : aspectRatio === '16/9'
      ? 'w-full aspect-[16/10] sm:aspect-[16/9] min-h-[190px]'
      : 'w-full aspect-[16/10] sm:aspect-[4/5] md:aspect-[3/4] min-h-[190px]';

  const titleClass =
    aspectRatio === '26/10.5'
      ? 'text-xl sm:text-2xl md:text-3xl lg:text-4xl'
      : aspectRatio === '16/9'
      ? 'text-base sm:text-lg md:text-xl lg:text-2xl line-clamp-3'
      : 'text-base sm:text-lg lg:text-xl line-clamp-3';

  return (
    <article
      onClick={() => {
        onSelect(article.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-xl bg-neutral-900 border border-transparent dark:border-[#333333]/80 shadow-md hover:shadow-xl transition-all duration-500 flex flex-col justify-end animate-card-fade-in ${aspectClass}`}
    >
      {/* Фонове фото */}
      {article.coverImage ? (
        <img
          src={article.coverImage}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
        />
      ) : (
        <div className="absolute inset-0 bg-neutral-900 flex items-center justify-center text-white/30 font-serif text-sm">
          The Impart
        </div>
      )}

      {/* Темні градієнтні накладки для читабельності тексту */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15 group-hover:from-black/90 group-hover:via-black/50 transition-all duration-300" />

      {/* Контент поверх фото */}
      <div
        className={`relative z-10 text-white w-full ${
          isHero ? 'p-5 sm:p-8 md:p-10 lg:p-12 max-w-4xl' : 'p-4 sm:p-5 md:p-6'
        }`}
      >
        {/* Рубрика та динамічний час */}
        <div className="flex items-center gap-2 text-[11px] sm:text-xs uppercase tracking-wider text-white/80 mb-2 drop-shadow-xs">
          <span className="font-medium text-white/95">{category}</span>
          <span className="text-white/40">•</span>
          <span className="text-white/80">{timeAgo}</span>
        </div>

        {/* Назва статті */}
        <h3
          className={`font-serif font-medium text-white leading-snug drop-shadow-sm group-hover:text-white/95 transition-colors ${titleClass}`}
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {title}
        </h3>

        {/* Короткий опис: плавно з'являється при наведенні курсору */}
        {excerpt && (
          <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-all duration-300 ease-out">
            <div className="overflow-hidden">
              <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed font-sans pt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75 line-clamp-3">
                {excerpt}
              </p>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function parseRouteFromUrl(): {
  route: 'main' | 'admin' | 'login' | 'about' | 'contacts';
  section: HeaderSection | null;
  articleId: string | null;
  searchQuery: string | null;
  page: number;
} {
  if (typeof window === 'undefined') {
    return { route: 'main', section: null, articleId: null, searchQuery: null, page: 1 };
  }

  const rawPath = window.location.pathname.replace(/\/+$/, '') || '/';
  const path = rawPath.toLowerCase();
  const search = window.location.search;
  const hash = window.location.hash;
  const params = new URLSearchParams(search);

  // 1. Сторінка входу: /login або #login
  if (path === '/login' || path.startsWith('/login/') || hash === '#login') {
    return { route: 'login', section: null, articleId: null, searchQuery: null, page: 1 };
  }

  // 2. Адмінка або панель редактора: /admin, #admin, /editor, #editor
  if (
    path === '/admin' ||
    path.startsWith('/admin/') ||
    hash === '#admin' ||
    path === '/editor' ||
    path.startsWith('/editor/') ||
    hash === '#editor'
  ) {
    return { route: 'admin', section: null, articleId: null, searchQuery: null, page: 1 };
  }

  // 3. Статичні сторінки: /about, #about, /contacts, #contacts
  if (path === '/about' || path.startsWith('/about/') || hash === '#about' || params.get('page') === 'about') {
    return { route: 'about', section: null, articleId: null, searchQuery: null, page: 1 };
  }
  if (path === '/contacts' || path.startsWith('/contacts/') || hash === '#contacts' || params.get('page') === 'contacts') {
    return { route: 'contacts', section: null, articleId: null, searchQuery: null, page: 1 };
  }

  // 4. Пряме посилання на статтю: /article/:id або зворотна сумісність: ?article=:id або #article-:id
  let articleId: string | null = null;
  const articleMatch = rawPath.match(/^\/article\/(.+)$/i);
  if (articleMatch) {
    articleId = decodeURIComponent(articleMatch[1]);
  } else if (params.get('article')) {
    articleId = params.get('article');
  } else if (hash.startsWith('#article-')) {
    articleId = hash.replace('#article-', '');
  }

  if (articleId) {
    return { route: 'main', section: null, articleId, searchQuery: null, page: 1 };
  }

  // 5. Розділи: /news, /articles, /reviews або зворотна сумісність ?section=...
  let section: HeaderSection | null = null;
  if (path === '/news' || params.get('section') === 'news') {
    section = 'news';
  } else if (path === '/articles' || params.get('section') === 'articles') {
    section = 'articles';
  } else if (path === '/reviews' || params.get('section') === 'reviews') {
    section = 'reviews';
  }

  // 6. Пошук: /search/:query, /search?q=... або ?search=... або ?q=...
  let searchQuery: string | null = null;
  const searchMatch = rawPath.match(/^\/search\/(.+)$/i);
  if (searchMatch) {
    searchQuery = decodeURIComponent(searchMatch[1]);
  } else if (path === '/search' || params.has('search') || params.has('q')) {
    const q = params.get('q') || params.get('search');
    if (q && q.trim()) searchQuery = q.trim();
  }

  // 7. Пагінація: ?page=...
  const pgParam = parseInt(params.get('page') || '1', 10);
  const page = isNaN(pgParam) || pgParam < 1 ? 1 : pgParam;

  return { route: 'main', section, articleId: null, searchQuery, page };
}

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<'main' | 'admin' | 'login' | 'about' | 'contacts'>(() => parseRouteFromUrl().route);

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return Boolean(getAuthToken());
  });

  const [userRole, setUserRole] = useState<UserRole>(() => getUserRole());
  const [userDisplayName, setUserDisplayName] = useState<string>(() => getUserDisplayName());
  const [username, setUsername] = useState<string>(() => getUsername());
  const [drafts, setDrafts] = useState<ArticleDraft[]>([]);

  const refreshUserData = () => {
    setUserRole(getUserRole());
    setUserDisplayName(getUserDisplayName());
    setUsername(getUsername());
  };

  const fetchDrafts = async () => {
    try {
      const data = await fetchDraftsFromCloud();
      setDrafts(data);
    } catch (e) {
      console.warn('Failed to fetch drafts:', e);
    }
  };

  // Автоматичне перенаправлення між /admin та /login залежно від статусу сесії
  useEffect(() => {
    if (currentRoute === 'admin' || currentRoute === 'login') {
      verifyAdminSession().then((session) => {
        const isValid = Boolean(session?.authenticated);
        setIsAdminAuthenticated(isValid);
        if (isValid) {
          if (session.role) setUserRole(session.role);
          if (session.displayName) setUserDisplayName(session.displayName);
          if (session.username) setUsername(session.username);
          refreshUserData();
          fetchDrafts();
        }
        if (currentRoute === 'admin' && !isValid) {
          window.history.replaceState(null, '', '/login');
          setCurrentRoute('login');
        } else if (currentRoute === 'login' && isValid) {
          window.history.replaceState(null, '', '/admin');
          setCurrentRoute('admin');
        }
      });
    }
  }, [currentRoute]);

  useEffect(() => {
    if (currentRoute === 'admin' && !isAdminAuthenticated && !getAuthToken()) {
      window.history.replaceState(null, '', '/login');
      setCurrentRoute('login');
    }
  }, [currentRoute, isAdminAuthenticated]);

  useEffect(() => {
    if (isAdminAuthenticated) {
      refreshUserData();
      fetchDrafts();
    }
  }, [isAdminAuthenticated]);

  const [siteLang, setSiteLang] = useState<SiteLanguage>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === 'en' || saved === 'ua') return saved;
    }
    return 'ua';
  });

  // Темна тема є основною за замовчуванням (HEX #111 для header/footer, #222 для body, #cbcbcb для тексту).
  // Якщо користувач змінює тему, браузер локально запам'ятовує вибір у localStorage.
  const [siteTheme, setSiteTheme] = useState<SiteTheme>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') return saved;
      } catch (e) {
        console.error(e);
      }
    }
    return 'dark';
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const isAdminRoute = currentRoute === 'admin' || currentRoute === 'login';
      if (isAdminRoute) {
        // В адмін-панелі та на сторінці входу має бути виключно світла тема
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.style.backgroundColor = '#ffffff';
        document.body.style.color = '#000000';
      } else if (siteTheme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.style.backgroundColor = '#222222';
        document.body.style.color = '#cbcbcb';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.style.backgroundColor = '#ffffff';
        document.body.style.color = '#000000';
      }
      try {
        localStorage.setItem(THEME_STORAGE_KEY, siteTheme);
      } catch (e) {
        console.error(e);
      }
    }
  }, [siteTheme, currentRoute]);

  const toggleTheme = () => {
    setSiteTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const [socialLinks, setSocialLinks] = useState<SiteSocialLinks>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(SOCIAL_STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_SOCIAL_LINKS;
  });

// Очищення застарілих жорстких інлайн-кольорів у збережених сторінках
const sanitizePageContent = (raw?: string): string => {
  if (!raw) return '';
  return raw
    .replace(
      /<p[^>]*>\s*<span[^>]*style="[^"]*font-size:\s*1\.45rem[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/p>/gi,
      '<h3>$1</h3>'
    )
    .replace(
      /style="([^"]*?)color:\s*(?:rgb\(\s*23\s*,\s*23\s*,\s*23\s*\)|#171717|#0a0a0a|#000000|#1f2937|#262626|black)\s*;?([^"]*?)"/gi,
      (match, before, after) => {
        const remaining = `${before}${after}`.trim().replace(/^;\s*/, '').replace(/;\s*;+/g, ';');
        return remaining ? `style="${remaining}"` : '';
      }
    );
};

const sanitizeStaticPages = (data: SitePagesData): SitePagesData => ({
  ...data,
  about: {
    ...data.about,
    content: sanitizePageContent(data.about?.content),
    contentEn: sanitizePageContent(data.about?.contentEn),
  },
  contacts: {
    ...data.contacts,
    content: sanitizePageContent(data.contacts?.content),
    contentEn: sanitizePageContent(data.contacts?.contentEn),
  },
});

  const [staticPages, setStaticPages] = useState<SitePagesData>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(PAGES_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object' && (parsed.about || parsed.contacts)) {
            const combined = {
              about: { ...DEFAULT_PAGES_DATA.about, ...(parsed.about || {}) },
              contacts: { ...DEFAULT_PAGES_DATA.contacts, ...(parsed.contacts || {}) },
            };
            return sanitizeStaticPages(combined);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_PAGES_DATA;
  });

  const fetchPagesFromDb = async () => {
    try {
      const data = await fetchPagesFromCloud();
      if (data && typeof data === 'object' && (data.about || data.contacts)) {
        const combined = {
          about: { ...DEFAULT_PAGES_DATA.about, ...(data.about || {}) },
          contacts: { ...DEFAULT_PAGES_DATA.contacts, ...(data.contacts || {}) },
        };
        const sanitized = sanitizeStaticPages(combined);
        setStaticPages(sanitized);
        try {
          localStorage.setItem(PAGES_STORAGE_KEY, JSON.stringify(sanitized));
        } catch (e) {
          console.error(e);
        }
      }
    } catch (err) {
      console.warn('Pages fetch notice:', err);
    }
  };

  const handleSaveStaticPages = async (newPages: SitePagesData) => {
    setStaticPages(newPages);
    try {
      localStorage.setItem(PAGES_STORAGE_KEY, JSON.stringify(newPages));
    } catch (e) {
      console.error(e);
    }
    await savePagesToCloud(newPages);
  };

  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(() => parseRouteFromUrl().articleId);

  const [taxonomies, setTaxonomies] = useState<TaxonomiesData>(() => getStoredTaxonomies());

  const handleSaveTaxonomies = async (data: TaxonomiesData) => {
    setTaxonomies(data);
    saveStoredTaxonomies(data);
    try {
      await saveTaxonomiesToCloud(data);
    } catch (err) {
      console.warn('Cloud save taxonomies notice:', err);
    }
  };

  const fetchTaxonomiesFromDb = async () => {
    try {
      const cloudData = await fetchTaxonomiesFromCloud();
      if (cloudData && Array.isArray(cloudData.categories) && Array.isArray(cloudData.topics)) {
        setTaxonomies(cloudData);
        saveStoredTaxonomies(cloudData);
      }
    } catch (err) {
      console.warn('Fetch taxonomies notice:', err);
    }
  };

  const [articles, setArticles] = useState<Article[]>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return SEED_ARTICLES;
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Активний розділ у шапці: 'news' | 'articles' | 'reviews' | null (null = головна стрічка)
  const [activeCategorySection, setActiveCategorySection] = useState<HeaderSection | null>(() => parseRouteFromUrl().section);

  // Поточна сторінка для пагінації у розділах рубрик (по 10 статей на сторінку)
  const [categoryPage, setCategoryPage] = useState<number>(() => parseRouteFromUrl().page);

  // Стан пошуку та мобільного меню
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Блокування скролу та закриття меню по клавіші Escape
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsMobileMenuOpen(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isMobileMenuOpen]);

  const [activeSearchFilter, setActiveSearchFilter] = useState<{
    query: string;
    articleIds: string[];
  } | null>(() => {
    const q = parseRouteFromUrl().searchQuery;
    if (q) {
      return { query: q, articleIds: [] };
    }
    return null;
  });

  // Поточна сторінка для пагінації у результатах пошуку (по 10 статей на сторінку)
  const [searchPage, setSearchPage] = useState<number>(() => parseRouteFromUrl().page);


  // Кількість статей у стрічці головної сторінки (спочатку 10, по +10 при "показати більше")
  const [visibleCount, setVisibleCount] = useState<number>(10);

  // Скидаємо лічильник статей головної при зміні мови
  useEffect(() => {
    setVisibleCount(10);
  }, [siteLang]);

  const handleSetLang = (lang: SiteLanguage) => {
    setSiteLang(lang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSocialLinksFromDb = async () => {
    // 1. Пряме завантаження з хмарної бази даних Neon (гарантовано працює у ВСІХ браузерах без проксі)
    try {
      const cloudLinks = await fetchSocialLinksFromCloud();
      if (cloudLinks && typeof cloudLinks === 'object') {
        setSocialLinks(cloudLinks);
        try {
          localStorage.setItem(SOCIAL_STORAGE_KEY, JSON.stringify(cloudLinks));
        } catch (e) {
          console.error(e);
        }
        return;
      }
    } catch (e) {
      console.warn('Neon direct fetch notice:', e);
    }

    // 2. Резервне завантаження через /api/settings
    try {
      const res = await fetch(`/api/settings?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          setSocialLinks(data);
          try {
            localStorage.setItem(SOCIAL_STORAGE_KEY, JSON.stringify(data));
          } catch (e) {
            console.error(e);
          }
        }
      }
    } catch (err) {
      console.warn('Settings endpoint unavailable, keeping existing:', err);
    }
  };

  const handleSaveSocialLinks = async (links: SiteSocialLinks) => {
    let savedSuccessfully = false;

    // 1. Зберігаємо безпосередньо у хмарній базі даних Neon (обходить будь-які блокування проксі)
    try {
      await saveSocialLinksToCloud(links);
      savedSuccessfully = true;
    } catch (cloudErr) {
      console.warn('Direct cloud save error, falling back to server route:', cloudErr);
    }

    // 2. Додатковий фоновий бекап на локальний сервер
    try {
      await fetch(`/api/settings?_t=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(links),
      });
      savedSuccessfully = true;
    } catch (serverErr) {
      // Якщо проксі Cloud Run видає 500, але Neon зберіг — помилку користувачу не показуємо
    }

    if (!savedSuccessfully) {
      throw new Error('Не вдалося зберегти дані на сервері або в базі даних. Перевірте з\'єднання.');
    }

    setSocialLinks(links);
    try {
      localStorage.setItem(SOCIAL_STORAGE_KEY, JSON.stringify(links));
    } catch (e) {
      console.error(e);
    }
  };

  const sanitizeArticleList = (list: any): Article[] => {
    if (!Array.isArray(list)) return [];
    return list
      .filter((a) => a && typeof a === 'object' && a.id !== undefined && (a.title || a.titleEn))
      .map((a): Article => ({
        ...a,
        id: String(a.id),
        topics: Array.isArray(a.topics)
          ? a.topics.map((t: any) => String(t).trim().replace(/^#+/, '')).filter(Boolean)
          : typeof a.topics === 'string' && a.topics.trim()
          ? a.topics.split(',').map((t: string) => t.trim().replace(/^#+/, '')).filter(Boolean)
          : [],
        topicsEn: Array.isArray(a.topicsEn)
          ? a.topicsEn.map((t: any) => String(t).trim().replace(/^#+/, '')).filter(Boolean)
          : typeof a.topicsEn === 'string' && a.topicsEn.trim()
          ? a.topicsEn.split(',').map((t: string) => t.trim().replace(/^#+/, '')).filter(Boolean)
          : [],
      }));
  };

  const fetchArticlesFromDb = async () => {
    let loaded = false;

    // 1. Пряме завантаження статей із хмарної бази Neon
    try {
      const cloudArticles = await fetchArticlesFromCloud();
      const sanitized = sanitizeArticleList(cloudArticles);
      if (sanitized.length > 0) {
        setArticles(sanitized);
        loaded = true;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        } catch (e) {
          console.error(e);
        }
        setIsLoading(false);
        return;
      }
    } catch (e) {
      console.warn('Neon direct articles fetch notice:', e);
    }

    // 2. Резервне завантаження через /api/articles
    try {
      const res = await fetch(`/api/articles?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        const sanitized = sanitizeArticleList(data);
        if (sanitized.length > 0) {
          setArticles(sanitized);
          loaded = true;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
          } catch (e) {
            console.error(e);
          }
        }
      }
    } catch (err) {
      console.warn('Backend unavailable, checking local storage:', err);
    }

    // 3. Якщо сервер недоступний — підтягуємо локальний кеш або початкові матеріали редакції
    if (!loaded) {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const sanitized = sanitizeArticleList(parsed);
          if (sanitized.length > 0) {
            setArticles(sanitized);
            loaded = true;
          }
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (!loaded) {
      setArticles((prev) => (prev && prev.length > 0 ? prev : SEED_ARTICLES));
    }

    setIsLoading(false);
  };

  // Завантаження статей, налаштувань, статичних сторінок та таксономій із бази даних
  useEffect(() => {
    fetchArticlesFromDb();
    fetchSocialLinksFromDb();
    fetchPagesFromDb();
    fetchTaxonomiesFromDb();
  }, []);

  // Синхронізація з навігацією браузера (URL, popstate, hashchange)
  useEffect(() => {
    const handleLocationChange = () => {
      const parsed = parseRouteFromUrl();
      if (parsed.route === 'login') {
        setCurrentRoute('login');
        setSelectedArticleId(null);
        return;
      }
      if (parsed.route === 'admin') {
        if (!isAdminAuthenticated && !getAuthToken()) {
          window.history.replaceState(null, '', '/login');
          setCurrentRoute('login');
        } else {
          setCurrentRoute('admin');
        }
        setSelectedArticleId(null);
        return;
      }

      if (parsed.route === 'about' || parsed.route === 'contacts') {
        setCurrentRoute(parsed.route);
        setSelectedArticleId(null);
        setActiveSearchFilter(null);
        setActiveCategorySection(null);
        return;
      }

      setCurrentRoute('main');
      setSelectedArticleId(parsed.articleId);

      if (parsed.searchQuery) {
        setActiveSearchFilter({ query: parsed.searchQuery, articleIds: [] });
        setSearchPage(parsed.page);
        setActiveCategorySection(null);
      } else if (parsed.section) {
        setActiveSearchFilter(null);
        setActiveCategorySection(parsed.section);
        setCategoryPage(parsed.page);
      } else {
        setActiveSearchFilter(null);
        setActiveCategorySection(null);
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [isAdminAuthenticated]);

  const navigateToPage = (page: 'about' | 'contacts') => {
    setSelectedArticleId(null);
    setActiveCategorySection(null);
    setActiveSearchFilter(null);
    setIsMobileMenuOpen(false);
    setIsSearchOpen(false);
    window.history.pushState(null, '', `/${page}`);
    setCurrentRoute(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateTo = (route: 'main' | 'admin' | 'login' | 'about' | 'contacts', articleId?: string) => {
    if (route === 'login') {
      if (isAdminAuthenticated) {
        window.history.pushState(null, '', '/admin');
        setCurrentRoute('admin');
      } else {
        window.history.pushState(null, '', '/login');
        setCurrentRoute('login');
      }
      setSelectedArticleId(null);
    } else if (route === 'admin') {
      if (!isAdminAuthenticated && !getAuthToken()) {
        window.history.pushState(null, '', '/login');
        setCurrentRoute('login');
      } else {
        window.history.pushState(null, '', '/admin');
        setCurrentRoute('admin');
      }
      setSelectedArticleId(null);
    } else if (route === 'about' || route === 'contacts') {
      navigateToPage(route);
    } else {
      setCurrentRoute('main');
      if (articleId) {
        window.history.pushState(null, '', `/article/${encodeURIComponent(articleId)}`);
        setSelectedArticleId(articleId);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.history.pushState(null, '', '/');
        setSelectedArticleId(null);
        setActiveCategorySection(null);
      }
    }
  };

  const handleSelectSection = (sec: HeaderSection | null) => {
    setCurrentRoute('main');
    setActiveCategorySection(sec);
    setCategoryPage(1);
    setSelectedArticleId(null);
    setActiveSearchFilter(null);
    if (sec) {
      window.history.pushState(null, '', `/${sec}`);
    } else {
      window.history.pushState(null, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectCategoryPage = (pageNumber: number) => {
    setCategoryPage(pageNumber);
    if (activeCategorySection) {
      window.history.pushState(
        null,
        '',
        `/${activeCategorySection}${pageNumber > 1 ? `?page=${pageNumber}` : ''}`
      );
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectSearchPage = (pageNumber: number) => {
    setSearchPage(pageNumber);
    if (activeSearchFilter) {
      window.history.pushState(
        null,
        '',
        `/search/${encodeURIComponent(activeSearchFilter.query)}${pageNumber > 1 ? `?page=${pageNumber}` : ''}`
      );
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleShowAllSearchResults = (query: string, results: Article[]) => {
    setSelectedArticleId(null);
    setActiveCategorySection(null);
    setSearchPage(1);
    setActiveSearchFilter({
      query,
      articleIds: results.map((r) => r.id),
    });
    window.history.pushState(null, '', `/search/${encodeURIComponent(query)}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetSearch = () => {
    setActiveSearchFilter(null);
    setSearchPage(1);
    window.history.pushState(null, '', '/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectTopicFromArticle = (topic: string) => {
    setSelectedArticleId(null);
    setActiveCategorySection(null);
    setSearchPage(1);
    setActiveSearchFilter({
      query: topic,
      articleIds: [],
    });
    window.history.pushState(null, '', `/search/${encodeURIComponent(topic)}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectCategoryFromArticle = (catName: string) => {
    const lower = catName.trim().toLowerCase();
    if (lower === 'новини' || lower === 'новина' || lower === 'news') {
      handleSelectSection('news');
    } else if (['обзори', 'огляди', 'обзор', 'огляд', 'reviews', 'review'].includes(lower)) {
      handleSelectSection('reviews');
    } else if (['статті', 'стаття', 'articles', 'article'].includes(lower)) {
      handleSelectSection('articles');
    } else {
      setSelectedArticleId(null);
      setActiveCategorySection(null);
      setSearchPage(1);
      setActiveSearchFilter({
        query: catName,
        articleIds: [],
      });
      window.history.pushState(null, '', `/search/${encodeURIComponent(catName)}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectArticle = (id: string | null) => {
    if (id) {
      window.history.pushState(null, '', `/article/${encodeURIComponent(id)}`);
      setSelectedArticleId(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Якщо повернулися зі статті, відновлюємо URL розділу/пошуку або головної
      if (activeSearchFilter) {
        window.history.pushState(
          null,
          '',
          `/search/${encodeURIComponent(activeSearchFilter.query)}${searchPage > 1 ? `?page=${searchPage}` : ''}`
        );
      } else if (activeCategorySection) {
        window.history.pushState(
          null,
          '',
          `/${activeCategorySection}${categoryPage > 1 ? `?page=${categoryPage}` : ''}`
        );
      } else {
        window.history.pushState(null, '', '/');
      }
      setSelectedArticleId(null);
    }
  };

  const handleSaveArticle = async (article: Article) => {
    let savedArticle = article;

    // 1. Зберігаємо у хмарну базу даних Neon безпосередньо (доступно для всіх браузерів)
    try {
      savedArticle = await saveArticleToCloud(article);
    } catch (err) {
      console.warn('Direct Neon cloud save notice, trying server endpoint:', err);
    }

    // 2. Резервний фоновий бекап на сервер
    try {
      await fetch(`/api/articles?_t=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(article),
      });
    } catch (e) {
      // Резервний запит
    }

    setArticles((prev) => {
      const exists = prev.some((a) => a.id === savedArticle.id);
      const updated = exists
        ? prev.map((a) => (a.id === savedArticle.id ? savedArticle : a))
        : [savedArticle, ...prev];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  const handleDeleteArticle = async (id: string) => {
    // 1. Видаляємо з хмарної бази даних
    try {
      await deleteArticleFromCloud(id);
    } catch (e) {
      console.warn('Cloud delete notice:', e);
    }

    // 2. Фоновий запит на сервер
    try {
      await fetch(`/api/articles?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          ...getAuthHeaders(),
        },
      });
    } catch (e) {
      // Резервний запит
    }

    setArticles((prev) => {
      const updated = prev.filter((a) => a.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
    if (selectedArticleId === id) {
      setSelectedArticleId(null);
    }
  };

  const handleAdminLogout = async () => {
    await logoutAdmin();
    setIsAdminAuthenticated(false);
    setUserRole('admin');
    setUserDisplayName('');
    setUsername('');
    window.history.pushState(null, '', '/login');
    setCurrentRoute('login');
  };

  const handleSaveDraft = async (draft: ArticleDraft) => {
    const saved = await saveDraftToCloud(draft);
    setDrafts((prev) => {
      const exists = prev.some((d) => d.id === saved.id);
      return exists ? prev.map((d) => (d.id === saved.id ? saved : d)) : [saved, ...prev];
    });
  };

  const handleApproveDraft = async (draft: ArticleDraft) => {
    await handleSaveArticle(draft.articleData);
    const res = await approveDraftOnCloud(draft.id, {
      published: draft.articleData.published,
      publishedEn: draft.articleData.publishedEn,
      moderatorNote: 'Схвалено адміністратором',
    });
    if (res.draft) {
      setDrafts((prev) => prev.map((d) => (d.id === draft.id ? res.draft! : d)));
    } else {
      setDrafts((prev) => prev.map((d) => (d.id === draft.id ? { ...d, status: 'approved' as const } : d)));
    }
  };

  const handleRejectDraft = async (draftId: string, note?: string) => {
    const res = await rejectDraftOnCloud(draftId, note);
    if (res.draft) {
      setDrafts((prev) => prev.map((d) => (d.id === draftId ? res.draft! : d)));
    } else {
      setDrafts((prev) =>
        prev.map((d) => (d.id === draftId ? { ...d, status: 'rejected' as const, moderatorNote: note } : d))
      );
    }
  };

  const handleDeleteDraft = async (draftId: string) => {
    await deleteDraftFromCloud(draftId);
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
  };

  // Фільтрація статей відповідно до обраної мови
  const basePublishedArticles = articles.filter((a) => {
    if (siteLang === 'en') {
      const isPubEn = a.publishedEn === true || String(a.publishedEn) === 'true';
      return isPubEn && Boolean(a.titleEn?.trim());
    }
    return a.published === true || String(a.published) === 'true' || (a.published as any) === 1;
  });

  // Статті для результатів пошуку (розумний пошук з виправленням одруківок)
  // Важливо: хуки повинні викликатися до будь-яких early return операторів
  const searchResultsData = useMemo(() => {
    if (!activeSearchFilter) return [];
    const q = activeSearchFilter.query.trim();
    if (!q) return [];
    return searchArticlesWithFuzzy(articles, q, siteLang);
  }, [activeSearchFilter, articles, siteLang]);

  const searchResultsArticles = useMemo(() => {
    return searchResultsData.map((r) => r.article);
  }, [searchResultsData]);

  const hasSearchTypoMatches = useMemo(() => {
    return searchResultsData.some((r) => r.hasFuzzyMatch);
  }, [searchResultsData]);

  const selectedArticle = articles.find((a) => a.id === selectedArticleId);

  // Окрема сторінка входу: /login
  if (currentRoute === 'login') {
    return (
      <AdminLogin
        onLoginSuccess={() => {
          setIsAdminAuthenticated(true);
          refreshUserData();
          fetchDrafts();
          window.history.pushState(null, '', '/admin');
          setCurrentRoute('admin');
        }}
        onBackToSite={() => navigateTo('main')}
      />
    );
  }

  // Режим адмін-панелі або панелі редактора: /admin
  if (currentRoute === 'admin') {
    if (!isAdminAuthenticated) {
      return (
        <AdminLogin
          onLoginSuccess={() => {
            setIsAdminAuthenticated(true);
            refreshUserData();
            fetchDrafts();
            window.history.pushState(null, '', '/admin');
            setCurrentRoute('admin');
          }}
          onBackToSite={() => navigateTo('main')}
        />
      );
    }

    return (
      <ErrorBoundary fallbackTitle="Помилка панелі керування">
        <AdminPanel
          articles={articles}
          onSaveArticle={handleSaveArticle}
          onDeleteArticle={handleDeleteArticle}
          onExitAdmin={() => navigateTo('main')}
          onLogout={handleAdminLogout}
          onViewArticleOnSite={(id) => navigateTo('main', id)}
          socialLinks={socialLinks}
          onSaveSocialLinks={handleSaveSocialLinks}
          onRefreshSocialLinks={fetchSocialLinksFromDb}
          pages={staticPages}
          onSavePages={handleSaveStaticPages}
          onViewPageOnSite={(slug) => navigateToPage(slug)}
          taxonomies={taxonomies}
          onSaveTaxonomies={handleSaveTaxonomies}
          userRole={userRole}
          userDisplayName={userDisplayName}
          username={username}
          drafts={drafts}
          onSaveDraft={handleSaveDraft}
          onApproveDraft={handleApproveDraft}
          onRejectDraft={handleRejectDraft}
          onDeleteDraft={handleDeleteDraft}
          onRefreshDrafts={fetchDrafts}
        />
      </ErrorBoundary>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white dark:bg-[#222222] text-black dark:text-[#cbcbcb] flex flex-col justify-between transition-colors duration-200">
      {/* Модальне вікно пошуку з напівпрозорим бекдропом і блюром */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        articles={articles}
        lang={siteLang}
        onSelectArticle={(id) => {
          handleSelectArticle(id);
        }}
        onShowAllSearchResults={handleShowAllSearchResults}
      />

      {/* Шапка (Header) - адаптивна: на мобільних згорнутий вибір рубрик (кнопка зліва, назва по центру, пошук справа) */}
      <header className="site-header w-full bg-white/95 dark:bg-[#111111]/95 backdrop-blur-md sticky top-0 z-40 py-3.5 sm:py-4 border-none transition-all">
        <div className="relative w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto flex items-center justify-between min-h-[38px]">
          {/* Ліва сторона:
              - На мобільних (< md): кнопка виклику меню рубрик
              - На десктопі (>= md): логотип The Impart
          */}
          <div className="flex items-center z-20">
            {/* Кнопка виклику меню рубрик на мобільному */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Відкрити меню рубрик"
              className="md:hidden flex items-center justify-center w-10 h-10 -ml-2 text-black dark:text-[#cbcbcb] hover:opacity-60 active:scale-95 transition-all cursor-pointer focus:outline-none"
            >
              <Menu className="w-5 h-5 stroke-[2]" />
            </button>

            {/* Десктопний логотип (на лівій межі) */}
            <div className="hidden md:block overflow-hidden py-0.5 -my-0.5">
              <button
                type="button"
                onClick={() => {
                  handleSelectSection(null);
                  setActiveSearchFilter(null);
                }}
                aria-label="The Impart — Головна сторінка"
                className="animate-title-slide-down block text-xl sm:text-2xl font-medium tracking-tight text-black dark:text-[#ffffff] hover:opacity-75 transition-opacity select-none text-left cursor-pointer focus:outline-none"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                The Impart
              </button>
            </div>
          </div>

          {/* Центр:
              - На мобільних: назва сайту The Impart строго по центру
              - На десктопі: рубрики (Новини / Статті / Огляди) з жирнішим шрифтом
          */}
          {/* Мобільний логотип по центру */}
          <div className="md:hidden absolute left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                handleSelectSection(null);
                setActiveSearchFilter(null);
                setIsMobileMenuOpen(false);
              }}
              aria-label="The Impart — Головна сторінка"
              className="block text-xl font-medium tracking-tight text-black dark:text-[#ffffff] hover:opacity-75 transition-opacity select-none text-center cursor-pointer focus:outline-none whitespace-nowrap"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              The Impart
            </button>
          </div>

          {/* Десктопний вибір рубрик (Новини / Статті / Огляди) по центру з жирнішим шрифтом */}
          <nav
            aria-label="Розділи сайту"
            className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-6 lg:gap-9 z-10 pointer-events-auto"
          >
            {NAV_SECTIONS.map((sec) => {
              const isActive = activeCategorySection === sec.id && !selectedArticleId && !activeSearchFilter;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => handleSelectSection(sec.id)}
                  className={`group relative py-1 text-sm md:text-[15px] transition-colors duration-250 cursor-pointer focus:outline-none ${
                    isActive
                      ? 'text-black dark:text-[#ffffff] font-bold tracking-normal'
                      : 'text-neutral-800 dark:text-[#cbcbcb] hover:text-black dark:hover:text-[#ffffff] font-semibold tracking-normal'
                  }`}
                >
                  <span className="relative z-10 transition-transform duration-200 inline-block group-hover:-translate-y-[0.5px]">
                    {siteLang === 'en' ? sec.titleEn : sec.titleUa}
                  </span>
                  {/* Мінімалістична лінія-підкреслення з плавною анімацією розширення */}
                  <span
                    className={`absolute bottom-0 left-0 h-[2px] bg-black dark:bg-[#ffffff] transition-all duration-300 ease-out ${
                      isActive ? 'w-full' : 'w-0 group-hover:w-full'
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          {/* Права сторона: кнопка пошуку та перемикач теми (доступний на всіх екранах) */}
          <div className="z-20 flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              aria-label={siteLang === 'en' ? 'Search' : 'Пошук'}
              className="text-black dark:text-[#cbcbcb] hover:opacity-60 active:scale-95 transition-all cursor-pointer focus:outline-none flex items-center justify-center w-10 h-10"
            >
              <Search className="w-5 h-5 stroke-[1.8]" />
            </button>

            {/* Перемикач теми: світла / темна тема */}
            <div className="flex items-center -mr-1 sm:-mr-2">
              <ThemeToggle
                theme={siteTheme}
                onToggle={toggleTheme}
                siteLang={siteLang}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Модальне вікно вибору рубрик: на весь екран, напівпрозоре з розмиттям, хрестик строго над кнопкою меню */}
      <RubricsModal
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        activeSection={activeCategorySection}
        onSelectSection={(sec) => {
          handleSelectSection(sec);
        }}
        siteLang={siteLang}
        onSwitchLang={handleSetLang}
        theme={siteTheme}
        onToggleTheme={toggleTheme}
        onOpenSearch={() => setIsSearchOpen(true)}
        onNavigateToPage={(slug) => navigateToPage(slug)}
      />

      {/* Центральна частина (Body) зі статтями та статичними сторінками */}
      <main className="flex-1 flex flex-col justify-between">
        <div className="w-full">
          {selectedArticle ? (
            <ArticleView
              article={selectedArticle}
              lang={siteLang}
              onBack={() => handleSelectArticle(null)}
              onSwitchLang={handleSetLang}
              onSelectTopic={handleSelectTopicFromArticle}
              onSelectCategory={handleSelectCategoryFromArticle}
            />
          ) : currentRoute === 'about' || currentRoute === 'contacts' ? (
            <StaticPageView
              page={staticPages[currentRoute]}
              lang={siteLang}
              socialLinks={socialLinks}
              onBack={() => navigateTo('main')}
              onSwitchLang={handleSetLang}
              onNavigateToPage={(slug) => navigateToPage(slug)}
            />
          ) : activeSearchFilter ? (
            /* Сторінка результатів пошуку (з пагінацією по 10 статей, без "показати більше") */
            <div
              key={`search_${activeSearchFilter.query}_${searchPage}`}
              className="w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto pt-2 sm:pt-3.5 pb-10 sm:pb-14 animate-article-fade-in"
            >
              {(() => {
                const totalSearchPages = Math.max(1, Math.ceil(searchResultsArticles.length / 10));
                const safeSearchPage = Math.min(Math.max(1, searchPage), totalSearchPages);
                const startIndex = (safeSearchPage - 1) * 10;
                const pageSearchArticles = searchResultsArticles.slice(startIndex, startIndex + 10);

                const sRow1 = pageSearchArticles.slice(0, 2);
                const sRow2 = pageSearchArticles.slice(2, 5);
                const sRow3 = pageSearchArticles.slice(5, 7);
                const sRow4 = pageSearchArticles.slice(7, 10);

                return (
                  <div>
                    {/* Заголовок результатів пошуку та кнопка скидання */}
                    <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-neutral-100 dark:border-[#333333] gap-4">
                      <div>
                        <h1
                          className="text-2xl sm:text-3xl font-medium tracking-tight text-black dark:text-[#ffffff]"
                          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                        >
                          {siteLang === 'en' ? 'Search Results' : 'Результати пошуку'}
                        </h1>
                        <p className="text-xs sm:text-sm text-neutral-500 dark:text-[#888888] mt-1.5 flex flex-wrap items-center gap-2">
                          <Search className="w-3.5 h-3.5 text-neutral-400 dark:text-[#777777] shrink-0" />
                          <span>
                            {siteLang === 'en' ? 'Query:' : 'Запит:'}{' '}
                            <strong className="text-black dark:text-[#ffffff] font-semibold">«{activeSearchFilter.query}»</strong>
                          </span>
                          <span className="text-neutral-300 dark:text-neutral-700">•</span>
                          <span>
                            {siteLang === 'en'
                              ? `${searchResultsArticles.length} ${
                                  searchResultsArticles.length === 1 ? 'article found' : 'articles found'
                                }`
                              : `Знайдено матеріалів: ${searchResultsArticles.length}`}
                          </span>
                          {hasSearchTypoMatches && (
                            <>
                              <span className="text-neutral-300 dark:text-neutral-700">•</span>
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-600 dark:text-[#a0a0a0] bg-neutral-100/90 dark:bg-[#1a1a1a] border border-neutral-200/70 dark:border-[#333333] px-2 py-0.5 rounded-full font-sans">
                                <Sparkles className="w-3 h-3 text-neutral-500 dark:text-[#888888]" />
                                <span>{siteLang === 'en' ? 'Typo-tolerant' : 'З урахуванням одруківок'}</span>
                              </span>
                            </>
                          )}
                          {totalSearchPages > 1 && (
                            <>
                              <span className="text-neutral-300 dark:text-neutral-700">•</span>
                              <span>
                                {siteLang === 'en'
                                  ? `Page ${safeSearchPage} of ${totalSearchPages}`
                                  : `Сторінка ${safeSearchPage} з ${totalSearchPages}`}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleResetSearch}
                        className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-neutral-600 dark:text-[#cbcbcb] hover:text-black dark:hover:text-white bg-neutral-50 dark:bg-[#1c1c1c] hover:bg-neutral-100 dark:hover:bg-[#252525] border border-neutral-200 dark:border-[#333333] px-3.5 py-2 rounded transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{siteLang === 'en' ? 'Reset search' : 'Скинути пошук'}</span>
                      </button>
                    </div>

                    {searchResultsArticles.length === 0 ? (
                      <div className="py-20 text-center max-w-md mx-auto">
                        <p className="text-neutral-400 dark:text-[#777777] font-serif italic text-lg sm:text-xl mb-2">
                          {siteLang === 'en'
                            ? 'No articles match your search query.'
                            : 'За вашим запитом не знайдено опублікованих статей.'}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-[#888888] mb-6 font-sans">
                          {siteLang === 'en'
                            ? 'Try searching with simpler or different keywords.'
                            : 'Спробуйте використати інші ключові слова або спростити запит.'}
                        </p>
                        <button
                          type="button"
                          onClick={handleResetSearch}
                          className="text-xs uppercase tracking-wider text-black dark:text-[#ffffff] underline underline-offset-4 cursor-pointer hover:opacity-75"
                        >
                          {siteLang === 'en' ? 'Return to all articles' : 'Повернутися до всіх статей'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-4 sm:space-y-6">
                          {/* Ряд 1: 2 горизонтальні фото (16:9) */}
                          {sRow1.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                              {sRow1.map((article) => (
                                <ArticleCard
                                  key={article.id}
                                  article={article}
                                  siteLang={siteLang}
                                  aspectRatio="16/9"
                                  onSelect={(id) => handleSelectArticle(id)}
                                />
                              ))}
                            </div>
                          )}

                          {/* Ряд 2: 3 вертикальні фото (3:4) */}
                          {sRow2.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-5">
                              {sRow2.map((article) => (
                                <ArticleCard
                                  key={article.id}
                                  article={article}
                                  siteLang={siteLang}
                                  aspectRatio="3/4"
                                  onSelect={(id) => handleSelectArticle(id)}
                                />
                              ))}
                            </div>
                          )}

                          {/* Ряд 3: 2 горизонтальні фото (16:9) */}
                          {sRow3.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                              {sRow3.map((article) => (
                                <ArticleCard
                                  key={article.id}
                                  article={article}
                                  siteLang={siteLang}
                                  aspectRatio="16/9"
                                  onSelect={(id) => handleSelectArticle(id)}
                                />
                              ))}
                            </div>
                          )}

                          {/* Ряд 4: 3 вертикальні фото (3:4) */}
                          {sRow4.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-5">
                              {sRow4.map((article) => (
                                <ArticleCard
                                  key={article.id}
                                  article={article}
                                  siteLang={siteLang}
                                  aspectRatio="3/4"
                                  onSelect={(id) => handleSelectArticle(id)}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Пагінація сторінок результатів пошуку (перемикання сторінок як у рубриках) */}
                        {totalSearchPages > 1 && (
                          <nav
                            aria-label="Нумерація сторінок результатів пошуку"
                            className="mt-12 sm:mt-16 pt-8 border-t border-neutral-100 dark:border-[#333333] flex items-center justify-center gap-2 sm:gap-3"
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectSearchPage(safeSearchPage - 1)}
                              disabled={safeSearchPage <= 1}
                              aria-label="Попередня сторінка"
                              className={`px-3 py-1.5 text-xs sm:text-sm tracking-wider transition-colors cursor-pointer focus:outline-none ${
                                safeSearchPage <= 1
                                  ? 'text-neutral-300 dark:text-neutral-700 cursor-not-allowed'
                                  : 'text-neutral-600 dark:text-[#cbcbcb] hover:text-black dark:hover:text-white'
                              }`}
                            >
                              ←
                            </button>

                            {Array.from({ length: totalSearchPages }, (_, i) => i + 1).map((p) => {
                              const isCurrent = p === safeSearchPage;
                              return (
                                <button
                                  key={`search-page-${p}`}
                                  type="button"
                                  onClick={() => handleSelectSearchPage(p)}
                                  aria-current={isCurrent ? 'page' : undefined}
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
                              onClick={() => handleSelectSearchPage(safeSearchPage + 1)}
                              disabled={safeSearchPage >= totalSearchPages}
                              aria-label="Наступна сторінка"
                              className={`px-3 py-1.5 text-xs sm:text-sm tracking-wider transition-colors cursor-pointer focus:outline-none ${
                                safeSearchPage >= totalSearchPages
                                  ? 'text-neutral-300 dark:text-neutral-700 cursor-not-allowed'
                                  : 'text-neutral-600 dark:text-[#cbcbcb] hover:text-black dark:hover:text-white'
                              }`}
                            >
                              →
                            </button>
                          </nav>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : activeCategorySection ? (
            /* Сторінка обраної рубрики (Новини / Статті / Огляди) */
            <div
              key={`cat_${activeCategorySection}_${categoryPage}`}
              className="w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto pt-2 sm:pt-3.5 pb-10 sm:pb-14 animate-article-fade-in"
            >
              {(() => {
                const categoryArticles = basePublishedArticles.filter((article) =>
                  matchesHeaderSection(article, activeCategorySection)
                );
                const totalCategoryPages = Math.max(1, Math.ceil(categoryArticles.length / 10));
                const safePage = Math.min(Math.max(1, categoryPage), totalCategoryPages);
                const startIndex = (safePage - 1) * 10;
                const pageArticles = categoryArticles.slice(startIndex, startIndex + 10);

                // Розмітка без великого фото згідно з вимогами:
                // Ряд 1: 2 горизонтальні (16:9)
                // Ряд 2: 3 вертикальні (3:4)
                // Ряд 3: 2 горизонтальні (16:9)
                // Ряд 4: 3 вертикальні (3:4)
                const catRow1 = pageArticles.slice(0, 2);
                const catRow2 = pageArticles.slice(2, 5);
                const catRow3 = pageArticles.slice(5, 7);
                const catRow4 = pageArticles.slice(7, 10);

                const sectionTitle =
                  siteLang === 'en'
                    ? activeCategorySection === 'news'
                      ? 'News'
                      : activeCategorySection === 'reviews'
                      ? 'Reviews'
                      : 'Articles'
                    : activeCategorySection === 'news'
                    ? 'Новини'
                    : activeCategorySection === 'reviews'
                    ? 'Огляди'
                    : 'Статті';

                return (
                  <div className="space-y-6 sm:space-y-8 animate-fade-in">
                    {/* Заголовок поточної рубрики */}
                    <div className="flex items-baseline justify-between border-b border-neutral-100 dark:border-[#333333] pb-3">
                      <div className="flex items-baseline gap-3">
                        <h1
                          className="text-2xl sm:text-3xl font-medium tracking-tight text-black dark:text-[#ffffff]"
                          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                        >
                          {sectionTitle}
                        </h1>
                        <span className="text-xs text-neutral-400 dark:text-[#777777] font-light tracking-wide">
                          {categoryArticles.length}{' '}
                          {siteLang === 'en'
                            ? categoryArticles.length === 1
                              ? 'material'
                              : 'materials'
                            : categoryArticles.length === 1
                            ? 'матеріал'
                            : [2, 3, 4].includes(categoryArticles.length % 10) &&
                              ![12, 13, 14].includes(categoryArticles.length % 100)
                            ? 'матеріали'
                            : 'матеріалів'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectSection(null)}
                        className="text-xs text-neutral-500 dark:text-[#888888] hover:text-black dark:hover:text-[#ffffff] transition-colors cursor-pointer underline underline-offset-4"
                      >
                        {siteLang === 'en' ? 'All materials' : 'Всі матеріали'}
                      </button>
                    </div>

                    {isLoading ? (
                      <div className="py-24 text-center">
                        <div className="inline-block w-5 h-5 border-2 border-neutral-300 dark:border-neutral-700 border-t-black dark:border-t-white rounded-full animate-spin" />
                      </div>
                    ) : categoryArticles.length === 0 ? (
                      <div className="py-24 text-center max-w-md mx-auto">
                        <p className="text-neutral-400 dark:text-[#777777] font-serif italic text-lg sm:text-xl mb-3">
                          {siteLang === 'en'
                            ? 'No articles published in this category yet.'
                            : 'У цій рубриці наразі немає опублікованих статей.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleSelectSection(null)}
                          className="text-xs uppercase tracking-widest text-black dark:text-[#ffffff] underline underline-offset-4 hover:opacity-70 transition-opacity cursor-pointer"
                        >
                          {siteLang === 'en' ? 'Return to all materials' : 'Повернутися до всіх матеріалів'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-4 sm:space-y-6">
                          {/* Ряд 1: 2 горизонтальні фото (16:9) */}
                          {catRow1.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                              {catRow1.map((article) => (
                                <ArticleCard
                                  key={article.id}
                                  article={article}
                                  siteLang={siteLang}
                                  aspectRatio="16/9"
                                  onSelect={(id) => handleSelectArticle(id)}
                                />
                              ))}
                            </div>
                          )}

                          {/* Ряд 2: 3 вертикальні фото (3:4) */}
                          {catRow2.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-5">
                              {catRow2.map((article) => (
                                <ArticleCard
                                  key={article.id}
                                  article={article}
                                  siteLang={siteLang}
                                  aspectRatio="3/4"
                                  onSelect={(id) => handleSelectArticle(id)}
                                />
                              ))}
                            </div>
                          )}

                          {/* Ряд 3: 2 горизонтальні фото (16:9) */}
                          {catRow3.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                              {catRow3.map((article) => (
                                <ArticleCard
                                  key={article.id}
                                  article={article}
                                  siteLang={siteLang}
                                  aspectRatio="16/9"
                                  onSelect={(id) => handleSelectArticle(id)}
                                />
                              ))}
                            </div>
                          )}

                          {/* Ряд 4: 3 вертикальні фото (3:4) */}
                          {catRow4.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-5">
                              {catRow4.map((article) => (
                                <ArticleCard
                                  key={article.id}
                                  article={article}
                                  siteLang={siteLang}
                                  aspectRatio="3/4"
                                  onSelect={(id) => handleSelectArticle(id)}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Нумерація сторінок (якщо статей у цій рубриці більше 10) */}
                        {totalCategoryPages > 1 && (
                          <nav
                            aria-label="Нумерація сторінок"
                            className="mt-12 sm:mt-16 pt-8 border-t border-neutral-100 dark:border-[#333333] flex items-center justify-center gap-2 sm:gap-3"
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectCategoryPage(safePage - 1)}
                              disabled={safePage <= 1}
                              aria-label="Попередня сторінка"
                              className={`px-3 py-1.5 text-xs sm:text-sm tracking-wider transition-colors cursor-pointer focus:outline-none ${
                                safePage <= 1
                                  ? 'text-neutral-300 dark:text-neutral-700 cursor-not-allowed'
                                  : 'text-neutral-600 dark:text-[#cbcbcb] hover:text-black dark:hover:text-white'
                              }`}
                            >
                              ←
                            </button>

                            {Array.from({ length: totalCategoryPages }, (_, i) => i + 1).map((p) => {
                              const isCurrent = p === safePage;
                              return (
                                <button
                                  key={`cat-page-${p}`}
                                  type="button"
                                  onClick={() => handleSelectCategoryPage(p)}
                                  aria-current={isCurrent ? 'page' : undefined}
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
                              onClick={() => handleSelectCategoryPage(safePage + 1)}
                              disabled={safePage >= totalCategoryPages}
                              aria-label="Наступна сторінка"
                              className={`px-3 py-1.5 text-xs sm:text-sm tracking-wider transition-colors cursor-pointer focus:outline-none ${
                                safePage >= totalCategoryPages
                                  ? 'text-neutral-300 dark:text-neutral-700 cursor-not-allowed'
                                  : 'text-neutral-600 dark:text-[#cbcbcb] hover:text-black dark:hover:text-white'
                              }`}
                            >
                              →
                            </button>
                          </nav>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto pt-2 sm:pt-3.5 pb-10 sm:pb-14">
              {isLoading ? (
                <div className="py-24 text-center">
                  <div className="inline-block w-5 h-5 border-2 border-neutral-300 border-t-black rounded-full animate-spin" />
                </div>
              ) : basePublishedArticles.length === 0 ? (
                <div className="py-24 text-center max-w-md mx-auto">
                  <p className="text-neutral-400 font-serif italic text-lg sm:text-xl mb-2">
                    {siteLang === 'en'
                      ? 'No articles published in English yet.'
                      : 'У базі даних наразі немає опублікованих статей.'}
                  </p>
                  <p className="text-xs text-neutral-400 font-sans">
                    {siteLang === 'en' ? (
                      <button
                        onClick={() => handleSetLang('ua')}
                        className="text-black underline underline-offset-4 cursor-pointer hover:opacity-75"
                      >
                        Switch to Ukrainian version to read materials.
                      </button>
                    ) : (
                      'Створюйте та публікуйте матеріали через панель адміністратора.'
                    )}
                  </p>
                </div>
              ) : (
                <div className="space-y-4 sm:space-y-6 animate-article-fade-in">
                  {(() => {
                    const visibleArticles = basePublishedArticles.slice(0, visibleCount);

                    // 1. Перші 10 статей мають чітку розмітку за вимогами:
                    // - Ряд 1: 1 велике фото 21:9
                    // - Ряд 2: 2 фото горизонтального формату (16:9)
                    // - Ряд 3: 3 фото вертикального формату (3:4)
                    // - Ряд 4: 2 фото горизонтального формату (16:9)
                    // - Ряд 5: 2 фото горизонтального формату (16:9)
                    const initial10 = visibleArticles.slice(0, 10);
                    const row1 = initial10.slice(0, 1);
                    const row2 = initial10.slice(1, 3);
                    const row3 = initial10.slice(3, 6);
                    const row4 = initial10.slice(6, 8);
                    const row5 = initial10.slice(8, 10);

                    // 2. Наступні статті (10 і далі):
                    // Чередуються між собою: спочатку 3 вертикальних, потім 2 горизонтальних, і так далі
                    const subsequent = visibleArticles.slice(10);
                    const subsequentRows: { type: 'vertical' | 'horizontal'; articles: Article[] }[] = [];
                    let subIdx = 0;
                    let isVertical = true;

                    while (subIdx < subsequent.length) {
                      const count = isVertical ? 3 : 2;
                      const chunk = subsequent.slice(subIdx, subIdx + count);
                      subsequentRows.push({
                        type: isVertical ? 'vertical' : 'horizontal',
                        articles: chunk,
                      });
                      subIdx += count;
                      isVertical = !isVertical;
                    }

                    return (
                      <>
                        {/* Ряд 1: 1 велике фото горизонтального формату 26 на 10.5 */}
                        {row1.length > 0 && (
                          <div>
                            {row1.map((article) => (
                              <ArticleCard
                                key={article.id}
                                article={article}
                                siteLang={siteLang}
                                aspectRatio="26/10.5"
                                isHero
                                onSelect={(id) => handleSelectArticle(id)}
                              />
                            ))}
                          </div>
                        )}

                        {/* Ряд 2: 2 фото горизонтального формату */}
                        {row2.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                            {row2.map((article) => (
                              <ArticleCard
                                key={article.id}
                                article={article}
                                siteLang={siteLang}
                                aspectRatio="16/9"
                                onSelect={(id) => handleSelectArticle(id)}
                              />
                            ))}
                          </div>
                        )}

                        {/* Ряд 3: 3 фото вертикального формату */}
                        {row3.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-5">
                            {row3.map((article) => (
                              <ArticleCard
                                key={article.id}
                                article={article}
                                siteLang={siteLang}
                                aspectRatio="3/4"
                                onSelect={(id) => handleSelectArticle(id)}
                              />
                            ))}
                          </div>
                        )}

                        {/* Ряд 4: 2 фото горизонтального формату */}
                        {row4.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                            {row4.map((article) => (
                              <ArticleCard
                                key={article.id}
                                article={article}
                                siteLang={siteLang}
                                aspectRatio="16/9"
                                onSelect={(id) => handleSelectArticle(id)}
                              />
                            ))}
                          </div>
                        )}

                        {/* Ряд 5: 2 фото горизонтального формату */}
                        {row5.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                            {row5.map((article) => (
                              <ArticleCard
                                key={article.id}
                                article={article}
                                siteLang={siteLang}
                                aspectRatio="16/9"
                                onSelect={(id) => handleSelectArticle(id)}
                              />
                            ))}
                          </div>
                        )}

                        {/* Наступні статті (10+): чередування 3 вертикальних і 2 горизонтальних */}
                        {subsequentRows.map((row, rIdx) => {
                          if (row.type === 'vertical') {
                            return (
                              <div
                                key={`sub_vert_${rIdx}`}
                                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-5"
                              >
                                {row.articles.map((article) => (
                                  <ArticleCard
                                    key={article.id}
                                    article={article}
                                    siteLang={siteLang}
                                    aspectRatio="3/4"
                                    onSelect={(id) => handleSelectArticle(id)}
                                  />
                                ))}
                              </div>
                            );
                          }
                          return (
                            <div
                              key={`sub_horiz_${rIdx}`}
                              className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5"
                            >
                              {row.articles.map((article) => (
                                <ArticleCard
                                  key={article.id}
                                  article={article}
                                  siteLang={siteLang}
                                  aspectRatio="16/9"
                                  onSelect={(id) => handleSelectArticle(id)}
                                />
                              ))}
                            </div>
                          );
                        })}

                        {/* Ексклюзивна для головної сторінки функція "Показати більше" з виразним жирнішим шрифтом */}
                        {basePublishedArticles.length > visibleCount && (
                          <div className="pt-10 sm:pt-14 pb-4 flex flex-col items-center justify-center">
                            <button
                              type="button"
                              onClick={() => setVisibleCount((prev) => prev + 10)}
                              className="group relative inline-flex items-center gap-2.5 py-2.5 px-3 text-xs sm:text-[13px] tracking-[0.16em] uppercase font-semibold text-neutral-800 dark:text-[#cbcbcb] hover:text-black dark:hover:text-[#ffffff] transition-colors duration-300 cursor-pointer focus:outline-none"
                              aria-label={siteLang === 'en' ? 'Show more articles' : 'Показати більше статей'}
                            >
                              <span className="font-semibold">{siteLang === 'en' ? 'Show more' : 'Показати більше'}</span>
                              <span className="text-neutral-600 dark:text-[#999999] group-hover:text-black dark:group-hover:text-[#ffffff] group-hover:translate-y-0.5 transition-all duration-300 text-sm font-bold">
                                ↓
                              </span>
                              {/* Тонка мінімалістична лінія знизу, що змінюється при наведенні */}
                              <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-neutral-300 dark:bg-[#444444] group-hover:bg-black dark:group-hover:bg-[#ffffff] transition-colors duration-300" />
                            </button>
                            <span className="mt-2 text-[11px] text-neutral-500 dark:text-[#777777] font-medium tracking-wide">
                              {Math.min(visibleCount, basePublishedArticles.length)} {siteLang === 'en' ? 'of' : 'з'}{' '}
                              {basePublishedArticles.length}
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Градієнтний блок-розділювач у нижній частині body для м'якого переходу до футера */}
        <div className="w-full h-16 sm:h-24 bg-gradient-to-b from-white to-neutral-100 dark:from-[#222222] dark:to-[#111111] mt-8 sm:mt-12 transition-colors duration-200 pointer-events-none select-none" />
      </main>

      {/* Футер: дуже темно-сірий майже чорний HEX #111 без лінії розділення */}
      <footer className="site-footer w-full bg-white dark:bg-[#111111] py-10 sm:py-12 border-none transition-colors duration-200">
        <div className="w-[92%] sm:w-[90%] md:w-[calc(26/34*100%)] mx-auto flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="flex flex-col items-start">
            <span className="text-base sm:text-lg font-normal tracking-normal text-black dark:text-[#ffffff] font-sans select-none">
              The Impart
            </span>
            <p className="text-xs text-neutral-400 dark:text-[#777777] mt-1">
              {siteLang === 'en'
                ? 'A knowledge space for tech and culture.'
                : 'Простір знань про технології та культуру.'}
            </p>

            {/* Посилання на сторінки "Про проєкт" та "Контакти" */}
            <div className="mt-2.5 flex items-center gap-3 text-xs font-sans">
              <button
                type="button"
                onClick={() => navigateToPage('about')}
                className="text-neutral-500 dark:text-[#999999] hover:text-black dark:hover:text-[#ffffff] transition-colors cursor-pointer underline-offset-4 hover:underline"
              >
                {siteLang === 'en' ? 'About Project' : 'Про проєкт'}
              </button>
              <span className="text-neutral-300 dark:text-neutral-700">•</span>
              <button
                type="button"
                onClick={() => navigateToPage('contacts')}
                className="text-neutral-500 dark:text-[#999999] hover:text-black dark:hover:text-[#ffffff] transition-colors cursor-pointer underline-offset-4 hover:underline"
              >
                {siteLang === 'en' ? 'Contacts' : 'Контакти'}
              </button>
            </div>

            <div className="mt-3.5 flex items-center gap-4 text-neutral-400 dark:text-[#888888]">
              {/* Telegram */}
              {socialLinks[siteLang]?.telegram && (
                <a
                  href={socialLinks[siteLang].telegram}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Telegram"
                  className="footer-social-link text-neutral-400 dark:text-[#888888] hover:text-black dark:hover:text-[#ffffff] transition-colors duration-200"
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M21.927 3.513a1.498 1.498 0 0 0-1.505-.288L2.348 10.38c-1.048.423-1.042 1.34-.191 1.602l4.639 1.448 10.741-6.777c.507-.308.972-.143.59.196l-8.704 7.854-.319 4.768c.467 0 .673-.214.935-.467l2.247-2.185 4.675 3.453c.861.475 1.482.23 1.696-.8l3.068-14.457c.314-1.26-.481-1.831-1.308-1.442z" />
                  </svg>
                </a>
              )}

              {/* Instagram */}
              {socialLinks[siteLang]?.instagram && (
                <a
                  href={socialLinks[siteLang].instagram}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  className="footer-social-link text-neutral-400 dark:text-[#888888] hover:text-black dark:hover:text-[#ffffff] transition-colors duration-200"
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>
              )}

              {/* X (formerly Twitter) */}
              {socialLinks[siteLang]?.x && (
                <a
                  href={socialLinks[siteLang].x}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="X (Twitter)"
                  className="footer-social-link text-neutral-400 dark:text-[#888888] hover:text-black dark:hover:text-[#ffffff] transition-colors duration-200"
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              )}

              {/* YouTube */}
              {socialLinks[siteLang]?.youtube && (
                <a
                  href={socialLinks[siteLang].youtube}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="YouTube"
                  className="footer-social-link text-neutral-400 dark:text-[#888888] hover:text-black dark:hover:text-[#ffffff] transition-colors duration-200"
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </a>
              )}

              {/* Threads */}
              {socialLinks[siteLang]?.threads && (
                <a
                  href={socialLinks[siteLang].threads}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Threads"
                  className="footer-social-link text-neutral-400 dark:text-[#888888] hover:text-black dark:hover:text-[#ffffff] transition-colors duration-200"
                >
                  <svg className="w-5 h-5 fill-none stroke-current stroke-[1.8] stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                    <path d="M19.25 12c0 4.5-3.25 8.25-8 8.25-4.5 0-7.75-3.5-7.75-8.25S6.75 3.75 12 3.75c4.75 0 7.5 3 7.75 7.25M16 11.25c0 3-1.75 4.5-4 4.5s-3.75-1.5-3.75-3.75S9.75 8.25 12 8.25c2.75 0 4 2 4 4.5v1.25c0 1.5-.75 2.5-2 2.5s-2-.75-2-2.25" />
                  </svg>
                </a>
              )}
            </div>
          </div>

          {/* Права частина футера: Перемикач теми, перемикач мови UA / EN та копірайт */}
          <div className="flex flex-col sm:items-end gap-3">
            <div className="flex items-center gap-3 text-xs tracking-wider font-sans select-none">
              <ThemeToggle
                theme={siteTheme}
                onToggle={toggleTheme}
                siteLang={siteLang}
                className="w-8 h-8"
              />
              <span className="text-neutral-300 dark:text-neutral-700">|</span>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => handleSetLang('ua')}
                  className={`py-1 transition-colors cursor-pointer ${
                    siteLang === 'ua'
                      ? 'font-medium text-black dark:text-[#ffffff]'
                      : 'text-neutral-400 dark:text-[#777777] hover:text-black dark:hover:text-[#ffffff]'
                  }`}
                  title="Українська версія"
                >
                  UA
                </button>
                <span className="mx-2 text-neutral-300 dark:text-neutral-700">/</span>
                <button
                  type="button"
                  onClick={() => handleSetLang('en')}
                  className={`py-1 transition-colors cursor-pointer ${
                    siteLang === 'en'
                      ? 'font-medium text-black dark:text-[#ffffff]'
                      : 'text-neutral-400 dark:text-[#777777] hover:text-black dark:hover:text-[#ffffff]'
                  }`}
                  title="English version"
                >
                  EN
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-neutral-400 dark:text-[#777777] font-sans">
              <span>© {new Date().getFullYear()} The Impart. All rights reserved.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
