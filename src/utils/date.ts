import type { SiteLanguage } from '../types.ts';

/**
 * Форматує час публікації матеріалу відповідно до мови сайту:
 * - Якщо минуло менше 7 днів: показує скільки часу минуло ("щойно" / "just now", "15 хв тому" / "15 min ago", "2 год тому" / "2 hours ago", "вчора" / "yesterday", "3 дні тому" / "3 days ago").
 * - Якщо минуло 7 днів або більше: показує календарну дату на відповідній мові ("22 вересня 2026" / "September 22, 2026").
 */
export function formatTimeAgoOrDate(
  createdAt?: string,
  dateStr?: string,
  id?: string,
  lang: SiteLanguage = 'ua'
): string {
  let targetDate: Date | null = null;

  // 1. Спроба взяти точний timestamp з createdAt (з бази даних)
  if (createdAt) {
    const parsed = new Date(createdAt);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    }
  }

  // 2. Спроба взяти timestamp з id (якщо id згенеровано через Date.now())
  if (!targetDate && id && /^\d{12,14}$/.test(id)) {
    const timestamp = parseInt(id, 10);
    const parsed = new Date(timestamp);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    }
  }

  // 3. Спроба розпарсити dateStr
  if (!targetDate && dateStr) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    }
  }

  // Якщо не вдалося визначити дату, повертаємо початковий рядок
  if (!targetDate) {
    return dateStr || '';
  }

  const now = new Date();
  const diffMs = now.getTime() - targetDate.getTime();

  // До 1 хвилини
  if (diffMs <= 60 * 1000) {
    return lang === 'en' ? 'just now' : 'щойно';
  }

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  // Менше 60 хвилин
  if (diffMinutes < 60) {
    if (lang === 'en') {
      return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
    }
    return `${diffMinutes} ${getPluralUkrainian(diffMinutes, 'хвилину', 'хвилини', 'хвилин')} тому`;
  }

  // Менше 24 годин
  if (diffHours < 24) {
    if (lang === 'en') {
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    }
    return `${diffHours} ${getPluralUkrainian(diffHours, 'годину', 'години', 'годин')} тому`;
  }

  // Менше 7 днів (до тижня)
  if (diffDays < 7) {
    if (diffDays === 1) return lang === 'en' ? 'yesterday' : 'вчора';
    if (lang === 'en') return `${diffDays} days ago`;
    return `${diffDays} ${getPluralUkrainian(diffDays, 'день', 'дні', 'днів')} тому`;
  }

  // Більше або дорівнює тижню: показуємо календарну дату
  if (lang === 'en') {
    return targetDate.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  return targetDate.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getPluralUkrainian(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) {
    return many;
  }
  if (mod10 === 1) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return few;
  }
  return many;
}

/**
 * Отримує надійний таймстемп дати первинного створення статті для стабільного хронологічного сортування.
 * Пріоритет:
 * 1. a.createdAt (ISO рядок з точним часом створення)
 * 2. timestamp з числового id (якщо id згенеровано через Date.now())
 * 3. розпарсена дата з a.date
 */
export function getArticleCreationTimestamp(a: { createdAt?: string; id?: string; date?: string }): number {
  if (a.createdAt) {
    const t = new Date(a.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (a.id && /^\d{12,14}$/.test(String(a.id))) {
    const t = parseInt(String(a.id), 10);
    if (!isNaN(t) && t > 0) return t;
  }
  if (a.date) {
    const t = new Date(a.date).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return 0;
}

/**
 * Сортує масив статей строго хронологічно за первинною датою створення (найновіші спочатку).
 * Завдяки цьому редагування будь-яких полів статті НІКОЛИ не призводить до зсуву статті в хронології.
 */
export function sortArticlesChronologically<T extends { createdAt?: string; id: string; date?: string }>(articles: T[]): T[] {
  return [...articles].sort((a, b) => {
    const timeA = getArticleCreationTimestamp(a);
    const timeB = getArticleCreationTimestamp(b);
    if (timeB !== timeA) return timeB - timeA;
    return String(b.id).localeCompare(String(a.id));
  });
}

