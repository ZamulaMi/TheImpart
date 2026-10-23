export interface CategoryItem {
  id: string;
  name: string;
  nameEn?: string;
}

export interface TopicItem {
  id: string;
  name: string;
  nameEn?: string;
}

export interface TaxonomiesData {
  categories: CategoryItem[];
  topics: TopicItem[];
}

export interface NavigationCategory {
  id: string;
  slug: string;
  name: string;
  nameEn?: string;
  rubrics: string[]; // назви рубрик (categories), прив'язані до цієї категорії
  rubricsEn?: string[];
  topics: string[]; // назви тем (topics), прив'язані до цієї категорії
  topicsEn?: string[];
  order?: number;
}

export interface Article {
  id: string;
  // Українська версія (основна)
  title: string;
  excerpt: string;
  showExcerptInArticle?: boolean; // Відображати або не відображати короткий опис безпосередньо у статті (за замовчуванням true)
  content: string;
  category: string;
  categories?: string[]; // Рубрики статті (UA) - можливість призначити декілька рубрик
  topics?: string[]; // Теми / теги статті (UA)
  author: string;
  coverImage?: string;
  date: string;
  readTime?: string;
  createdAt?: string;
  updatedAt?: string; // Дата останнього редагування (відображається виключно в адмін-панелі)
  published: boolean; // Опубліковано для української версії сайту
  views?: number; // Загальна кількість переглядів статті

  // Англійська версія
  titleEn?: string;
  excerptEn?: string;
  showExcerptInArticleEn?: boolean; // Відображати короткий опис безпосередньо у статті для англійської версії
  contentEn?: string;
  categoryEn?: string;
  categoriesEn?: string[]; // Рубрики статті (EN) - можливість призначити декілька рубрик
  topicsEn?: string[]; // Теми / теги статті (EN)
  publishedEn?: boolean; // Опубліковано для англійської версії сайту
}

export interface StatsConfig {
  thresholdSeconds: number;
}

export interface ArticleStatsSummaryItem {
  id: string;
  title: string;
  titleEn?: string;
  category: string;
  categories?: string[];
  topics?: string[];
  author?: string;
  coverImage?: string;
  published: boolean;
  publishedEn?: boolean;
  date: string;
  createdAt?: string;
  viewsInPeriod: number;
  totalViews: number;
  durationSecondsInPeriod: number;
  avgDurationSecondsInPeriod: number;
  totalDurationSeconds: number;
}

export interface StatsTimeSeriesPoint {
  date: string;
  label: string;
  views: number;
  durationSeconds: number;
}

export interface StatsSummaryResponse {
  config: StatsConfig;
  period: 'day' | 'week' | 'month' | '3months' | 'halfyear' | 'year' | 'all';
  year?: number;
  summary: {
    totalViews: number;
    totalDurationSeconds: number;
    avgDurationSeconds: number;
    articlesCount: number;
  };
  timeSeries: StatsTimeSeriesPoint[];
  articles: ArticleStatsSummaryItem[];
}

export type UserRole = 'admin' | 'editor';

export type SiteTheme = 'light' | 'dark';

export interface AuthUser {
  username: string;
  displayName: string;
  role: UserRole;
  isCustom?: boolean;
}

export interface EditorAccount {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  isActive: boolean;
  lastLogin?: string;
}

export interface ArticleDraft {
  id: string;
  type: 'new' | 'update';
  articleId?: string;
  originalArticleTitle?: string;
  authorUsername: string;
  authorDisplayName: string;
  articleData: Article;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  moderatorNote?: string;
}

export type SiteLanguage = 'ua' | 'en';

export interface SocialLinksSet {
  telegram?: string;
  instagram?: string;
  x?: string;
  youtube?: string;
  threads?: string;
  facebook?: string;
}

export interface SiteSocialLinks {
  ua: SocialLinksSet;
  en: SocialLinksSet;
}

export const DEFAULT_SOCIAL_LINKS: SiteSocialLinks = {
  ua: {
    telegram: 'https://t.me/impart',
    instagram: 'https://instagram.com/impart',
    x: 'https://x.com/impart_ua',
    youtube: 'https://youtube.com/@impart_ua',
    threads: 'https://threads.net/@impart_ua',
    facebook: 'https://facebook.com/impart',
  },
  en: {
    telegram: 'https://t.me/impart_en',
    instagram: 'https://instagram.com/impart_en',
    x: 'https://x.com/impart_en',
    youtube: 'https://youtube.com/@impart_en',
    threads: 'https://threads.net/@impart_en',
    facebook: 'https://facebook.com/impart_en',
  },
};

export type StaticPageId = 'about' | 'contacts';

export interface StaticPageData {
  id: StaticPageId;
  slug: string;
  title: string;
  titleEn: string;
  content: string;
  contentEn: string;
  updatedAt?: string;
}

export interface SitePagesData {
  about: StaticPageData;
  contacts: StaticPageData;
}

export const DEFAULT_PAGES_DATA: SitePagesData = {
  about: {
    id: 'about',
    slug: 'about',
    title: 'Про проєкт',
    titleEn: 'About the Project',
    content: `**The Impart** — це незалежний простір знань про технології та культуру. Ми досліджуємо, як цифрові трансформації змінюють мислення людини, естетику навколишнього світу та структуру сучасного суспільства.

### Наша місія
Замість інформаційного шуму та поверхневих сенсацій ми обираємо глибину, уважність і естетичну точність. Наше завдання — створювати осмислений простір для тих, хто прагне розуміти глибинні процеси технологічного та культурного розвитку.

### Ключові напрями
- **Технології та майбутнє:** Штучний інтелект, цифрова етика, еволюція взаємодії людини та машини.
- **Культура та естетика:** Сучасне мистецтво, архітектура, візуальні медіа та нові форми вираження.
- **Філософія та споглядання:** Усвідомленість у цифровому віці, повільне читання та критичне мислення.

Ми публікуємо аналітичні статті, глибокі огляди, інтерв'ю та есе провідних авторів.`,
    contentEn: `**The Impart** is an independent knowledge space for technology and culture. We explore how digital transformations shape human consciousness, aesthetic environments, and contemporary society.

### Our Mission
Rather than chasing algorithmic noise and surface-level headlines, we choose depth, mindfulness, and aesthetic clarity. Our purpose is to build a thoughtful space for those who seek to understand the foundational currents of tech and culture.

### Core Focus Areas
- **Technology & Futures:** Artificial intelligence, digital ethics, and the evolution of human-machine interaction.
- **Culture & Aesthetics:** Contemporary art, architecture, visual media, and emerging creative forms.
- **Philosophy & Reflection:** Mindfulness in the digital era, slow reading, and critical contemplation.

We curate insightful essays, in-depth reviews, and commentary from forward-thinking thinkers and practitioners.`,
    updatedAt: new Date().toISOString(),
  },
  contacts: {
    id: 'contacts',
    slug: 'contacts',
    title: 'Контакти',
    titleEn: 'Contacts',
    content: `### Редакція та комунікація
Ми завжди раді співпраці з авторами, дослідниками, дизайнерами та культурними діячами. Якщо ви маєте ідею для матеріалу, коментар або відгук — напишіть нам.

- **Загальні запитання:** contact@theimpart.com
- **Редакція та пропозиції статей:** editorial@theimpart.com
- **Співпраця та партнерства:** partners@theimpart.com
- **Преса та медіа-запити:** press@theimpart.com

### Офіційні спільноти
Слідкуйте за нашими публікаціями, анонсами та ексклюзивними матеріалами в офіційних каналах проєкту:
- **Telegram:** @impart
- **Instagram:** @impart
- **X (Twitter):** @impart_ua
- **Threads:** @impart_ua

### Формат роботи
Редакція працює у розподіленому форматі (Київ / віддалено). Ми відповідаємо на всі листи протягом 1-2 робочих днів.`,
    contentEn: `### Editorial & Inquiries
We welcome collaborations with writers, researchers, designers, and cultural thinkers. If you have an editorial pitch, inquiry, or feedback — feel free to reach out.

- **General inquiries:** contact@theimpart.com
- **Editorial pitches:** editorial@theimpart.com
- **Partnerships:** partners@theimpart.com
- **Press & media:** press@theimpart.com

### Official Channels
Follow our publications, announcements, and featured essays across our platforms:
- **Telegram:** @impart_en
- **Instagram:** @impart_en
- **X (Twitter):** @impart_en
- **Threads:** @impart_en

### Operating Format
Our team works remotely with roots in Kyiv, Ukraine. We aim to respond to all editorial inquiries within 1–2 business days.`,
    updatedAt: new Date().toISOString(),
  },
};

