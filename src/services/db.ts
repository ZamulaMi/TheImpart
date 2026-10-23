import { Article, SiteSocialLinks, SitePagesData, TaxonomiesData, NavigationCategory } from '../types';
import { getAuthHeaders } from './auth';
import { formatErrorMessage } from '../utils/errors';

export async function fetchPagesFromCloud(): Promise<SitePagesData | null> {
  try {
    const res = await fetch(`/api/pages?_t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === 'object' && (data.about || data.contacts)) {
        return data as SitePagesData;
      }
    }
  } catch (err) {
    console.warn('API fetchPages notice:', err);
  }
  return null;
}

export async function savePagesToCloud(pages: SitePagesData): Promise<SitePagesData> {
  try {
    const res = await fetch(`/api/pages?_t=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(pages),
    });

    if (res) {
      const text = await res.text().catch(() => '');
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }

      if (res.ok) {
        return (data && typeof data === 'object' && (data.about || data.contacts)) ? (data as SitePagesData) : pages;
      }

      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(formatErrorMessage(data.error || data, 'Не вдалося зберегти сторінки на сервері'));
      }
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('server error')) {
      throw err;
    }
  }

  return pages;
}

export async function fetchSocialLinksFromCloud(): Promise<SiteSocialLinks | null> {
  try {
    const res = await fetch(`/api/settings?_t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === 'object') {
        return data as SiteSocialLinks;
      }
    }
  } catch (err) {
    console.warn('API fetchSocialLinks notice:', err);
  }
  return null;
}

export async function saveSocialLinksToCloud(links: SiteSocialLinks): Promise<SiteSocialLinks> {
  try {
    const res = await fetch(`/api/settings?_t=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(links),
    });

    if (res) {
      const text = await res.text().catch(() => '');
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }

      if (res.ok) {
        return (data && typeof data === 'object' && data.ua) ? (data as SiteSocialLinks) : links;
      }

      if (res.status === 400 || res.status === 401) {
        throw new Error(formatErrorMessage(data.error || data, 'Не вдалося зберегти налаштування на сервері'));
      }
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('server error')) {
      throw err;
    }
  }

  // Якщо сервер Vercel тимчасово недоступний, повертаємо передані налаштування
  return links;
}

export async function fetchArticlesFromCloud(): Promise<Article[] | null> {
  try {
    const res = await fetch(`/api/articles?_t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        return data as Article[];
      }
    }
  } catch (err) {
    console.warn('API fetchArticles notice:', err);
  }
  return null;
}

export async function saveArticleToCloud(article: Article): Promise<Article> {
  try {
    const res = await fetch(`/api/articles?_t=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(article),
    });

    if (res) {
      const text = await res.text().catch(() => '');
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }

      if (res.ok) {
        return (data && typeof data === 'object' && data.id) ? (data as Article) : article;
      }

      if (res.status === 400 || res.status === 401) {
        throw new Error(formatErrorMessage(data.error || data, 'Не вдалося зберегти статтю на сервері'));
      }
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('server error')) {
      throw err;
    }
  }

  // Якщо серверний маршрут Vercel тимчасово недоступний, повертаємо статтю (збережеться у локальний кеш)
  return article;
}

export async function deleteArticleFromCloud(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/articles?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
    });

    if (res && res.ok) {
      return true;
    }
  } catch (err) {
    console.warn('API deleteArticle notice:', err);
  }

  return true;
}

export async function fetchTaxonomiesFromCloud(): Promise<TaxonomiesData | null> {
  try {
    const res = await fetch(`/api/taxonomies?_t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === 'object' && Array.isArray(data.categories) && Array.isArray(data.topics)) {
        return data as TaxonomiesData;
      }
    }
  } catch (err) {
    console.warn('API fetchTaxonomies notice:', err);
  }
  return null;
}

export async function saveTaxonomiesToCloud(taxonomies: TaxonomiesData): Promise<TaxonomiesData> {
  try {
    const res = await fetch(`/api/taxonomies?_t=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(taxonomies),
    });

    if (res) {
      const text = await res.text().catch(() => '');
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }

      if (res.ok) {
        return (data && typeof data === 'object' && Array.isArray(data.categories)) ? (data as TaxonomiesData) : taxonomies;
      }

      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(formatErrorMessage(data.error || data, 'Не вдалося зберегти таксономії на сервері'));
      }
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('server error')) {
      throw err;
    }
  }

  return taxonomies;
}

export async function fetchNavCategoriesFromCloud(): Promise<NavigationCategory[] | null> {
  try {
    const res = await fetch(`/api/categories?_t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data) && data.length > 0) {
        return data as NavigationCategory[];
      }
    }
  } catch (err) {
    console.warn('API fetchNavCategories notice:', err);
  }
  return null;
}

export async function saveNavCategoriesToCloud(categories: NavigationCategory[]): Promise<NavigationCategory[]> {
  try {
    const res = await fetch(`/api/categories?_t=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(categories),
    });

    if (res) {
      const text = await res.text().catch(() => '');
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }

      if (res.ok) {
        return Array.isArray(data) ? (data as NavigationCategory[]) : categories;
      }

      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(formatErrorMessage(data.error || data, 'Не вдалося зберегти категорії на сервері'));
      }
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('server error')) {
      throw err;
    }
  }

  return categories;
}

