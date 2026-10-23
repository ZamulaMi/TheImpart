import React, { useState } from 'react';
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  Eye,
  Check,
  X,
  Edit3,
  Trash2,
  Calendar,
  User,
  Sparkles,
  ExternalLink,
  Layers,
  ArrowUpRight,
  ChevronRight,
  MessageSquare,
  HelpCircle,
  FolderTree,
  Tag,
  Languages,
} from 'lucide-react';
import { ArticleDraft, Article } from '../types';
import { ContentRenderer } from './ContentRenderer';
import { formatTimeAgoOrDate } from '../utils/date';

interface DraftsManagerProps {
  drafts: ArticleDraft[];
  articles: Article[];
  onApproveDraft: (draft: ArticleDraft) => Promise<void> | void;
  onRejectDraft: (draftId: string, note?: string) => Promise<void> | void;
  onDeleteDraft: (draftId: string) => Promise<void> | void;
  onEditDraftInEditor: (draft: ArticleDraft) => void;
  showNotification: (msg: string) => void;
  onRefreshDrafts?: () => Promise<void> | void;
}

export const DraftsManager: React.FC<DraftsManagerProps> = ({
  drafts = [],
  articles = [],
  onApproveDraft,
  onRejectDraft,
  onDeleteDraft,
  onEditDraftInEditor,
  showNotification,
  onRefreshDrafts,
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [reviewingDraft, setReviewingDraft] = useState<ArticleDraft | null>(null);
  const [rejectingDraftId, setRejectingDraftId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [compareTab, setCompareTab] = useState<'ua' | 'en'>('ua');

  const pendingCount = drafts.filter((d) => d.status === 'pending').length;
  const approvedCount = drafts.filter((d) => d.status === 'approved').length;
  const rejectedCount = drafts.filter((d) => d.status === 'rejected').length;

  const filteredDrafts = drafts.filter((d) => {
    if (filterStatus === 'all') return true;
    return d.status === filterStatus;
  });

  const getOriginalArticle = (draft: ArticleDraft): Article | undefined => {
    if (draft.type !== 'update' || !draft.articleId) return undefined;
    return articles.find((a) => a.id === draft.articleId);
  };

  const handleApprove = async (draft: ArticleDraft) => {
    setIsProcessing(true);
    try {
      await onApproveDraft(draft);
      setReviewingDraft(null);
    } catch {
      // Помилка відображається в onApproveDraft
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectingDraftId) return;
    setIsProcessing(true);
    try {
      await onRejectDraft(rejectingDraftId, rejectionNote.trim() || undefined);
      setRejectingDraftId(null);
      setRejectionNote('');
      if (reviewingDraft?.id === rejectingDraftId) {
        setReviewingDraft(null);
      }
    } catch {
      // Handled in parent
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (draft: ArticleDraft) => {
    if (window.confirm(`Видалити чорнетку «${draft.articleData?.title || 'Без назви'}»?`)) {
      try {
        await onDeleteDraft(draft.id);
        if (reviewingDraft?.id === draft.id) {
          setReviewingDraft(null);
        }
      } catch {}
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Шапка розділу */}
      <div className="pb-6 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-serif font-medium text-black">
              Чорнетки та модерація матеріалів
            </h1>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-white animate-pulse">
                {pendingCount} {pendingCount === 1 ? 'нова' : 'нових'}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Переглядайте та підтверджуйте матеріали, надіслані редакторами. Опубліковані статті на сайті не змінюються, доки ви не схвалите чернетку.
          </p>
        </div>

        {onRefreshDrafts && (
          <button
            type="button"
            onClick={() => onRefreshDrafts()}
            className="text-xs text-neutral-500 hover:text-black underline cursor-pointer self-start sm:self-auto"
          >
            Оновити список
          </button>
        )}
      </div>

      {/* Фільтри статусів */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto text-xs sm:text-sm">
        <button
          type="button"
          onClick={() => setFilterStatus('pending')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
            filterStatus === 'pending'
              ? 'bg-amber-100 text-amber-900 border border-amber-300'
              : 'text-neutral-500 hover:text-black hover:bg-neutral-100'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Очікують розгляду ({pendingCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('approved')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
            filterStatus === 'approved'
              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
              : 'text-neutral-500 hover:text-black hover:bg-neutral-100'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Схвалені ({approvedCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('rejected')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
            filterStatus === 'rejected'
              ? 'bg-red-100 text-red-900 border border-red-300'
              : 'text-neutral-500 hover:text-black hover:bg-neutral-100'
          }`}
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Відхилені ({rejectedCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('all')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
            filterStatus === 'all'
              ? 'bg-black text-white'
              : 'text-neutral-500 hover:text-black hover:bg-neutral-100'
          }`}
        >
          <span>Всі чернетки ({drafts.length})</span>
        </button>
      </div>

      {/* Список чернеток */}
      {filteredDrafts.length === 0 ? (
        <div className="p-12 text-center bg-neutral-50 border border-neutral-200/80 rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-white border border-neutral-200 mx-auto flex items-center justify-center text-neutral-400 shadow-xs">
            <FileText className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-neutral-800">
            {filterStatus === 'pending'
              ? 'Немає чернеток, що очікують розгляду'
              : filterStatus === 'approved'
              ? 'Немає схвалених чернеток'
              : filterStatus === 'rejected'
              ? 'Немає відхилених чернеток'
              : 'Чорнеток поки що немає'}
          </p>
          <p className="text-xs text-neutral-500 max-w-md mx-auto">
            Коли редактор створює нову статтю або змінює вже опубліковану, вона автоматично з'являється тут для підтвердження адміністратором.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredDrafts.map((draft) => {
            const originalArticle = getOriginalArticle(draft);
            const isNew = draft.type === 'new';
            const articleData = draft.articleData || {};

            return (
              <div
                key={draft.id}
                className="bg-white border border-neutral-200 rounded-xl p-5 sm:p-6 shadow-xs hover:border-neutral-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                {/* Ліва частина: обкладинка та інформація */}
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  {articleData.coverImage ? (
                    <img
                      src={articleData.coverImage}
                      alt={articleData.title}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover bg-neutral-100 shrink-0 border border-neutral-200"
                    />
                  ) : (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg bg-neutral-100 border border-neutral-200 shrink-0 flex items-center justify-center text-neutral-400 text-xs font-mono">
                      Без фото
                    </div>
                  )}

                  <div className="space-y-2 flex-1 min-w-0">
                    {/* Бейджі типу та статусу */}
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      {isNew ? (
                        <span className="font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                          Нова стаття
                        </span>
                      ) : (
                        <span className="font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Edit3 className="w-3 h-3" />
                          <span>Зміни до існуючої статті</span>
                        </span>
                      )}

                      {draft.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3 text-amber-500" />
                          <span>Очікує перевірки</span>
                        </span>
                      )}
                      {draft.status === 'approved' && (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          <span>Схвалено та опубліковано</span>
                        </span>
                      )}
                      {draft.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 font-medium text-red-800 bg-red-50 border border-red-300 px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3 text-red-500" />
                          <span>Відхилено</span>
                        </span>
                      )}

                      <span className="text-neutral-400">•</span>
                      <span className="text-neutral-500">
                        Автор: <strong className="text-black font-medium">{draft.authorDisplayName || draft.authorUsername}</strong>
                      </span>
                    </div>

                    {/* Заголовок статті */}
                    <div>
                      <h3 className="text-base sm:text-lg font-serif font-medium text-black line-clamp-1 hover:text-neutral-700">
                        {articleData.title || 'Без назви'}
                      </h3>
                      {articleData.titleEn && (
                        <p className="text-xs text-neutral-400 italic line-clamp-1">
                          EN: {articleData.titleEn}
                        </p>
                      )}
                    </div>

                    {/* Опис оригіналу (якщо це правка) */}
                    {!isNew && originalArticle && (
                      <p className="text-xs text-neutral-500 bg-neutral-50 p-2 rounded border border-neutral-200/60 flex items-center gap-1.5">
                        <span className="text-neutral-400 font-medium">Оригінал на сайті:</span>
                        <span className="font-medium text-black truncate">{originalArticle.title}</span>
                      </p>
                    )}

                    {/* Примітка модератора */}
                    {draft.moderatorNote && (
                      <p className="text-xs text-neutral-600 bg-amber-50/60 border border-amber-200/60 p-2 rounded">
                        <strong>Примітка:</strong> {draft.moderatorNote}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-[11px] text-neutral-400 pt-0.5">
                      <span>Створено: {formatTimeAgoOrDate(draft.createdAt, undefined, draft.id, 'ua')}</span>
                      <span>•</span>
                      <span>Оновлено: {formatTimeAgoOrDate(draft.updatedAt, undefined, draft.id, 'ua')}</span>
                      {articleData.category && (
                        <>
                          <span>•</span>
                          <span className="text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">
                            {articleData.category}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Права частина: Кнопки дій */}
                <div className="flex items-center gap-2 flex-wrap self-end md:self-center shrink-0 border-t md:border-t-0 pt-3 md:pt-0 w-full md:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setReviewingDraft(draft)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-neutral-100 hover:bg-neutral-200 text-black rounded-lg transition-colors cursor-pointer"
                    title="Переглянути та порівняти зміни"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Переглянути</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onEditDraftInEditor(draft)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-neutral-300 hover:border-black text-neutral-700 hover:text-black rounded-lg transition-colors cursor-pointer"
                    title="Відкрити в редакторі статей для внесення додаткових змін"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Редагувати</span>
                  </button>

                  {draft.status !== 'approved' && (
                    <button
                      type="button"
                      onClick={() => handleApprove(draft)}
                      disabled={isProcessing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                      title="Схвалити та опублікувати на сайті"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Схвалити</span>
                    </button>
                  )}

                  {draft.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingDraftId(draft.id);
                        setRejectionNote('');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-neutral-200 text-neutral-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Відхилити чернетку"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Відхилити</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(draft)}
                    className="p-2 text-neutral-400 hover:text-red-600 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                    title="Видалити чернетку"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модальне вікно відхилення чернетки */}
      {rejectingDraftId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2 text-base font-semibold text-red-600">
                <XCircle className="w-5 h-5" />
                <span>Відхилення чернетки</span>
              </div>
              <button
                type="button"
                onClick={() => setRejectingDraftId(null)}
                className="text-neutral-400 hover:text-black cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-600">
              Ви збираєтесь відхилити цю чернетку. Ви можете вказати примітку для автора, що саме слід виправити:
            </p>

            <div>
              <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5 font-medium">
                Примітка / Зауваження (необов'язково)
              </label>
              <textarea
                rows={3}
                value={rejectionNote}
                onChange={(e) => setRejectionNote(e.target.value)}
                placeholder="Наприклад: Необхідно додати обкладинку або скоротити перший абзац..."
                className="w-full text-xs sm:text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-3 outline-none focus:border-black focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingDraftId(null)}
                className="px-4 py-2 text-xs text-neutral-600 hover:text-black cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleRejectConfirm}
                disabled={isProcessing}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors disabled:opacity-50"
              >
                {isProcessing ? 'Збереження...' : 'Підтвердити відхилення'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Повноекранне модальне вікно перегляду та порівняння (Diff / Preview) */}
      {reviewingDraft && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-scale-up">
            {/* Шапка модального вікна */}
            <div className="p-5 sm:p-6 border-b border-neutral-200 bg-neutral-50/70 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs uppercase tracking-wider font-semibold text-neutral-500">
                    Перегляд чернетки
                  </span>
                  {reviewingDraft.type === 'new' ? (
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                      Нова стаття
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                      Зміни до опублікованої статті
                    </span>
                  )}
                  <span className="text-[11px] text-neutral-500">
                    Автор: <strong>{reviewingDraft.authorDisplayName || reviewingDraft.authorUsername}</strong>
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-serif font-medium text-black line-clamp-1">
                  {reviewingDraft.articleData?.title || 'Без назви'}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setReviewingDraft(null)}
                className="text-neutral-400 hover:text-black p-2 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Вкладки мов у модалі (UA / EN) */}
            <div className="px-6 py-2.5 bg-white border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCompareTab('ua')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    compareTab === 'ua' ? 'bg-black text-white' : 'text-neutral-500 hover:text-black'
                  }`}
                >
                  Українська версія (основна)
                </button>
                <button
                  type="button"
                  onClick={() => setCompareTab('en')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    compareTab === 'en' ? 'bg-black text-white' : 'text-neutral-500 hover:text-black'
                  }`}
                >
                  English version {reviewingDraft.articleData?.titleEn ? '✓' : '(порожньо)'}
                </button>
              </div>

              <div className="text-xs text-neutral-400">
                Створено: {new Date(reviewingDraft.createdAt).toLocaleString('uk-UA')}
              </div>
            </div>

            {/* Вміст перегляду / порівняння */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {reviewingDraft.type === 'update' && getOriginalArticle(reviewingDraft) ? (
                /* ПОРІВНЯННЯ: Оригінал проти Чернетки */
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Ліва колонка: Оригінальна версія на сайті */}
                    <div className="p-5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-neutral-200 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        <span>Поточна опублікована стаття</span>
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[10px]">
                          На сайті зараз
                        </span>
                      </div>

                      {(() => {
                        const orig = getOriginalArticle(reviewingDraft)!;
                        const isEn = compareTab === 'en';
                        const title = isEn ? orig.titleEn : orig.title;
                        const excerpt = isEn ? orig.excerptEn : orig.excerpt;
                        const cats = isEn ? orig.categoriesEn || [orig.categoryEn] : orig.categories || [orig.category];

                        return (
                          <div className="space-y-3">
                            {orig.coverImage && (
                              <img
                                src={orig.coverImage}
                                alt="Поточна обкладинка"
                                className="w-full aspect-[16/9] object-cover rounded-lg border border-neutral-200"
                              />
                            )}
                            <div>
                              <div className="text-[11px] text-neutral-400 uppercase font-mono">Заголовок:</div>
                              <h4 className="text-base font-serif font-medium text-black">
                                {title || <span className="text-neutral-400 italic">(не вказано)</span>}
                              </h4>
                            </div>

                            <div>
                              <div className="text-[11px] text-neutral-400 uppercase font-mono">Короткий опис:</div>
                              <p className="text-xs text-neutral-600 leading-relaxed">
                                {excerpt || <span className="text-neutral-400 italic">(не вказано)</span>}
                              </p>
                            </div>

                            <div>
                              <div className="text-[11px] text-neutral-400 uppercase font-mono">Рубрики:</div>
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {cats?.filter(Boolean).map((c: any, i: number) => (
                                  <span key={i} className="text-xs bg-white border border-neutral-200 px-2 py-0.5 rounded">
                                    {String(c)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Права колонка: Пропонована чорнетка від редактора */}
                    <div className="p-5 bg-amber-50/40 border-2 border-amber-300 rounded-xl space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-amber-200 text-xs font-semibold text-amber-900 uppercase tracking-wider">
                        <span>Пропоновані зміни редактора</span>
                        <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 text-[10px]">
                          Чорнетка
                        </span>
                      </div>

                      {(() => {
                        const prop = reviewingDraft.articleData;
                        const isEn = compareTab === 'en';
                        const title = isEn ? prop.titleEn : prop.title;
                        const excerpt = isEn ? prop.excerptEn : prop.excerpt;
                        const cats = isEn ? prop.categoriesEn || [prop.categoryEn] : prop.categories || [prop.category];

                        return (
                          <div className="space-y-3">
                            {prop.coverImage && (
                              <img
                                src={prop.coverImage}
                                alt="Нова обкладинка"
                                className="w-full aspect-[16/9] object-cover rounded-lg border border-amber-200 shadow-xs"
                              />
                            )}
                            <div>
                              <div className="text-[11px] text-amber-800 uppercase font-mono">Заголовок:</div>
                              <h4 className="text-base font-serif font-medium text-black">
                                {title || <span className="text-neutral-400 italic">(не вказано)</span>}
                              </h4>
                            </div>

                            <div>
                              <div className="text-[11px] text-amber-800 uppercase font-mono">Короткий опис:</div>
                              <p className="text-xs text-neutral-700 leading-relaxed">
                                {excerpt || <span className="text-neutral-400 italic">(не вказано)</span>}
                              </p>
                            </div>

                            <div>
                              <div className="text-[11px] text-amber-800 uppercase font-mono">Рубрики:</div>
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {cats?.filter(Boolean).map((c: any, i: number) => (
                                  <span key={i} className="text-xs bg-white border border-amber-200 px-2 py-0.5 rounded text-amber-950 font-medium">
                                    {String(c)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Повний текст статті (Рендеринг контенту) */}
                  <div className="border border-neutral-200 rounded-xl p-6 bg-white space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 pb-2 border-b border-neutral-100 flex items-center justify-between">
                      <span>Повний текст пропонованої статті ({compareTab.toUpperCase()})</span>
                      <span className="text-[11px] text-neutral-400">Форматування та медіа-блоки</span>
                    </div>

                    <div className="prose max-w-none text-sm">
                      <ContentRenderer
                        content={
                          compareTab === 'en'
                            ? reviewingDraft.articleData.contentEn || 'No content provided for English version.'
                            : reviewingDraft.articleData.content || ''
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* ПЕРЕГЛЯД НОВОЇ СТАТТІ */
                <div className="space-y-6">
                  {reviewingDraft.articleData?.coverImage && (
                    <img
                      src={reviewingDraft.articleData.coverImage}
                      alt={reviewingDraft.articleData.title}
                      className="w-full max-h-[360px] object-cover rounded-xl border border-neutral-200"
                    />
                  )}

                  <div className="space-y-2">
                    <div className="text-xs text-neutral-400 uppercase tracking-widest font-mono">
                      {reviewingDraft.articleData?.category || 'Загальне'} • Автор: {reviewingDraft.articleData?.author}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-serif font-medium text-black">
                      {compareTab === 'en'
                        ? reviewingDraft.articleData?.titleEn || reviewingDraft.articleData?.title
                        : reviewingDraft.articleData?.title}
                    </h1>
                    {(compareTab === 'en' ? reviewingDraft.articleData?.excerptEn : reviewingDraft.articleData?.excerpt) && (
                      <p className="text-sm text-neutral-600 italic leading-relaxed pt-1">
                        {compareTab === 'en'
                          ? reviewingDraft.articleData.excerptEn
                          : reviewingDraft.articleData.excerpt}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-neutral-200 pt-6 prose max-w-none text-sm">
                    <ContentRenderer
                      content={
                        compareTab === 'en'
                          ? reviewingDraft.articleData?.contentEn || 'No content provided for English version.'
                          : reviewingDraft.articleData?.content || ''
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Футер модального вікна з кнопками дій */}
            <div className="p-4 sm:p-5 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between gap-4 flex-wrap">
              <div className="text-xs text-neutral-500">
                Статус: <strong className="text-black">{reviewingDraft.status}</strong>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onEditDraftInEditor(reviewingDraft);
                    setReviewingDraft(null);
                  }}
                  className="px-4 py-2 border border-neutral-300 hover:border-black text-neutral-800 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Редагувати в редакторі
                </button>

                {reviewingDraft.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingDraftId(reviewingDraft.id);
                    }}
                    className="px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    Відхилити чернетку
                  </button>
                )}

                {reviewingDraft.status !== 'approved' && (
                  <button
                    type="button"
                    onClick={() => handleApprove(reviewingDraft)}
                    disabled={isProcessing}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Схвалити та опублікувати на сайті</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
