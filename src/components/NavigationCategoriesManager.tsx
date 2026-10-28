import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Layers,
  FolderTree,
  Tag,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Sparkles,
  Info,
  Search,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { NavigationCategory, TaxonomiesData, Article } from '../types';
import { slugifyCategory, matchesNavCategory } from '../utils/categories';
import { formatErrorMessage } from '../utils/errors';

interface NavigationCategoriesManagerProps {
  categories: NavigationCategory[];
  onSaveCategories: (categories: NavigationCategory[]) => Promise<void> | void;
  onRefreshCategories?: () => Promise<void>;
  taxonomies: TaxonomiesData;
  articles: Article[];
  showNotification: (msg: string) => void;
  canDelete?: boolean;
  onViewCategoryOnSite?: (slug: string) => void;
}

export const NavigationCategoriesManager: React.FC<NavigationCategoriesManagerProps> = ({
  categories,
  onSaveCategories,
  onRefreshCategories,
  taxonomies,
  articles,
  showNotification,
  canDelete = true,
  onViewCategoryOnSite,
}) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeTaxonomiesCategories = Array.isArray(taxonomies?.categories) ? taxonomies.categories : [];
  const safeTaxonomiesTopics = Array.isArray(taxonomies?.topics) ? taxonomies.topics : [];
  const safeArticles = Array.isArray(articles) ? articles : [];

  // Стан для модального вікна створення/редагування категорії
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<NavigationCategory | null>(null);
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<NavigationCategory | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Форма редагування
  const [formName, setFormName] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [selectedRubrics, setSelectedRubrics] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  // Фільтри у формі для швидкого пошуку рубрик/тем
  const [rubricSearch, setRubricSearch] = useState('');
  const [topicSearch, setTopicSearch] = useState('');

  useEffect(() => {
    if (onRefreshCategories) {
      onRefreshCategories().catch(() => {});
    }
  }, []);

  const handleRefresh = async () => {
    if (!onRefreshCategories) return;
    setIsRefreshing(true);
    try {
      await onRefreshCategories();
      showNotification('Категорії оновлено з бази даних');
    } catch {
      showNotification('Не вдалося оновити категорії з сервера');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Підрахунок статей для кожної категорії
  const getArticleCountForCategory = (cat: NavigationCategory) => {
    return safeArticles.filter((art) => matchesNavCategory(art, cat)).length;
  };

  // Розрахунок статей для поточної форми в реальному часі
  const currentFormArticleCount = useMemo(() => {
    const tempCat: NavigationCategory = {
      id: editingCategory?.id || 'temp',
      slug: formSlug || 'temp',
      name: formName || 'Категорія',
      rubrics: selectedRubrics,
      topics: selectedTopics,
    };
    return safeArticles.filter((art) => matchesNavCategory(art, tempCat)).length;
  }, [formName, formSlug, selectedRubrics, selectedTopics, safeArticles]);

  const handleOpenCreateModal = () => {
    setEditingCategory(null);
    setFormName('');
    setFormNameEn('');
    setFormSlug('');
    setIsSlugManuallyEdited(false);
    setSelectedRubrics([]);
    setSelectedTopics([]);
    setRubricSearch('');
    setTopicSearch('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cat: NavigationCategory) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormNameEn(cat.nameEn || '');
    setFormSlug(cat.slug);
    setIsSlugManuallyEdited(true);
    setSelectedRubrics(Array.isArray(cat.rubrics) ? [...cat.rubrics] : []);
    setSelectedTopics(Array.isArray(cat.topics) ? [...cat.topics] : []);
    setRubricSearch('');
    setTopicSearch('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleNameChange = (val: string) => {
    setFormName(val);
    if (!isSlugManuallyEdited) {
      setFormSlug(slugifyCategory(val));
    }
  };

  const handleToggleRubric = (rubricName: string) => {
    setSelectedRubrics((prev) => {
      const exists = prev.some((r) => r.toLowerCase() === rubricName.toLowerCase());
      if (exists) {
        return prev.filter((r) => r.toLowerCase() !== rubricName.toLowerCase());
      } else {
        return [...prev, rubricName];
      }
    });
  };

  const handleToggleTopic = (topicName: string) => {
    const clean = topicName.replace(/^#+/, '');
    setSelectedTopics((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === clean.toLowerCase());
      if (exists) {
        return prev.filter((t) => t.toLowerCase() !== clean.toLowerCase());
      } else {
        return [...prev, clean];
      }
    });
  };

  const handleSelectAllRubrics = () => {
    const all = safeTaxonomiesCategories.map((c) => c.name);
    setSelectedRubrics(all);
  };

  const handleClearAllRubrics = () => {
    setSelectedRubrics([]);
  };

  const handleSelectAllTopics = () => {
    const all = safeTaxonomiesTopics.map((t) => t.name.replace(/^#+/, ''));
    setSelectedTopics(all);
  };

  const handleClearAllTopics = () => {
    setSelectedTopics([]);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanName = formName.trim();
    if (!cleanName) {
      setFormError('Вкажіть назву категорії');
      showNotification('Вкажіть назву категорії');
      return;
    }

    const cleanSlug = formSlug.trim() || slugifyCategory(cleanName);

    // Перевірка дублікатів slug
    const duplicateSlug = safeCategories.some(
      (c) => c.slug.toLowerCase() === cleanSlug.toLowerCase() && c.id !== editingCategory?.id
    );
    if (duplicateSlug) {
      const msg = `Категорія з посиланням «/${cleanSlug}» вже існує`;
      setFormError(msg);
      showNotification(msg);
      return;
    }

    // Якщо рубрики і теми не вибрані вручну, перевіряємо чи є однойменна рубрика або підставляємо назву категорії
    let effectiveRubrics = [...selectedRubrics];
    if (effectiveRubrics.length === 0 && selectedTopics.length === 0) {
      const matchingTaxCat = safeTaxonomiesCategories.find(
        (tc) => tc.name.trim().toLowerCase() === cleanName.toLowerCase()
      );
      effectiveRubrics = [matchingTaxCat ? matchingTaxCat.name : cleanName];
    }

    // Відповідні назви EN для вибраних рубрик
    const rubricsEnList: string[] = [];
    effectiveRubrics.forEach((rName) => {
      const found = safeTaxonomiesCategories.find((tc) => tc.name.toLowerCase() === rName.toLowerCase());
      if (found?.nameEn) rubricsEnList.push(found.nameEn);
    });
    if (editingCategory?.rubricsEn) {
      editingCategory.rubricsEn.forEach((existingEn) => {
        const stillMatches = effectiveRubrics.some((rName) => {
          const found = safeTaxonomiesCategories.find((tc) => tc.name.toLowerCase() === rName.toLowerCase());
          return found?.nameEn?.toLowerCase() === existingEn.toLowerCase();
        });
        if (stillMatches && !rubricsEnList.some((x) => x.toLowerCase() === existingEn.toLowerCase())) {
          rubricsEnList.push(existingEn);
        }
      });
    }
    if (formNameEn.trim() && rubricsEnList.length === 0 && selectedTopics.length === 0) {
      rubricsEnList.push(formNameEn.trim());
    }

    // Відповідні назви EN для вибраних тем
    const topicsEnList: string[] = [];
    selectedTopics.forEach((tName) => {
      const found = safeTaxonomiesTopics.find((tt) => tt.name.toLowerCase() === tName.toLowerCase());
      if (found?.nameEn) topicsEnList.push(found.nameEn);
    });

    setIsSaving(true);
    try {
      if (editingCategory) {
        const updated = safeCategories.map((c) =>
          c.id === editingCategory.id
            ? {
                ...c,
                name: cleanName,
                nameEn: formNameEn.trim() || undefined,
                slug: cleanSlug,
                rubrics: effectiveRubrics,
                rubricsEn: rubricsEnList.length > 0 ? rubricsEnList : undefined,
                topics: selectedTopics,
                topicsEn: topicsEnList.length > 0 ? topicsEnList : undefined,
              }
            : c
        );
        await onSaveCategories(updated);
        showNotification(`Категорію «${cleanName}» успішно збережено`);
      } else {
        const newCat: NavigationCategory = {
          id: `cat-nav-${Date.now()}`,
          name: cleanName,
          nameEn: formNameEn.trim() || undefined,
          slug: cleanSlug,
          rubrics: effectiveRubrics,
          rubricsEn: rubricsEnList.length > 0 ? rubricsEnList : undefined,
          topics: selectedTopics,
          topicsEn: topicsEnList.length > 0 ? topicsEnList : undefined,
          order: safeCategories.length,
        };
        await onSaveCategories([...safeCategories, newCat]);
        showNotification(`Категорію «${cleanName}» створено та збережено`);
      }

      setIsModalOpen(false);
      setEditingCategory(null);
      setFormError(null);
    } catch (err: any) {
      const msg = formatErrorMessage(err, 'Не вдалося зберегти категорію на сервері');
      setFormError(msg);
      showNotification(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestDeleteCategory = (cat: NavigationCategory) => {
    setCategoryPendingDelete(cat);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryPendingDelete) return;
    const target = categoryPendingDelete;
    setIsSaving(true);
    try {
      const updated = safeCategories
        .filter((c) => c.id !== target.id)
        .map((c, idx) => ({ ...c, order: idx }));
      await onSaveCategories(updated);
      setCategoryPendingDelete(null);
      showNotification(`Категорію «${target.name}» видалено`);
    } catch (err: any) {
      showNotification(formatErrorMessage(err, 'Помилка видалення категорії на сервері'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index <= 0 || isSaving) return;
    const reordered = safeCategories.map((c) => ({ ...c }));
    const temp = reordered[index - 1];
    reordered[index - 1] = reordered[index];
    reordered[index] = temp;
    reordered.forEach((c, idx) => {
      c.order = idx;
    });
    setIsSaving(true);
    try {
      await onSaveCategories(reordered);
      showNotification('Порядок категорій збережено');
    } catch (err: any) {
      showNotification(formatErrorMessage(err, 'Не вдалося зберегти порядок категорій'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= safeCategories.length - 1 || isSaving) return;
    const reordered = safeCategories.map((c) => ({ ...c }));
    const temp = reordered[index + 1];
    reordered[index + 1] = reordered[index];
    reordered[index] = temp;
    reordered.forEach((c, idx) => {
      c.order = idx;
    });
    setIsSaving(true);
    try {
      await onSaveCategories(reordered);
      showNotification('Порядок категорій збережено');
    } catch (err: any) {
      showNotification(formatErrorMessage(err, 'Не вдалося зберегти порядок категорій'));
    } finally {
      setIsSaving(false);
    }
  };

  // Фільтровані списки для форми
  const filteredRubrics = safeTaxonomiesCategories.filter(
    (c) =>
      c.name.toLowerCase().includes(rubricSearch.toLowerCase()) ||
      (c.nameEn && c.nameEn.toLowerCase().includes(rubricSearch.toLowerCase()))
  );

  const filteredTopics = safeTaxonomiesTopics.filter(
    (t) =>
      t.name.toLowerCase().includes(topicSearch.toLowerCase()) ||
      (t.nameEn && t.nameEn.toLowerCase().includes(topicSearch.toLowerCase()))
  );

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-page-fade-in">
      {/* Заголовок розділу */}
      <div className="pb-6 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-black" />
            <h1 className="text-xl sm:text-2xl font-serif font-medium text-black">
              Категорії сайту
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 max-w-2xl">
            Керуйте категоріями, які відображаються у випадаючому списку «Категорії» в шапці сайту.
            Обирайте, які рубрики та теми входять до кожної категорії — користувачі побачать лише матеріали без внутрішньої розмітки.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {onRefreshCategories && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isSaving}
              title="Оновити категорії безпосередньо із бази даних"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs sm:text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Оновити</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenCreateModal}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Створити категорію</span>
          </button>
        </div>
      </div>

      {/* Пояснювальна плашка */}
      <div className="p-4 bg-neutral-50 border border-neutral-200/80 rounded-xl flex items-start gap-3">
        <Info className="w-4 h-4 text-neutral-600 mt-0.5 shrink-0" />
        <div className="text-xs text-neutral-600 leading-relaxed">
          <strong className="text-black font-semibold">Як працюють категорії:</strong>{' '}
          У шапці сайту посилання розміщені в порядку: <strong>«Новини»</strong>, <strong>«Категорії»</strong> (зі списком) та <strong>«Популярні»</strong>.{' '}
          Коли відвідувач розгортає <strong>«Категорії»</strong>, він бачить пункти зі списку нижче (наприклад, «Статті», «Огляди»).{' '}
          Для читача вибрані всередині рубрики і теми <em>не показуються</em> — вони використовуються системою суто для фільтрації відповідних статей.
        </div>
      </div>

      {/* Список категорій */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs uppercase tracking-wider text-neutral-400 font-semibold px-2">
          <span>Список категорій ({safeCategories.length})</span>
          <span>Порядок та дії</span>
        </div>

        {safeCategories.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-neutral-200 rounded-xl bg-neutral-50/50">
            <Layers className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-600 font-medium">Список категорій наразі порожній</p>
            <p className="text-xs text-neutral-400 mt-1 mb-4">
              Створіть першу категорію для шапки сайту
            </p>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-black text-white text-xs font-medium rounded hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Додати категорію</span>
            </button>
          </div>
        ) : (
          safeCategories.map((cat, index) => {
            const articleCount = getArticleCountForCategory(cat);
            const rubricsList = cat.rubrics || [];
            const topicsList = cat.topics || [];

            return (
              <div
                key={cat.id}
                className="bg-white border border-neutral-200/80 rounded-xl p-5 hover:border-neutral-300 transition-all shadow-2xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center text-xs font-semibold shrink-0">
                      {index + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-base font-semibold text-black tracking-tight">
                          {cat.name}
                        </h3>
                        {cat.nameEn && (
                          <span className="text-xs text-neutral-400 font-normal">
                            / {cat.nameEn}
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded">
                          /{cat.slug}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-1 flex items-center gap-2">
                        <span className="font-medium text-black">{articleCount}</span>
                        <span>
                          {articleCount === 1
                            ? 'стаття відповідає параметрам'
                            : articleCount >= 2 && articleCount <= 4
                            ? 'статті відповідають параметрам'
                            : 'статей відповідають параметрам'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Кнопки переміщення та керування */}
                  <div className="flex items-center gap-1 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveUp(index)}
                      className={`p-1.5 rounded transition-colors cursor-pointer ${
                        index === 0
                          ? 'text-neutral-200 cursor-not-allowed'
                          : 'text-neutral-500 hover:text-black hover:bg-neutral-100'
                      }`}
                      title="Перемістити вище"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === safeCategories.length - 1}
                      onClick={() => handleMoveDown(index)}
                      className={`p-1.5 rounded transition-colors cursor-pointer ${
                        index === safeCategories.length - 1
                          ? 'text-neutral-200 cursor-not-allowed'
                          : 'text-neutral-500 hover:text-black hover:bg-neutral-100'
                      }`}
                      title="Перемістити нижче"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>

                    {onViewCategoryOnSite && (
                      <button
                        type="button"
                        onClick={() => onViewCategoryOnSite(cat.slug)}
                        className="p-1.5 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded transition-colors cursor-pointer"
                        title="Переглянути на сайті"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(cat)}
                      className="p-1.5 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded transition-colors cursor-pointer ml-1"
                      title="Редагувати параметри категорії"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    {canDelete && (
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleRequestDeleteCategory(cat)}
                        className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer disabled:opacity-50"
                        title="Видалити категорію"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Блок з обраними рубриками та темами (відображається лише в адмін-панелі) */}
                <div className="pt-3 border-t border-neutral-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Рубрики */}
                  <div className="bg-neutral-50/70 p-3 rounded-lg border border-neutral-100">
                    <div className="flex items-center gap-1.5 text-neutral-500 font-medium mb-2">
                      <FolderTree className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Включені рубрики ({rubricsList.length}):</span>
                    </div>
                    {rubricsList.length === 0 ? (
                      <span className="text-neutral-400 italic">Жодної рубрики не вибрано</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {rubricsList.map((r, i) => (
                          <span
                            key={i}
                            className="bg-white border border-neutral-200 text-neutral-800 px-2 py-0.5 rounded text-[11px]"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Теми */}
                  <div className="bg-neutral-50/70 p-3 rounded-lg border border-neutral-100">
                    <div className="flex items-center gap-1.5 text-neutral-500 font-medium mb-2">
                      <Tag className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Включені теми ({topicsList.length}):</span>
                    </div>
                    {topicsList.length === 0 ? (
                      <span className="text-neutral-400 italic">Жодної теми не вибрано</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {topicsList.map((t, i) => (
                          <span
                            key={i}
                            className="bg-white border border-neutral-200 text-neutral-800 px-2 py-0.5 rounded text-[11px]"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Модальне вікно створення / редагування категорії */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 max-w-2xl w-full p-6 sm:p-7 space-y-6 animate-page-fade-in my-8 max-h-[90vh] flex flex-col">
            {/* Шапка модалки */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-100 shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-black" />
                <h3 className="text-base font-semibold text-black uppercase tracking-wider">
                  {editingCategory ? 'Редагувати категорію' : 'Створити нову категорію'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-black cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Тіло форми з прокруткою */}
            <form onSubmit={handleSaveForm} className="space-y-6 overflow-y-auto pr-1 flex-1">
              {formError && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Поля назви */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-600 mb-1.5">
                    Назва категорії (UA) *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="наприклад: Статті, Огляди..."
                    value={formName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 px-3.5 py-2.5 rounded-lg focus:outline-none focus:border-black focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-600 mb-1.5">
                    Назва англійською (EN)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Articles, Reviews..."
                    value={formNameEn}
                    onChange={(e) => setFormNameEn(e.target.value)}
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 px-3.5 py-2.5 rounded-lg focus:outline-none focus:border-black focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Slug / Посилання */}
              <div>
                <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-600 mb-1.5">
                  URL-ідентифікатор (slug)
                </label>
                <div className="flex items-center">
                  <span className="text-xs text-neutral-400 bg-neutral-100 border border-r-0 border-neutral-200 px-3 py-2.5 rounded-l-lg select-none">
                    /category/
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="articles"
                    value={formSlug}
                    onChange={(e) => {
                      setIsSlugManuallyEdited(true);
                      setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
                    }}
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 px-3 py-2.5 rounded-r-lg focus:outline-none focus:border-black focus:bg-white transition-all font-mono"
                  />
                </div>
              </div>

              {/* Інформаційний бейдж про приватність рубрик */}
              <div className="p-3 bg-neutral-100/70 border border-neutral-200/70 rounded-lg text-xs text-neutral-600 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-neutral-500 mt-0.5 shrink-0" />
                <span>
                  Виберіть, які рубрики та теми мають автоматично потрапляти до цієї категорії.
                  Для читачів ці зв'язки будуть приховані — вони бачитимуть лише категорію <strong>«{formName || 'Назва'}»</strong>.
                </span>
              </div>

              {/* ВИБІР РУБРИК */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-black">
                    <FolderTree className="w-4 h-4" />
                    <span>Рубрики журналу ({selectedRubrics.length} вибрано)</span>
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={handleSelectAllRubrics}
                      className="text-neutral-500 hover:text-black underline cursor-pointer"
                    >
                      Обрати всі
                    </button>
                    <span className="text-neutral-300">•</span>
                    <button
                      type="button"
                      onClick={handleClearAllRubrics}
                      className="text-neutral-500 hover:text-black underline cursor-pointer"
                    >
                      Очистити
                    </button>
                  </div>
                </div>

                {safeTaxonomiesCategories.length > 8 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Швидкий пошук рубрик..."
                      value={rubricSearch}
                      onChange={(e) => setRubricSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded focus:outline-none focus:border-black"
                    />
                  </div>
                )}

                <div className="max-h-48 overflow-y-auto p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 flex flex-wrap gap-2">
                  {filteredRubrics.map((cat) => {
                    const isSelected = selectedRubrics.some(
                      (r) => r.toLowerCase() === cat.name.toLowerCase()
                    );
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleToggleRubric(cat.name)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-black text-white border-black shadow-2xs'
                            : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                        <span>{cat.name}</span>
                        {cat.nameEn && (
                          <span className={`text-[10px] ${isSelected ? 'text-neutral-300' : 'text-neutral-400'}`}>
                            ({cat.nameEn})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ВИБІР ТЕМ / ТЕГІВ */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-black">
                    <Tag className="w-4 h-4" />
                    <span>Теми та теги ({selectedTopics.length} вибрано)</span>
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={handleSelectAllTopics}
                      className="text-neutral-500 hover:text-black underline cursor-pointer"
                    >
                      Обрати всі
                    </button>
                    <span className="text-neutral-300">•</span>
                    <button
                      type="button"
                      onClick={handleClearAllTopics}
                      className="text-neutral-500 hover:text-black underline cursor-pointer"
                    >
                      Очистити
                    </button>
                  </div>
                </div>

                {safeTaxonomiesTopics.length > 8 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Швидкий пошук тем..."
                      value={topicSearch}
                      onChange={(e) => setTopicSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded focus:outline-none focus:border-black"
                    />
                  </div>
                )}

                <div className="max-h-48 overflow-y-auto p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 flex flex-wrap gap-2">
                  {filteredTopics.map((top) => {
                    const clean = top.name.replace(/^#+/, '');
                    const isSelected = selectedTopics.some(
                      (t) => t.toLowerCase() === clean.toLowerCase()
                    );
                    return (
                      <button
                        key={top.id}
                        type="button"
                        onClick={() => handleToggleTopic(clean)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                            : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                        <span>#{clean}</span>
                        {top.nameEn && (
                          <span className={`text-[10px] ${isSelected ? 'text-neutral-300' : 'text-neutral-400'}`}>
                            ({top.nameEn})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Попередній перегляд підрахунку */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center justify-between text-xs text-emerald-950">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>
                    Зараз цим налаштуванням відповідає <strong>{currentFormArticleCount}</strong> статей на сайті
                  </span>
                </div>
              </div>

              {/* Кнопки збереження */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-medium text-neutral-600 hover:text-black transition-colors cursor-pointer disabled:opacity-50"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSaving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>
                    {isSaving
                      ? 'Збереження...'
                      : editingCategory
                      ? 'Зберегти зміни'
                      : 'Створити категорію'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальне вікно підтвердження видалення категорії (без блокуючого window.confirm) */}
      {categoryPendingDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 max-w-md w-full p-6 space-y-5 animate-page-fade-in">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-black">Видалити категорію?</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Пункт «{categoryPendingDelete.name}» зникне з меню «Категорії» у шапці сайту (самі статті залишаться).
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setCategoryPendingDelete(null)}
                className="text-neutral-400 hover:text-black cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setCategoryPendingDelete(null)}
                className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-black transition-colors cursor-pointer disabled:opacity-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleConfirmDeleteCategory}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isSaving ? 'Видалення...' : 'Видалити'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
