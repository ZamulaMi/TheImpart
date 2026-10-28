import { Article, SiteSocialLinks, SitePagesData, TaxonomiesData, NavigationCategory } from '../types';
import { getAuthHeaders } from './auth';
import { formatErrorMessage } from '../utils/errors';

export async function fetchPagesFromCloud(_forceFresh = true): Promise<SitePagesData | null> {
  try {
    const res = await fetch(`/api/pages?_t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === 'object' && !Array.isArray(data) && (data.about || data.contacts)) {
        return data as SitePagesData;
      }
    }
  } catch (err) {
    console.warn('API fetchPages notice:', err);
  }
  return null;
}

export async function savePagesToCloud(pages: SitePagesData): Promise<SitePagesData> {
  const res = await fetch(`/api/pages?_t=${Date.now()}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(pages),
  });

  const text = await res.text().catch(() => '');
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }

  if (res.ok) {
    return data && typeof data === 'object' && !Array.isArray(data) && (data.about || data.contacts)
      ? (data as SitePagesData)
      : pages;
  }

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося зберегти сторінки на сервері'));
}

export async function fetchSocialLinksFromCloud(_forceFresh = true): Promise<SiteSocialLinks | null> {
  try {
    const res = await fetch(`/api/settings?_t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === 'object' && !Array.isArray(data) && (data.ua || data.en)) {
        return data as SiteSocialLinks;
      }
    }
  } catch (err) {
    console.warn('API fetchSocialLinks notice:', err);
  }
  return null;
}

export async function saveSocialLinksToCloud(links: SiteSocialLinks): Promise<SiteSocialLinks> {
  const res = await fetch(`/api/settings?_t=${Date.now()}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(links),
  });

  const text = await res.text().catch(() => '');
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }

  if (res.ok) {
    return data && typeof data === 'object' && !Array.isArray(data) && (data.ua || data.en)
      ? (data as SiteSocialLinks)
      : links;
  }

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося зберегти налаштування соц. мереж на сервері'));
}

export async function fetchArticlesFromCloud(): Promise<Article[] | null> {
  try {
    const authHeaders = getAuthHeaders();
    const url = `/api/articles?_t=${Date.now()}`;
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...authHeaders,
      },
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
  const res = await fetch(`/api/articles?_t=${Date.now()}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(article),
  });

  const text = await res.text().catch(() => '');
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }

  if (res.ok) {
    return data && typeof data === 'object' && data.id ? (data as Article) : article;
  }

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося зберегти статтю на сервері'));
}

export async function deleteArticleFromCloud(id: string): Promise<boolean> {
  const cleanId = String(id).trim();
  const res = await fetch(`/api/articles?id=${encodeURIComponent(cleanId)}`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ id: cleanId }),
  });

  const text = await res.text().catch(() => '');
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }

  if (res.ok) {
    return true;
  }

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося видалити статтю на сервері'));
}

export async function fetchTaxonomiesFromCloud(_forceFresh = true): Promise<TaxonomiesData | null> {
  try {
    const res = await fetch(`/api/taxonomies?_t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
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
  const res = await fetch(`/api/taxonomies?_t=${Date.now()}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(taxonomies),
  });

  const text = await res.text().catch(() => '');
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }

  if (res.ok) {
    return data && typeof data === 'object' && Array.isArray(data.categories)
      ? (data as TaxonomiesData)
      : taxonomies;
  }

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося зберегти рубрики та теми на сервері'));
}

export async function fetchNavCategoriesFromCloud(_forceFresh = true): Promise<NavigationCategory[] | null> {
  try {
    const res = await fetch(`/api/categories?_t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        return data as NavigationCategory[];
      }
    }
  } catch (err) {
    console.warn('API fetchNavCategories notice:', err);
  }
  return null;
}

export async function saveNavCategoriesToCloud(categories: NavigationCategory[]): Promise<NavigationCategory[]> {
  const res = await fetch(`/api/categories?_t=${Date.now()}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(categories),
  });

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

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося зберегти категорії на сервері'));
}


