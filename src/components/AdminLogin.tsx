import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ArrowLeft, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { loginAdmin } from '../services/auth';
import { formatErrorMessage } from '../utils/errors';

interface AdminLoginProps {
  onLoginSuccess: () => void;
  onBackToSite: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess, onBackToSite }) => {
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem('impart_admin_username') || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Будь ласка, введіть логін та пароль.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const result = await loginAdmin(username.trim(), password, rememberMe);
    setIsLoading(false);

    if (result.success) {
      onLoginSuccess();
    } else {
      setErrorMessage(formatErrorMessage(result.error, 'Невірний логін або пароль.'));
      if (result.remainingAttempts !== undefined) {
        setRemainingAttempts(result.remainingAttempts);
      }
      if (result.locked) {
        setIsLocked(true);
      }
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col justify-between selection:bg-neutral-900 selection:text-white light admin-scope" data-theme="light">
      {/* Верхня панель */}
      <header className="px-6 sm:px-12 py-5 flex items-center justify-between border-b border-neutral-200/90 bg-white/90 backdrop-blur-md">
        <button
          onClick={onBackToSite}
          type="button"
          className="flex items-center gap-2 text-xs sm:text-sm text-neutral-600 hover:text-black transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Повернутися на сайт</span>
        </button>

        <div className="flex items-center gap-2 text-[11px] text-neutral-500 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Захищене з'єднання (SSL/TLS)</span>
        </div>
      </header>

      {/* Центральна картка входу */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-white border border-neutral-200 rounded-2xl p-8 sm:p-10 shadow-xl relative overflow-hidden">
          {/* Декоративна тонка лінія зверху */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-neutral-300 via-neutral-900 to-neutral-300" />

          {/* Заголовок та брендинг */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-700 mb-4 shadow-xs">
              <Lock className="w-5 h-5 text-neutral-700" />
            </div>
            <h1
              className="text-2xl sm:text-3xl font-medium tracking-tight text-black mb-2"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              The Impart
            </h1>
            <p className="text-xs uppercase tracking-widest text-neutral-500 font-sans">
              Вхід для адміністратора та редактора
            </p>
          </div>

          {/* Сповіщення про помилку */}
          {errorMessage && (
            <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{formatErrorMessage(errorMessage)}</p>
                {remainingAttempts !== null && remainingAttempts > 0 && !isLocked && (
                  <p className="text-[11px] text-red-600/90 mt-1">
                    Залишилось спроб до блокування: <strong className="text-red-900">{remainingAttempts}</strong>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Форма авторизації */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-600 mb-2">
                Ім'я користувача / Логін
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  placeholder="Введіть ваш логін"
                  required
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 hover:bg-white focus:bg-white border border-neutral-300 focus:border-black focus:ring-1 focus:ring-black rounded-lg text-sm text-neutral-900 placeholder-neutral-400 transition-all outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-600 mb-2">
                Пароль
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  placeholder="••••••••••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-neutral-50 hover:bg-white focus:bg-white border border-neutral-300 focus:border-black focus:ring-1 focus:ring-black rounded-lg text-sm text-neutral-900 placeholder-neutral-400 transition-all outline-none disabled:opacity-50 font-mono tracking-tight"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
                  title={showPassword ? 'Приховати пароль' : 'Показати пароль'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-neutral-600 hover:text-black">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-neutral-300 bg-white text-black focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span>Запам'ятати на цьому пристрої</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-black text-white hover:bg-neutral-800 active:bg-neutral-900 font-medium text-sm rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Перевірка облікових даних...</span>
                </>
              ) : (
                <span>Увійти до панелі керування</span>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Футер */}
      <footer className="px-6 py-4 text-center text-xs text-neutral-500 border-t border-neutral-200 bg-white">
        © {new Date().getFullYear()} The Impart. Усі права захищено. Авторизований доступ лише для редакції.
      </footer>
    </div>
  );
};
