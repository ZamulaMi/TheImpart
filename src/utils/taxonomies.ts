import type { TaxonomiesData, CategoryItem, TopicItem } from '../types.ts';

export const TAXONOMIES_STORAGE_KEY = 'the_impart_taxonomies_v1';

export const DEFAULT_TAXONOMIES: TaxonomiesData = {
  categories: [
    { id: 'cat-news', name: 'Новини', nameEn: 'News' },
    { id: 'cat-articles', name: 'Статті', nameEn: 'Articles' },
    { id: 'cat-reviews', name: 'Огляди', nameEn: 'Reviews' },
    { id: 'cat-1', name: 'Філософія', nameEn: 'Philosophy' },
    { id: 'cat-2', name: 'Архітектура', nameEn: 'Architecture' },
    { id: 'cat-3', name: 'Естетика', nameEn: 'Aesthetics' },
    { id: 'cat-4', name: 'Мистецтво', nameEn: 'Art' },
    { id: 'cat-5', name: 'Дизайн', nameEn: 'Design' },
    { id: 'cat-6', name: 'Есе', nameEn: 'Essays' },
    { id: 'cat-7', name: 'Культура', nameEn: 'Culture' },
  ],
  topics: [
    { id: 'top-1', name: 'Мінімалізм', nameEn: 'Minimalism' },
    { id: 'top-2', name: 'Усвідомленість', nameEn: 'Mindfulness' },
    { id: 'top-3', name: 'Світло та тінь', nameEn: 'Light & Shadow' },
    { id: 'top-4', name: 'Тиша', nameEn: 'Silence' },
    { id: 'top-5', name: 'Форма', nameEn: 'Form' },
    { id: 'top-6', name: 'Гармонія', nameEn: 'Harmony' },
    { id: 'top-7', name: 'Простір', nameEn: 'Space' },
    { id: 'top-8', name: 'Матеріальність', nameEn: 'Materiality' },
    { id: 'top-9', name: 'Природа', nameEn: 'Nature' },
    { id: 'top-10', name: 'Час', nameEn: 'Time' },
  ],
};

export function getStoredTaxonomies(): TaxonomiesData {
  if (typeof window === 'undefined') return DEFAULT_TAXONOMIES;
  try {
    const raw = localStorage.getItem(TAXONOMIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.topics)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading stored taxonomies:', e);
  }
  return DEFAULT_TAXONOMIES;
}

export function saveStoredTaxonomies(data: TaxonomiesData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TAXONOMIES_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving taxonomies to storage:', e);
  }
}
