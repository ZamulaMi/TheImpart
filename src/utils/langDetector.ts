import { SiteLanguage } from '../types';

export const LANG_STORAGE_KEY = 'the_impart_lang_v1';

// Список 15 країн колишнього СРСР (ISO коди)
export const POST_SOVIET_COUNTRY_CODES = new Set([
  'UA', // Україна
  'KZ', // Казахстан
  'UZ', // Узбекистан
  'GE', // Грузія
  'AZ', // Азербайджан
  'AM', // Вірменія
  'MD', // Молдова
  'KG', // Киргизстан
  'TJ', // Таджикистан
  'TM', // Туркменістан
  'BY', // Білорусь
  'LT', // Литва
  'LV', // Латвія
  'EE', // Естонія
  'RU', // Росія
]);

// Список часових поясів IANA для країн колишнього СРСР
export const POST_SOVIET_TIMEZONES = new Set([
  // Україна
  'europe/kyiv',
  'europe/kiev',
  'europe/uzhgorod',
  'europe/zaporozhye',
  'europe/simferopol',
  // Молдова
  'europe/chisinau',
  'europe/tiraspol',
  // Білорусь
  'europe/minsk',
  // Країни Балтії
  'europe/vilnius',
  'europe/riga',
  'europe/tallinn',
  // Кавказ
  'asia/tbilisi',
  'asia/yerevan',
  'asia/baku',
  // Центральна Азія
  'asia/almaty',
  'asia/qyzylorda',
  'asia/kyzylorda',
  'asia/qostanay',
  'asia/kostanay',
  'asia/aqtobe',
  'asia/aktau',
  'asia/aqtau',
  'asia/oral',
  'asia/atyrau',
  'asia/tashkent',
  'asia/samarkand',
  'asia/bishkek',
  'asia/dushanbe',
  'asia/ashgabat',
  'asia/ashkhabad',
  // Росія
  'europe/kaliningrad',
  'europe/moscow',
  'europe/kirov',
  'europe/astrakhan',
  'europe/volgograd',
  'europe/saratov',
  'europe/ulyanovsk',
  'europe/samara',
  'asia/yekaterinburg',
  'asia/omsk',
  'asia/novosibirsk',
  'asia/barnaul',
  'asia/tomsk',
  'asia/novokuznetsk',
  'asia/krasnoyarsk',
  'asia/irkutsk',
  'asia/chita',
  'asia/yakutsk',
  'asia/khandyga',
  'asia/vladivostok',
  'asia/ust-nera',
  'asia/magadan',
  'asia/sakhalin',
  'asia/srednekolymsk',
  'asia/kamchatka',
  'asia/anadyr',
  'w-su',
]);

/**
 * Перевіряє, чи налаштована в браузері українська чи російська мова
 */
export function isBrowserUkOrRu(): boolean {
  if (typeof navigator === 'undefined') return false;

  const rawLangs =
    Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language || ''];

  return rawLangs.some((lang) => {
    if (!lang || typeof lang !== 'string') return false;
    const lower = lang.trim().toLowerCase();
    return (
      lower.startsWith('uk') ||
      lower.startsWith('ua') ||
      lower.startsWith('ru') ||
      lower.startsWith('be')
    );
  });
}

/**
 * Перевіряє, чи перебуває користувач у часовому поясі країн колишнього СРСР
 */
export function isPostSovietTimezone(): boolean {
  if (typeof Intl === 'undefined' || !Intl.DateTimeFormat) return false;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return false;
    return POST_SOVIET_TIMEZONES.has(tz.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Перевіряє явний мовний параметр у URL (?lang=en або ?lang=uk / ?lang=ua),
 * щоб канонічні двомовні посилання відкривалися відповідною мовою.
 */
export function getUrlRequestedSiteLanguage(): SiteLanguage | null {
  if (typeof window === 'undefined' || !window.location?.search) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('lang')?.trim().toLowerCase();
    if (raw === 'en') return 'en';
    if (raw === 'uk' || raw === 'ua') return 'ua';
  } catch {}
  return null;
}

/**
 * Синхронне визначення початкової мови при першому завантаженні сторінки:
 * - Якщо в URL явно передано ?lang=en або ?lang=uk|ua — повертає вказану мову.
 * - Якщо збережено вибір у localStorage — повертає його.
 * - Якщо мова браузера українська чи російська — повертає 'ua'.
 * - Якщо часовий пояс належить країні колишнього СРСР — повертає 'ua'.
 * - У всіх інших випадках (інша країна та інша мова) — повертає 'en'.
 */
export function getInitialSiteLanguage(): SiteLanguage {
  const urlLang = getUrlRequestedSiteLanguage();
  if (urlLang) {
    return urlLang;
  }

  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === 'en' || saved === 'ua') {
        return saved;
      }
    } catch {}
  }

  // 1. Мова браузера українська або російська
  if (isBrowserUkOrRu()) {
    return 'ua';
  }

  // 2. Територія країн колишнього СРСР (за часовим поясом)
  if (isPostSovietTimezone()) {
    return 'ua';
  }

  // 3. Інша країна та мова браузера відмінна від uk/ru -> англійська
  return 'en';
}

/**
 * Асинхронне уточнення геопозиції (наприклад, через IP / заголовки сервера)
 * для першого відвідування, якщо в localStorage ще не було явного збереження.
 */
export async function refineInitialLanguageViaGeo(
  currentLang: SiteLanguage,
  onLanguageResolved: (lang: SiteLanguage) => void
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // Якщо мова явно задана у параметрі URL (?lang=...) — не перезаписуємо її геолокацією
    if (getUrlRequestedSiteLanguage()) return;

    // Якщо користувач уже має збережений вибір — не змінюємо
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'ua') return;

    // Якщо браузер українською чи російською — уже гарантовано 'ua'
    if (isBrowserUkOrRu()) {
      localStorage.setItem(LANG_STORAGE_KEY, 'ua');
      return;
    }

    // Запит до локального API сервера з таймаутом
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch('/api/geo', {
      signal: controller.signal,
      cache: 'no-store',
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === 'object') {
        if (data.isPostSoviet === true && currentLang !== 'ua') {
          onLanguageResolved('ua');
          localStorage.setItem(LANG_STORAGE_KEY, 'ua');
          return;
        } else if (data.isPostSoviet === false && !isBrowserUkOrRu() && currentLang !== 'en') {
          onLanguageResolved('en');
          localStorage.setItem(LANG_STORAGE_KEY, 'en');
          return;
        }
      }
    }

    // Зберігаємо початково визначену мову, щоб не запитувати щоразу
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  } catch {}
}
