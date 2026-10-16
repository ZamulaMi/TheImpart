/**
 * Утиліта для безпечного форматування та вилучення рядкових повідомлень про помилки.
 * Запобігає падінню React (Minified React error #31: Objects are not valid as a React child {code, message}).
 */

export function formatErrorMessage(err: unknown, fallback: string = 'Сталася неочікувана помилка'): string {
  if (err === null || err === undefined) {
    return fallback;
  }

  if (typeof err === 'string') {
    const trimmed = err.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof err === 'number' || typeof err === 'boolean') {
    return String(err);
  }

  if (typeof err === 'object') {
    const rec = err as Record<string, any>;

    // 1. Якщо це стандартний об'єкт Error
    if (typeof rec.message === 'string' && rec.message.trim()) {
      return rec.message.trim();
    }

    // 2. Якщо це API-відповідь типу { error: "текст" }
    if (typeof rec.error === 'string' && rec.error.trim()) {
      return rec.error.trim();
    }

    // 3. Якщо це відповідь платформи Vercel або Google: { error: { code, message } }
    if (rec.error && typeof rec.error === 'object') {
      const nested = rec.error;
      if (typeof nested.message === 'string' && nested.message.trim()) {
        return nested.message.trim();
      }
      if (typeof nested.code === 'string' && nested.code.trim()) {
        return `Помилка сервера (${nested.code})`;
      }
    }

    // 4. Якщо це об'єкт із ключами { code, message }
    if (typeof rec.code === 'string' || typeof rec.code === 'number') {
      if (typeof rec.message === 'string' && rec.message.trim()) {
        return rec.message.trim();
      }
      return `Помилка сервера (${rec.code})`;
    }

    // 5. Якщо це детальний опис у полі statusText або status
    if (typeof rec.statusText === 'string' && rec.statusText.trim()) {
      return rec.statusText.trim();
    }

    // 6. Спроба серіалізації в зрозумілий рядок
    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}') {
        return json;
      }
    } catch {}
  }

  return fallback;
}
