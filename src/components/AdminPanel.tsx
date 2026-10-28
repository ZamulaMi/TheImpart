import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  Check,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Video as VideoIcon,
  X,
  Languages,
  Copy,
  FileText,
  Share2,
  Upload,
  Link2,
  FolderTree,
  Tag,
  LogOut,
  Shield,
  Users,
  Clock,
  Inbox,
  CheckCircle2,
  XCircle,
  AlertCircle,
  User,
  BookOpen,
  BarChart2,
  Layers,
} from 'lucide-react';
import { Article, SiteSocialLinks, TaxonomiesData, ArticleDraft, UserRole, SitePagesData, DEFAULT_PAGES_DATA, NavigationCategory } from '../types';
import { formatTimeAgoOrDate } from '../utils/date';
import { ContentRenderer } from './ContentRenderer';
import { SocialLinksManager } from './SocialLinksManager';
import { RichArticleEditor } from './RichArticleEditor';
import { TaxonomyManager } from './TaxonomyManager';
import { NavigationCategoriesManager } from './NavigationCategoriesManager';
import { AdminSecurityManager } from './AdminSecurityManager';
import { EditorAccountsManager } from './EditorAccountsManager';
import { DraftsManager } from './DraftsManager';
import { StaticPagesManager } from './StaticPagesManager';
import { StatsManager } from './StatsManager';
import { getAuthHeaders } from '../services/auth';
import { fetchArticleViewsMap } from '../services/stats';
import { formatErrorMessage } from '../utils/errors';
import { hasSubstantiveArticleChanges } from '../utils/seo';

interface AdminPanelProps {
  articles?: Article[];
  onSaveArticle: (article: Article) => Promise<void> | void;
  onDeleteArticle: (id: string) => Promise<void> | void;
  onExitAdmin: () => void;
  onLogout?: () => void;
  onViewArticleOnSite: (id: string) => void;
  socialLinks?: SiteSocialLinks;
  onSaveSocialLinks: (links: SiteSocialLinks) => Promise<void> | void;
  onRefreshSocialLinks?: () => Promise<void>;
  pages?: SitePagesData;
  onSavePages?: (pages: SitePagesData) => Promise<void> | void;
  onViewPageOnSite?: (pageSlug: 'about' | 'contacts') => void;
  taxonomies?: TaxonomiesData;
  onSaveTaxonomies: (data: TaxonomiesData) => void;
  navCategories?: NavigationCategory[];
  onSaveNavCategories?: (categories: NavigationCategory[]) => Promise<void> | void;
  onViewCategoryOnSite?: (slug: string) => void;
  userRole?: UserRole;
  userDisplayName?: string;
  username?: string;
  drafts?: ArticleDraft[];
  onSaveDraft?: (draft: ArticleDraft) => Promise<void> | void;
  onApproveDraft?: (draft: ArticleDraft) => Promise<void> | void;
  onRejectDraft?: (draftId: string, note?: string) => Promise<void> | void;
  onDeleteDraft?: (draftId: string) => Promise<void> | void;
  onRefreshDrafts?: () => Promise<void>;
}

function parseShowExcerpt(val: any, fallback = true): boolean {
  if (val === undefined || val === null) return fallback;
  if (val === false || val === 'false' || val === 0 || val === '0') return false;
  if (val === true || val === 'true' || val === 1 || val === '1') return true;
  return fallback;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  articles: rawArticles = [],
  onSaveArticle,
  onDeleteArticle,
  onExitAdmin,
  onLogout,
  onViewArticleOnSite,
  socialLinks = { ua: {}, en: {} },
  onSaveSocialLinks,
  onRefreshSocialLinks,
  pages,
  onSavePages,
  onViewPageOnSite,
  taxonomies = { categories: [], topics: [] },
  onSaveTaxonomies,
  navCategories = [],
  onSaveNavCategories,
  onViewCategoryOnSite,
  userRole = 'admin',
  userDisplayName,
  username,
  drafts = [],
  onSaveDraft,
  onApproveDraft,
  onRejectDraft,
  onDeleteDraft,
  onRefreshDrafts,
}) => {
  const isEditor = userRole === 'editor';
  const articles = Array.isArray(rawArticles) ? rawArticles.filter(Boolean) : [];
  // Розділи панелі
  const [activeSection, setActiveSection] = useState<'articles' | 'stats' | 'drafts' | 'nav_categories' | 'taxonomies' | 'pages' | 'editors' | 'social_links' | 'security'>('articles');
  const [editorArticlesTab, setEditorArticlesTab] = useState<'articles' | 'my_drafts'>('articles');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  // Карта переглядів з бази даних
  const [viewsMap, setViewsMap] = useState<Record<string, number>>({});

  const refreshViews = async () => {
    try {
      const data = await fetchArticleViewsMap();
      if (data && typeof data === 'object') {
        setViewsMap(data);
      }
    } catch {}
  };

  useEffect(() => {
    refreshViews();
    const interval = setInterval(refreshViews, 20000);
    return () => clearInterval(interval);
  }, [activeSection]);

  const [editingArticle, setEditingArticle] = useState<Partial<Article> | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'published_ua' | 'published_en' | 'hidden'>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Стан для безпечного підтвердження видалення статті без блокування браузером iframe
  const [articlePendingDelete, setArticlePendingDelete] = useState<Article | null>(null);
  const [isDeletingArticle, setIsDeletingArticle] = useState(false);

  const handleConfirmDelete = async () => {
    if (!articlePendingDelete) return;
    setIsDeletingArticle(true);
    try {
      await onDeleteArticle(articlePendingDelete.id);
      showNotification('Статтю назавжди видалено з сервера та бази даних.');
      setArticlePendingDelete(null);
    } catch (err: any) {
      console.error('Delete article failed:', err);
      showNotification(`Помилка видалення: ${err.message || 'Не вдалося видалити статтю на сервері'}`);
    } finally {
      setIsDeletingArticle(false);
    }
  };

  // Швидке створення рубрик та тем безпосередньо у формі статті
  const [showQuickCreateCat, setShowQuickCreateCat] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');
  const [quickCatNameEn, setQuickCatNameEn] = useState('');

  const [showQuickCreateTop, setShowQuickCreateTop] = useState(false);
  const [quickTopName, setQuickTopName] = useState('');
  const [quickTopNameEn, setQuickTopNameEn] = useState('');

  // Мовна вкладка у редакторі форми: 'ua' або 'en'
  const [formLangTab, setFormLangTab] = useState<'ua' | 'en'>('ua');

  // Вкладка перегляду контенту: 'edit' або 'preview'
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');

  const coverFileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCover(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 1920;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(event.target?.result as string);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.88));
          };
          img.onerror = () => reject(new Error('Не вдалося завантажити зображення'));
          img.src = event.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Помилка читання файлу'));
        reader.readAsDataURL(file);
      });

      let finalUrl = dataUrl;
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ data: dataUrl, filename: file.name }),
        });
        if (res.ok) {
          const resJson = await res.json();
          if (resJson.url) finalUrl = resJson.url;
        }
      } catch {}

      setEditingArticle((prev) => ({
        ...prev,
        coverImage: finalUrl,
      }));
      showNotification('Головну обкладинку успішно завантажено!');
    } catch {
      showNotification('Помилка завантаження фотографії');
    } finally {
      setIsUploadingCover(false);
    }
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleStartCreate = () => {
    setErrorMsg(null);
    setIsCreatingNew(true);
    setEditingDraftId(null);
    setFormLangTab('ua');
    setEditorTab('edit');
    setEditingArticle({
      id: Date.now().toString(),
      title: '',
      excerpt: '',
      showExcerptInArticle: true,
      content: '',
      category: 'Есе',
      categories: ['Есе'],
      topics: [],
      author: isEditor ? (userDisplayName || username || 'Редактор The Impart') : 'Редакція The Impart',
      coverImage: '',
      date: new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }),
      published: true,
      titleEn: '',
      excerptEn: '',
      showExcerptInArticleEn: true,
      contentEn: '',
      categoryEn: 'Essay',
      categoriesEn: ['Essay'],
      topicsEn: [],
      publishedEn: false,
    });
  };

  const handleStartEdit = (article: Article) => {
    setErrorMsg(null);
    setIsCreatingNew(false);
    setEditingDraftId(null);
    setFormLangTab('ua');
    setEditorTab('edit');
    const initialCats =
      article.categories && article.categories.length > 0
        ? [...article.categories]
        : article.category
        ? article.category.split(',').map((c) => c.trim()).filter(Boolean)
        : ['Загальне'];
    const initialCatsEn =
      article.categoriesEn && article.categoriesEn.length > 0
        ? [...article.categoriesEn]
        : article.categoryEn
        ? article.categoryEn.split(',').map((c) => c.trim()).filter(Boolean)
        : [];
    const initialTopics = (
      Array.isArray(article.topics)
        ? article.topics
        : typeof (article as any).topics === 'string' && (article as any).topics.trim()
        ? (article as any).topics.split(',')
        : []
    )
      .map((s: any) => String(s).trim().replace(/^#+/, ''))
      .filter(Boolean);
    const initialTopicsEn = (
      Array.isArray(article.topicsEn)
        ? article.topicsEn
        : typeof (article as any).topicsEn === 'string' && (article as any).topicsEn.trim()
        ? (article as any).topicsEn.split(',')
        : []
    )
      .map((s: any) => String(s).trim().replace(/^#+/, ''))
      .filter(Boolean);

    setEditingArticle({
      ...article,
      showExcerptInArticle: parseShowExcerpt(article.showExcerptInArticle, true),
      showExcerptInArticleEn: article.showExcerptInArticleEn !== undefined
        ? parseShowExcerpt(article.showExcerptInArticleEn, true)
        : parseShowExcerpt(article.showExcerptInArticle, true),
      categories: initialCats,
      categoriesEn: initialCatsEn,
      topics: initialTopics,
      topicsEn: initialTopicsEn,
      views: Math.max(viewsMap[article.id] ?? 0, article.views ?? 0),
    });
  };

  const handleEditDraft = (draft: ArticleDraft) => {
    setErrorMsg(null);
    setIsCreatingNew(draft.type === 'new');
    setEditingDraftId(draft.id);
    setActiveSection('articles');
    setFormLangTab('ua');
    setEditorTab('edit');

    const art = draft.articleData;
    const initialCats =
      art.categories && art.categories.length > 0
        ? [...art.categories]
        : art.category
        ? art.category.split(',').map((c: any) => c.trim()).filter(Boolean)
        : ['Загальне'];
    const initialCatsEn =
      art.categoriesEn && art.categoriesEn.length > 0
        ? [...art.categoriesEn]
        : art.categoryEn
        ? art.categoryEn.split(',').map((c: any) => c.trim()).filter(Boolean)
        : [];
    const initialTopics = (
      Array.isArray(art.topics)
        ? art.topics
        : typeof (art as any).topics === 'string' && (art as any).topics.trim()
        ? (art as any).topics.split(',')
        : []
    )
      .map((s: any) => String(s).trim().replace(/^#+/, ''))
      .filter(Boolean);
    const initialTopicsEn = (
      Array.isArray(art.topicsEn)
        ? art.topicsEn
        : typeof (art as any).topicsEn === 'string' && (art as any).topicsEn.trim()
        ? (art as any).topicsEn.split(',')
        : []
    )
      .map((s: any) => String(s).trim().replace(/^#+/, ''))
      .filter(Boolean);

    setEditingArticle({
      ...art,
      showExcerptInArticle: parseShowExcerpt(art?.showExcerptInArticle, true),
      showExcerptInArticleEn: art?.showExcerptInArticleEn !== undefined
        ? parseShowExcerpt(art.showExcerptInArticleEn, true)
        : parseShowExcerpt(art?.showExcerptInArticle, true),
      categories: initialCats,
      categoriesEn: initialCatsEn,
      topics: initialTopics,
      topicsEn: initialTopicsEn,
      views: (art?.id ? viewsMap[art.id] : undefined) ?? art?.views ?? 0,
    });
  };

  const handleCancel = () => {
    setErrorMsg(null);
    setEditingArticle(null);
    setEditingDraftId(null);
    setIsCreatingNew(false);
    setEditorTab('edit');
  };

  // Швидке перемикання видимості статті для української версії
  const handleToggleUaVisibility = async (article: Article) => {
    const isCurrentlyPublished =
      article.published === true || String(article.published) === 'true' || (article.published as any) === 1;
    const nextPublished = !isCurrentlyPublished;

    setTogglingId(`ua_${article.id}`);
    try {
      await onSaveArticle({
        ...article,
        published: nextPublished,
      });
      showNotification(
        nextPublished
          ? `Українську версію «${article.title}» опубліковано на сайті.`
          : `Українську версію «${article.title}» приховано з сайту.`
      );
    } catch (err: any) {
      console.error('Toggle visibility error:', err);
      showNotification(`Помилка: ${err.message || 'Не вдалося змінити видимість'}`);
    } finally {
      setTogglingId(null);
    }
  };

  // Швидке перемикання видимості статті для англійської версії
  const handleToggleEnVisibility = async (article: Article) => {
    if (!article.titleEn?.trim()) {
      showNotification('Спочатку заповніть англійську версію статті у редакторі.');
      return;
    }

    const isCurrentlyPublished =
      article.publishedEn === true || String(article.publishedEn) === 'true' || (article.publishedEn as any) === 1;
    const nextPublished = !isCurrentlyPublished;

    setTogglingId(`en_${article.id}`);
    try {
      await onSaveArticle({
        ...article,
        publishedEn: nextPublished,
      });
      showNotification(
        nextPublished
          ? `Англійську версію «${article.titleEn}» опубліковано на сайті.`
          : `Англійську версію «${article.titleEn}» приховано з сайту.`
      );
    } catch (err: any) {
      console.error('Toggle visibility error:', err);
      showNotification(`Помилка: ${err.message || 'Не вдалося змінити видимість'}`);
    } finally {
      setTogglingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArticle || !editingArticle.title?.trim()) {
      setErrorMsg('Будь ласка, вкажіть заголовок статті для основної (української) версії.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    const isPub = editingArticle.published !== false && String(editingArticle.published) !== 'false';
    const isPubEn =
      editingArticle.publishedEn === true || String(editingArticle.publishedEn) === 'true';

    // Автоматично додаємо тему, якщо користувач ввів її в поле, але не натиснув кнопку
    const finalTopics = Array.isArray(editingArticle.topics)
      ? [...editingArticle.topics]
      : [];
    const finalTopicsEn = Array.isArray(editingArticle.topicsEn)
      ? [...editingArticle.topicsEn]
      : [];

    const pendingTopic = quickTopName.trim().replace(/^#+/, '');
    const pendingTopicEn = quickTopNameEn.trim().replace(/^#+/, '');
    if (pendingTopic && !finalTopics.includes(pendingTopic)) {
      finalTopics.push(pendingTopic);
    }
    if (pendingTopicEn && !finalTopicsEn.includes(pendingTopicEn)) {
      finalTopicsEn.push(pendingTopicEn);
    }

    const existing = !isCreatingNew ? articles.find((a) => a.id === editingArticle.id) : undefined;

    // КРИТИЧНО: Первинна дата створення (createdAt) та дата публікації (date) фіксуються НАЗАВЖДИ!
    // При будь-якому редагуванні (обкладинка, текст, заголовок тощо) дата публікації для користувачів сайту НЕ ЗМІНЮЄТЬСЯ.
    const originalCreatedAt = existing?.createdAt || editingArticle.createdAt || new Date().toISOString();
    const originalDate = existing?.date || editingArticle.date || new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
    const updatedAt = existing
      ? hasSubstantiveArticleChanges(existing, editingArticle)
        ? new Date().toISOString()
        : existing.updatedAt
      : undefined;

    const finalArticle: Article = {
      id: editingArticle.id || Date.now().toString(),
      // Українська версія
      title: editingArticle.title.trim(),
      excerpt: editingArticle.excerpt?.trim() || '',
      showExcerptInArticle: parseShowExcerpt(editingArticle.showExcerptInArticle, true),
      content: editingArticle.content?.trim() || '',
      category:
        editingArticle.categories && editingArticle.categories.length > 0
          ? editingArticle.categories.join(', ')
          : editingArticle.category?.trim() || 'Загальне',
      categories:
        editingArticle.categories && editingArticle.categories.length > 0
          ? editingArticle.categories
          : editingArticle.category
          ? [editingArticle.category.trim()]
          : ['Загальне'],
      topics: finalTopics,
      published: isPub,
      // Загальні метадані
      author: editingArticle.author?.trim() || 'Редакція The Impart',
      coverImage: editingArticle.coverImage?.trim() || undefined,
      coverImageCaption: editingArticle.coverImageCaption?.trim() || undefined,
      coverImageCaptionEn: editingArticle.coverImageCaptionEn?.trim() || undefined,
      date: originalDate,
      createdAt: originalCreatedAt,
      updatedAt: updatedAt,
      // Англійська версія
      titleEn: editingArticle.titleEn?.trim() || undefined,
      excerptEn: editingArticle.excerptEn?.trim() || undefined,
      showExcerptInArticleEn: editingArticle.showExcerptInArticleEn !== undefined
        ? parseShowExcerpt(editingArticle.showExcerptInArticleEn, true)
        : parseShowExcerpt(editingArticle.showExcerptInArticle, true),
      contentEn: editingArticle.contentEn?.trim() || undefined,
      categoryEn:
        editingArticle.categoriesEn && editingArticle.categoriesEn.length > 0
          ? editingArticle.categoriesEn.join(', ')
          : editingArticle.categoryEn?.trim() || undefined,
      categoriesEn:
        editingArticle.categoriesEn && editingArticle.categoriesEn.length > 0
          ? editingArticle.categoriesEn
          : editingArticle.categoryEn
          ? [editingArticle.categoryEn.trim()]
          : undefined,
      topicsEn: finalTopicsEn,
      publishedEn: isPubEn,
      views: Math.max(existing?.views ?? 0, editingArticle.views ?? 0, (editingArticle.id ? viewsMap[editingArticle.id] : 0) ?? 0),
    };

    if (isEditor && onSaveDraft) {
      const existingDraft = editingDraftId
        ? drafts.find((d) => d.id === editingDraftId)
        : null;

      const draftPayload: ArticleDraft = {
        id: editingDraftId || `draft-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: isCreatingNew ? 'new' : 'update',
        articleId: isCreatingNew ? undefined : finalArticle.id,
        originalArticleTitle: isCreatingNew
          ? undefined
          : articles.find((a) => a.id === finalArticle.id)?.title || finalArticle.title,
        authorUsername: username || 'editor',
        authorDisplayName: userDisplayName || username || 'Редактор',
        articleData: finalArticle,
        createdAt: existingDraft?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
      };

      try {
        await onSaveDraft(draftPayload);
      } catch (err) {
        console.warn('Draft sync notice:', err);
      }
    }

    try {
      await onSaveArticle(finalArticle);
      if (editingDraftId && onApproveDraft) {
        const draft = drafts.find((d) => d.id === editingDraftId);
        if (draft) {
          try {
            await onApproveDraft({ ...draft, articleData: finalArticle });
          } catch {}
        }
      }
      try {
        localStorage.removeItem(`impart_autosave_${finalArticle.id}_ua`);
        localStorage.removeItem(`impart_autosave_${finalArticle.id}_en`);
        localStorage.removeItem(`impart_autosave_new_ua`);
        localStorage.removeItem(`impart_autosave_new_en`);
      } catch {}
      showNotification(
        isCreatingNew
          ? 'Статтю успішно створено та опубліковано у базі даних!'
          : 'Зміни успішно збережено та опубліковано!'
      );
      setEditingArticle(null);
      setEditingDraftId(null);
      setIsCreatingNew(false);
    } catch (err: any) {
      console.error('Save error:', err);
      setErrorMsg(formatErrorMessage(err, 'Помилка збереження у базі даних.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickCreateCategory = () => {
    const clean = quickCatName.trim();
    if (!clean) return;
    if (taxonomies.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      handleToggleCategory(clean, quickCatNameEn.trim() || undefined);
      setShowQuickCreateCat(false);
      setQuickCatName('');
      setQuickCatNameEn('');
      return;
    }
    const newCat = {
      id: `cat-${Date.now()}`,
      name: clean,
      nameEn: quickCatNameEn.trim() || undefined,
    };
    onSaveTaxonomies({
      ...taxonomies,
      categories: [...taxonomies.categories, newCat],
    });
    setEditingArticle((prev) => {
      if (!prev) return prev;
      const currentCats =
        prev.categories && prev.categories.length > 0
          ? [...prev.categories]
          : prev.category
          ? prev.category.split(',').map((c) => c.trim()).filter(Boolean)
          : [];
      const currentCatsEn =
        prev.categoriesEn && prev.categoriesEn.length > 0
          ? [...prev.categoriesEn]
          : prev.categoryEn
          ? prev.categoryEn.split(',').map((c) => c.trim()).filter(Boolean)
          : [];

      const nextCats = currentCats.includes(clean) ? currentCats : [...currentCats, clean];
      const nextCatsEn =
        quickCatNameEn.trim() && !currentCatsEn.includes(quickCatNameEn.trim())
          ? [...currentCatsEn, quickCatNameEn.trim()]
          : currentCatsEn;

      return {
        ...prev,
        categories: nextCats,
        category: nextCats.join(', '),
        categoriesEn: nextCatsEn,
        categoryEn: nextCatsEn.join(', '),
      };
    });
    setShowQuickCreateCat(false);
    setQuickCatName('');
    setQuickCatNameEn('');
    showNotification(`Створено рубрику «${clean}»`);
  };

  const handleToggleCategory = (catName: string, catNameEn?: string) => {
    setEditingArticle((prev) => {
      if (!prev) return prev;
      const currentCats =
        prev.categories && prev.categories.length > 0
          ? [...prev.categories]
          : prev.category
          ? prev.category.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
      const currentCatsEn =
        prev.categoriesEn && prev.categoriesEn.length > 0
          ? [...prev.categoriesEn]
          : prev.categoryEn
          ? prev.categoryEn.split(',').map((s) => s.trim()).filter(Boolean)
          : [];

      const exists = currentCats.some((c) => c.toLowerCase() === catName.toLowerCase());
      let nextCats: string[];
      let nextCatsEn: string[];

      if (exists) {
        if (currentCats.length <= 1) {
          showNotification('Стаття повинна містити щонайменше одну рубрику.');
          return prev;
        }
        nextCats = currentCats.filter((c) => c.toLowerCase() !== catName.toLowerCase());
        nextCatsEn = catNameEn
          ? currentCatsEn.filter((c) => c.toLowerCase() !== catNameEn.toLowerCase())
          : currentCatsEn;
      } else {
        nextCats = [...currentCats, catName];
        nextCatsEn =
          catNameEn && !currentCatsEn.some((c) => c.toLowerCase() === catNameEn.toLowerCase())
            ? [...currentCatsEn, catNameEn]
            : currentCatsEn;
      }

      return {
        ...prev,
        categories: nextCats,
        category: nextCats.join(', '),
        categoriesEn: nextCatsEn,
        categoryEn: nextCatsEn.join(', '),
      };
    });
  };

  const handleToggleCategoryEn = (enName: string, uaName?: string) => {
    setEditingArticle((prev) => {
      if (!prev) return prev;
      const currentCatsEn =
        prev.categoriesEn && prev.categoriesEn.length > 0
          ? [...prev.categoriesEn]
          : prev.categoryEn
          ? prev.categoryEn.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
      const currentCatsUa =
        prev.categories && prev.categories.length > 0
          ? [...prev.categories]
          : prev.category
          ? prev.category.split(',').map((s) => s.trim()).filter(Boolean)
          : [];

      const exists = currentCatsEn.some((c) => c.toLowerCase() === enName.toLowerCase());
      let nextCatsEn: string[];
      let nextCatsUa = currentCatsUa;

      if (exists) {
        if (currentCatsEn.length <= 1) {
          showNotification('Article must have at least one category.');
          return prev;
        }
        nextCatsEn = currentCatsEn.filter((c) => c.toLowerCase() !== enName.toLowerCase());
      } else {
        nextCatsEn = [...currentCatsEn, enName];
        if (uaName && !currentCatsUa.some((c) => c.toLowerCase() === uaName.toLowerCase())) {
          nextCatsUa = [...currentCatsUa, uaName];
        }
      }

      return {
        ...prev,
        categoriesEn: nextCatsEn,
        categoryEn: nextCatsEn.join(', '),
        categories: nextCatsUa,
        category: nextCatsUa.join(', '),
      };
    });
  };

  // Тимчасові / спеціальні теми, які створені для окремих статей і не входять до постійного каталогу
  const oneOffTopics = useMemo(() => {
    const globalNamesUa = new Set(
      (taxonomies.topics || []).map((t) => t.name.trim().toLowerCase())
    );
    const map = new Map<string, { name: string; nameEn?: string; count: number }>();

    articles.forEach((art) => {
      if (Array.isArray(art.topics)) {
        art.topics.forEach((t, idx) => {
          const clean = t?.trim();
          if (!clean) return;
          const lower = clean.toLowerCase();
          if (!globalNamesUa.has(lower)) {
            const topEn = art.topicsEn && art.topicsEn[idx] ? art.topicsEn[idx].trim() : undefined;
            const existing = map.get(lower);
            if (existing) {
              existing.count += 1;
              if (!existing.nameEn && topEn) existing.nameEn = topEn;
            } else {
              map.set(lower, {
                name: clean,
                nameEn: topEn,
                count: 1,
              });
            }
          }
        });
      }
    });

    return Array.from(map.values());
  }, [articles, taxonomies.topics]);

  const handleQuickCreateTopic = (scope: 'this_article' | 'global' = 'this_article') => {
    const rawClean = quickTopName.trim().replace(/^#+/, '');
    const rawCleanEn = quickTopNameEn.trim().replace(/^#+/, '');
    if (!rawClean && !rawCleanEn) return;

    const clean = rawClean || rawCleanEn;
    const cleanEn = rawCleanEn || rawClean;

    // Якщо обрано збереження для всіх статей — додаємо у постійну таксономію тем
    if (scope === 'global') {
      let updatedTopics = [...taxonomies.topics];
      if (!updatedTopics.some((t) => t.name.trim().replace(/^#+/, '').toLowerCase() === clean.toLowerCase())) {
        const newTop = {
          id: `top-${Date.now()}`,
          name: clean,
          nameEn: cleanEn || undefined,
        };
        updatedTopics.push(newTop);
        onSaveTaxonomies({
          ...taxonomies,
          topics: updatedTopics,
        });
      }
    }

    // Прив'язуємо тему до поточної статті
    setEditingArticle((prev) => {
      if (!prev) return prev;
      const current = (Array.isArray(prev.topics) ? prev.topics : [])
        .map((t) => String(t).trim().replace(/^#+/, ''))
        .filter(Boolean);
      const currentEn = (Array.isArray(prev.topicsEn) ? prev.topicsEn : [])
        .map((t) => String(t).trim().replace(/^#+/, ''))
        .filter(Boolean);

      const nextTopics = current.some((t) => t.toLowerCase() === clean.toLowerCase())
        ? current
        : [...current, clean];
      const nextTopicsEn = cleanEn && !currentEn.some((t) => t.toLowerCase() === cleanEn.toLowerCase())
        ? [...currentEn, cleanEn]
        : currentEn;

      return {
        ...prev,
        topics: nextTopics,
        topicsEn: nextTopicsEn,
      };
    });

    setShowQuickCreateTop(false);
    setQuickTopName('');
    setQuickTopNameEn('');

    if (scope === 'global') {
      showNotification(`Постійну тему «#${clean}» додано до статті та збережено у каталог`);
    } else {
      showNotification(`Тему «#${clean}» прикріплено до цієї статті`);
    }
  };

  const handleToggleTopic = (topicName: string, topicNameEn?: string) => {
    const cleanUa = topicName.trim().replace(/^#+/, '');
    const cleanEn = topicNameEn ? topicNameEn.trim().replace(/^#+/, '') : undefined;
    if (!cleanUa && !cleanEn) return;

    setEditingArticle((prev) => {
      if (!prev) return prev;
      const current = (Array.isArray(prev.topics) ? prev.topics : [])
        .map((t) => String(t).trim().replace(/^#+/, ''))
        .filter(Boolean);
      const currentEn = (Array.isArray(prev.topicsEn) ? prev.topicsEn : [])
        .map((t) => String(t).trim().replace(/^#+/, ''))
        .filter(Boolean);

      const isAttachedUa = cleanUa
        ? current.some((t) => t.toLowerCase() === cleanUa.toLowerCase())
        : false;
      const isAttachedEn = cleanEn
        ? currentEn.some((t) => t.toLowerCase() === cleanEn.toLowerCase())
        : false;
      const isAttached = isAttachedUa || isAttachedEn;

      if (isAttached) {
        return {
          ...prev,
          topics: cleanUa ? current.filter((t) => t.toLowerCase() !== cleanUa.toLowerCase()) : current,
          topicsEn: cleanEn ? currentEn.filter((t) => t.toLowerCase() !== cleanEn.toLowerCase()) : currentEn,
        };
      } else {
        const nextTopics = cleanUa && !isAttachedUa ? [...current, cleanUa] : current;
        const nextTopicsEn = cleanEn && !isAttachedEn ? [...currentEn, cleanEn] : currentEn;
        return {
          ...prev,
          topics: nextTopics,
          topicsEn: nextTopicsEn,
        };
      }
    });
  };

  const handleRemoveTopic = (topicName: string) => {
    const clean = topicName.trim().replace(/^#+/, '').toLowerCase();
    setEditingArticle((prev) => {
      if (!prev) return prev;
      const current = (Array.isArray(prev.topics) ? prev.topics : [])
        .map((t) => String(t).trim().replace(/^#+/, ''))
        .filter(Boolean);
      const currentEn = (Array.isArray(prev.topicsEn) ? prev.topicsEn : [])
        .map((t) => String(t).trim().replace(/^#+/, ''))
        .filter(Boolean);

      const idx = current.findIndex((t) => t.toLowerCase() === clean);
      const newTopics = current.filter((t) => t.toLowerCase() !== clean);
      let newTopicsEn = currentEn;
      if (idx !== -1 && currentEn.length > idx) {
        newTopicsEn = currentEn.filter((_, i) => i !== idx);
      }
      return {
        ...prev,
        topics: newTopics,
        topicsEn: newTopicsEn,
      };
    });
  };

  const handleRemoveTopicEn = (topicNameEn: string) => {
    const clean = topicNameEn.trim().replace(/^#+/, '').toLowerCase();
    setEditingArticle((prev) => {
      if (!prev) return prev;
      const currentEn = (Array.isArray(prev.topicsEn) ? prev.topicsEn : [])
        .map((t) => String(t).trim().replace(/^#+/, ''))
        .filter(Boolean);
      return {
        ...prev,
        topicsEn: currentEn.filter((t) => t.toLowerCase() !== clean),
      };
    });
  };

  const filteredArticles = articles.filter((a) => {
    const isPubUa = a.published === true || String(a.published) === 'true' || (a.published as any) === 1;
    const isPubEn = a.publishedEn === true || String(a.publishedEn) === 'true' || (a.publishedEn as any) === 1;

    if (filterStatus === 'published_ua') return isPubUa;
    if (filterStatus === 'published_en') return isPubEn;
    if (filterStatus === 'hidden') return !isPubUa && !isPubEn;
    return true;
  });

  const uaPublishedCount = articles.filter(
    (a) => a.published === true || String(a.published) === 'true' || (a.published as any) === 1
  ).length;
  const enPublishedCount = articles.filter(
    (a) => a.publishedEn === true || String(a.publishedEn) === 'true' || (a.publishedEn as any) === 1
  ).length;

  const pendingDraftsCount = drafts.filter((d) => d.status === 'pending').length;
  const myDrafts = isEditor
    ? drafts.filter((d) => d.authorUsername.toLowerCase() === (username || '').toLowerCase() || !username)
    : [];

  return (
    <div className="min-h-screen bg-white text-black font-sans flex flex-col light admin-scope" data-theme="light">
      {/* Верхня панель адмінки */}
      <header className="border-b border-neutral-100 bg-white sticky top-0 z-30 px-6 sm:px-12 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <button
            onClick={onExitAdmin}
            className="flex items-center gap-2 text-sm text-neutral-600 hover:text-black transition-colors cursor-pointer group"
            title="Повернутися на головний сайт"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">На сайт</span>
          </button>
          <span className="text-neutral-300">/</span>
          <span
            className="text-lg sm:text-xl font-medium tracking-tight text-black select-none"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            The Impart
          </span>
          <span
            className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-sm ${
              isEditor
                ? 'bg-amber-100 text-amber-900 font-semibold'
                : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {isEditor ? 'Панель редактора' : 'Панель керування'}
          </span>
          {isEditor && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-neutral-700 bg-neutral-100 border border-neutral-200/80 px-2.5 py-0.5 rounded-full font-sans">
              <User className="w-3 h-3 text-neutral-500" />
              <span>Редактор: <strong>{userDisplayName || username || 'Редактор'}</strong></span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onExitAdmin();
            }}
            className="text-xs text-neutral-500 hover:text-black flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Головна сторінка</span>
          </a>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="text-xs text-neutral-500 hover:text-red-600 flex items-center gap-1.5 transition-colors cursor-pointer pl-3 border-l border-neutral-200"
              title="Завершити сеанс"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Вийти</span>
            </button>
          )}
        </div>
      </header>

      {/* Спливаюче сповіщення */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-black text-white text-xs sm:text-sm px-4 py-3 rounded shadow-lg flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Основний контейнер з лівим сайдбаром меню та робочою областю */}
      <div className="flex-1 flex flex-col md:flex-row w-full max-w-7xl mx-auto">
        {/* Лівий сайдбар з кнопками опцій */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-neutral-100 p-6 shrink-0 bg-neutral-50/40">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-3 px-3">
            Розділи
          </div>
          <nav className="flex flex-row md:flex-col gap-1.5">
            {/* Опція 1: Редактор статей (доступно всім) */}
            <button
              type="button"
              onClick={() => {
                setActiveSection('articles');
                setEditingArticle(null);
                setEditingDraftId(null);
                setIsCreatingNew(false);
              }}
              className={`flex-1 md:flex-initial flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                activeSection === 'articles'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Редактор статей</span>
            </button>

            {/* Опція 2: Статистика та перегляди (доступно всім) */}
            <button
              type="button"
              onClick={() => {
                setActiveSection('stats');
                setEditingArticle(null);
                setEditingDraftId(null);
                setIsCreatingNew(false);
              }}
              className={`flex-1 md:flex-initial flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                activeSection === 'stats'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
              }`}
            >
              <BarChart2 className="w-4 h-4 shrink-0" />
              <span>Статистика</span>
            </button>

            {/* Опція 3: Чорнетки та модерація (тільки адміністратор) */}
            {!isEditor && (
              <button
                type="button"
                onClick={() => {
                  setActiveSection('drafts');
                  setEditingArticle(null);
                  setEditingDraftId(null);
                  setIsCreatingNew(false);
                }}
                className={`flex-1 md:flex-initial flex items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                  activeSection === 'drafts'
                    ? 'bg-black text-white shadow-xs'
                    : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Inbox className="w-4 h-4 shrink-0" />
                  <span>Чорнетки</span>
                </div>
                {pendingDraftsCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white animate-pulse">
                    {pendingDraftsCount}
                  </span>
                )}
              </button>
            )}

            {/* Опція: Категорії (для меню сайту) */}
            <button
              type="button"
              onClick={() => {
                setActiveSection('nav_categories');
                setEditingArticle(null);
                setEditingDraftId(null);
                setIsCreatingNew(false);
              }}
              className={`flex-1 md:flex-initial flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                activeSection === 'nav_categories'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span>Категорії</span>
            </button>

            {/* Опція: Рубрики та теми (доступно всім) */}
            <button
              type="button"
              onClick={() => {
                setActiveSection('taxonomies');
                setEditingArticle(null);
                setEditingDraftId(null);
                setIsCreatingNew(false);
              }}
              className={`flex-1 md:flex-initial flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                activeSection === 'taxonomies'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
              }`}
            >
              <FolderTree className="w-4 h-4 shrink-0" />
              <span>Рубрики та теми</span>
            </button>

            {/* Опція 4: Облікові записи редакторів (тільки адміністратор) */}
            {!isEditor && (
              <button
                type="button"
                onClick={() => {
                  setActiveSection('editors');
                  setEditingArticle(null);
                  setEditingDraftId(null);
                  setIsCreatingNew(false);
                }}
                className={`flex-1 md:flex-initial flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                  activeSection === 'editors'
                    ? 'bg-black text-white shadow-xs'
                    : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>Редактори</span>
              </button>
            )}

            {/* Опція 5: Соц. мережі (тільки адміністратор) */}
            {!isEditor && (
              <button
                type="button"
                onClick={() => {
                  setActiveSection('social_links');
                  setEditingArticle(null);
                  setEditingDraftId(null);
                  setIsCreatingNew(false);
                }}
                className={`flex-1 md:flex-initial flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                  activeSection === 'social_links'
                    ? 'bg-black text-white shadow-xs'
                    : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
                }`}
              >
                <Share2 className="w-4 h-4 shrink-0" />
                <span>Соц. мережі</span>
              </button>
            )}

            {/* Опція 6: Сторінки сайту (тільки адміністратор) */}
            {!isEditor && (
              <button
                type="button"
                onClick={() => {
                  setActiveSection('pages');
                  setEditingArticle(null);
                  setEditingDraftId(null);
                  setIsCreatingNew(false);
                }}
                className={`flex-1 md:flex-initial flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                  activeSection === 'pages'
                    ? 'bg-black text-white shadow-xs'
                    : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
                }`}
              >
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>Сторінки сайту</span>
              </button>
            )}

            {/* Опція 6: Безпека та пароль (тільки адміністратор) */}
            {!isEditor && (
              <button
                type="button"
                onClick={() => {
                  setActiveSection('security');
                  setEditingArticle(null);
                  setEditingDraftId(null);
                  setIsCreatingNew(false);
                }}
                className={`flex-1 md:flex-initial flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                  activeSection === 'security'
                    ? 'bg-black text-white shadow-xs'
                    : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
                }`}
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span>Безпека та пароль</span>
              </button>
            )}
          </nav>
        </aside>

        {/* Робоча область вибраного розділу */}
        <main className="flex-1 w-full px-6 sm:px-12 py-8 sm:py-12 overflow-x-hidden">
          {activeSection === 'stats' ? (
            <StatsManager
              taxonomies={taxonomies}
              onViewArticleOnSite={onViewArticleOnSite}
              onEditArticle={(id) => {
                const found = articles.find((a) => a.id === id);
                if (found) {
                  handleStartEdit(found);
                  setActiveSection('articles');
                }
              }}
            />
          ) : activeSection === 'drafts' && !isEditor ? (
            <DraftsManager
              drafts={drafts}
              articles={articles}
              onApproveDraft={onApproveDraft || (async () => {})}
              onRejectDraft={onRejectDraft || (async () => {})}
              onDeleteDraft={onDeleteDraft || (async () => {})}
              onEditDraftInEditor={handleEditDraft}
              showNotification={showNotification}
              onRefreshDrafts={onRefreshDrafts}
            />
          ) : activeSection === 'editors' && !isEditor ? (
            <EditorAccountsManager showNotification={showNotification} />
          ) : activeSection === 'nav_categories' ? (
            <NavigationCategoriesManager
              categories={navCategories}
              onSaveCategories={onSaveNavCategories || (() => {})}
              taxonomies={taxonomies}
              articles={articles}
              showNotification={showNotification}
              canDelete={!isEditor}
              onViewCategoryOnSite={(slug) => {
                if (onViewCategoryOnSite) {
                  onViewCategoryOnSite(slug);
                } else {
                  window.location.href = `/${slug}`;
                }
              }}
            />
          ) : activeSection === 'taxonomies' ? (
            <TaxonomyManager
              taxonomies={taxonomies}
              onSaveTaxonomies={onSaveTaxonomies}
              articles={articles}
              showNotification={showNotification}
              canDelete={!isEditor}
              onUpdateArticles={async (updatedArticles) => {
                for (const art of updatedArticles) {
                  try {
                    await onSaveArticle(art);
                  } catch (e) {
                    console.warn('Update article error:', e);
                  }
                }
              }}
            />
          ) : activeSection === 'social_links' && !isEditor ? (
            <SocialLinksManager
              socialLinks={socialLinks}
              onSaveSocialLinks={onSaveSocialLinks}
              onRefreshSocialLinks={onRefreshSocialLinks}
              showNotification={showNotification}
            />
          ) : activeSection === 'pages' && !isEditor ? (
            <StaticPagesManager
              pages={pages || DEFAULT_PAGES_DATA}
              onSavePages={onSavePages || (async () => {})}
              onViewOnSite={onViewPageOnSite}
            />
          ) : activeSection === 'security' && !isEditor ? (
            <AdminSecurityManager
              showNotification={showNotification}
              onLogout={onLogout}
            />
          ) : editingArticle ? (
          /* Форма редагування / створення статті */
          <div className="max-w-3xl mx-auto space-y-6">
            {isEditor && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <div>
                  <strong className="font-semibold">Збереження як чернетка:</strong> Усі зміни та нові статті зберігаються як чернетки для перевірки головним адміністратором. Поточні опубліковані статті на сайті залишаються без змін до моменту їх схвалення в адмін-панелі.
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pb-6 border-b border-neutral-100">
              <div>
                <h1 className="text-xl sm:text-2xl font-serif font-medium text-black">
                  {editingDraftId
                    ? 'Редагування чернетки'
                    : isCreatingNew
                    ? 'Нова стаття'
                    : isEditor
                    ? 'Внесення змін до статті (чернетка)'
                    : 'Редагування статті'}
                </h1>
                <p className="text-xs text-neutral-500 mt-1">
                  Основна назва статті в списку завжди українською, переклад створюється на вкладці «English».
                </p>
                {!isCreatingNew && editingArticle && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 mt-2">
                    <span className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded font-sans">
                      Дата створення: <strong className="font-medium text-black">{editingArticle.date || (editingArticle.createdAt ? new Date(editingArticle.createdAt).toLocaleDateString('uk-UA') : '—')}</strong> (зафіксована)
                    </span>
                    {editingArticle.updatedAt && (
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200/60 px-2 py-0.5 rounded font-sans">
                        Останнє редагування: <strong className="font-medium">{new Date(editingArticle.updatedAt).toLocaleString('uk-UA')}</strong>
                      </span>
                    )}
                    {editingArticle.id && (
                      <span className="inline-flex items-center gap-1.5 bg-neutral-100 text-neutral-800 px-2.5 py-0.5 rounded font-sans border border-neutral-200/60" title="Загальна кількість переглядів статті">
                        <Eye className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Перегляди:</span>
                        <strong className="font-semibold text-black">
                          {((editingArticle.id ? viewsMap[editingArticle.id] : undefined) ?? editingArticle.views ?? 0).toLocaleString('uk-UA')}
                        </strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="text-xs sm:text-sm text-neutral-500 hover:text-black transition-colors cursor-pointer"
              >
                Скасувати
              </button>
            </div>

            {/* ВКЛАДКИ МОВ: УКРАЇНСЬКА ТА АНГЛІЙСЬКА */}
            <div className="flex items-center gap-2 border-b border-neutral-200 pb-px mb-8">
              <button
                type="button"
                onClick={() => setFormLangTab('ua')}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-all cursor-pointer ${
                  formLangTab === 'ua'
                    ? 'border-black text-black'
                    : 'border-transparent text-neutral-400 hover:text-neutral-700'
                }`}
              >
                <span>Українська версія (основна)</span>
                {editingArticle.published !== false ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" title="Опубліковано на UA" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-neutral-300" title="Приховано на UA" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setFormLangTab('en')}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-all cursor-pointer ${
                  formLangTab === 'en'
                    ? 'border-black text-black'
                    : 'border-transparent text-neutral-400 hover:text-neutral-700'
                }`}
              >
                <span>English version</span>
                {editingArticle.publishedEn ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" title="Опубліковано на EN" />
                ) : editingArticle.titleEn?.trim() ? (
                  <span className="w-2 h-2 rounded-full bg-amber-400" title="Чернетка EN" />
                ) : (
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-normal">
                    (порожньо)
                  </span>
                )}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ЗАГАЛЬНІ ПОЛЯ (Автор та обкладинка — спільні для обох мов) */}
              <div className="p-4 bg-neutral-50/70 border border-neutral-200/80 rounded-lg space-y-4">
                <div className="flex items-center justify-between text-xs text-neutral-500 uppercase tracking-wider">
                  <span>Загальні параметри матеріалу</span>
                  <span className="text-[10px] text-neutral-400">Спільні для UA та EN</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                      Автор статті
                    </label>
                    <input
                      type="text"
                      placeholder="Ім'я автора"
                      value={editingArticle.author || ''}
                      onChange={(e) => setEditingArticle((prev) => (prev ? { ...prev, author: e.target.value } : prev))}
                      className="w-full text-sm border-b border-neutral-200 pb-1.5 focus:border-black focus:outline-none transition-colors bg-transparent"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs uppercase tracking-wider text-neutral-500">
                        Головна обкладинка статті
                      </label>
                      <button
                        type="button"
                        onClick={() => coverFileInputRef.current?.click()}
                        disabled={isUploadingCover}
                        className="inline-flex items-center gap-1.5 text-xs text-neutral-800 hover:text-black font-medium cursor-pointer underline disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingCover ? 'Завантаження...' : 'Завантажити файл'}</span>
                      </button>
                    </div>
                    <input
                      type="file"
                      ref={coverFileInputRef}
                      accept="image/*"
                      onChange={handleCoverFileChange}
                      className="hidden"
                    />
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/... або завантажте файл кнопкою вище"
                      value={editingArticle.coverImage || ''}
                      onChange={(e) => setEditingArticle((prev) => (prev ? { ...prev, coverImage: e.target.value } : prev))}
                      className="w-full text-sm border-b border-neutral-200 pb-1.5 focus:border-black focus:outline-none transition-colors bg-transparent font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Підпис до головного фото / заставки */}
                <div className="pt-3 border-t border-neutral-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs uppercase tracking-wider text-neutral-500 font-medium">
                          Підпис головного фото (UA)
                        </label>
                        <span className="text-[11px] text-neutral-400 font-normal">
                          тільки у статті
                        </span>
                      </div>
                      <input
                        type="text"
                        placeholder="Вкажіть підпис або джерело/автора фото (наприклад: Фото: Reuters)..."
                        value={editingArticle.coverImageCaption || ''}
                        onChange={(e) =>
                          setEditingArticle((prev) => (prev ? { ...prev, coverImageCaption: e.target.value } : prev))
                        }
                        className="w-full text-xs sm:text-sm border-b border-neutral-200 pb-1.5 focus:border-black focus:outline-none transition-colors bg-transparent"
                      />
                      <p className="text-[11px] text-neutral-400 mt-1">
                        Відображається під головним фото виключно у статті, не на картках каталогу.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs uppercase tracking-wider text-neutral-500 font-medium">
                          Підпис головного фото (EN)
                        </label>
                        <span className="text-[11px] text-neutral-400 font-normal">
                          for English version
                        </span>
                      </div>
                      <input
                        type="text"
                        placeholder="Photo credit or caption in English (e.g. Photo: Reuters)..."
                        value={editingArticle.coverImageCaptionEn || ''}
                        onChange={(e) =>
                          setEditingArticle((prev) => (prev ? { ...prev, coverImageCaptionEn: e.target.value } : prev))
                        }
                        className="w-full text-xs sm:text-sm border-b border-neutral-200 pb-1.5 focus:border-black focus:outline-none transition-colors bg-transparent"
                      />
                      <p className="text-[11px] text-neutral-400 mt-1">
                        Displayed under the cover image exclusively inside the English article.
                      </p>
                    </div>
                  </div>
                </div>

                {editingArticle.coverImage && (
                  <div className="relative aspect-[16/10] sm:aspect-[21/9] md:aspect-[26/10.5] max-h-56 overflow-hidden rounded-lg bg-neutral-100 border border-neutral-200 group">
                    <img
                      src={editingArticle.coverImage}
                      alt="Обкладинка"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] uppercase tracking-wider font-mono backdrop-blur-xs">
                      Формат заставки (26:10.5)
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingArticle((prev) => (prev ? { ...prev, coverImage: '' } : prev))}
                      title="Видалити обкладинку"
                      className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black text-white rounded-full transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {(editingArticle.coverImageCaption || editingArticle.coverImageCaptionEn) && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-xs px-3 py-1.5 backdrop-blur-xs flex items-center justify-between">
                        <span className="truncate italic">
                          Підпис: {editingArticle.coverImageCaption || editingArticle.coverImageCaptionEn}
                        </span>
                        <span className="text-[10px] text-neutral-300 ml-2 shrink-0">тільки у статті</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ВМІСТ УКРАЇНСЬКОЇ ВЕРСІЇ */}
              {formLangTab === 'ua' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                    <span className="text-xs uppercase tracking-wider font-medium text-black flex items-center gap-1.5">
                      Український текст статті (UA)
                    </span>
                    <span className="text-xs text-neutral-400">Основна версія</span>
                  </div>

                  {/* Заголовок UA */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Заголовок статті (UA) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Введіть заголовок статті українською..."
                      value={editingArticle.title || ''}
                      onChange={(e) => setEditingArticle((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                      className="w-full text-lg sm:text-xl font-sans font-semibold tracking-tight border-b border-neutral-200 pb-2 focus:border-black focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Рубрики статті (UA) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs uppercase tracking-wider text-neutral-500">
                        Рубрики статті * (можна обрати кілька)
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowQuickCreateCat(!showQuickCreateCat)}
                        className="text-xs text-neutral-500 hover:text-black flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{showQuickCreateCat ? 'Скасувати' : 'Створити нову рубрику'}</span>
                      </button>
                    </div>

                    {showQuickCreateCat && (
                      <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                        <div className="text-xs font-medium text-black">Нова рубрика</div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            placeholder="Назва рубрики (UA)..."
                            value={quickCatName}
                            onChange={(e) => setQuickCatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleQuickCreateCategory();
                              }
                            }}
                            className="w-full text-xs bg-white border border-neutral-200 px-3 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                          <input
                            type="text"
                            placeholder="Name in EN..."
                            value={quickCatNameEn}
                            onChange={(e) => setQuickCatNameEn(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleQuickCreateCategory();
                              }
                            }}
                            className="w-full text-xs bg-white border border-neutral-200 px-3 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                          <button
                            type="button"
                            onClick={handleQuickCreateCategory}
                            className="px-3.5 py-1.5 bg-black text-white text-xs font-medium rounded hover:bg-neutral-800 shrink-0 cursor-pointer"
                          >
                            Додати
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Вибір рубрик зі списку */}
                    <div className="space-y-2.5">
                      <div className="text-[11px] text-neutral-500 flex items-center justify-between">
                        <span>💡 Натисніть на рубрики, щоб додати або зняти їх для статті (можна обрати кілька):</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {taxonomies.categories.map((cat) => {
                          const currentCats =
                            editingArticle.categories && editingArticle.categories.length > 0
                              ? editingArticle.categories
                              : editingArticle.category
                              ? editingArticle.category.split(',').map((s) => s.trim()).filter(Boolean)
                              : [];
                          const isSelected = currentCats.some((c) => c.toLowerCase() === cat.name.toLowerCase());
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => handleToggleCategory(cat.name, cat.nameEn)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-black text-white border-black shadow-xs ring-1 ring-black'
                                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400 hover:text-black'
                              }`}
                              title={isSelected ? 'Натисніть для зняття рубрики' : `Додати рубрику «${cat.name}»`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                              <span>{cat.name}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Список призначених рубрик */}
                      {(() => {
                        const selectedCats =
                          editingArticle.categories && editingArticle.categories.length > 0
                            ? editingArticle.categories
                            : editingArticle.category
                            ? editingArticle.category.split(',').map((s) => s.trim()).filter(Boolean)
                            : [];
                        if (selectedCats.length === 0) return null;
                        return (
                          <div className="flex items-center gap-2 text-xs text-neutral-500 pt-1">
                            <span>Призначені рубрики:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedCats.map((catName) => (
                                <span
                                  key={catName}
                                  className="inline-flex items-center gap-1 bg-neutral-100 text-black px-2 py-0.5 rounded text-[11px] font-medium"
                                >
                                  {catName}
                                  {selectedCats.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleCategory(catName)}
                                      className="hover:text-red-600 transition-colors ml-0.5 cursor-pointer text-xs"
                                      title="Видалити рубрику"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Теми статті (Topics / Tags) */}
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs uppercase tracking-wider text-neutral-500">
                        Теми статті (для детального сортування)
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowQuickCreateTop(!showQuickCreateTop)}
                        className="text-xs text-neutral-500 hover:text-black flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{showQuickCreateTop ? 'Скасувати' : 'Створити нову тему'}</span>
                      </button>
                    </div>

                    {showQuickCreateTop && (
                      <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-black flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-neutral-600" />
                            <span>Створення нової теми</span>
                          </div>
                          <span className="text-[11px] text-neutral-400">
                            Оберіть: лише для цієї статті чи в загальний каталог
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            placeholder="Назва теми (UA)... наприклад: Вибори-2026 або Apple-Event"
                            value={quickTopName}
                            onChange={(e) => setQuickTopName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleQuickCreateTopic('this_article');
                              }
                            }}
                            className="w-full text-xs bg-white border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black"
                          />
                          <input
                            type="text"
                            placeholder="Topic name in EN (optional)..."
                            value={quickTopNameEn}
                            onChange={(e) => setQuickTopNameEn(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleQuickCreateTopic('this_article');
                              }
                            }}
                            className="w-full text-xs bg-white border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black"
                          />
                        </div>

                        {/* Дві дії створення теми: тільки для цієї статті або для всіх */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-neutral-200/60">
                          <p className="text-[11px] text-neutral-500 leading-tight">
                            💡 <span className="font-medium text-neutral-700">«Тільки для цієї статті»</span> відокремлює кілька статей з однієї актуальної події без збереження у постійний каталог.
                          </p>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleQuickCreateTopic('this_article')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white text-xs font-medium rounded hover:bg-black transition-colors cursor-pointer shadow-xs"
                              title="Додати тему лише для цієї статті, без збереження у постійний каталог тем"
                            >
                              <FileText className="w-3.5 h-3.5 text-amber-300" />
                              <span>Тільки для цієї статті</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleQuickCreateTopic('global')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-neutral-800 border border-neutral-300 text-xs font-medium rounded hover:bg-neutral-100 transition-colors cursor-pointer"
                              title="Створити постійну тему, яка збережеться у загальний каталог тем для всіх статей"
                            >
                              <Globe className="w-3.5 h-3.5 text-blue-500" />
                              <span>Для всіх статей (у каталог)</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Обрані теми для цієї статті */}
                    {editingArticle.topics && editingArticle.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[11px] text-neutral-400 mr-1">Обрані теми:</span>
                        {editingArticle.topics.map((t) => {
                          const isGlobal = taxonomies.topics.some(
                            (gt) => gt.name.toLowerCase() === t.toLowerCase()
                          );
                          return (
                            <span
                              key={t}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md shadow-xs ${
                                isGlobal
                                  ? 'bg-black text-white'
                                  : 'bg-neutral-800 text-white border border-neutral-600'
                              }`}
                            >
                              <span>#{t}</span>
                              {!isGlobal && (
                                <span
                                  className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-amber-400/20 text-amber-300 rounded font-normal"
                                  title="Тема створена лише для цієї статті (не в постійному каталозі)"
                                >
                                  для цієї статті
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveTopic(t)}
                                className="hover:text-neutral-300 cursor-pointer ml-0.5"
                                title="Прибрати зі статті"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Вибір тем з доступних */}
                    <div className="p-3 bg-neutral-50/70 border border-neutral-200/80 rounded-lg space-y-3">
                      <div>
                        <div className="text-[11px] text-neutral-400 mb-1.5 font-medium">
                          Постійні теми (Каталог):
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {taxonomies.topics.map((top) => {
                            const isAttached = (editingArticle.topics || []).some(
                              (t) => t.trim().replace(/^#+/, '').toLowerCase() === top.name.trim().replace(/^#+/, '').toLowerCase()
                            );
                            return (
                              <button
                                key={top.id}
                                type="button"
                                onClick={() => handleToggleTopic(top.name, top.nameEn)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                                  isAttached
                                    ? 'bg-neutral-900 text-white font-medium shadow-xs'
                                    : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-black'
                                }`}
                              >
                                {isAttached && <Check className="w-3 h-3 text-emerald-400" />}
                                <span>#{top.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {oneOffTopics.length > 0 && (
                        <div className="pt-2 border-t border-neutral-200/70">
                          <div className="text-[11px] text-neutral-400 mb-1.5 flex items-center justify-between">
                            <span className="font-medium text-neutral-600">
                              Теми з інших статей (тимчасові / для окремих матеріалів):
                            </span>
                            <span className="text-[10px] text-neutral-400">Натисніть для вибору</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {oneOffTopics.map((top) => {
                              const isAttached = (editingArticle.topics || []).some(
                                (t) => t.trim().replace(/^#+/, '').toLowerCase() === top.name.trim().replace(/^#+/, '').toLowerCase()
                              );
                              return (
                                <button
                                  key={`oneoff_${top.name}`}
                                  type="button"
                                  onClick={() => handleToggleTopic(top.name, top.nameEn)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                                    isAttached
                                      ? 'bg-neutral-900 text-white font-medium shadow-xs'
                                      : 'bg-amber-50/80 text-amber-900 border border-amber-200 hover:bg-amber-100 hover:border-amber-400'
                                  }`}
                                  title={`Тема використовується у ${top.count} статт${top.count === 1 ? 'і' : 'ях'}, не зберігається у загальний каталог`}
                                >
                                  {isAttached && <Check className="w-3 h-3 text-amber-400" />}
                                  <span>#{top.name}</span>
                                  <span className="text-[10px] opacity-60">({top.count})</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Короткий опис UA */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs uppercase tracking-wider text-neutral-500 font-medium">
                        Короткий опис (для списку на головній)
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-neutral-700 hover:text-black">
                        <input
                          type="checkbox"
                          checked={parseShowExcerpt(editingArticle.showExcerptInArticle, true)}
                          onChange={(e) => setEditingArticle((prev) => (prev ? { ...prev, showExcerptInArticle: e.target.checked } : prev))}
                          className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-black cursor-pointer accent-black"
                        />
                        <span className="font-medium">
                          Відображати короткий опис безпосередньо у статті
                        </span>
                      </label>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Одне-два речення про головну думку статті українською..."
                      value={editingArticle.excerpt || ''}
                      onChange={(e) => setEditingArticle((prev) => (prev ? { ...prev, excerpt: e.target.value } : prev))}
                      className="w-full text-sm border border-neutral-200 p-3 focus:border-black focus:outline-none transition-colors resize-none"
                    />
                    <p className="text-[11px] text-neutral-400">
                      {parseShowExcerpt(editingArticle.showExcerptInArticle, true)
                        ? '✓ Короткий опис буде показано у статті курсивом перед основним текстом'
                        : '✕ Короткий опис приховано у статті (відображатиметься лише у картках статей на головній та в рубриках)'}
                    </p>
                  </div>

                  {/* Текст UA + розширені інструменти форматування */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Текст статті (UA) *
                    </label>
                    <RichArticleEditor
                      value={editingArticle.content || ''}
                      onChange={(val) => setEditingArticle((prev) => (prev ? { ...prev, content: val } : prev))}
                      placeholder="Напишіть текст статті українською тут..."
                      lang="ua"
                      articleId={editingArticle.id || 'new'}
                      minHeight="420px"
                    />
                  </div>

                  {/* Перемикач видимості української версії */}
                  <div className="pt-2">
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Видимість на українській версії сайту
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingArticle((prev) => (prev ? { ...prev, published: true } : prev))}
                        className={`p-3.5 border text-left rounded transition-all cursor-pointer flex items-start gap-3 ${
                          editingArticle.published !== false
                            ? 'border-black bg-neutral-50 ring-1 ring-black'
                            : 'border-neutral-200 hover:border-neutral-300 bg-white'
                        }`}
                      >
                        <Eye className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-black">Опубліковано для UA</div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            Відображається читачам, коли обрана мова UA
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingArticle((prev) => (prev ? { ...prev, published: false } : prev))}
                        className={`p-3.5 border text-left rounded transition-all cursor-pointer flex items-start gap-3 ${
                          editingArticle.published === false
                            ? 'border-black bg-neutral-50 ring-1 ring-black'
                            : 'border-neutral-200 hover:border-neutral-300 bg-white'
                        }`}
                      >
                        <EyeOff className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-black">Приховано для UA</div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            Зберігається в базі, але не показується на сайті
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ВМІСТ АНГЛІЙСЬКОЇ ВЕРСІЇ */}
              {formLangTab === 'en' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                    <span className="text-xs uppercase tracking-wider font-medium text-black flex items-center gap-1.5">
                      English Article Version (EN)
                    </span>
                    {editingArticle.content && !editingArticle.contentEn && (
                      <button
                        type="button"
                        onClick={() => {
                          // Допомагає скопіювати текст або медіа-посилання з UA для перекладу
                          setEditingArticle({
                            ...editingArticle,
                            categoryEn: editingArticle.categoryEn || editingArticle.category,
                            contentEn: editingArticle.content,
                          });
                          showNotification('Структуру тексту скопійовано з української версії для перекладу.');
                        }}
                        className="text-xs text-neutral-600 hover:text-black flex items-center gap-1 underline cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Скопіювати з UA для перекладу</span>
                      </button>
                    )}
                  </div>

                  {/* Заголовок EN */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Article Title (EN)
                    </label>
                    <input
                      type="text"
                      placeholder="Enter article title in English..."
                      value={editingArticle.titleEn || ''}
                      onChange={(e) => setEditingArticle((prev) => (prev ? { ...prev, titleEn: e.target.value } : prev))}
                      className="w-full text-lg sm:text-xl font-sans font-semibold tracking-tight border-b border-neutral-200 pb-2 focus:border-black focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Рубрики EN (можна обрати кілька) */}
                  <div className="space-y-3">
                    <label className="block text-xs uppercase tracking-wider text-neutral-500">
                      Topic / Category (EN) — select multiple if applicable
                    </label>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {taxonomies.categories.map((cat) => {
                          const enName = cat.nameEn || cat.name;
                          const currentCatsEn =
                            editingArticle.categoriesEn && editingArticle.categoriesEn.length > 0
                              ? editingArticle.categoriesEn
                              : editingArticle.categoryEn
                              ? editingArticle.categoryEn.split(',').map((s) => s.trim()).filter(Boolean)
                              : [];
                          const isSelected = currentCatsEn.some((c) => c.toLowerCase() === enName.toLowerCase());
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => handleToggleCategoryEn(enName, cat.name)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-black text-white border-black shadow-xs ring-1 ring-black'
                                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                              <span>{enName}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Список призначених англійських рубрик */}
                      {(() => {
                        const selectedCatsEn =
                          editingArticle.categoriesEn && editingArticle.categoriesEn.length > 0
                            ? editingArticle.categoriesEn
                            : editingArticle.categoryEn
                            ? editingArticle.categoryEn.split(',').map((s) => s.trim()).filter(Boolean)
                            : [];
                        if (selectedCatsEn.length === 0) return null;
                        return (
                          <div className="flex items-center gap-2 text-xs text-neutral-500 pt-1">
                            <span>Selected categories:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedCatsEn.map((catEnName) => (
                                <span
                                  key={catEnName}
                                  className="inline-flex items-center gap-1 bg-neutral-100 text-black px-2 py-0.5 rounded text-[11px] font-medium"
                                >
                                  {catEnName}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleCategoryEn(catEnName)}
                                    className="hover:text-red-600 transition-colors ml-0.5 cursor-pointer text-xs"
                                    title="Remove category"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Теми EN */}
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs uppercase tracking-wider text-neutral-500">
                        Article Themes & Tags (EN)
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowQuickCreateTop(!showQuickCreateTop)}
                        className="text-xs text-neutral-500 hover:text-black flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{showQuickCreateTop ? 'Cancel' : 'Create new theme'}</span>
                      </button>
                    </div>

                    {showQuickCreateTop && (
                      <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-black flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-neutral-600" />
                            <span>Create new theme</span>
                          </div>
                          <span className="text-[11px] text-neutral-400">
                            Choose: only for this article or to global catalog
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            placeholder="Theme name in EN... e.g. Minimalism or Apple-Event"
                            value={quickTopNameEn}
                            onChange={(e) => setQuickTopNameEn(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleQuickCreateTopic('this_article');
                              }
                            }}
                            className="w-full text-xs bg-white border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black"
                          />
                          <input
                            type="text"
                            placeholder="Назва теми (UA, опціонально)..."
                            value={quickTopName}
                            onChange={(e) => setQuickTopName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleQuickCreateTopic('this_article');
                              }
                            }}
                            className="w-full text-xs bg-white border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black"
                          />
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-neutral-200/60">
                          <p className="text-[11px] text-neutral-500 leading-tight">
                            💡 <span className="font-medium text-neutral-700">«Only for this article»</span> creates a topic for breaking/special news without saving to catalog.
                          </p>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleQuickCreateTopic('this_article')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white text-xs font-medium rounded hover:bg-black transition-colors cursor-pointer shadow-xs"
                              title="Attach theme only for this article"
                            >
                              <FileText className="w-3.5 h-3.5 text-amber-300" />
                              <span>Only for this article</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleQuickCreateTopic('global')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-neutral-800 border border-neutral-300 text-xs font-medium rounded hover:bg-neutral-100 transition-colors cursor-pointer"
                              title="Save into permanent catalog for all articles"
                            >
                              <Globe className="w-3.5 h-3.5 text-blue-500" />
                              <span>For all articles (catalog)</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Обрані англійські теми */}
                    {editingArticle.topicsEn && editingArticle.topicsEn.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[11px] text-neutral-400 mr-1">Selected themes:</span>
                        {editingArticle.topicsEn.map((t) => {
                          const isGlobal = taxonomies.topics.some(
                            (gt) => (gt.nameEn || gt.name).toLowerCase() === t.toLowerCase()
                          );
                          return (
                            <span
                              key={t}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md shadow-xs ${
                                isGlobal
                                  ? 'bg-black text-white'
                                  : 'bg-neutral-800 text-white border border-neutral-600'
                              }`}
                            >
                              <span>#{t}</span>
                              {!isGlobal && (
                                <span
                                  className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-amber-400/20 text-amber-300 rounded font-normal"
                                  title="Theme created only for this article (not in permanent catalog)"
                                >
                                  for this article
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveTopicEn(t)}
                                className="hover:text-neutral-300 cursor-pointer ml-0.5"
                                title="Remove theme"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="p-3 bg-neutral-50/70 border border-neutral-200/80 rounded-lg space-y-3">
                      <div>
                        <div className="text-[11px] text-neutral-400 mb-1.5 font-medium">
                          Permanent Catalog Themes:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {taxonomies.topics.map((top) => {
                            const topEnName = (top.nameEn || top.name).trim().replace(/^#+/, '');
                            const topUaName = top.name.trim().replace(/^#+/, '');
                            const isAttached =
                              (editingArticle.topicsEn || []).some((t) => t.trim().replace(/^#+/, '').toLowerCase() === topEnName.toLowerCase()) ||
                              (editingArticle.topics || []).some((t) => t.trim().replace(/^#+/, '').toLowerCase() === topUaName.toLowerCase());
                            return (
                              <button
                                key={top.id}
                                type="button"
                                onClick={() => handleToggleTopic(top.name, topEnName)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                                  isAttached
                                    ? 'bg-neutral-900 text-white font-medium shadow-xs'
                                    : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-black'
                                }`}
                              >
                                {isAttached && <Check className="w-3 h-3 text-emerald-400" />}
                                <span>#{topEnName}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {oneOffTopics.length > 0 && (
                        <div className="pt-2 border-t border-neutral-200/70">
                          <div className="text-[11px] text-neutral-400 mb-1.5 flex items-center justify-between">
                            <span className="font-medium text-neutral-600">
                              One-off themes from other articles:
                            </span>
                            <span className="text-[10px] text-neutral-400">Click to attach</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {oneOffTopics.map((top) => {
                              const topEnName = (top.nameEn || top.name).trim().replace(/^#+/, '');
                              const topUaName = top.name.trim().replace(/^#+/, '');
                              const isAttached =
                                (editingArticle.topicsEn || []).some((t) => t.trim().replace(/^#+/, '').toLowerCase() === topEnName.toLowerCase()) ||
                                (editingArticle.topics || []).some((t) => t.trim().replace(/^#+/, '').toLowerCase() === topUaName.toLowerCase());
                              return (
                                <button
                                  key={`oneoff_en_${top.name}`}
                                  type="button"
                                  onClick={() => handleToggleTopic(top.name, topEnName)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                                    isAttached
                                      ? 'bg-neutral-900 text-white font-medium shadow-xs'
                                      : 'bg-amber-50/80 text-amber-900 border border-amber-200 hover:bg-amber-100 hover:border-amber-400'
                                  }`}
                                  title={`Used in ${top.count} article(s), not in permanent catalog`}
                                >
                                  {isAttached && <Check className="w-3 h-3 text-amber-400" />}
                                  <span>#{topEnName}</span>
                                  <span className="text-[10px] opacity-60">({top.count})</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Короткий опис EN */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs uppercase tracking-wider text-neutral-500 font-medium">
                        Excerpt / Summary (EN)
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-neutral-700 hover:text-black">
                        <input
                          type="checkbox"
                          checked={editingArticle.showExcerptInArticleEn !== undefined ? parseShowExcerpt(editingArticle.showExcerptInArticleEn, true) : parseShowExcerpt(editingArticle.showExcerptInArticle, true)}
                          onChange={(e) => setEditingArticle((prev) => (prev ? { ...prev, showExcerptInArticleEn: e.target.checked } : prev))}
                          className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-black cursor-pointer accent-black"
                        />
                        <span className="font-medium">
                          Display excerpt in article
                        </span>
                      </label>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="One or two sentences summarizing the article in English..."
                      value={editingArticle.excerptEn || ''}
                      onChange={(e) => setEditingArticle((prev) => (prev ? { ...prev, excerptEn: e.target.value } : prev))}
                      className="w-full text-sm border border-neutral-200 p-3 focus:border-black focus:outline-none transition-colors resize-none"
                    />
                    <p className="text-[11px] text-neutral-400">
                      {(editingArticle.showExcerptInArticleEn !== undefined ? parseShowExcerpt(editingArticle.showExcerptInArticleEn, true) : parseShowExcerpt(editingArticle.showExcerptInArticle, true))
                        ? '✓ Excerpt will be shown at the beginning of the article before content'
                        : '✕ Excerpt hidden in article (only used for preview cards in feed)'}
                    </p>
                  </div>

                  {/* Текст EN + розширені інструменти форматування */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Article Content (EN)
                    </label>
                    <RichArticleEditor
                      value={editingArticle.contentEn || ''}
                      onChange={(val) => setEditingArticle((prev) => (prev ? { ...prev, contentEn: val } : prev))}
                      placeholder="Write English article content here..."
                      lang="en"
                      articleId={editingArticle.id || 'new'}
                      minHeight="420px"
                    />
                  </div>

                  {/* Перемикач видимості англійської версії */}
                  <div className="pt-2">
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Видимість на англійській версії сайту
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingArticle((prev) => (prev ? { ...prev, publishedEn: true } : prev))}
                        className={`p-3.5 border text-left rounded transition-all cursor-pointer flex items-start gap-3 ${
                          editingArticle.publishedEn === true
                            ? 'border-black bg-neutral-50 ring-1 ring-black'
                            : 'border-neutral-200 hover:border-neutral-300 bg-white'
                        }`}
                      >
                        <Eye className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-black">Опубліковано для EN</div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            Стаття з'явиться на сайті, коли читач перемкнеться на англійську мову
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingArticle((prev) => (prev ? { ...prev, publishedEn: false } : prev))}
                        className={`p-3.5 border text-left rounded transition-all cursor-pointer flex items-start gap-3 ${
                          editingArticle.publishedEn !== true
                            ? 'border-black bg-neutral-50 ring-1 ring-black'
                            : 'border-neutral-200 hover:border-neutral-300 bg-white'
                        }`}
                      >
                        <EyeOff className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-black">Приховано для EN (чернетка)</div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            Не відображається в англійській версії сайту
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Повідомлення про помилку збереження */}
              {errorMsg && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
                  {formatErrorMessage(errorMsg)}
                </div>
              )}

              {/* Кнопки збереження */}
              <div className="pt-6 border-t border-neutral-100 flex items-center justify-between">
                <div className="text-xs text-neutral-500">
                  {formLangTab === 'ua' ? (
                    <button
                      type="button"
                      onClick={() => setFormLangTab('en')}
                      className="text-black hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>Перейти до редагування англійської версії</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setFormLangTab('ua')}
                      className="text-black hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>Повернутися до української версії</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleCancel}
                    className="px-5 py-2 text-xs sm:text-sm text-neutral-600 hover:text-black transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-black text-white text-xs sm:text-sm tracking-wide hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-2"
                  >
                    {isSaving && (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    <span>
                      {isSaving
                        ? 'Збереження...'
                        : isEditor
                        ? 'Надіслати чернетку на модерацію'
                        : isCreatingNew
                        ? 'Створити матеріал'
                        : 'Зберегти зміни'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : (
          /* Список статей у панелі */
          <div>
            {isEditor && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-1.5 shadow-xs">
                <div className="font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Панель редактора — Режим чернеток</span>
                </div>
                <p className="leading-relaxed text-neutral-700">
                  Вам доступне оперативне перемикання видимості статей (публікація/приховування UA та EN безпосередньо кнопками в списку), створення нових матеріалів та редагування існуючих через систему чернеток на модерацію. Видалення статей доступне лише адміністратору.
                </p>
              </div>
            )}

            {/* Вкладки для редактора: Опубліковані статті та Мої чернетки */}
            {isEditor && (
              <div className="flex items-center gap-2 mb-6 border-b border-neutral-200 pb-2">
                <button
                  type="button"
                  onClick={() => setEditorArticlesTab('articles')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    editorArticlesTab === 'articles' ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  Опубліковані статті ({articles.length})
                </button>
                <button
                  type="button"
                  onClick={() => setEditorArticlesTab('my_drafts')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    editorArticlesTab === 'my_drafts' ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  <span>Мої чернетки на модерації</span>
                  {myDrafts.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                      {myDrafts.length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Заголовок та кнопка створення */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-neutral-100 mb-6 gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-serif font-medium text-black">
                  {isEditor && editorArticlesTab === 'my_drafts'
                    ? 'Мої чернетки'
                    : isEditor
                    ? 'Редактор матеріалів'
                    : 'Редактор статей'}
                </h1>
                <p className="text-xs sm:text-sm text-neutral-500 mt-1">
                  {isEditor && editorArticlesTab === 'my_drafts'
                    ? `Матеріали, надіслані вами на перевірку адміністратору (${myDrafts.length})`
                    : `Керування статтями журналу (${articles.length} ${articles.length === 1 ? 'стаття' : 'статей'})`}
                </p>
              </div>
              <button
                onClick={handleStartCreate}
                className="self-start sm:self-auto flex items-center gap-2 bg-black text-white px-4 py-2 text-xs sm:text-sm tracking-wide hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{isEditor ? 'Створити нову статтю (чернетку)' : 'Створити нову статтю'}</span>
              </button>
            </div>

            {/* Відображення чернеток редактора або звичайного списку статей */}
            {isEditor && editorArticlesTab === 'my_drafts' ? (
              myDrafts.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-neutral-200 rounded-xl space-y-3">
                  <p className="text-neutral-500 text-sm">У вас ще немає створених чернеток.</p>
                  <button
                    onClick={handleStartCreate}
                    className="inline-flex items-center gap-1.5 text-xs font-medium bg-black text-white px-3.5 py-2 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Створити нову статтю (чернетку)</span>
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {myDrafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-3 -mx-3 hover:bg-neutral-50/70 transition-colors rounded-lg"
                    >
                      <div className="flex items-start gap-4">
                        {draft.articleData?.coverImage ? (
                          <img
                            src={draft.articleData.coverImage}
                            alt=""
                            className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded shrink-0 bg-neutral-100 border border-neutral-200"
                          />
                        ) : (
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded bg-neutral-100 border border-neutral-200 shrink-0 flex items-center justify-center text-xs font-serif text-neutral-400">
                            The Impart
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-[11px] flex-wrap">
                            <span className="font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                              {draft.type === 'new' ? 'Нова стаття' : 'Зміни до статті'}
                            </span>
                            {draft.status === 'pending' && (
                              <span className="font-medium text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full">
                                Очікує розгляду
                              </span>
                            )}
                            {draft.status === 'approved' && (
                              <span className="font-medium text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-full">
                                Схвалено та опубліковано
                              </span>
                            )}
                            {draft.status === 'rejected' && (
                              <span className="font-medium text-red-800 bg-red-50 border border-red-300 px-2 py-0.5 rounded-full">
                                Відхилено
                              </span>
                            )}
                            <span className="text-neutral-400">•</span>
                            <span className="text-neutral-400">{new Date(draft.updatedAt).toLocaleDateString('uk-UA')}</span>
                          </div>

                          <h3 className="text-base font-serif font-medium text-black">
                            {draft.articleData?.title || 'Без назви'}
                          </h3>
                          {draft.moderatorNote && (
                            <p className="text-xs text-neutral-600 bg-amber-50 p-2.5 rounded border border-amber-200/80">
                              <strong>Коментар адміністратора:</strong> {draft.moderatorNote}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleEditDraft(draft)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-300 hover:border-black rounded-lg cursor-pointer transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Продовжити редагування</span>
                        </button>
                        {onDeleteDraft && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Видалити цю чернетку?')) {
                                onDeleteDraft(draft.id);
                              }
                            }}
                            className="p-1.5 text-neutral-400 hover:text-red-600 rounded cursor-pointer"
                            title="Видалити чернетку"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
            <>
            {/* Вкладки фільтрів видимості: Всі, Опубліковані UA, Опубліковані EN, Приховані */}
            {articles.length > 0 && (
              <div className="flex items-center gap-2 pb-4 mb-4 border-b border-neutral-100 overflow-x-auto">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterStatus === 'all'
                      ? 'bg-black text-white font-medium'
                      : 'bg-neutral-100 text-neutral-600 hover:text-black hover:bg-neutral-200'
                  }`}
                >
                  <span>Всі матеріали</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    filterStatus === 'all' ? 'bg-neutral-800 text-white' : 'bg-neutral-200 text-neutral-600'
                  }`}>
                    {articles.length}
                  </span>
                </button>

                <button
                  onClick={() => setFilterStatus('published_ua')}
                  className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterStatus === 'published_ua'
                      ? 'bg-emerald-700 text-white font-medium'
                      : 'bg-neutral-100 text-neutral-600 hover:text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <span>Опубліковані UA</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    filterStatus === 'published_ua' ? 'bg-emerald-800 text-white' : 'bg-neutral-200 text-neutral-600'
                  }`}>
                    {uaPublishedCount}
                  </span>
                </button>

                <button
                  onClick={() => setFilterStatus('published_en')}
                  className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterStatus === 'published_en'
                      ? 'bg-blue-700 text-white font-medium'
                      : 'bg-neutral-100 text-neutral-600 hover:text-blue-700 hover:bg-blue-50'
                  }`}
                >
                  <span>Опубліковані EN</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    filterStatus === 'published_en' ? 'bg-blue-800 text-white' : 'bg-neutral-200 text-neutral-600'
                  }`}>
                    {enPublishedCount}
                  </span>
                </button>

                <button
                  onClick={() => setFilterStatus('hidden')}
                  className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterStatus === 'hidden'
                      ? 'bg-neutral-800 text-white font-medium'
                      : 'bg-neutral-100 text-neutral-600 hover:text-black hover:bg-neutral-200'
                  }`}
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Приховані</span>
                </button>
              </div>
            )}

            {articles.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-neutral-200">
                <p className="text-neutral-500 text-sm mb-4">Наразі немає жодної статті.</p>
                <button
                  onClick={handleStartCreate}
                  className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-black underline underline-offset-4 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Створити першу публікацію
                </button>
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-neutral-200">
                <p className="text-neutral-500 text-sm">Немає статей для обраного фільтра.</p>
                <button
                  onClick={() => setFilterStatus('all')}
                  className="mt-3 text-xs text-black underline underline-offset-4 cursor-pointer"
                >
                  Показати всі матеріали
                </button>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {filteredArticles.map((art) => {
                  const isPubUa =
                    art.published === true || String(art.published) === 'true' || (art.published as any) === 1;
                  const isPubEn =
                    art.publishedEn === true || String(art.publishedEn) === 'true' || (art.publishedEn as any) === 1;
                  const hasEn = Boolean(art.titleEn?.trim());

                  const isTogglingUa = togglingId === `ua_${art.id}`;
                  const isTogglingEn = togglingId === `en_${art.id}`;
                  const timeDisplay = formatTimeAgoOrDate(art.createdAt, art.date, art.id, 'ua');

                  return (
                    <div
                      key={art.id}
                      className={`py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group px-3 -mx-3 transition-colors rounded ${
                        isPubUa || isPubEn
                          ? 'hover:bg-neutral-50/60'
                          : 'bg-neutral-50/50 hover:bg-neutral-100/60 border-l-2 border-neutral-300'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {art.coverImage ? (
                          <img
                            src={art.coverImage}
                            alt={art.title}
                            className={`w-16 h-16 sm:w-20 sm:h-20 object-cover rounded shrink-0 bg-neutral-100 ${
                              !isPubUa && !isPubEn ? 'grayscale opacity-75' : ''
                            }`}
                          />
                        ) : (
                          <div
                            className={`w-16 h-16 sm:w-20 sm:h-20 rounded shrink-0 flex items-center justify-center text-xs font-serif ${
                              isPubUa ? 'bg-neutral-100 text-neutral-400' : 'bg-neutral-200 text-neutral-500'
                            }`}
                          >
                            The Impart
                          </div>
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            {/* Статус UA */}
                            {isPubUa ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                UA: Live
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">
                                UA: Сховано
                              </span>
                            )}

                            {/* Статус EN */}
                            {isPubEn ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                EN: Live
                              </span>
                            ) : hasEn ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                EN: Чернетка
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                                EN: Немає
                              </span>
                            )}

                            <span className="text-neutral-300">•</span>
                            <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium">
                              {Array.isArray(art.categories) && art.categories.length > 0
                                ? art.categories.map((c: any) => typeof c === 'string' ? c : c?.name || String(c)).join(' / ')
                                : typeof art.category === 'string'
                                ? art.category
                                : (art.category as any)?.name || (art.category as any)?.title || ''}
                            </span>
                            {timeDisplay && (
                              <>
                                <span className="text-neutral-300">•</span>
                                <span className="text-xs text-neutral-400" title={`Створено: ${art.date || art.createdAt}`}>
                                  {timeDisplay}
                                </span>
                              </>
                            )}
                            {(() => {
                              const liveViews = (viewsMap && typeof viewsMap[art.id] === 'number')
                                ? viewsMap[art.id]
                                : (typeof art.views === 'number' ? art.views : 0);
                              return (
                                <>
                                  <span className="text-neutral-300">•</span>
                                  <span
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded"
                                    title="Загальна кількість переглядів статті"
                                  >
                                    <Eye className="w-3 h-3 text-neutral-500" />
                                    <span>{liveViews.toLocaleString('uk-UA')}</span>
                                  </span>
                                </>
                              );
                            })()}
                            {art.updatedAt && (
                              <>
                                <span className="text-neutral-300">•</span>
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60"
                                  title={`Останнє редагування: ${new Date(art.updatedAt).toLocaleString('uk-UA')}`}
                                >
                                  Редаговано: {new Date(art.updatedAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                              </>
                            )}
                          </div>

                          {/* ГОЛОВНА НАЗВА В СПИСКУ ЗАВЖДИ УКРАЇНСЬКОЮ */}
                          <h2 className="text-base sm:text-lg font-serif font-medium text-black group-hover:text-neutral-700 transition-colors">
                            {typeof art.title === 'string' ? art.title : (art.title as any)?.name || String(art.title || '')}
                          </h2>

                          {/* Додаткова плашка, якщо є англійський переклад */}
                          {art.titleEn && (
                            <p className="text-xs text-neutral-400 italic mt-0.5 flex items-center gap-1">
                              <span>EN:</span>
                              <span>{typeof art.titleEn === 'string' ? art.titleEn : String(art.titleEn)}</span>
                            </p>
                          )}

                          {art.excerpt && (
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-neutral-500 line-clamp-1 max-w-xl">
                                {typeof art.excerpt === 'string' ? art.excerpt : String(art.excerpt)}
                              </p>
                              {art.showExcerptInArticle === false && (
                                <span className="text-[10px] text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded shrink-0" title="Короткий опис приховано безпосередньо у статті">
                                  приховано у статті
                                </span>
                              )}
                            </div>
                          )}

                          {Array.isArray(art.topics) && art.topics.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {art.topics.map((t: any, idx: number) => {
                                const topicStr = typeof t === 'string' ? t : t?.name || String(t);
                                const isGlobal = taxonomies.topics.some(
                                  (gt) => gt.name.toLowerCase() === topicStr.toLowerCase()
                                );
                                return (
                                  <span
                                    key={`${topicStr}_${idx}`}
                                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                                      isGlobal
                                        ? 'text-neutral-500 bg-neutral-100'
                                        : 'text-amber-800 bg-amber-50 border border-amber-200/60'
                                    }`}
                                    title={
                                      isGlobal
                                        ? 'Тема з постійного каталогу'
                                        : 'Тема створена лише для цієї статті'
                                    }
                                  >
                                    #{topicStr}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          <p className="text-[11px] text-neutral-400 mt-1">
                            {typeof art.author === 'string' ? art.author : (art.author as any)?.name || String(art.author || '')}
                          </p>
                        </div>
                      </div>

                      {/* Панель дій над статтею */}
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 self-end sm:self-center flex-wrap justify-end">
                        {/* Перемикач видимості для UA (доступний для адміністратора та редактора) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleUaVisibility(art);
                          }}
                          disabled={isTogglingUa}
                          className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-medium border shadow-2xs ${
                            isPubUa
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400'
                              : 'bg-neutral-100 text-neutral-600 border-neutral-300 hover:bg-neutral-200 hover:text-black hover:border-neutral-400'
                          } disabled:opacity-50`}
                          title={
                            isPubUa
                              ? 'Українська версія опублікована на сайті. Натисніть, щоб приховати.'
                              : 'Українська версія прихована з сайту. Натисніть, щоб опублікувати.'
                          }
                          aria-label={`Перемикач видимості UA для ${art.title}`}
                        >
                          {isTogglingUa ? (
                            <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              {isPubUa ? (
                                <Eye className="w-3.5 h-3.5 text-emerald-700" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5 text-neutral-500" />
                              )}
                              <span className="font-bold">UA</span>
                              <span className="hidden sm:inline text-[11px] font-normal">
                                {isPubUa ? 'Видно' : 'Сховано'}
                              </span>
                            </>
                          )}
                        </button>

                        {/* Перемикач видимості для EN (доступний для адміністратора та редактора) */}
                        {hasEn ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleEnVisibility(art);
                            }}
                            disabled={isTogglingEn}
                            className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-medium border shadow-2xs ${
                              isPubEn
                                ? 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100 hover:border-blue-400'
                                : 'bg-neutral-100 text-neutral-600 border-neutral-300 hover:bg-neutral-200 hover:text-black hover:border-neutral-400'
                            } disabled:opacity-50`}
                            title={
                              isPubEn
                                ? 'Англійська версія опублікована на сайті. Натисніть, щоб приховати.'
                                : 'Англійська версія прихована з сайту. Натисніть, щоб опублікувати.'
                            }
                            aria-label={`Перемикач видимості EN для ${art.titleEn || art.title}`}
                          >
                            {isTogglingEn ? (
                              <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                {isPubEn ? (
                                  <Eye className="w-3.5 h-3.5 text-blue-700" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5 text-neutral-500" />
                                )}
                                <span className="font-bold">EN</span>
                                <span className="hidden sm:inline text-[11px] font-normal">
                                  {isPubEn ? 'Видно' : 'Сховано'}
                                </span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span
                            className="hidden sm:inline-flex items-center px-2 py-1.5 text-[11px] text-neutral-400 bg-neutral-50 border border-neutral-200/60 rounded-lg cursor-not-allowed select-none"
                            title="Англійська версія ще не створена"
                          >
                            EN —
                          </span>
                        )}

                        {/* Скопіювати пряме посилання на статтю */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = `${window.location.origin}/article/${art.id}`;
                            navigator.clipboard.writeText(url).then(() => {
                              showNotification('Пряме посилання на статтю скопійовано');
                            });
                          }}
                          className="p-2 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded transition-colors cursor-pointer"
                          title="Скопіювати пряме посилання на статтю"
                        >
                          <Link2 className="w-4 h-4" />
                        </button>

                        {/* Перегляд на сайті */}
                        <button
                          onClick={() => onViewArticleOnSite(art.id)}
                          className="p-2 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded transition-colors cursor-pointer"
                          title="Переглянути на сайті"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>

                        {/* Редагування */}
                        <button
                          onClick={() => handleStartEdit(art)}
                          className="p-2 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded transition-colors cursor-pointer"
                          title="Редагувати статтю (UA / EN)"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* Видалення (тільки адмін) */}
                        {!isEditor && (
                          <button
                            onClick={() => setArticlePendingDelete(art)}
                            className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="Видалити назавжди"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </>
            )}
          </div>
        )}
      </main>
      </div>

      {/* Модальне вікно підтвердження видалення статті */}
      {articlePendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-serif font-bold text-neutral-900 dark:text-neutral-100 mb-2">
              Підтвердження видалення
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6 leading-relaxed">
              Ви впевнені, що бажаєте безповоротно видалити статтю «<strong>{articlePendingDelete.title || articlePendingDelete.titleEn || articlePendingDelete.id}</strong>» з сервера та бази даних?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingArticle}
                onClick={() => setArticlePendingDelete(null)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={isDeletingArticle}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
              >
                {isDeletingArticle ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Видалення...</span>
                  </>
                ) : (
                  <span>Видалити назавжди</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
