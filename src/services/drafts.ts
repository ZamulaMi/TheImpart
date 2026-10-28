import { ArticleDraft, Article } from '../types';
import { getAuthHeaders } from './auth';
import { formatErrorMessage } from '../utils/errors';

const DRAFTS_STORAGE_KEY = 'the_impart_drafts_v1';

function getLocalDrafts(): ArticleDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function setLocalDrafts(drafts: ArticleDraft[]): void {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch {}
}

export async function fetchDraftsFromCloud(): Promise<ArticleDraft[]> {
  try {
    const res = await fetch(`/api/drafts?_t=${Date.now()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        setLocalDrafts(data);
        return data as ArticleDraft[];
      }
    }
  } catch (err) {
    console.warn('API fetchDrafts notice:', err);
  }

  return getLocalDrafts();
}

export async function saveDraftToCloud(draft: ArticleDraft): Promise<ArticleDraft> {
  let savedDraft = draft;
  try {
    const res = await fetch(`/api/drafts?_t=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(draft),
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.draft) {
        savedDraft = data.draft;
      }
    } else if (res.status === 400 || res.status === 401 || res.status === 403) {
      const data = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(data.error || 'Помилка збереження чернетки на сервері'));
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('fetch')) {
      throw err;
    }
  }

  // Оновлюємо локальний кеш
  const local = getLocalDrafts();
  const idx = local.findIndex((d) => d.id === savedDraft.id);
  const nextList = idx >= 0
    ? local.map((d) => (d.id === savedDraft.id ? savedDraft : d))
    : [savedDraft, ...local];
  setLocalDrafts(nextList);

  return savedDraft;
}

export async function deleteDraftFromCloud(id: string): Promise<boolean> {
  try {
    await fetch(`/api/drafts?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
    });
  } catch (err) {
    console.warn('API deleteDraft notice:', err);
  }

  const local = getLocalDrafts();
  setLocalDrafts(local.filter((d) => d.id !== id));
  return true;
}

export async function approveDraftOnCloud(
  draftId: string,
  options?: { published?: boolean; publishedEn?: boolean; moderatorNote?: string }
): Promise<{ success: boolean; article?: Article; draft?: ArticleDraft; error?: string }> {
  try {
    const res = await fetch('/api/drafts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        action: 'approve',
        draftId,
        ...options,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      // Оновлюємо локальний кеш чернеток
      const local = getLocalDrafts();
      const updated = local.map((d) =>
        d.id === draftId ? { ...d, status: 'approved' as const, moderatorNote: options?.moderatorNote || 'Схвалено' } : d
      );
      setLocalDrafts(updated);

      return {
        success: true,
        article: data.article,
        draft: data.draft,
      };
    }

    return {
      success: false,
      error: formatErrorMessage(data.error || 'Не вдалося опублікувати чернетку'),
    };
  } catch (err: any) {
    return {
      success: false,
      error: formatErrorMessage(err, 'Помилка виконання запиту'),
    };
  }
}

export async function rejectDraftOnCloud(
  draftId: string,
  moderatorNote?: string
): Promise<{ success: boolean; draft?: ArticleDraft; error?: string }> {
  try {
    const res = await fetch('/api/drafts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        action: 'reject',
        draftId,
        moderatorNote,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      const local = getLocalDrafts();
      const updated = local.map((d) =>
        d.id === draftId ? { ...d, status: 'rejected' as const, moderatorNote } : d
      );
      setLocalDrafts(updated);

      return {
        success: true,
        draft: data.draft,
      };
    }

    return {
      success: false,
      error: formatErrorMessage(data.error || 'Не вдалося відхилити чернетку'),
    };
  } catch (err: any) {
    return {
      success: false,
      error: formatErrorMessage(err, 'Помилка виконання запиту'),
    };
  }
}
