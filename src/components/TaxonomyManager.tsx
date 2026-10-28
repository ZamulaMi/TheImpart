import React, { useState } from 'react';
import { Plus, Trash2, Folder, Tag, Check, Sparkles, Edit3, X } from 'lucide-react';
import { TaxonomiesData, CategoryItem, TopicItem, Article } from '../types';

interface TaxonomyManagerProps {
  taxonomies: TaxonomiesData;
  onSaveTaxonomies: (data: TaxonomiesData) => void;
  articles: Article[];
  showNotification: (msg: string) => void;
  canDelete?: boolean;
  onUpdateArticles?: (articles: Article[]) => void;
}

export const TaxonomyManager: React.FC<TaxonomyManagerProps> = ({
  taxonomies,
  onSaveTaxonomies,
  articles,
  showNotification,
  canDelete = true,
  onUpdateArticles,
}) => {
  const safeCategories = Array.isArray(taxonomies?.categories) ? taxonomies.categories : [];
  const safeTopics = Array.isArray(taxonomies?.topics) ? taxonomies.topics : [];
  const safeArticles = Array.isArray(articles) ? articles : [];

  // Нова рубрика
  const [newCatName, setNewCatName] = useState('');
  const [newCatNameEn, setNewCatNameEn] = useState('');

  // Нова тема
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicNameEn, setNewTopicNameEn] = useState('');

  // Редагування існуючої рубрики
  const [editingCategory, setEditingCategory] = useState<{
    id: string;
    originalName: string;
    name: string;
    originalNameEn?: string;
    nameEn?: string;
  } | null>(null);

  // Редагування існуючої теми
  const [editingTopic, setEditingTopic] = useState<{
    id: string;
    originalName: string;
    name: string;
    originalNameEn?: string;
    nameEn?: string;
  } | null>(null);

  // Підрахунок використання рубрик (з урахуванням масивів та розділених рядків)
  const getCategoryCount = (catName: string) => {
    const target = catName.trim().toLowerCase();
    return safeArticles.filter((a) => {
      if (!a) return false;
      const catsList =
        Array.isArray(a.categories) && a.categories.length > 0
          ? a.categories
          : a.category
          ? a.category.split(',').map((s) => s.trim())
          : [];
      return catsList.some(
        (c) =>
          (typeof c === 'string' ? c : (c as any)?.name || '')
            .trim()
            .toLowerCase() === target
      );
    }).length;
  };

  // Підрахунок використання тем
  const getTopicCount = (topicName: string) => {
    const target = topicName.trim().replace(/^#+/, '').toLowerCase();
    return safeArticles.filter((a) => {
      if (!a || !Array.isArray(a.topics)) return false;
      return a.topics.some(
        (t) =>
          String(t || '')
            .trim()
            .replace(/^#+/, '')
            .toLowerCase() === target
      );
    }).length;
  };

  // Додавання нової рубрики
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCatName.trim();
    if (!cleanName) return;

    if (
      safeCategories.some(
        (c) => c.name.toLowerCase() === cleanName.toLowerCase()
      )
    ) {
      showNotification('Рубрика з такою назвою вже існує');
      return;
    }

    const newCat: CategoryItem = {
      id: `cat-${Date.now()}`,
      name: cleanName,
      nameEn: newCatNameEn.trim() || undefined,
    };

    const updated: TaxonomiesData = {
      categories: [...safeCategories, newCat],
      topics: safeTopics,
    };

    onSaveTaxonomies(updated);
    setNewCatName('');
    setNewCatNameEn('');
    showNotification(`Рубрику «${cleanName}» успішно додано`);
  };

  // Збереження відредагованої рубрики
  const handleSaveEditedCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    const cleanName = editingCategory.name.trim();
    if (!cleanName) {
      showNotification('Назва рубрики не може бути порожньою');
      return;
    }

    // Перевірка на дублікат серед інших рубрик
    const duplicate = safeCategories.some(
      (c) => c.id !== editingCategory.id && c.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      showNotification('Рубрика з такою назвою вже існує');
      return;
    }

    const cleanNameEn = editingCategory.nameEn?.trim() || undefined;
    const oldName = editingCategory.originalName;
    const oldNameEn = editingCategory.originalNameEn;

    const updatedCategories = safeCategories.map((c) =>
      c.id === editingCategory.id
        ? { ...c, name: cleanName, nameEn: cleanNameEn }
        : c
    );

    const updatedTaxonomies: TaxonomiesData = {
      categories: updatedCategories,
      topics: safeTopics,
    };

    onSaveTaxonomies(updatedTaxonomies);

    // Якщо назва змінилася, оновлюємо також статті, що використовували стару назву
    if (onUpdateArticles && oldName.toLowerCase() !== cleanName.toLowerCase()) {
      const updatedArticles = safeArticles.map((art) => {
        let changed = false;
        let newCats = art.categories ? [...art.categories] : [];
        if (newCats.some((c) => c.toLowerCase() === oldName.toLowerCase())) {
          newCats = newCats.map((c) => (c.toLowerCase() === oldName.toLowerCase() ? cleanName : c));
          changed = true;
        }

        let newCategory = art.category;
        if (newCategory) {
          const parts = newCategory.split(',').map((s) => s.trim());
          if (parts.some((p) => p.toLowerCase() === oldName.toLowerCase())) {
            newCategory = parts
              .map((p) => (p.toLowerCase() === oldName.toLowerCase() ? cleanName : p))
              .join(', ');
            changed = true;
          }
        }

        let newCatsEn = art.categoriesEn ? [...art.categoriesEn] : [];
        if (cleanNameEn && oldNameEn && newCatsEn.some((c) => c.toLowerCase() === oldNameEn.toLowerCase())) {
          newCatsEn = newCatsEn.map((c) => (c.toLowerCase() === oldNameEn.toLowerCase() ? cleanNameEn : c));
          changed = true;
        }

        let newCategoryEn = art.categoryEn;
        if (cleanNameEn && oldNameEn && newCategoryEn) {
          const partsEn = newCategoryEn.split(',').map((s) => s.trim());
          if (partsEn.some((p) => p.toLowerCase() === oldNameEn.toLowerCase())) {
            newCategoryEn = partsEn
              .map((p) => (p.toLowerCase() === oldNameEn.toLowerCase() ? cleanNameEn : p))
              .join(', ');
            changed = true;
          }
        }

        if (changed) {
          return {
            ...art,
            categories: newCats.length > 0 ? newCats : [cleanName],
            category: newCategory || cleanName,
            categoriesEn: newCatsEn.length > 0 ? newCatsEn : cleanNameEn ? [cleanNameEn] : art.categoriesEn,
            categoryEn: newCategoryEn || cleanNameEn || art.categoryEn,
          };
        }
        return art;
      });

      onUpdateArticles(updatedArticles);
    }

    setEditingCategory(null);
    showNotification(`Рубрику «${oldName}» успішно змінено на «${cleanName}»`);
  };

  // Видалення рубрики
  const handleDeleteCategory = (id: string, name: string) => {
    const updated: TaxonomiesData = {
      categories: safeCategories.filter((c) => c.id !== id),
      topics: safeTopics,
    };
    onSaveTaxonomies(updated);
    showNotification(`Рубрику «${name}» видалено`);
  };

  // Додавання нової теми
  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newTopicName.trim().replace(/^#+/, '');
    if (!cleanName) return;

    if (
      safeTopics.some(
        (t) => t.name.toLowerCase() === cleanName.toLowerCase()
      )
    ) {
      showNotification('Тема з такою назвою вже існує');
      return;
    }

    const newTopic: TopicItem = {
      id: `top-${Date.now()}`,
      name: cleanName,
      nameEn: newTopicNameEn.trim().replace(/^#+/, '') || undefined,
    };

    const updated: TaxonomiesData = {
      categories: safeCategories,
      topics: [...safeTopics, newTopic],
    };

    onSaveTaxonomies(updated);
    setNewTopicName('');
    setNewTopicNameEn('');
    showNotification(`Тему «${cleanName}» успішно додано`);
  };

  // Збереження відредагованої теми
  const handleSaveEditedTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTopic) return;
    const cleanName = editingTopic.name.trim().replace(/^#+/, '');
    if (!cleanName) {
      showNotification('Назва теми не може бути порожньою');
      return;
    }

    const duplicate = safeTopics.some(
      (t) => t.id !== editingTopic.id && t.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      showNotification('Тема з такою назвою вже існує');
      return;
    }

    const cleanNameEn = editingTopic.nameEn?.trim().replace(/^#+/, '') || undefined;
    const oldName = editingTopic.originalName;
    const oldNameEn = editingTopic.originalNameEn;

    const updatedTopics = safeTopics.map((t) =>
      t.id === editingTopic.id
        ? { ...t, name: cleanName, nameEn: cleanNameEn }
        : t
    );

    const updatedTaxonomies: TaxonomiesData = {
      categories: safeCategories,
      topics: updatedTopics,
    };

    onSaveTaxonomies(updatedTaxonomies);

    // Якщо назва теми змінилася, оновлюємо також теми у статтях
    if (onUpdateArticles && oldName.toLowerCase() !== cleanName.toLowerCase()) {
      const updatedArticles = safeArticles.map((art) => {
        let changed = false;
        let newTopics = Array.isArray(art.topics) ? [...art.topics] : [];
        if (newTopics.some((t) => t.replace(/^#+/, '').toLowerCase() === oldName.toLowerCase())) {
          newTopics = newTopics.map((t) =>
            t.replace(/^#+/, '').toLowerCase() === oldName.toLowerCase() ? cleanName : t
          );
          changed = true;
        }

        let newTopicsEn = Array.isArray(art.topicsEn) ? [...art.topicsEn] : [];
        if (cleanNameEn && oldNameEn && newTopicsEn.some((t) => t.replace(/^#+/, '').toLowerCase() === oldNameEn.toLowerCase())) {
          newTopicsEn = newTopicsEn.map((t) =>
            t.replace(/^#+/, '').toLowerCase() === oldNameEn.toLowerCase() ? cleanNameEn : t
          );
          changed = true;
        }

        if (changed) {
          return {
            ...art,
            topics: newTopics,
            topicsEn: newTopicsEn,
          };
        }
        return art;
      });

      onUpdateArticles(updatedArticles);
    }

    setEditingTopic(null);
    showNotification(`Тему «${oldName}» успішно змінено на «${cleanName}»`);
  };

  // Видалення теми
  const handleDeleteTopic = (id: string, name: string) => {
    const updated: TaxonomiesData = {
      categories: safeCategories,
      topics: safeTopics.filter((t) => t.id !== id),
    };
    onSaveTaxonomies(updated);
    showNotification(`Тему «${name}» видалено`);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      {!canDelete && (
        <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
          <div>
            <span className="font-semibold">Обмеження редактора:</span> Ви можете додавати та змінювати (редагувати) назви наявних рубрик і тем. Видалення наявних елементів структури журналу дозволено лише головному адміністратору.
          </div>
        </div>
      )}

      {/* Модальне вікно редагування рубрики */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-neutral-200 max-w-md w-full p-6 space-y-5 animate-page-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-black" />
                <h3 className="text-sm font-semibold text-black uppercase tracking-wider">
                  Змінити рубрику
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedCategory} className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                  Назва рубрики (UA) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editingCategory.name}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, name: e.target.value })
                  }
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                  Category name (EN)
                </label>
                <input
                  type="text"
                  placeholder="e.g. News, Culture..."
                  value={editingCategory.nameEn || ''}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, nameEn: e.target.value })
                  }
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-black transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-black text-white text-xs font-medium rounded hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Зберегти зміни</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальне вікно редагування теми */}
      {editingTopic && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-neutral-200 max-w-md w-full p-6 space-y-5 animate-page-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-black" />
                <h3 className="text-sm font-semibold text-black uppercase tracking-wider">
                  Змінити тему статті
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingTopic(null)}
                className="text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedTopic} className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                  Назва теми (UA) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editingTopic.name}
                  onChange={(e) =>
                    setEditingTopic({ ...editingTopic, name: e.target.value })
                  }
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                  Topic name (EN)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Design, Architecture..."
                  value={editingTopic.nameEn || ''}
                  onChange={(e) =>
                    setEditingTopic({ ...editingTopic, nameEn: e.target.value })
                  }
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditingTopic(null)}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-black transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-black text-white text-xs font-medium rounded hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Зберегти зміни</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="pb-6 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-medium text-black">
            Рубрики та теми статей
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Створюйте, редагуйте та змінюйте структуру журналу. Обрані рубрики та теми доступні в редакторі статей для категоризації та подальшого сортування.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 bg-neutral-50 px-3 py-1.5 rounded-md border border-neutral-200/60 self-start sm:self-auto">
          <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
          <span>{safeCategories.length} рубрик • {safeTopics.length} тем</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* КОЛОНКА 1: РУБРИКИ (CATEGORIES) */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-neutral-200">
            <Folder className="w-4 h-4 text-black" />
            <h2 className="text-sm uppercase tracking-wider font-semibold text-black">
              Рубрики ({safeCategories.length})
            </h2>
          </div>

          {/* Форма додавання нової рубрики */}
          <form
            onSubmit={handleAddCategory}
            className="p-4 bg-neutral-50 border border-neutral-200/80 rounded-lg space-y-3"
          >
            <div className="text-xs font-medium text-black">Створити нову рубрику</div>
            <div className="space-y-2">
              <input
                type="text"
                required
                placeholder="Назва рубрики (UA) *"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full text-xs sm:text-sm bg-white border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black transition-colors"
              />
              <input
                type="text"
                placeholder="Category name (EN) — необов'язково"
                value={newCatNameEn}
                onChange={(e) => setNewCatNameEn(e.target.value)}
                className="w-full text-xs sm:text-sm bg-white border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black transition-colors"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-black text-white text-xs font-medium rounded hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Додати рубрику</span>
            </button>
          </form>

          {/* Список рубрик */}
          <div className="space-y-2">
            {safeCategories.map((cat) => {
              const count = getCategoryCount(cat.name);
              return (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-3 bg-white border border-neutral-100 hover:border-neutral-200 rounded-lg transition-colors group"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-black truncate">
                        {cat.name}
                      </span>
                      {cat.nameEn && (
                        <span className="text-xs text-neutral-400 truncate">
                          / {cat.nameEn}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-neutral-400 mt-0.5">
                      {count} {count === 1 ? 'стаття' : count >= 2 && count <= 4 ? 'статті' : 'статей'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingCategory({
                          id: cat.id,
                          originalName: cat.name,
                          name: cat.name,
                          originalNameEn: cat.nameEn,
                          nameEn: cat.nameEn || '',
                        })
                      }
                      className="p-1.5 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded transition-colors cursor-pointer"
                      title="Змінити рубрику (редагувати назву)"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                        title="Видалити рубрику"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* КОЛОНКА 2: ТЕМИ (TOPICS / TAGS) */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-neutral-200">
            <Tag className="w-4 h-4 text-black" />
            <h2 className="text-sm uppercase tracking-wider font-semibold text-black">
              Теми / Теги ({safeTopics.length})
            </h2>
          </div>

          {/* Форма додавання нової теми */}
          <form
            onSubmit={handleAddTopic}
            className="p-4 bg-neutral-50 border border-neutral-200/80 rounded-lg space-y-3"
          >
            <div className="text-xs font-medium text-black">Створити нову тему</div>
            <div className="space-y-2">
              <input
                type="text"
                required
                placeholder="Назва теми (UA) *"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                className="w-full text-xs sm:text-sm bg-white border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black transition-colors"
              />
              <input
                type="text"
                placeholder="Topic name (EN) — необов'язково"
                value={newTopicNameEn}
                onChange={(e) => setNewTopicNameEn(e.target.value)}
                className="w-full text-xs sm:text-sm bg-white border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black transition-colors"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-black text-white text-xs font-medium rounded hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Додати тему</span>
            </button>
          </form>

          {/* Список тем у вигляді бейджів */}
          <div className="flex flex-wrap gap-2 pt-1">
            {safeTopics.map((topic) => {
              const count = getTopicCount(topic.name);
              return (
                <div
                  key={topic.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100/90 hover:bg-neutral-200/70 border border-neutral-200 rounded-md text-xs transition-colors group"
                >
                  <span className="font-medium text-neutral-800">#{topic.name}</span>
                  {topic.nameEn && (
                    <span className="text-neutral-400 text-[11px]">({topic.nameEn})</span>
                  )}
                  <span className="text-[10px] text-neutral-400 bg-white px-1.5 py-0.5 rounded-full border border-neutral-200/60 ml-0.5">
                    {count}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setEditingTopic({
                        id: topic.id,
                        originalName: topic.name,
                        name: topic.name,
                        originalNameEn: topic.nameEn,
                        nameEn: topic.nameEn || '',
                      })
                    }
                    className="text-neutral-400 hover:text-black transition-colors ml-1 cursor-pointer"
                    title="Змінити тему (редагувати назву)"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTopic(topic.id, topic.name)}
                      className="text-neutral-400 hover:text-red-600 transition-colors ml-0.5 cursor-pointer"
                      title="Видалити тему"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
