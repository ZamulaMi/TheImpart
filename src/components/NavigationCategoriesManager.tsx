import React, { useState, useMemo } from 'react';
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
  Eye,
  Sparkles,
  Info,
  Search,
} from 'lucide-react';
import { NavigationCategory, TaxonomiesData, Article } from '../types';
import { slugifyCategory, matchesNavCategory } from '../utils/categories';

interface NavigationCategoriesManagerProps {
  categories: NavigationCategory[];
  onSaveCategories: (categories: NavigationCategory[]) => void;
  taxonomies: TaxonomiesData;
  articles: Article[];
  showNotification: (msg: string) => void;
  canDelete?: boolean;
  onViewCategoryOnSite?: (slug: string) => void;
}

export const NavigationCategoriesManager: React.FC<NavigationCategoriesManagerProps> = ({
  categories,
  onSaveCategories,
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

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formName.trim();
    if (!cleanName) {
      showNotification('Вкажіть назву категорії');
      return;
    }

    const cleanSlug = formSlug.trim() || slugifyCategory(cleanName);

    // Перевірка дублікатів slug
    const duplicateSlug = safeCategories.some(
      (c) => c.slug.toLowerCase() === cleanSlug.toLowerCase() && c.id !== editingCategory?.id
    );
    if (duplicateSlug) {
      showNotification(`Категорія з посиланням «/${cleanSlug}» вже існує`);
      return;
    }

    if (selectedRubrics.length === 0 && selectedTopics.length === 0) {
      showNotification('Виберіть хоча б одну рубрику або тему для цієї категорії');
      return;
    }

    // Відповідні назви EN для вибраних рубрик
    const rubricsEnList: string[] = [];
    selectedRubrics.forEach((rName) => {
      const found = safeTaxonomiesCategories.find((tc) => tc.name.toLowerCase() === rName.toLowerCase());
      if (found?.nameEn) rubricsEnList.push(found.nameEn);
    });

    // Відповідні назви EN для вибраних тем
    const topicsEnList: string[] = [];
    selectedTopics.forEach((tName) => {
      const found = safeTaxonomiesTopics.find((tt) => tt.name.toLowerCase() === tName.toLowerCase());
      if (found?.nameEn) topicsEnList.push(found.nameEn);
    });

    if (editingCategory) {
      // Оновлення наявної категорії
      const updated = safeCategories.map((c) =>
        c.id === editingCategory.id
          ? {
              ...c,
              name: cleanName,
              nameEn: formNameEn.trim() || undefined,
              slug: cleanSlug,
              rubrics: selectedRubrics,
              rubricsEn: rubricsEnList.length > 0 ? rubricsEnList : undefined,
              topics: selectedTopics,
              topicsEn: topicsEnList.length > 0 ? topicsEnList : undefined,
            }
          : c
      );
      onSaveCategories(updated);
      showNotification(`Категорію «${cleanName}» успішно оновлено`);
    } else {
      // Створення нової категорії
      const newCat: NavigationCategory = {
        id: `cat-nav-${Date.now()}`,
        name: cleanName,
        nameEn: formNameEn.trim() || undefined,
        slug: cleanSlug,
        rubrics: selectedRubrics,
        rubricsEn: rubricsEnList.length > 0 ? rubricsEnList : undefined,
        topics: selectedTopics,
        topicsEn: topicsEnList.length > 0 ? topicsEnList : undefined,
        order: safeCategories.length,
      };
      onSaveCategories([...safeCategories, newCat]);
      showNotification(`Категорію «${cleanName}» створено та додано до списку`);
    }

    setIsModalOpen(false);
    setEditingCategory(null);
  };

  const handleDeleteCategory = (cat: NavigationCategory) => {
    if (!window.confirm(`Ви дійсно бажаєте видалити категорію «${cat.name}» з меню?`)) {
      return;
    }
    const updated = safeCategories.filter((c) => c.id !== cat.id);
    onSaveCategories(updated);
    showNotification(`Категорію «${cat.name}» видалено`);
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const reordered = [...safeCategories];
    const temp = reordered[index - 1];
    reordered[index - 1] = reordered[index];
    reordered[index] = temp;
    reordered.forEach((c, idx) => {
      c.order = idx;
    });
    onSaveCategories(reordered);
  };

  const handleMoveDown = (index: number) => {
    if (index >= safeCategories.length - 1) return;
    const reordered = [...safeCategories];
    const temp = reordered[index + 1];
    reordered[index + 1] = reordered[index];
    reordered[index] = temp;
    reordered.forEach((c, idx) => {
      c.order = idx;
    });
    onSaveCategories(reordered);
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

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs self-start sm:self-auto shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Створити категорію</span>
        </button>
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
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
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
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-medium text-neutral-600 hover:text-black transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingCategory ? 'Зберегти зміни' : 'Створити категорію'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
