import { StatsConfig, StatsSummaryResponse } from '../types';
import { getAuthHeaders } from './auth';

/**
 * Отримує налаштування порогу зарахування перегляду
 */
export async function fetchStatsConfig(): Promise<StatsConfig> {
  try {
    const res = await fetch(`/api/stats?action=config&_t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.thresholdSeconds === 'number' && data.thresholdSeconds > 0) {
        try {
          localStorage.setItem('the_impart_stats_threshold', String(data.thresholdSeconds));
        } catch {}
        return data as StatsConfig;
      }
    }
  } catch (err) {
    console.warn('fetchStatsConfig notice:', err);
  }
  try {
    const cached = localStorage.getItem('the_impart_stats_threshold');
    if (cached) {
      const val = parseInt(cached, 10);
      if (val > 0) return { thresholdSeconds: val };
    }
  } catch {}
  return { thresholdSeconds: 5 };
}

/**
 * Зберігає новий поріг часу зарахування перегляду (у секундах)
 */
export async function saveStatsConfig(thresholdSeconds: number): Promise<boolean> {
  try {
    const res = await fetch('/api/stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        action: 'config',
        thresholdSeconds,
      }),
    });
    if (res.ok) {
      try {
        localStorage.setItem('the_impart_stats_threshold', String(thresholdSeconds));
      } catch {}
      return true;
    }
  } catch (err) {
    console.error('saveStatsConfig error:', err);
  }
  return false;
}

/**
 * Фіксує перебування читача на статті (перегляд або час)
 */
export async function trackArticleView(payload: {
  articleId: string;
  durationSeconds?: number;
  qualifyView?: boolean;
  sessionId: string;
}): Promise<{ views: number; totalDurationSeconds: number } | null> {
  try {
    const bodyStr = JSON.stringify({
      action: 'track',
      articleId: payload.articleId,
      durationSeconds: payload.durationSeconds || 0,
      qualifyView: Boolean(payload.qualifyView),
      sessionId: payload.sessionId,
    });

    const res = await fetch('/api/stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: bodyStr,
      keepalive: true,
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    // Не блокуємо інтерфейс якщо аналітика тимчасово не відповідає
    console.warn('trackArticleView notice:', err);
  }
  return null;
}

/**
 * Отримує повну статистику та аналітику за обраний період та фільтри
 */
export async function fetchStatsSummary(params: {
  period?: string;
  year?: number;
  search?: string;
  category?: string;
  topic?: string;
}): Promise<StatsSummaryResponse | null> {
  try {
    const query = new URLSearchParams();
    query.set('action', 'summary');
    if (params.period) query.set('period', params.period);
    if (params.year) query.set('year', String(params.year));
    if (params.search) query.set('search', params.search);
    if (params.category && params.category !== 'all') query.set('category', params.category);
    if (params.topic && params.topic !== 'all') query.set('topic', params.topic);
    query.set('_t', String(Date.now()));

    const res = await fetch(`/api/stats?${query.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
    });

    if (res.ok) {
      const data = await res.json();
      return data as StatsSummaryResponse;
    }
  } catch (err) {
    console.error('fetchStatsSummary error:', err);
  }
  return null;
}

/**
 * Отримує мапу переглядів для швидкого оновлення списку статей
 */
export async function fetchArticleViewsMap(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(`/api/stats?action=totals&_t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('fetchArticleViewsMap notice:', err);
  }
  return null;
}

/**
 * Отримує актуальну кількість переглядів для однієї конкретної статті
 */
export async function fetchSingleArticleViews(articleId: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/stats?action=article&id=${encodeURIComponent(articleId)}&_t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.views === 'number') {
        return data.views;
      }
    }
  } catch (err) {
    console.warn('fetchSingleArticleViews notice:', err);
  }
  return null;
}
