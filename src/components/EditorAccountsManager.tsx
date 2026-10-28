import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  KeyRound,
  Trash2,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
  Clock,
  Calendar,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { EditorAccount } from '../types';
import {
  fetchEditorsFromCloud,
  createEditorAccount,
  updateEditorAccount,
  deleteEditorAccount,
} from '../services/auth';

interface EditorAccountsManagerProps {
  showNotification: (msg: string) => void;
}

export const EditorAccountsManager: React.FC<EditorAccountsManagerProps> = ({
  showNotification,
}) => {
  const [editors, setEditors] = useState<EditorAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Створення нового редактора
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Редагування існуючого редактора
  const [editingEditor, setEditingEditor] = useState<EditorAccount | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);

  const loadEditors = async () => {
    setIsLoading(true);
    try {
      const data = await fetchEditorsFromCloud();
      setEditors(data);
    } catch {
      setErrorMsg('Не вдалося завантажити список редакторів');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEditors();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUser = newUsername.trim();
    const cleanPass = newPassword.trim();
    const cleanName = newDisplayName.trim() || cleanUser;

    if (!cleanUser || cleanUser.length < 3) {
      setErrorMsg('Логін повинен містити щонайменше 3 символи');
      return;
    }
    if (!cleanPass || cleanPass.length < 6) {
      setErrorMsg('Пароль повинен містити щонайменше 6 символів');
      return;
    }

    setIsSubmitting(true);
    const res = await createEditorAccount({
      username: cleanUser,
      password: cleanPass,
      displayName: cleanName,
      isActive: true,
    });
    setIsSubmitting(false);

    if (res.success) {
      showNotification(res.message || `Редактора «${cleanUser}» створено!`);
      setShowCreateModal(false);
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      loadEditors();
    } else {
      setErrorMsg(res.error || 'Помилка створення редактора');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEditor) return;
    setErrorMsg(null);

    setIsSubmitting(true);
    const res = await updateEditorAccount({
      id: editingEditor.id,
      displayName: editDisplayName.trim() || editingEditor.username,
      newPassword: editNewPassword.trim() || undefined,
      isActive: editingEditor.isActive,
    });
    setIsSubmitting(false);

    if (res.success) {
      showNotification(`Дані редактора «${editingEditor.username}» оновлено!`);
      setEditingEditor(null);
      setEditNewPassword('');
      loadEditors();
    } else {
      setErrorMsg(res.error || 'Помилка оновлення даних');
    }
  };

  const handleToggleActive = async (editor: EditorAccount) => {
    const nextState = !editor.isActive;
    const res = await updateEditorAccount({
      id: editor.id,
      isActive: nextState,
    });

    if (res.success) {
      setEditors((prev) =>
        prev.map((e) => (e.id === editor.id ? { ...e, isActive: nextState } : e))
      );
      showNotification(
        nextState
          ? `Обліковий запис «${editor.username}» активовано.`
          : `Обліковий запис «${editor.username}» деактивовано.`
      );
    } else {
      showNotification(res.error || 'Не вдалося змінити статус');
    }
  };

  const handleDelete = async (editor: EditorAccount) => {
    const confirmDelete = window.confirm(
      `Ви впевнені, що хочете видалити обліковий запис редактора «${editor.username}»? Він втратить доступ до панелі редактора.`
    );
    if (!confirmDelete) return;

    const res = await deleteEditorAccount(editor.id);
    if (res.success) {
      setEditors((prev) => prev.filter((e) => e.id !== editor.id));
      showNotification(`Обліковий запис «${editor.username}» видалено`);
    } else {
      showNotification(res.error || 'Не вдалося видалити редактора');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Заголовок */}
      <div className="pb-6 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-medium text-black">
            Облікові записи редакторів
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Створюйте та керуйте даними для входу редакторів. Редактори мають доступ лише до розділів «Редактор статей» та «Рубрики та теми», а всі їхні зміни надсилаються на модерацію як чернетки.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white hover:bg-neutral-800 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer shrink-0 shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          <span>Створити редактора</span>
        </button>
      </div>

      {/* Повідомлення про помилку */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Список редакторів */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-neutral-50/60 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-700">
            <Users className="w-4 h-4 text-black" />
            <span>Зареєстровані редактори ({editors.length})</span>
          </div>
          <span className="text-[11px] text-neutral-400">
            Доступ: Тільки статті та рубрики (збереження в чернетки)
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-neutral-400 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-black" />
            <span className="text-xs">Завантаження облікових записів...</span>
          </div>
        ) : editors.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-neutral-100 mx-auto flex items-center justify-center text-neutral-400">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-neutral-800">
              Поки що не створено жодного облікового запису редактора
            </p>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Натисніть кнопку «Створити редактора», щоб згенерувати логін та пароль для члена редакції.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {editors.map((editor) => (
              <div
                key={editor.id}
                className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50/50 transition-colors"
              >
                <div className="flex items-start sm:items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm shrink-0 ${
                      editor.isActive
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-200 text-neutral-500'
                    }`}
                  >
                    {editor.displayName?.slice(0, 2).toUpperCase() || editor.username.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-medium text-black">
                        {editor.displayName}
                      </span>
                      <span className="text-xs text-neutral-500 font-mono bg-neutral-100 px-2 py-0.5 rounded">
                        @{editor.username}
                      </span>
                      {editor.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>Активний</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                          <span>Деактивовано</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-[11px] text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>Створено: {new Date(editor.createdAt).toLocaleDateString('uk-UA')}</span>
                      </span>
                      {editor.lastLogin && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>Останній вхід: {new Date(editor.lastLogin).toLocaleDateString('uk-UA')}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Дії */}
                <div className="flex items-center gap-2 self-end sm:self-auto pt-2 sm:pt-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(editor)}
                    className={`p-2 text-xs rounded-lg border transition-colors cursor-pointer ${
                      editor.isActive
                        ? 'border-neutral-200 text-neutral-600 hover:text-amber-700 hover:bg-amber-50'
                        : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                    }`}
                    title={editor.isActive ? 'Деактивувати редактора' : 'Активувати редактора'}
                  >
                    {editor.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setEditingEditor(editor);
                      setEditDisplayName(editor.displayName);
                      setEditNewPassword('');
                    }}
                    className="p-2 text-xs border border-neutral-200 text-neutral-600 hover:text-black hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                    title="Змінити пароль або ім'я"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(editor)}
                    className="p-2 text-xs border border-neutral-200 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Видалити обліковий запис"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Інформаційна плашка про безпеку */}
      <div className="p-5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-600 space-y-2">
        <div className="flex items-center gap-2 font-medium text-black">
          <ShieldAlert className="w-4 h-4 text-neutral-700" />
          <span>Як працює панель редактора?</span>
        </div>
        <p className="leading-relaxed">
          1. Редактор здійснює вхід за своїм створеним логіном та паролем через звичайну сторінку авторизації.
        </p>
        <p className="leading-relaxed">
          2. Йому доступні лише розділи «Редактор статей» та «Рубрики та теми». Права видалення статей або рубрик/тем у редактора вимкнені.
        </p>
        <p className="leading-relaxed">
          3. Будь-які зміни в опублікованих статтях чи нові матеріали від редактора зберігаються як чернетки та не змінюють сайт доки Ви не підтвердите їх у розділі «Чорнетки та модерація».
        </p>
      </div>

      {/* Модальне вікно створення нового редактора */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2 text-base font-semibold text-black">
                <UserPlus className="w-5 h-5 text-black" />
                <span>Новий обліковий запис редактора</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-neutral-400 hover:text-black cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5 font-medium">
                  Логін для входу *
                </label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="editor_john"
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-black focus:bg-white transition-all font-mono"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Латинські літери, цифри або підкреслення (від 3 символів)
                </span>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5 font-medium">
                  Ім'я / Псевдонім редактора
                </label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Іван Франко"
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-black focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5 font-medium">
                  Пароль *
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg pl-3.5 pr-10 py-2.5 outline-none focus:border-black focus:bg-white transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-black cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Щонайменше 6 символів
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 text-xs text-neutral-600 hover:text-black cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-black text-white hover:bg-neutral-800 text-xs font-medium rounded-lg cursor-pointer transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Створити</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальне вікно редагування редактора */}
      {editingEditor && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2 text-base font-semibold text-black">
                <KeyRound className="w-5 h-5 text-black" />
                <span>Редагування редактора @{editingEditor.username}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingEditor(null)}
                className="text-neutral-400 hover:text-black cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5 font-medium">
                  Ім'я / Псевдонім
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-black focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5 font-medium">
                  Новий пароль (залиште порожнім, щоб не змінювати)
                </label>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editNewPassword}
                    onChange={(e) => setEditNewPassword(e.target.value)}
                    placeholder="Введіть новий пароль"
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg pl-3.5 pr-10 py-2.5 outline-none focus:border-black focus:bg-white transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-black cursor-pointer"
                  >
                    {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingEditor(null)}
                  className="px-4 py-2.5 text-xs text-neutral-600 hover:text-black cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-black text-white hover:bg-neutral-800 text-xs font-medium rounded-lg cursor-pointer transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Зберегти зміни</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
