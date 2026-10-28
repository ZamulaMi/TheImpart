/**
 * Утиліти для форматування статистики, переглядів та часу читання
 */

/**
 * Отримує правильну форму українського слова "перегляд" залежно від числа
 * 1 перегляд, 2..4 перегляди, 5..20 переглядів, 21 перегляд, 22..24 перегляди тощо
 */
export function getUkrainianViewPlural(count: number): string {
  const abs = Math.abs(Math.floor(count));
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod100 >= 11 && mod100 <= 19) {
    return 'переглядів';
  }
  if (mod10 === 1) {
    return 'перегляд';
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return 'перегляди';
  }
  return 'переглядів';
}

/**
 * Форматує кількість переглядів з відповідним словом
 */
export function formatViews(count: number | undefined, isEn: boolean = false): string {
  const n = count ?? 0;
  const formattedNum = n.toLocaleString(isEn ? 'en-US' : 'uk-UA');

  if (isEn) {
    return `${formattedNum} ${n === 1 ? 'view' : 'views'}`;
  }
  return `${formattedNum} ${getUkrainianViewPlural(n)}`;
}

/**
 * Форматує тривалість часу в зрозумілий для читача вигляд
 * Наприклад: "45 с", "3 хв 20 с", "1 год 15 хв"
 */
export function formatDuration(seconds: number | undefined, isEn: boolean = false): string {
  const totalSec = Math.max(0, Math.floor(seconds ?? 0));

  if (totalSec < 60) {
    return isEn ? `${totalSec}s` : `${totalSec} с`;
  }

  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const remainingSec = totalSec % 60;

  if (hours > 0) {
    if (isEn) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return minutes > 0 ? `${hours} год ${minutes} хв` : `${hours} год`;
  }

  if (isEn) {
    return remainingSec > 0 ? `${minutes}m ${remainingSec}s` : `${minutes}m`;
  }
  return remainingSec > 0 ? `${minutes} хв ${remainingSec} с` : `${minutes} хв`;
}

/**
 * Компактне форматування тривалості для таблиць
 */
export function formatDurationCompact(seconds: number | undefined, isEn: boolean = false): string {
  const totalSec = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const remainingSec = totalSec % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSec).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainingSec).padStart(2, '0')}`;
}
