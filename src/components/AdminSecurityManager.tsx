import React, { useState, useEffect } from 'react';
import {
  Shield,
  KeyRound,
  Lock,
  User,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  Sparkles,
  Info,
  Check,
} from 'lucide-react';
import {
  changeAdminCredentials,
  resetAdminCredentials,
  getAdminAccountInfo,
  AdminAccountInfo,
} from '../services/auth';
import { formatErrorMessage } from '../utils/errors';

interface AdminSecurityManagerProps {
  showNotification: (msg: string) => void;
  onLogout?: () => void;
}

export const AdminSecurityManager: React.FC<AdminSecurityManagerProps> = ({
  showNotification,
}) => {
  const [accountInfo, setAccountInfo] = useState<AdminAccountInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);

  // Поля форми
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Відображення паролів
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // Стани запитів
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Скидання до стандартних
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Завантаження інформації про обліковий запис
  const loadInfo = async () => {
    setIsLoadingInfo(true);
    try {
      const info = await getAdminAccountInfo();
      if (info) {
        setAccountInfo(info);
        setNewUsername(info.username);
      }
    } catch {
    } finally {
      setIsLoadingInfo(false);
    }
  };

  useEffect(() => {
    loadInfo();
  }, []);

  // Оцінка надійності пароля
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, text: 'Введіть пароль', color: 'bg-neutral-200' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score += 1;
    if (/[^a-zA-Z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score, text: 'Слабкий пароль', color: 'bg-amber-500' };
    if (score <= 3) return { score, text: 'Середній пароль', color: 'bg-blue-500' };
    return { score, text: 'Надійний пароль', color: 'bg-emerald-500' };
  };

  const strength = getPasswordStrength(newPassword);

  // Генерація надійного пароля
  const generateStrongPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%^&*';
    let res = '';
    for (let i = 0; i < 16; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(res);
    setConfirmPassword(res);
    setShowNewPass(true);
    setShowConfirmPass(true);
    showNotification('Згенеровано надійний пароль. Обовʼязково збережіть його!');
  };

  // Обробка зміни пароля та логіна
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!currentPassword) {
      setErrorMessage('Будь ласка, вкажіть ваш поточний пароль для підтвердження прав.');
      return;
    }

    if (!newUsername.trim()) {
      setErrorMessage('Вкажіть новий логін або залиште поточний.');
      return;
    }

    if (newUsername.trim().length < 3) {
      setErrorMessage('Логін повинен містити щонайменше 3 символи.');
      return;
    }

    if (!newPassword) {
      setErrorMessage('Введіть новий пароль.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage('Новий пароль повинен містити не менше 6 символів.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Новий пароль та підтвердження не збігаються.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await changeAdminCredentials(
        currentPassword,
        newUsername.trim(),
        newPassword
      );

      if (res.success) {
        setSuccessMessage('Облікові дані успішно змінено та надійно збережено!');
        showNotification('Логін та пароль адміністратора успішно оновлено.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        await loadInfo();
      } else {
        setErrorMessage(formatErrorMessage(res.error, 'Не вдалося оновити облікові дані.'));
      }
    } catch (err: any) {
      setErrorMessage(formatErrorMessage(err, 'Сталася непередбачена помилка.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Обробка скидання до стандартних
  const handleReset = async () => {
    if (!resetPasswordInput) {
      setResetError('Введіть поточний пароль для підтвердження скидання.');
      return;
    }

    setIsResetting(true);
    setResetError(null);

    try {
      const res = await resetAdminCredentials(resetPasswordInput);
      if (res.success) {
        showNotification('Облікові дані скинуто до стандартних налаштувань.');
        setShowResetConfirm(false);
        setResetPasswordInput('');
        setSuccessMessage('Облікові дані скинуто до значень за замовчуванням.');
        await loadInfo();
      } else {
        setResetError(formatErrorMessage(res.error, 'Не вдалося скинути облікові дані.'));
      }
    } catch (err: any) {
      setResetError(formatErrorMessage(err, 'Помилка виконання запиту.'));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Заголовок розділу */}
      <div className="border-b border-neutral-100 pb-6">
        <div className="flex items-center gap-2.5 text-neutral-400 text-xs uppercase tracking-wider mb-1">
          <Shield className="w-4 h-4 text-neutral-800" />
          <span>Безпека та авторизація</span>
        </div>
        <h1
          className="text-2xl sm:text-3xl font-normal text-black tracking-tight"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Зміна логіну та паролю
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Керуйте обліковими даними редакційної панелі. Нові дані шифруються за стандартом HMAC-SHA256
          та надійно зберігаються у базі даних (Neon PostgreSQL) та на сервері.
        </p>
      </div>

      {/* Інформаційна картка поточного стану */}
      <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-neutral-500 uppercase tracking-wider font-mono">
              Поточний обліковий запис
            </div>
            <div className="text-sm sm:text-base font-medium text-black flex items-center gap-2 mt-0.5">
              <span>{accountInfo?.username || 'admin_theimpart'}</span>
              {accountInfo?.isCustom ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-sans px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                  <Check className="w-3 h-3" />
                  Власні дані
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-sans px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700 font-medium">
                  За замовчуванням
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs text-neutral-500 font-mono sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-neutral-200">
          <div>Шифрування: HMAC-SHA256</div>
          <div className="text-emerald-600 font-medium flex items-center sm:justify-end gap-1 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
            Сховище: Хмара PostgreSQL
          </div>
        </div>
      </div>

      {/* Повідомлення про успіх */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{successMessage}</p>
            <p className="text-xs text-emerald-700 mt-1">
              Вашу активну сесію автоматично оновлено новим токеном безпеки. Перезайдіть на інших пристроях за новими даними.
            </p>
          </div>
        </div>
      )}

      {/* Повідомлення про помилку */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Помилка оновлення даних</p>
            <p className="text-xs text-red-700 mt-1">{formatErrorMessage(errorMessage)}</p>
          </div>
        </div>
      )}

      {/* Форма зміни облікових даних */}
      <form onSubmit={handleUpdate} className="space-y-6 bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 shadow-xs">
        {/* Блок 1: Підтвердження поточного пароля */}
        <div className="space-y-2 pb-6 border-b border-neutral-100">
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700">
            Поточний пароль адміністратора <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-neutral-500 mb-2">
            Введіть чинний пароль, щоб підтвердити ваші повноваження на зміну доступу.
          </p>
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
              <KeyRound className="w-4 h-4" />
            </div>
            <input
              type={showCurrentPass ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Введіть поточний пароль..."
              required
              disabled={isSubmitting}
              className="w-full pl-10 pr-10 py-2.5 bg-neutral-50 hover:bg-neutral-100/50 focus:bg-white border border-neutral-300 focus:border-black rounded-lg text-sm text-black placeholder-neutral-400 transition-all outline-none"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPass(!showCurrentPass)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 hover:text-black cursor-pointer"
              title={showCurrentPass ? 'Приховати пароль' : 'Показати пароль'}
            >
              {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Блок 2: Новий логін */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700">
            Новий логін адміністратора
          </label>
          <p className="text-xs text-neutral-500 mb-2">
            Ім'я користувача для авторизації (можна залишити поточний логін або вказати новий).
          </p>
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="admin_theimpart"
              required
              disabled={isSubmitting}
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 hover:bg-neutral-100/50 focus:bg-white border border-neutral-300 focus:border-black rounded-lg text-sm text-black placeholder-neutral-400 transition-all outline-none"
            />
          </div>
        </div>

        {/* Блок 3: Новий пароль */}
        <div className="space-y-2">
          <div className="flex items-center justify-between max-w-md">
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700">
              Новий пароль
            </label>
            <button
              type="button"
              onClick={generateStrongPassword}
              className="text-[11px] text-neutral-600 hover:text-black flex items-center gap-1 cursor-pointer transition-colors"
              title="Згенерувати випадковий надійний пароль"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Згенерувати пароль</span>
            </button>
          </div>
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showNewPass ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Мінімум 6 символів..."
              required
              disabled={isSubmitting}
              className="w-full pl-10 pr-10 py-2.5 bg-neutral-50 hover:bg-neutral-100/50 focus:bg-white border border-neutral-300 focus:border-black rounded-lg text-sm text-black placeholder-neutral-400 transition-all outline-none font-mono"
            />
            <button
              type="button"
              onClick={() => setShowNewPass(!showNewPass)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 hover:text-black cursor-pointer"
              title={showNewPass ? 'Приховати пароль' : 'Показати пароль'}
            >
              {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Індикатор надійності пароля */}
          {newPassword && (
            <div className="max-w-md pt-1 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-neutral-500">
                <span>Надійність:</span>
                <span className="font-medium text-neutral-700">{strength.text}</span>
              </div>
              <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden flex gap-1">
                <div
                  className={`h-full transition-all duration-300 ${strength.color}`}
                  style={{ width: `${Math.min(100, strength.score * 20)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Блок 4: Підтвердження нового пароля */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700">
            Підтвердіть новий пароль
          </label>
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showConfirmPass ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Повторіть новий пароль..."
              required
              disabled={isSubmitting}
              className={`w-full pl-10 pr-10 py-2.5 bg-neutral-50 hover:bg-neutral-100/50 focus:bg-white border rounded-lg text-sm text-black placeholder-neutral-400 transition-all outline-none font-mono ${
                confirmPassword && confirmPassword !== newPassword
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-neutral-300 focus:border-black'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPass(!showConfirmPass)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 hover:text-black cursor-pointer"
              title={showConfirmPass ? 'Приховати пароль' : 'Показати пароль'}
            >
              {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmPassword && confirmPassword !== newPassword && (
            <p className="text-[11px] text-red-500">Паролі не збігаються.</p>
          )}
        </div>

        {/* Кнопка збереження */}
        <div className="pt-4 border-t border-neutral-100 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting || (!!confirmPassword && confirmPassword !== newPassword)}
            className="w-full sm:w-auto px-6 py-3 bg-black text-white hover:bg-neutral-800 active:bg-neutral-900 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Збереження та шифрування...</span>
              </>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                <span>Оновити логін та пароль</span>
              </>
            )}
          </button>

          <span className="text-xs text-neutral-400 text-center sm:text-left">
            Дані набувають чинності миттєво для всіх сеансів.
          </span>
        </div>
      </form>

      {/* Блок скидання до стандартних налаштувань */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-neutral-500" />
              <span>Скидання до початкових облікових даних</span>
            </h3>
            <p className="text-xs text-neutral-500 mt-1 max-w-lg">
              Якщо ви бажаєте відмовитися від власних налаштувань та повернути логін і пароль за замовчуванням
              (змінні середовища Vercel або стандартний логін).
            </p>
          </div>

          {!showResetConfirm && (
            <button
              type="button"
              onClick={() => {
                setShowResetConfirm(true);
                setResetError(null);
              }}
              className="text-xs text-neutral-600 hover:text-black px-3.5 py-2 border border-neutral-200 hover:border-neutral-300 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              Скинути дані
            </button>
          )}
        </div>

        {showResetConfirm && (
          <div className="mt-5 p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-3 animate-fade-in">
            <div className="text-xs text-neutral-700 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Для скидання до заводських облікових даних введіть ваш поточний пароль:
              </span>
            </div>

            {resetError && (
              <div className="text-xs text-red-600 font-medium">
                {formatErrorMessage(resetError)}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="password"
                value={resetPasswordInput}
                onChange={(e) => setResetPasswordInput(e.target.value)}
                placeholder="Поточний пароль..."
                disabled={isResetting}
                className="w-full sm:w-64 px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg outline-none focus:border-black font-mono"
              />
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isResetting || !resetPasswordInput}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isResetting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Підтвердити скидання</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetConfirm(false);
                    setResetPasswordInput('');
                  }}
                  className="px-3 py-2 text-xs text-neutral-600 hover:text-black cursor-pointer"
                >
                  Скасувати
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Пам'ятка безпеки */}
      <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-3">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Рекомендація щодо збереження пароля:</p>
          <p className="text-amber-800/90 leading-relaxed">
            Після зміни обов'язково збережіть нові дані у надійному менеджері паролів (наприклад, 1Password, Bitwarden або Apple Keychain).
            Якщо ви забудете власний пароль, відновлення можливе через скидання змінних у Vercel Dashboard або через прямий доступ до PostgreSQL.
          </p>
        </div>
      </div>
    </div>
  );
};
