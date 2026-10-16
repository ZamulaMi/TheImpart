import React, { useState, useEffect } from 'react';
import { Globe, Save, Check, RefreshCw } from 'lucide-react';
import { SiteSocialLinks, SocialLinksSet } from '../types';
import { formatErrorMessage } from '../utils/errors';

interface SocialLinksManagerProps {
  socialLinks: SiteSocialLinks;
  onSaveSocialLinks: (links: SiteSocialLinks) => Promise<void> | void;
  onRefreshSocialLinks?: () => Promise<void>;
  showNotification: (msg: string) => void;
}

export const SocialLinksManager: React.FC<SocialLinksManagerProps> = ({
  socialLinks,
  onSaveSocialLinks,
  onRefreshSocialLinks,
  showNotification,
}) => {
  const [activeLangTab, setActiveLangTab] = useState<'ua' | 'en'>('ua');
  const [formData, setFormData] = useState<SiteSocialLinks>(socialLinks);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!hasChanges) {
      setFormData(socialLinks);
    }
  }, [socialLinks, hasChanges]);

  // Завантаження актуальних даних при відкритті менеджера
  useEffect(() => {
    if (onRefreshSocialLinks) {
      onRefreshSocialLinks();
    }
  }, []);

  const handleRefresh = async () => {
    if (!onRefreshSocialLinks) return;
    setIsRefreshing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await onRefreshSocialLinks();
      setHasChanges(false);
      const timeStr = new Date().toLocaleTimeString('uk-UA');
      setSuccessMessage(`✓ Свіжі посилання успішно завантажено з сервера (${timeStr})`);
      showNotification('Дані оновлено з сервера!');
    } catch {
      setErrorMessage('Не вдалося зв\'язатися з сервером');
      showNotification('Не вдалося оновити дані із сервера');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Оновлення посилання для конкретної мови та платформи
  const handleLinkChange = (lang: 'ua' | 'en', platform: keyof SocialLinksSet, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [lang]: {
        ...(prev?.[lang] || {}),
        [platform]: value,
      },
    }));
    setHasChanges(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleCopyFromOtherLang = (sourceLang: 'ua' | 'en', targetLang: 'ua' | 'en') => {
    setFormData((prev) => ({
      ...prev,
      [targetLang]: {
        ...(prev?.[sourceLang] || {}),
      },
    }));
    setHasChanges(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    showNotification(
      targetLang === 'en'
        ? 'Посилання скопійовано з української версії'
        : 'Посилання скопійовано з англійської версії'
    );
  };

  const normalizeUrl = (raw: string): string => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    // Якщо введено t.me/xxx, instagram.com/xxx тощо - додаємо https://
    if (trimmed.includes('.') || trimmed.startsWith('@')) {
      const clean = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
      return `https://${clean}`;
    }
    return trimmed;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    // Безпечно нормалізуємо посилання перед збереженням
    const normalizedData: SiteSocialLinks = {
      ua: {
        telegram: normalizeUrl(formData?.ua?.telegram || ''),
        instagram: normalizeUrl(formData?.ua?.instagram || ''),
        x: normalizeUrl(formData?.ua?.x || ''),
        youtube: normalizeUrl(formData?.ua?.youtube || ''),
        threads: normalizeUrl(formData?.ua?.threads || ''),
      },
      en: {
        telegram: normalizeUrl(formData?.en?.telegram || ''),
        instagram: normalizeUrl(formData?.en?.instagram || ''),
        x: normalizeUrl(formData?.en?.x || ''),
        youtube: normalizeUrl(formData?.en?.youtube || ''),
        threads: normalizeUrl(formData?.en?.threads || ''),
      },
    };

    setFormData(normalizedData);

    try {
      await onSaveSocialLinks(normalizedData);
      setHasChanges(false);
      const timeStr = new Date().toLocaleTimeString('uk-UA');
      setSuccessMessage(`✓ Успішно збережено на сервері та в базі даних (${timeStr})`);
      showNotification('Посилання на соц. мережі успішно збережено на сервері!');
    } catch (err: any) {
      console.error('Save social links error:', err);
      setErrorMessage(
        formatErrorMessage(err, 'Помилка збереження на сервері. Спробуйте ще раз.')
      );
      showNotification('Помилка збереження на сервері');
    } finally {
      setIsSaving(false);
    }
  };

  const currentLinks = formData[activeLangTab] || {};

  return (
    <div className="max-w-3xl mx-auto">
      {/* Заголовок */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-neutral-100 gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-medium text-black">
            Керування соціальними мережами
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Налаштуйте посилання на соц. мережі у футері окремо для української та англійської версій сайту.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefreshSocialLinks && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isSaving}
              title="Перезавантажити посилання безпосередньо із сервера"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs tracking-wider font-medium rounded transition-colors disabled:opacity-50 cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Оновити з сервера</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-black text-white text-xs uppercase tracking-wider font-medium rounded hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{isSaving ? 'Збереження...' : 'Зберегти зміни'}</span>
          </button>
        </div>
      </div>

      {/* Повідомлення про успіх */}
      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-900 ml-4 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Повідомлення про помилку */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 text-xs rounded flex items-center justify-between">
          <span>{formatErrorMessage(errorMessage)}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-600 hover:text-red-900 ml-4 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Вкладки вибору мови: UA та EN */}
      <div className="flex items-center justify-between border-b border-neutral-200 pb-px mb-8">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveLangTab('ua')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-all cursor-pointer ${
              activeLangTab === 'ua'
                ? 'border-black text-black'
                : 'border-transparent text-neutral-400 hover:text-neutral-700'
            }`}
          >
            <span>Українська версія (UA)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveLangTab('en')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-all cursor-pointer ${
              activeLangTab === 'en'
                ? 'border-black text-black'
                : 'border-transparent text-neutral-400 hover:text-neutral-700'
            }`}
          >
            <span>English version (EN)</span>
          </button>
        </div>

        {/* Кнопка швидкого копіювання */}
        {activeLangTab === 'en' ? (
          <button
            type="button"
            onClick={() => handleCopyFromOtherLang('ua', 'en')}
            className="text-xs text-neutral-500 hover:text-black underline underline-offset-4 cursor-pointer"
          >
            Скопіювати з UA
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleCopyFromOtherLang('en', 'ua')}
            className="text-xs text-neutral-500 hover:text-black underline underline-offset-4 cursor-pointer"
          >
            Скопіювати з EN
          </button>
        )}
      </div>

      {/* Форма налаштування посилань */}
      <form onSubmit={handleSave} className="space-y-6 bg-neutral-50/70 p-6 sm:p-8 rounded-lg border border-neutral-100">
        {/* Telegram */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 fill-current text-sky-500" viewBox="0 0 24 24">
                <path d="M21.927 3.513a1.498 1.498 0 0 0-1.505-.288L2.348 10.38c-1.048.423-1.042 1.34-.191 1.602l4.639 1.448 10.741-6.777c.507-.308.972-.143.59.196l-8.704 7.854-.319 4.768c.467 0 .673-.214.935-.467l2.247-2.185 4.675 3.453c.861.475 1.482.23 1.696-.8l3.068-14.457c.314-1.26-.481-1.831-1.308-1.442z" />
              </svg>
              <span>Telegram ({activeLangTab.toUpperCase()})</span>
            </span>
            <span className="text-[10px] text-neutral-400 font-normal lowercase">https://t.me/...</span>
          </label>
          <input
            type="text"
            value={currentLinks.telegram || ''}
            onChange={(e) => handleLinkChange(activeLangTab, 'telegram', e.target.value)}
            placeholder="https://t.me/your_channel"
            className="w-full px-3.5 py-2.5 bg-white text-sm border border-neutral-200 rounded focus:outline-none focus:border-black font-mono text-xs"
          />
        </div>

        {/* Instagram */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 fill-current text-pink-600" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
              <span>Instagram ({activeLangTab.toUpperCase()})</span>
            </span>
            <span className="text-[10px] text-neutral-400 font-normal lowercase">https://instagram.com/...</span>
          </label>
          <input
            type="text"
            value={currentLinks.instagram || ''}
            onChange={(e) => handleLinkChange(activeLangTab, 'instagram', e.target.value)}
            placeholder="https://instagram.com/your_profile"
            className="w-full px-3.5 py-2.5 bg-white text-sm border border-neutral-200 rounded focus:outline-none focus:border-black font-mono text-xs"
          />
        </div>

        {/* X (formerly Twitter) */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 fill-current text-black" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>X / Twitter ({activeLangTab.toUpperCase()})</span>
            </span>
            <span className="text-[10px] text-neutral-400 font-normal lowercase">https://x.com/...</span>
          </label>
          <input
            type="text"
            value={currentLinks.x || ''}
            onChange={(e) => handleLinkChange(activeLangTab, 'x', e.target.value)}
            placeholder="https://x.com/your_account"
            className="w-full px-3.5 py-2.5 bg-white text-sm border border-neutral-200 rounded focus:outline-none focus:border-black font-mono text-xs"
          />
        </div>

        {/* YouTube */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 fill-current text-red-600" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              <span>YouTube ({activeLangTab.toUpperCase()})</span>
            </span>
            <span className="text-[10px] text-neutral-400 font-normal lowercase">https://youtube.com/@...</span>
          </label>
          <input
            type="text"
            value={currentLinks.youtube || ''}
            onChange={(e) => handleLinkChange(activeLangTab, 'youtube', e.target.value)}
            placeholder="https://youtube.com/@your_channel"
            className="w-full px-3.5 py-2.5 bg-white text-sm border border-neutral-200 rounded focus:outline-none focus:border-black font-mono text-xs"
          />
        </div>

        {/* Threads */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 fill-none stroke-current stroke-[2] stroke-linecap-round stroke-linejoin-round text-black" viewBox="0 0 24 24">
                <path d="M19.25 12c0 4.5-3.25 8.25-8 8.25-4.5 0-7.75-3.5-7.75-8.25S6.75 3.75 12 3.75c4.75 0 7.5 3 7.75 7.25M16 11.25c0 3-1.75 4.5-4 4.5s-3.75-1.5-3.75-3.75S9.75 8.25 12 8.25c2.75 0 4 2 4 4.5v1.25c0 1.5-.75 2.5-2 2.5s-2-.75-2-2.25" />
              </svg>
              <span>Threads ({activeLangTab.toUpperCase()})</span>
            </span>
            <span className="text-[10px] text-neutral-400 font-normal lowercase">https://threads.net/@...</span>
          </label>
          <input
            type="text"
            value={currentLinks.threads || ''}
            onChange={(e) => handleLinkChange(activeLangTab, 'threads', e.target.value)}
            placeholder="https://threads.net/@your_account"
            className="w-full px-3.5 py-2.5 bg-white text-sm border border-neutral-200 rounded focus:outline-none focus:border-black font-mono text-xs"
          />
        </div>

        {/* Нижня панель дій */}
        <div className="pt-4 border-t border-neutral-200 flex items-center justify-between">
          <p className="text-xs text-neutral-500">
            {hasChanges
              ? 'Є незбережені зміни. Натисніть «Зберегти зміни», щоб застосувати їх.'
              : 'Усі зміни синхронізовано з базою даних.'}
          </p>
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2 bg-black text-white text-xs uppercase tracking-wider font-medium rounded hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </form>
    </div>
  );
};
