import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  EyeOff,
  Link as LinkIcon,
  Table as TableIcon,
  Image as ImageIcon,
  Video as VideoIcon,
  Highlighter,
  Palette,
  Type,
  Quote,
  AlertCircle,
  Info,
  CheckCircle2,
  AlertTriangle,
  List,
  ListOrdered,
  Minus,
  Upload,
  ChevronDown,
  Columns,
  Undo2,
  Redo2,
  X,
  Check,
  RotateCcw,
  Sparkles,
  Images,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
} from 'lucide-react';
import { ContentRenderer } from './ContentRenderer';
import { markdownToHtml } from '../utils/editorConverter';
import { PhotoCarousel, CarouselSlide } from './PhotoCarousel';
import { getAuthHeaders } from '../services/auth';
import { formatErrorMessage } from '../utils/errors';

interface RichArticleEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  lang?: 'ua' | 'en';
  minHeight?: string;
  articleId?: string;
}

export const RichArticleEditor: React.FC<RichArticleEditorProps> = ({
  value,
  onChange,
  placeholder = 'Почніть писати статтю тут...',
  lang = 'ua',
  minHeight = '440px',
  articleId = 'default',
}) => {
  const visualEditorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInternalChangeRef = useRef(false);

  // Режим відображення: 'visual' (WYSIWYG), 'split' (паралельний), 'code' (розмітка), 'preview' (чистий перегляд)
  const [viewMode, setViewMode] = useState<'visual' | 'split' | 'code' | 'preview'>('visual');

  // Історія дій для Undo / Redo
  const [history, setHistory] = useState<string[]>([value || '']);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Автозбереження
  const [autoSaveStatus, setAutoSaveStatus] = useState<string | null>(null);
  const [hasDraftNotice, setHasDraftNotice] = useState<boolean>(false);
  const [draftTimestamp, setDraftTimestamp] = useState<string>('');
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const storageKey = `impart_autosave_${articleId}_${lang}`;

  // Меню та випадаючі списки
  const [activeDropdown, setActiveDropdown] = useState<
    'heading' | 'highlight' | 'color' | 'font' | 'callout' | null
  >(null);

  // Модальні діалоги
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isEditingExistingLink, setIsEditingExistingLink] = useState(false);
  const activeLinkElRef = useRef<HTMLAnchorElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const [showTableModal, setShowTableModal] = useState(false);
  const [tableCols, setTableCols] = useState(3);
  const [tableRows, setTableRows] = useState(3);
  const [tableHeaders, setTableHeaders] = useState(['Колонка 1', 'Колонка 2', 'Колонка 3']);

  const [showImageModal, setShowImageModal] = useState(false);
  const [imageTab, setImageTab] = useState<'upload' | 'url'>('upload');
  const [imageUrl, setImageUrl] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  const [showCarouselModal, setShowCarouselModal] = useState(false);
  const [carouselSlides, setCarouselSlides] = useState<Array<{ id: string; url: string; caption: string }>>([]);
  const [carouselCaption, setCarouselCaption] = useState('');
  const [carouselUrlInput, setCarouselUrlInput] = useState('');
  const [carouselUrlCaption, setCarouselUrlCaption] = useState('');
  const [isUploadingCarousel, setIsUploadingCarousel] = useState(false);
  const [carouselUploadError, setCarouselUploadError] = useState<string | null>(null);
  const carouselFileInputRef = useRef<HTMLInputElement>(null);

  // 1. Автоматичне закриття випадаючих меню при кліку за їх межами або Esc
  useEffect(() => {
    if (!activeDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.editor-dropdown-container')) {
        setActiveDropdown(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveDropdown(null);
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDropdown]);

  // 2. Ініціалізація та синхронізація вмісту візуального редактора
  useEffect(() => {
    if (!visualEditorRef.current) return;
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }

    const htmlContent = markdownToHtml(value || '');
    if (visualEditorRef.current.innerHTML !== htmlContent) {
      visualEditorRef.current.innerHTML = htmlContent;
    }
  }, [value, viewMode]);

  // 3. Перевірка наявності автозбереженої чернетки при відкритті
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(storageKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.content && parsed.content.trim() !== (value || '').trim()) {
          setHasDraftNotice(true);
          setDraftTimestamp(parsed.time || 'нещодавно');
        }
      }
    } catch {}
  }, [storageKey]);

  // 4. Автозбереження кожні 1.5 секунди після припинення вводу
  const triggerAutoSave = useCallback(
    (newContent: string) => {
      setAutoSaveStatus('Збереження...');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

      autoSaveTimerRef.current = setTimeout(() => {
        try {
          const nowStr = new Date().toLocaleTimeString('uk-UA', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          localStorage.setItem(
            storageKey,
            JSON.stringify({ content: newContent, time: nowStr, timestamp: Date.now() })
          );
          setAutoSaveStatus(`Автозбережено о ${nowStr}`);
        } catch {
          setAutoSaveStatus(null);
        }
      }, 1500);
    },
    [storageKey]
  );

  // 5. Оновлення історії та виклик onChange
  const pushToHistoryAndEmit = (newVal: string) => {
    isInternalChangeRef.current = true;
    onChange(newVal);
    triggerAutoSave(newVal);

    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      if (sliced.length > 50) sliced.shift();
      return [...sliced, newVal];
    });
    setHistoryIndex((prev) => prev + 1);
  };

  // 6. Відновлення чернетки
  const handleRestoreDraft = () => {
    try {
      const savedDraft = localStorage.getItem(storageKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.content) {
          pushToHistoryAndEmit(parsed.content);
          if (visualEditorRef.current) {
            visualEditorRef.current.innerHTML = markdownToHtml(parsed.content);
          }
        }
      }
    } catch {}
    setHasDraftNotice(false);
  };

  const handleDismissDraft = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setHasDraftNotice(false);
  };

  // 7. Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const targetIndex = historyIndex - 1;
      const targetVal = history[targetIndex];
      setHistoryIndex(targetIndex);
      isInternalChangeRef.current = true;
      onChange(targetVal);
      if (visualEditorRef.current) {
        visualEditorRef.current.innerHTML = markdownToHtml(targetVal);
      }
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const targetIndex = historyIndex + 1;
      const targetVal = history[targetIndex];
      setHistoryIndex(targetIndex);
      isInternalChangeRef.current = true;
      onChange(targetVal);
      if (visualEditorRef.current) {
        visualEditorRef.current.innerHTML = markdownToHtml(targetVal);
      }
    }
  };

  // 8. Надійне збереження та відновлення виділення (Selection Range)
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && visualEditorRef.current) {
      const range = sel.getRangeAt(0);
      const common = range.commonAncestorContainer;
      if (visualEditorRef.current === common || visualEditorRef.current.contains(common)) {
        savedRangeRef.current = range.cloneRange();
      }
    }
  };

  const restoreSelection = () => {
    if (!savedRangeRef.current || !visualEditorRef.current) return;
    try {
      visualEditorRef.current.focus();
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
    } catch {}
  };

  // 9. Допоміжна функція для обгортання тексту в режимі Коду (Textarea)
  const wrapSelectionInTextarea = (prefix: string, suffix: string = '', defaultText: string = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.slice(start, end) || defaultText;
    const replacement = prefix + selected + suffix;
    const newVal = text.slice(0, start) + replacement + text.slice(end);
    pushToHistoryAndEmit(newVal);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  // 10. Виконання команд форматування (WYSIWYG + Code fallback)
  const executeCommand = (command: string, value: string | undefined = undefined) => {
    if (viewMode === 'code') {
      if (command === 'bold') wrapSelectionInTextarea('**', '**', 'жирний текст');
      else if (command === 'italic') wrapSelectionInTextarea('*', '*', 'курсив');
      else if (command === 'underline') wrapSelectionInTextarea('<u>', '</u>', 'підкреслений текст');
      else if (command === 'strikeThrough') wrapSelectionInTextarea('~~', '~~', 'закреслений текст');
      else if (command === 'insertUnorderedList') wrapSelectionInTextarea('- ', '', 'Елемент списку');
      else if (command === 'insertOrderedList') wrapSelectionInTextarea('1. ', '', 'Елемент списку');
      return;
    }

    if (!visualEditorRef.current) return;
    restoreSelection();
    try {
      document.execCommand(command, false, value);
    } catch {}

    const html = visualEditorRef.current.innerHTML;
    pushToHistoryAndEmit(html);
  };

  // 11. Надійна вставка блокових елементів (Callout, Таблиця, Медіа, Розділювач)
  const insertBlockElement = (htmlSnippet: string) => {
    if (!visualEditorRef.current) return;
    restoreSelection();

    const sel = window.getSelection();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlSnippet.trim();
    const targetEl = tempDiv.firstElementChild || tempDiv;

    if (!sel || sel.rangeCount === 0 || !visualEditorRef.current.contains(sel.anchorNode)) {
      visualEditorRef.current.appendChild(targetEl);
      const p = document.createElement('p');
      p.innerHTML = '<br/>';
      visualEditorRef.current.appendChild(p);
      pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
      return;
    }

    const range = sel.getRangeAt(0);

    // Шукаємо батьківський блоковий елемент всередині visualEditorRef
    let block: HTMLElement | null = null;
    let curr: Node | null = range.startContainer;
    while (curr && curr !== visualEditorRef.current) {
      if (curr.nodeType === Node.ELEMENT_NODE) {
        block = curr as HTMLElement;
        if (block.parentNode === visualEditorRef.current) break;
      }
      curr = curr.parentNode;
    }

    const nextP = document.createElement('p');
    nextP.innerHTML = '<br/>';

    if (block && block.parentNode === visualEditorRef.current) {
      // Якщо це порожній абзац, замінюємо його
      if (block.tagName.toLowerCase() === 'p' && (!block.textContent || !block.textContent.trim())) {
        visualEditorRef.current.replaceChild(targetEl, block);
        targetEl.after(nextP);
      } else {
        block.after(targetEl);
        targetEl.after(nextP);
      }
    } else {
      range.deleteContents();
      range.insertNode(targetEl);
      targetEl.after(nextP);
    }

    // Встановлюємо курсор у наступний порожній абзац
    const newRange = document.createRange();
    newRange.setStart(nextP, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    savedRangeRef.current = newRange.cloneRange();

    pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
  };

  // 12. Надійне перетворення блоків (Заголовки H1, H2, H3, звичайний абзац P)
  const handleFormatHeading = (tag: 'h2' | 'h3' | 'h4' | 'p') => {
    setActiveDropdown(null);

    if (viewMode === 'code') {
      if (tag === 'h2') wrapSelectionInTextarea('## ', '', 'Заголовок');
      else if (tag === 'h3') wrapSelectionInTextarea('### ', '', 'Підзаголовок');
      else if (tag === 'h4') wrapSelectionInTextarea('#### ', '', 'Дрібний заголовок');
      else wrapSelectionInTextarea('\n\n', '\n\n', 'Текст абзацу');
      return;
    }

    if (!visualEditorRef.current) return;
    restoreSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !visualEditorRef.current.contains(sel.anchorNode)) {
      visualEditorRef.current.focus();
      return;
    }

    const range = sel.getRangeAt(0);

    // Знаходимо найближчий блоковий контейнер
    let blockNode: HTMLElement | null = null;
    let curr: Node | null = range.startContainer;
    while (curr && curr !== visualEditorRef.current) {
      if (curr.nodeType === Node.ELEMENT_NODE) {
        const el = curr as HTMLElement;
        const tagName = el.tagName.toLowerCase();
        if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'div'].includes(tagName)) {
          blockNode = el;
          break;
        }
      }
      curr = curr.parentNode;
    }

    if (blockNode && visualEditorRef.current.contains(blockNode)) {
      // Замінюємо існуючий блок новим елементом потрібного тегу
      const newEl = document.createElement(tag);
      while (blockNode.firstChild) {
        newEl.appendChild(blockNode.firstChild);
      }
      blockNode.parentNode?.replaceChild(newEl, blockNode);

      // Встановлюємо курсор у кінець новоствореного блоку
      const newRange = document.createRange();
      newRange.selectNodeContents(newEl);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    } else {
      // Якщо текст був безпосередньо у visualEditorRef
      let success = false;
      try {
        success = document.execCommand('formatBlock', false, `<${tag.toUpperCase()}>`);
      } catch {}
      if (!success) {
        try {
          success = document.execCommand('formatBlock', false, tag);
        } catch {}
      }
      if (!success) {
        const newEl = document.createElement(tag);
        newEl.appendChild(range.extractContents());
        range.insertNode(newEl);
      }
    }

    pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
  };

  // 13. Застосування та зняття хайлайтера (Маркер)
  const handleApplyHighlight = (color: string | null) => {
    setActiveDropdown(null);

    if (viewMode === 'code') {
      if (color) wrapSelectionInTextarea(`[hl:${color}]`, `[/hl]`, 'виділений текст');
      return;
    }

    if (!visualEditorRef.current) return;
    restoreSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !visualEditorRef.current.contains(sel.anchorNode)) return;

    // Перевіряємо, чи виділення вже знаходиться всередині тегу <mark>
    let markEl: HTMLElement | null = null;
    let node: Node | null = sel.anchorNode;
    while (node && node !== visualEditorRef.current) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'mark') {
        markEl = node as HTMLElement;
        break;
      }
      node = node.parentNode;
    }

    if (!color) {
      // Зняти виділення
      if (markEl && markEl.parentNode) {
        while (markEl.firstChild) {
          markEl.parentNode.insertBefore(markEl.firstChild, markEl);
        }
        markEl.remove();
        pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
      }
      return;
    }

    const bgColors: Record<string, string> = {
      yellow: '#fef08a',
      green: '#a7f3d0',
      blue: '#bae6fd',
      pink: '#fbcfe8',
      orange: '#fed7aa',
      purple: '#e9d5ff',
    };
    const bg = bgColors[color] || '#fef08a';

    if (markEl) {
      markEl.className = `hl-${color}`;
      markEl.style.backgroundColor = bg;
      pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
      return;
    }

    const range = sel.getRangeAt(0);
    const selectedText = range.toString() || (savedRangeRef.current ? savedRangeRef.current.toString() : '');
    const mark = document.createElement('mark');
    mark.className = `hl-${color}`;
    mark.style.backgroundColor = bg;
    mark.style.padding = '2px 5px';
    mark.style.borderRadius = '3px';

    if (selectedText) {
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
    } else {
      mark.textContent = 'виділений текст';
      range.insertNode(mark);
    }

    const newRange = document.createRange();
    newRange.setStartAfter(mark);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    savedRangeRef.current = newRange.cloneRange();

    pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
  };

  // 14. Застосування та скидання кольору тексту
  const handleApplyColor = (colorHex: string | null) => {
    setActiveDropdown(null);
    if (viewMode === 'code') {
      if (colorHex) wrapSelectionInTextarea(`[color:${colorHex}]`, `[/color]`, 'кольоровий текст');
      return;
    }

    if (!visualEditorRef.current) return;
    restoreSelection();

    if (!colorHex) {
      document.execCommand('foreColor', false, '#111827');
    } else {
      document.execCommand('foreColor', false, colorHex);
    }

    pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
  };

  // 15. Застосування стилю шрифту
  const handleApplyFont = (fontFamily: string | null, fontType: 'serif' | 'sans' | 'mono' | 'default') => {
    setActiveDropdown(null);
    if (viewMode === 'code') {
      if (fontType !== 'default') wrapSelectionInTextarea(`[font:${fontType}]`, `[/font]`, 'текст шрифтом');
      return;
    }

    if (!visualEditorRef.current) return;
    restoreSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !visualEditorRef.current.contains(sel.anchorNode)) return;

    if (!fontFamily) {
      document.execCommand('fontName', false, 'inherit');
      pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
      return;
    }

    const range = sel.getRangeAt(0);
    const selectedText = range.toString() || (savedRangeRef.current ? savedRangeRef.current.toString() : '');
    const span = document.createElement('span');
    span.style.fontFamily = fontFamily;

    if (selectedText) {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    } else {
      span.textContent = 'Текст шрифтом';
      range.insertNode(span);
    }

    const newRange = document.createRange();
    newRange.setStartAfter(span);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    savedRangeRef.current = newRange.cloneRange();

    pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
  };

  // 16. Застосування / Скасування моноширинного коду
  const handleApplyCode = () => {
    if (viewMode === 'code') {
      wrapSelectionInTextarea('`', '`', 'код');
      return;
    }

    if (!visualEditorRef.current) return;
    restoreSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !visualEditorRef.current.contains(sel.anchorNode)) return;

    // Перевіряємо, чи курсор вже у <code>
    let codeEl: HTMLElement | null = null;
    let node: Node | null = sel.anchorNode;
    while (node && node !== visualEditorRef.current) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'code') {
        codeEl = node as HTMLElement;
        break;
      }
      node = node.parentNode;
    }

    if (codeEl && codeEl.parentNode) {
      while (codeEl.firstChild) {
        codeEl.parentNode.insertBefore(codeEl.firstChild, codeEl);
      }
      codeEl.remove();
      pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
      return;
    }

    const range = sel.getRangeAt(0);
    const code = document.createElement('code');
    code.style.background = '#f4f4f5';
    code.style.padding = '2px 5px';
    code.style.borderRadius = '4px';
    code.style.fontFamily = 'monospace';
    code.style.fontSize = '0.9em';

    if (!range.collapsed) {
      code.appendChild(range.extractContents());
    } else {
      code.textContent = 'код';
    }
    range.insertNode(code);

    const newRange = document.createRange();
    newRange.setStartAfter(code);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    savedRangeRef.current = newRange.cloneRange();

    pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
  };

  // 17. Застосування / Скасування Telegram спойлера
  const handleApplySpoiler = () => {
    if (viewMode === 'code') {
      wrapSelectionInTextarea('||', '||', 'прихований текст');
      return;
    }

    if (!visualEditorRef.current) return;
    restoreSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !visualEditorRef.current.contains(sel.anchorNode)) return;

    let node: Node | null = sel.anchorNode;
    let spoilerEl: HTMLElement | null = null;
    while (node && node !== visualEditorRef.current) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).classList.contains('tg-spoiler')) {
        spoilerEl = node as HTMLElement;
        break;
      }
      node = node.parentNode;
    }

    if (spoilerEl && spoilerEl.parentNode) {
      while (spoilerEl.firstChild) {
        spoilerEl.parentNode.insertBefore(spoilerEl.firstChild, spoilerEl);
      }
      spoilerEl.remove();
      pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
      return;
    }

    const range = sel.getRangeAt(0);
    const spoiler = document.createElement('span');
    spoiler.className = 'tg-spoiler';
    spoiler.setAttribute('data-spoiler', 'true');

    if (!range.collapsed) {
      spoiler.appendChild(range.extractContents());
    } else {
      spoiler.textContent = 'прихований текст';
    }
    range.insertNode(spoiler);

    const newRange = document.createRange();
    newRange.setStartAfter(spoiler);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    savedRangeRef.current = newRange.cloneRange();

    pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
  };

  // 18. Застосування Callout блоку (Цитати / довідки)
  const handleApplyCallout = (variant: 'info' | 'warning' | 'success' | 'danger' | 'dark' | 'quote') => {
    setActiveDropdown(null);
    const configs: Record<
      typeof variant,
      { bg: string; border: string; color: string; title: string }
    > = {
      info: { bg: '#f0f9ff', border: '#38bdf8', color: '#0369a1', title: 'До відома' },
      warning: { bg: '#fefce8', border: '#f59e0b', color: '#b45309', title: 'Зверніть увагу' },
      success: { bg: '#f0fdf4', border: '#10b981', color: '#047857', title: 'Висновок' },
      danger: { bg: '#fef2f2', border: '#ef4444', color: '#b91c1c', title: 'Важливо' },
      quote: { bg: '#fafafa', border: '#737373', color: '#171717', title: 'Цитата' },
      dark: { bg: '#171717', border: '#000000', color: '#fafafa', title: 'Коментар' },
    };

    const cfg = configs[variant];
    const textCol = variant === 'dark' ? '#fafafa' : '#1f2937';

    if (viewMode === 'code') {
      wrapSelectionInTextarea(
        `\n\n[callout:${variant} title="${cfg.title}"]\n`,
        `\n[/callout]\n\n`,
        'Введіть текст повідомлення тут...'
      );
      return;
    }

    if (!visualEditorRef.current) return;
    restoreSelection();

    const sel = window.getSelection();
    let selectedText =
      (sel && sel.toString()) || (savedRangeRef.current && savedRangeRef.current.toString()) || 'Введіть текст повідомлення тут...';

    const snippet = `
      <div class="callout-box callout-${variant}" data-variant="${variant}" style="margin: 20px 0; padding: 16px; border-radius: 8px; border-left: 4px solid ${cfg.border}; background: ${cfg.bg};">
        <div class="callout-title" style="font-weight: 600; font-size: 13px; text-transform: uppercase; margin-bottom: 6px; color: ${cfg.color}; letter-spacing: 0.05em;">
          ${cfg.title}
        </div>
        <div class="callout-body" style="color: ${textCol}; line-height: 1.6;">
          ${selectedText}
        </div>
      </div>
    `;

    insertBlockElement(snippet);
  };

  // 18. Відкриття вікна посилання
  const handleOpenLinkModal = (existingLinkEl?: HTMLAnchorElement | null) => {
    saveSelection();
    setActiveDropdown(null);

    if (viewMode === 'code' && textareaRef.current) {
      const ta = textareaRef.current;
      const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      setIsEditingExistingLink(false);
      setLinkText(selected);
      setLinkUrl('');
      setShowLinkModal(true);
      return;
    }

    const sel = window.getSelection();
    let targetLink: HTMLAnchorElement | null = existingLinkEl || null;

    if (!targetLink && sel && sel.anchorNode) {
      let node: Node | null = sel.anchorNode;
      while (node && node !== visualEditorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'a') {
          targetLink = node as HTMLAnchorElement;
          break;
        }
        node = node.parentNode;
      }
    }

    if (!targetLink && savedRangeRef.current && visualEditorRef.current) {
      let node: Node | null = savedRangeRef.current.commonAncestorContainer;
      while (node && node !== visualEditorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'a') {
          targetLink = node as HTMLAnchorElement;
          break;
        }
        node = node.parentNode;
      }
    }

    activeLinkElRef.current = targetLink;

    if (targetLink) {
      setIsEditingExistingLink(true);
      setLinkText(targetLink.textContent || '');
      setLinkUrl(targetLink.getAttribute('href') || '');
    } else {
      setIsEditingExistingLink(false);
      const textFromSel =
        (savedRangeRef.current && savedRangeRef.current.toString()) ||
        (sel && sel.toString()) ||
        '';
      setLinkText(textFromSel);
      setLinkUrl('');
    }

    setShowLinkModal(true);
  };

  // Збереження посилання
  const handleApplyLink = () => {
    if (!linkUrl.trim()) return;
    let cleanUrl = linkUrl.trim();
    if (
      !cleanUrl.startsWith('http://') &&
      !cleanUrl.startsWith('https://') &&
      !cleanUrl.startsWith('/') &&
      !cleanUrl.startsWith('mailto:') &&
      !cleanUrl.startsWith('tel:')
    ) {
      cleanUrl = `https://${cleanUrl}`;
    }
    const title = linkText.trim() || cleanUrl;

    if (viewMode === 'code' && textareaRef.current) {
      const ta = textareaRef.current;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const text = ta.value;
      const mdLink = `[${title}](${cleanUrl})`;
      const newVal = text.slice(0, start) + mdLink + text.slice(end);
      pushToHistoryAndEmit(newVal);
      setShowLinkModal(false);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + mdLink.length, start + mdLink.length);
      }, 0);
      return;
    }

    if (activeLinkElRef.current && visualEditorRef.current?.contains(activeLinkElRef.current)) {
      activeLinkElRef.current.setAttribute('href', cleanUrl);
      activeLinkElRef.current.textContent = title;
      activeLinkElRef.current.target = '_blank';
      activeLinkElRef.current.rel = 'noopener noreferrer';
      activeLinkElRef.current.style.color = '#0089ff';
      activeLinkElRef.current.style.textDecoration = 'underline';
      activeLinkElRef.current.style.textUnderlineOffset = '3px';
      if (visualEditorRef.current) {
        pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
      }
      setShowLinkModal(false);
      activeLinkElRef.current = null;
      return;
    }

    if (!visualEditorRef.current) return;

    // Створюємо елемент посилання
    const a = document.createElement('a');
    a.href = cleanUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = title;
    a.style.color = '#0089ff';
    a.style.textDecoration = 'underline';
    a.style.textUnderlineOffset = '3px';
    a.style.fontWeight = '500';

    try {
      visualEditorRef.current.focus();
    } catch {}

    let inserted = false;
    const saved = savedRangeRef.current;

    if (saved && (visualEditorRef.current === saved.commonAncestorContainer || visualEditorRef.current.contains(saved.commonAncestorContainer))) {
      try {
        saved.deleteContents();
        saved.insertNode(a);
        inserted = true;
      } catch (err) {
        console.warn('Could not insert link into saved range:', err);
      }
    }

    if (!inserted) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && visualEditorRef.current.contains(sel.anchorNode)) {
        try {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(a);
          inserted = true;
        } catch (err) {
          console.warn('Could not insert link into current selection:', err);
        }
      }
    }

    if (!inserted) {
      let targetP: HTMLElement | null = null;
      const lastChild = visualEditorRef.current.lastElementChild as HTMLElement | null;
      if (lastChild && ['p', 'div'].includes(lastChild.tagName.toLowerCase())) {
        targetP = lastChild;
      } else {
        targetP = document.createElement('p');
        visualEditorRef.current.appendChild(targetP);
      }
      targetP.appendChild(a);
    }

    try {
      const newRange = document.createRange();
      newRange.setStartAfter(a);
      newRange.collapse(true);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
      savedRangeRef.current = newRange.cloneRange();
    } catch {}

    pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
    setShowLinkModal(false);
    activeLinkElRef.current = null;
  };

  // Видалення посилання
  const handleRemoveLink = () => {
    let targetLink: HTMLAnchorElement | null = activeLinkElRef.current;
    if (!targetLink && savedRangeRef.current && visualEditorRef.current) {
      let node: Node | null = savedRangeRef.current.commonAncestorContainer;
      while (node && node !== visualEditorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === 'a') {
          targetLink = node as HTMLAnchorElement;
          break;
        }
        node = node.parentNode;
      }
    }

    if (targetLink && targetLink.parentNode) {
      const textNode = document.createTextNode(targetLink.textContent || '');
      targetLink.parentNode.replaceChild(textNode, targetLink);
      if (visualEditorRef.current) {
        pushToHistoryAndEmit(visualEditorRef.current.innerHTML);
      }
    }
    setShowLinkModal(false);
    activeLinkElRef.current = null;
  };

  // 19. Вставка таблиці (виправлено динамічне додавання колонок)
  const handleColsChange = (num: number) => {
    setTableCols(num);
    setTableHeaders((prev) => {
      const next = [...prev];
      if (num > next.length) {
        for (let i = next.length + 1; i <= num; i++) {
          next.push(`Колонка ${i}`);
        }
      } else {
        return next.slice(0, num);
      }
      return next;
    });
  };

  const handleInsertTable = () => {
    if (viewMode === 'code') {
      const headLine = `| ${tableHeaders.join(' | ')} |`;
      const sepLine = `| ${tableHeaders.map(() => '---').join(' | ')} |`;
      let rowsLines = '';
      for (let r = 1; r <= tableRows; r++) {
        const rowData = tableHeaders.map((_, c) => `Дані ${r}.${c + 1}`);
        rowsLines += `| ${rowData.join(' | ')} |\n`;
      }
      wrapSelectionInTextarea(`\n\n${headLine}\n${sepLine}\n${rowsLines}\n\n`, '', '');
      setShowTableModal(false);
      return;
    }

    const thead = `<thead><tr style="background: #f4f4f5;">${tableHeaders
      .map(
        (h) =>
          `<th style="border: 1px solid #e4e4e7; padding: 10px 14px; text-align: left; font-weight: 600; color: #18181b;">${h}</th>`
      )
      .join('')}</tr></thead>`;

    let tbodyRows = '';
    for (let r = 1; r <= tableRows; r++) {
      const bg = r % 2 === 0 ? 'background: #fafafa;' : '';
      const cells = tableHeaders
        .map(
          (_, c) =>
            `<td style="border: 1px solid #e4e4e7; padding: 10px 14px; color: #27272a;">Дані ${r}.${c + 1}</td>`
        )
        .join('');
      tbodyRows += `<tr style="${bg}">${cells}</tr>`;
    }

    const tableHtml = `
      <div style="overflow-x: auto; margin: 24px 0;">
        <table class="article-table" style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; border: 1px solid #e4e4e7; border-radius: 6px;">
          ${thead}
          <tbody>${tbodyRows}</tbody>
        </table>
      </div>
    `;

    insertBlockElement(tableHtml);
    setShowTableModal(false);
  };

  // 20. Завантаження та вставка фотографій
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 1600;
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
            resolve(canvas.toDataURL('image/jpeg', 0.85));
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
          const result = await res.json();
          if (result.url) finalUrl = result.url;
        }
      } catch {}

      setImageUrl(finalUrl);
    } catch (err: any) {
      setUploadError(formatErrorMessage(err, 'Помилка обробки файлу'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleApplyImage = () => {
    if (!imageUrl.trim()) return;
    const caption = imageCaption.trim();

    if (viewMode === 'code') {
      wrapSelectionInTextarea(`\n\n![${caption}](${imageUrl.trim()})\n\n`, '', '');
      setShowImageModal(false);
      setImageUrl('');
      setImageCaption('');
      setUploadError(null);
      return;
    }

    const captionHtml = caption
      ? `<figcaption style="text-align: center; font-size: 13px; color: #6b7280; font-style: italic; margin-top: 8px;">${caption}</figcaption>`
      : '';
    const imgHtml = `
      <figure class="article-image" style="margin: 28px 0; text-align: center;">
        <img src="${imageUrl.trim()}" alt="${caption}" style="max-width: 100%; max-height: 620px; border-radius: 8px; margin: 0 auto; display: block;" />
        ${captionHtml}
      </figure>
    `;
    insertBlockElement(imgHtml);
    setShowImageModal(false);
    setImageUrl('');
    setImageCaption('');
    setUploadError(null);
  };

  // 20.5. Завантаження та керування каруселлю фотографій
  const handleCarouselFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploadingCarousel(true);
    setCarouselUploadError(null);

    try {
      const uploadPromises = files.map(async (file) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              const maxDim = 1600;
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
              resolve(canvas.toDataURL('image/jpeg', 0.85));
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
            const result = await res.json();
            if (result.url) finalUrl = result.url;
          }
        } catch {}

        return {
          id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          url: finalUrl,
          caption: '',
        };
      });

      const newSlides = await Promise.all(uploadPromises);
      setCarouselSlides((prev) => [...prev, ...newSlides]);
    } catch (err: any) {
      setCarouselUploadError(formatErrorMessage(err, 'Помилка завантаження фотографій'));
    } finally {
      setIsUploadingCarousel(false);
      if (carouselFileInputRef.current) {
        carouselFileInputRef.current.value = '';
      }
    }
  };

  const handleAddSlideByUrl = () => {
    if (!carouselUrlInput.trim()) return;
    const url = carouselUrlInput.trim();
    setCarouselSlides((prev) => [
      ...prev,
      {
        id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        url,
        caption: carouselUrlCaption.trim(),
      },
    ]);
    setCarouselUrlInput('');
    setCarouselUrlCaption('');
  };

  const handleMoveSlide = (index: number, direction: 'up' | 'down') => {
    setCarouselSlides((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleRemoveSlide = (id: string) => {
    setCarouselSlides((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSlideCaptionChange = (id: string, caption: string) => {
    setCarouselSlides((prev) =>
      prev.map((s) => (s.id === id ? { ...s, caption } : s))
    );
  };

  const handleApplyCarousel = () => {
    if (carouselSlides.length < 2) return;
    const slidesData: CarouselSlide[] = carouselSlides.map((s) => ({
      url: s.url,
      caption: s.caption.trim() || undefined,
    }));
    const encodedJson = JSON.stringify(slidesData).replace(/"/g, '&quot;');
    const overallCap = carouselCaption.trim();
    const encodedCap = overallCap.replace(/"/g, '&quot;');
    const firstSlide = slidesData[0];
    const firstCap = firstSlide.caption || overallCap || '';

    if (viewMode === 'code') {
      const capAttr = overallCap ? ` caption="${overallCap}"` : '';
      const slidesMd = slidesData
        .map((s) => `  [slide: ${s.url}${s.caption ? ` "${s.caption}"` : ''}]`)
        .join('\n');
      wrapSelectionInTextarea(`\n\n[carousel${capAttr}]\n${slidesMd}\n[/carousel]\n\n`, '', '');
      setShowCarouselModal(false);
      setCarouselSlides([]);
      setCarouselCaption('');
      setCarouselUploadError(null);
      return;
    }

    const carouselHtml = `
      <figure class="article-carousel" data-carousel-images="${encodedJson}" data-carousel-caption="${encodedCap}" style="margin: 32px 0; text-align: center; user-select: none;">
        <div class="carousel-preview-container" style="position: relative; max-width: 100%; border-radius: 8px; overflow: hidden; background: #161616;">
          <img src="${firstSlide.url}" alt="${firstCap}" style="max-width: 100%; max-height: 620px; border-radius: 8px; margin: 0 auto; display: block;" />
          <div style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.7); color: #fff; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-family: monospace;">
            📷 1 / ${slidesData.length}
          </div>
          <div style="position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; background: rgba(0,0,0,0.45); padding: 5px 12px; border-radius: 20px;">
            ${slidesData
              .map(
                (_, i) =>
                  `<span style="display: inline-block; width: ${
                    i === 0 ? '20px' : '6px'
                  }; height: 6px; border-radius: 3px; background: ${
                    i === 0 ? '#ffffff' : 'rgba(255,255,255,0.45)'
                  };"></span>`
              )
              .join('')}
          </div>
        </div>
        ${
          overallCap || firstSlide.caption
            ? `<figcaption style="text-align: center; font-size: 13px; color: #6b7280; font-style: italic; margin-top: 8px;">${
                overallCap ? `<strong>${overallCap}</strong>${firstSlide.caption ? ' • ' : ''}` : ''
              }${firstSlide.caption || ''}</figcaption>`
            : ''
        }
      </figure>
    `;

    insertBlockElement(carouselHtml);
    setShowCarouselModal(false);
    setCarouselSlides([]);
    setCarouselCaption('');
    setCarouselUploadError(null);
  };

  // 21. Вставка YouTube відео
  const handleApplyVideo = () => {
    if (!videoUrl.trim()) return;
    const regExp =
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = videoUrl.trim().match(regExp);
    const vid = match ? match[1] : '';

    if (vid) {
      if (viewMode === 'code') {
        wrapSelectionInTextarea(`\n\n[video: https://www.youtube.com/watch?v=${vid}]\n\n`, '', '');
      } else {
        const vidHtml = `
          <div class="article-video-wrapper" style="margin: 28px 0; aspect-ratio: 16/9; background: #000; border-radius: 8px; overflow: hidden;">
            <iframe src="https://www.youtube.com/embed/${vid}" style="width: 100%; height: 100%; border: 0;" allowfullscreen></iframe>
          </div>
        `;
        insertBlockElement(vidHtml);
      }
    }
    setShowVideoModal(false);
    setVideoUrl('');
  };

  // Статистика тексту
  const wordsCount = value.trim() ? value.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length : 0;
  const charsCount = value.replace(/<[^>]*>/g, '').length;
  const readTimeMinutes = Math.max(1, Math.ceil(wordsCount / 180));

  // Оновлення коду в textarea
  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    pushToHistoryAndEmit(val);
  };

  // Гарячі клавіші на візуальному контейнері та коді
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      if (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'y' || e.key === 'Y' || e.key === 'н' || e.key === 'Н') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'b' || e.key === 'B' || e.key === 'и' || e.key === 'И') {
        e.preventDefault();
        executeCommand('bold');
      } else if (e.key === 'i' || e.key === 'I' || e.key === 'ш' || e.key === 'Ш') {
        e.preventDefault();
        executeCommand('italic');
      } else if (e.key === 'u' || e.key === 'U' || e.key === 'г' || e.key === 'Г') {
        e.preventDefault();
        executeCommand('underline');
      } else if (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л') {
        e.preventDefault();
        handleOpenLinkModal();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      handleRedo();
    }
  };

  return (
    <div className="border border-neutral-300 rounded-lg overflow-hidden bg-white shadow-xs focus-within:border-black transition-colors">
      {/* ПОВІДОМЛЕННЯ ПРО ВІДНОВЛЕННЯ ЧЕРНЕТКИ */}
      {hasDraftNotice && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900 animate-fade-in">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Знайдено автозбережену чернетку статті від <strong>{draftTimestamp}</strong>. Бажаєте відновити зміни?
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium transition-colors cursor-pointer"
            >
              Відновити
            </button>
            <button
              type="button"
              onClick={handleDismissDraft}
              className="px-2 py-1 text-neutral-600 hover:text-black cursor-pointer"
            >
              Відхилити
            </button>
          </div>
        </div>
      )}

      {/* ПАНЕЛЬ ІНСТРУМЕНТІВ (TOOLBAR) */}
      <div className="bg-neutral-50/95 border-b border-neutral-200 p-2 sm:p-2.5 flex flex-wrap items-center justify-between gap-1.5 select-none text-neutral-700 sticky top-0 z-20">
        <div className="flex flex-wrap items-center gap-1">
          {/* UNDO / REDO */}
          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Відмінити дію (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Повторити дію (Ctrl+Y або Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-neutral-200 mx-0.5" />

          {/* 1. РОЗМІР ТЕКСТУ (ЗАГОЛОВКИ) */}
          <div className="relative editor-dropdown-container">
            <button
              type="button"
              onMouseDown={(e) => {
                saveSelection();
                e.preventDefault();
              }}
              onClick={() => {
                saveSelection();
                setActiveDropdown(activeDropdown === 'heading' ? null : 'heading');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-neutral-800 bg-white border border-neutral-200 rounded hover:bg-neutral-100 transition-colors cursor-pointer"
              title="Стиль тексту (Заголовок / Абзац)"
            >
              <span>Стиль тексту</span>
              <ChevronDown className="w-3 h-3 text-neutral-500" />
            </button>

            {activeDropdown === 'heading' && (
              <div className="absolute top-full left-0 mt-1 z-30 w-52 bg-white border border-neutral-200 rounded-md shadow-lg py-1 animate-fade-in">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFormatHeading('h2')}
                  className="w-full px-3 py-2 text-left text-base font-bold hover:bg-neutral-100 flex items-center justify-between cursor-pointer"
                >
                  <span>Заголовок H1</span>
                  <span className="text-[10px] text-neutral-400 font-mono">Великий</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFormatHeading('h3')}
                  className="w-full px-3 py-2 text-left text-sm font-semibold hover:bg-neutral-100 flex items-center justify-between cursor-pointer"
                >
                  <span>Заголовок H2</span>
                  <span className="text-[10px] text-neutral-400 font-mono">Середній</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFormatHeading('h4')}
                  className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-neutral-100 flex items-center justify-between cursor-pointer"
                >
                  <span>Підзаголовок H3</span>
                  <span className="text-[10px] text-neutral-400 font-mono">Дрібний</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFormatHeading('p')}
                  className="w-full px-3 py-1.5 text-left text-xs text-neutral-600 hover:bg-neutral-100 border-t border-neutral-100 flex items-center justify-between cursor-pointer"
                >
                  <span>Звичайний абзац</span>
                  <span className="text-[10px] text-neutral-400 font-mono">Текст</span>
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-neutral-200 mx-0.5" />

          {/* 2. БАЗОВЕ ФОРМАТУВАННЯ (B, I, U, S, Code, Spoiler) */}
          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={() => executeCommand('bold')}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
            title="Жирний (Ctrl+B)"
          >
            <Bold className="w-4 h-4 font-bold" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={() => executeCommand('italic')}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
            title="Курсив (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={() => executeCommand('underline')}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
            title="Підкреслений (Ctrl+U)"
          >
            <Underline className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={() => executeCommand('strikeThrough')}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
            title="Закреслений"
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={handleApplyCode}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
            title="Код / Моноширинний"
          >
            <Code className="w-4 h-4" />
          </button>

          {/* TELEGRAM SPOILER (ПРИХОВАНИЙ ТЕКСТ) */}
          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={handleApplySpoiler}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-neutral-800 bg-neutral-200/70 hover:bg-neutral-300 rounded transition-colors cursor-pointer"
            title="Прихований текст / Спойлер (як у Telegram)"
          >
            <EyeOff className="w-3.5 h-3.5 text-neutral-600" />
            <span className="hidden sm:inline">Спойлер</span>
          </button>

          <div className="h-4 w-px bg-neutral-200 mx-0.5" />

          {/* 3. ХАЙЛАЙТЕР (МАРКЕР) */}
          <div className="relative editor-dropdown-container">
            <button
              type="button"
              onMouseDown={(e) => {
                saveSelection();
                e.preventDefault();
              }}
              onClick={() => {
                saveSelection();
                setActiveDropdown(activeDropdown === 'highlight' ? null : 'highlight');
              }}
              className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer flex items-center gap-0.5"
              title="Виділення маркером (Хайлайтер)"
            >
              <Highlighter className="w-4 h-4 text-amber-500" />
              <ChevronDown className="w-2.5 h-2.5 text-neutral-400" />
            </button>

            {activeDropdown === 'highlight' && (
              <div className="absolute top-full left-0 mt-1 z-30 w-48 bg-white border border-neutral-200 rounded-md shadow-lg p-2 animate-fade-in space-y-1">
                <div className="text-[10px] uppercase font-bold text-neutral-400 px-1 mb-1">
                  Колір маркера
                </div>
                {[
                  { id: 'yellow', label: 'Жовтий маркер', bg: 'bg-yellow-200' },
                  { id: 'green', label: 'Зелений маркер', bg: 'bg-emerald-200' },
                  { id: 'blue', label: 'Блакитний маркер', bg: 'bg-sky-200' },
                  { id: 'pink', label: 'Рожевий маркер', bg: 'bg-pink-200' },
                  { id: 'orange', label: 'Помаранчевий', bg: 'bg-amber-200' },
                  { id: 'purple', label: 'Фіолетовий', bg: 'bg-purple-200' },
                ].map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleApplyHighlight(color.id)}
                    className="w-full flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-neutral-100 cursor-pointer text-left"
                  >
                    <span className={`w-3.5 h-3.5 rounded-full ${color.bg} border border-neutral-300`} />
                    <span>{color.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleApplyHighlight(null)}
                  className="w-full flex items-center gap-2 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 rounded cursor-pointer text-left border-t border-neutral-100 mt-1 pt-1.5"
                >
                  <X className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Зняти маркер</span>
                </button>
              </div>
            )}
          </div>

          {/* 4. КОЛІР ТЕКСТУ */}
          <div className="relative editor-dropdown-container">
            <button
              type="button"
              onMouseDown={(e) => {
                saveSelection();
                e.preventDefault();
              }}
              onClick={() => {
                saveSelection();
                setActiveDropdown(activeDropdown === 'color' ? null : 'color');
              }}
              className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer flex items-center gap-0.5"
              title="Зміна кольору тексту"
            >
              <Palette className="w-4 h-4 text-rose-500" />
              <ChevronDown className="w-2.5 h-2.5 text-neutral-400" />
            </button>

            {activeDropdown === 'color' && (
              <div className="absolute top-full left-0 mt-1 z-30 w-48 bg-white border border-neutral-200 rounded-md shadow-lg p-2 animate-fade-in space-y-1">
                <div className="text-[10px] uppercase font-bold text-neutral-400 px-1 mb-1">
                  Колір тексту
                </div>
                {[
                  { hex: '#dc2626', label: 'Червоний', dot: 'bg-red-600' },
                  { hex: '#2563eb', label: 'Синій', dot: 'bg-blue-600' },
                  { hex: '#16a34a', label: 'Зелений', dot: 'bg-emerald-600' },
                  { hex: '#d97706', label: 'Бурштиновий', dot: 'bg-amber-600' },
                  { hex: '#9333ea', label: 'Фіолетовий', dot: 'bg-purple-600' },
                  { hex: '#111827', label: 'Чорний', dot: 'bg-black' },
                  { hex: '#6b7280', label: 'Світло-сірий', dot: 'bg-neutral-500' },
                ].map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleApplyColor(c.hex)}
                    className="w-full flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-neutral-100 cursor-pointer text-left"
                  >
                    <span className={`w-3.5 h-3.5 rounded-full ${c.dot}`} />
                    <span style={{ color: c.hex }} className="font-medium">
                      {c.label}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleApplyColor(null)}
                  className="w-full flex items-center gap-2 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 rounded cursor-pointer text-left border-t border-neutral-100 mt-1 pt-1.5"
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-neutral-900 border border-neutral-300" />
                  <span>Чорний за замовчуванням</span>
                </button>
              </div>
            )}
          </div>

          {/* 5. ШРИФТ (FONT FAMILY) */}
          <div className="relative editor-dropdown-container">
            <button
              type="button"
              onMouseDown={(e) => {
                saveSelection();
                e.preventDefault();
              }}
              onClick={() => {
                saveSelection();
                setActiveDropdown(activeDropdown === 'font' ? null : 'font');
              }}
              className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer flex items-center gap-0.5"
              title="Стиль шрифту"
            >
              <Type className="w-4 h-4 text-neutral-700" />
              <ChevronDown className="w-2.5 h-2.5 text-neutral-400" />
            </button>

            {activeDropdown === 'font' && (
              <div className="absolute top-full left-0 mt-1 z-30 w-60 bg-white border border-neutral-200 rounded-md shadow-lg p-1.5 animate-fade-in space-y-1">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleApplyFont('-apple-system, BlinkMacSystemFont, sans-serif', 'sans')}
                  className="w-full px-2.5 py-1.5 text-left text-sm font-sans font-medium hover:bg-neutral-100 rounded cursor-pointer flex items-center justify-between"
                >
                  <span>Сучасний Sans (гротеск)</span>
                  <span className="text-[10px] text-neutral-400 font-mono">Основний</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleApplyFont('Georgia, serif', 'serif')}
                  className="w-full px-2.5 py-1.5 text-left text-sm font-serif hover:bg-neutral-100 rounded cursor-pointer"
                >
                  Класичний Serif (із зарубками)
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleApplyFont('monospace', 'mono')}
                  className="w-full px-2.5 py-1.5 text-left text-xs font-mono hover:bg-neutral-100 rounded cursor-pointer"
                >
                  Друкарська машинка (Mono)
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleApplyFont(null, 'default')}
                  className="w-full px-2.5 py-1.5 text-left text-xs text-neutral-600 hover:bg-neutral-100 rounded cursor-pointer border-t border-neutral-100 mt-1"
                >
                  Скинути до стандартного
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-neutral-200 mx-0.5" />

          {/* 6. СПИСКИ */}
          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={() => executeCommand('insertUnorderedList')}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
            title="Маркований список"
          >
            <List className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={() => executeCommand('insertOrderedList')}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
            title="Нумерований список"
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-neutral-200 mx-0.5" />

          {/* 7. КОЛЬОРОВІ БЛОКИ ТА ЦИТАТИ (CALLOUTS) */}
          <div className="relative editor-dropdown-container">
            <button
              type="button"
              onMouseDown={(e) => {
                saveSelection();
                e.preventDefault();
              }}
              onClick={() => {
                saveSelection();
                setActiveDropdown(activeDropdown === 'callout' ? null : 'callout');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-neutral-800 bg-white border border-neutral-200 rounded hover:bg-neutral-100 transition-colors cursor-pointer"
              title="Кольорові блоки та цитати"
            >
              <Quote className="w-3.5 h-3.5 text-neutral-600" />
              <span>Блоки / Цитати</span>
              <ChevronDown className="w-3 h-3 text-neutral-400" />
            </button>

            {activeDropdown === 'callout' && (
              <div className="absolute top-full left-0 mt-1 z-30 w-56 bg-white border border-neutral-200 rounded-md shadow-lg p-1.5 animate-fade-in space-y-1">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setActiveDropdown(null);
                    if (viewMode === 'code') {
                      wrapSelectionInTextarea('\n\n> ', '\n\n', 'Текст редакційної цитати...');
                      return;
                    }
                    insertBlockElement(
                      `<blockquote style="border-left: 3px solid #000; padding-left: 16px; margin: 20px 0; font-style: italic; color: #1f2937;">Текст редакційної цитати...</blockquote>`
                    );
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-neutral-100 rounded text-left cursor-pointer"
                >
                  <Quote className="w-4 h-4 text-neutral-500" />
                  <span>Класична цитата з лінією</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleApplyCallout('info')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-sky-800 hover:bg-sky-50 rounded text-left cursor-pointer"
                >
                  <Info className="w-4 h-4 text-sky-600" />
                  <span>Інформаційний блок (Синій)</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleApplyCallout('warning')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-amber-800 hover:bg-amber-50 rounded text-left cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Попередження (Жовтий)</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleApplyCallout('success')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-emerald-800 hover:bg-emerald-50 rounded text-left cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Успіх / Висновок (Зелений)</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleApplyCallout('danger')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-800 hover:bg-red-50 rounded text-left cursor-pointer"
                >
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span>Увага / Критично (Червоний)</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleApplyCallout('dark')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-neutral-900 hover:bg-neutral-100 rounded text-left cursor-pointer"
                >
                  <span className="w-3.5 h-3.5 rounded bg-black inline-block" />
                  <span>Темний акцентний блок</span>
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-neutral-200 mx-0.5" />

          {/* 8. ВСТАВКА МЕДІА, ТАБЛИЦЬ, ПОСИЛАНЬ */}
          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={() => handleOpenLinkModal()}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
            title="Зробити посиланням (Ctrl+K)"
          >
            <LinkIcon className="w-4 h-4 text-blue-600" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={() => {
              saveSelection();
              setShowTableModal(true);
            }}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
            title="Створити таблицю"
          >
            <TableIcon className="w-4 h-4 text-emerald-600" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={() => {
              saveSelection();
              setShowImageModal(true);
            }}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
            title="Вставити фото (зберегти файл на сервері або URL)"
          >
            <ImageIcon className="w-4 h-4 text-neutral-700" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={() => {
              saveSelection();
              setShowCarouselModal(true);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-neutral-800 bg-neutral-100 hover:bg-neutral-200/80 border border-neutral-300 rounded transition-colors cursor-pointer text-xs font-medium"
            title="Вставити карусель з декількох фото (слайдер)"
          >
            <Images className="w-3.5 h-3.5 text-neutral-700" />
            <span>Карусель фото</span>
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={() => {
              saveSelection();
              setShowVideoModal(true);
            }}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
            title="Вставити YouTube відео"
          >
            <VideoIcon className="w-4 h-4 text-red-600" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              saveSelection();
              e.preventDefault();
            }}
            onClick={() => {
              if (viewMode === 'code') {
                wrapSelectionInTextarea('\n\n---\n\n', '', '');
                return;
              }
              insertBlockElement(
                '<hr class="article-divider" style="border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0;" />'
              );
            }}
            className="p-1.5 text-neutral-700 hover:text-black hover:bg-neutral-200/70 rounded transition-colors cursor-pointer"
            title="Розділювач статті"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        {/* ПЕРЕМИКАЧ РЕЖИМІВ (ВІЗУАЛЬНИЙ / ПАРАЛЕЛЬНО / КОД / ПРЕВ'Ю) */}
        <div className="flex items-center gap-1 border border-neutral-200 bg-white rounded p-0.5 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => setViewMode('visual')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors cursor-pointer font-medium ${
              viewMode === 'visual' ? 'bg-black text-white' : 'text-neutral-600 hover:text-black'
            }`}
            title="Візуальний інтерактивний редактор"
          >
            <Sparkles className="w-3 h-3" />
            <span>Візуальний</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`hidden md:inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors cursor-pointer font-medium ${
              viewMode === 'split' ? 'bg-black text-white' : 'text-neutral-600 hover:text-black'
            }`}
            title="Паралельний режим редактора та живого сайту"
          >
            <Columns className="w-3 h-3" />
            <span>Паралельно</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('code')}
            className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer font-medium ${
              viewMode === 'code' ? 'bg-black text-white' : 'text-neutral-600 hover:text-black'
            }`}
            title="Режим прямого редагування коду"
          >
            Код
          </button>
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer font-medium ${
              viewMode === 'preview' ? 'bg-black text-white' : 'text-neutral-600 hover:text-black'
            }`}
          >
            Прев'ю
          </button>
        </div>
      </div>

      {/* РОБОЧА ЗОНА РЕДАКТОРА */}
      <div className="relative">
        {/* 1. РЕЖИМ ВІЗУАЛЬНОГО РЕДАКТОРА (WYSIWYG) */}
        {viewMode === 'visual' && (
          <div
            ref={visualEditorRef}
            contentEditable
            suppressContentEditableWarning
            data-placeholder={placeholder}
            onInput={(e) => {
              const html = e.currentTarget.innerHTML;
              pushToHistoryAndEmit(html);
            }}
            onClick={(e) => {
              saveSelection();
              const target = e.target as HTMLElement;
              const linkEl = target.closest('a');
              if (linkEl && visualEditorRef.current?.contains(linkEl)) {
                e.preventDefault();
                e.stopPropagation();
                handleOpenLinkModal(linkEl as HTMLAnchorElement);
              }
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={saveSelection}
            onMouseUp={saveSelection}
            style={{ minHeight }}
            className="w-full p-5 sm:p-7 text-neutral-900 leading-relaxed font-sans text-base sm:text-lg focus:outline-none bg-white cursor-text select-text"
          />
        )}

        {/* 2. РЕЖИМ ПАРАЛЕЛЬНОГО ПЕРЕГЛЯДУ (SPLIT) */}
        {viewMode === 'split' && (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-200">
            <div
              ref={visualEditorRef}
              contentEditable
              suppressContentEditableWarning
              data-placeholder={placeholder}
              onInput={(e) => {
                const html = e.currentTarget.innerHTML;
                pushToHistoryAndEmit(html);
              }}
              onClick={(e) => {
                saveSelection();
                const target = e.target as HTMLElement;
                const linkEl = target.closest('a');
                if (linkEl && visualEditorRef.current?.contains(linkEl)) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOpenLinkModal(linkEl as HTMLAnchorElement);
                }
              }}
              onKeyDown={handleKeyDown}
              onKeyUp={saveSelection}
              onMouseUp={saveSelection}
              style={{ minHeight }}
              className="w-full p-5 text-neutral-900 leading-relaxed font-sans text-base focus:outline-none bg-white overflow-y-auto max-h-[650px]"
            />
            <div style={{ minHeight }} className="p-6 overflow-y-auto bg-neutral-50/50 max-h-[650px]">
              <div className="text-[11px] font-sans uppercase tracking-wider text-neutral-400 font-semibold mb-4 pb-1 border-b border-neutral-200">
                Живий попередній перегляд читача
              </div>
              <ContentRenderer content={value} />
            </div>
          </div>
        )}

        {/* 3. РЕЖИМ КОДУ / MARKDOWN */}
        {viewMode === 'code' && (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleCodeChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{ minHeight }}
            className="w-full p-5 text-sm sm:text-base leading-relaxed font-mono text-neutral-800 focus:outline-none resize-y border-0 bg-neutral-50/30"
          />
        )}

        {/* 4. РЕЖИМ ЧИСТОГО ПРЕВ'Ю */}
        {viewMode === 'preview' && (
          <div style={{ minHeight }} className="p-6 sm:p-10 bg-neutral-50/30 overflow-y-auto">
            <ContentRenderer content={value} />
          </div>
        )}
      </div>

      {/* НИЖНІЙ СТАТУСНИЙ РЯДОК: СТАТИСТИКА ТА АВТОЗБЕРЕЖЕННЯ */}
      <div className="bg-neutral-50 border-t border-neutral-200 px-4 py-2.5 flex flex-wrap items-center justify-between text-xs text-neutral-500 font-sans">
        <div className="flex items-center gap-3">
          <span>
            Слів: <strong className="text-neutral-800">{wordsCount}</strong>
          </span>
          <span>·</span>
          <span>
            Символів: <strong className="text-neutral-800">{charsCount}</strong>
          </span>
          <span>·</span>
          <span>
            Час читання: <strong className="text-neutral-800">~{readTimeMinutes} хв</strong>
          </span>
        </div>

        {/* СТАТУС АВТОЗБЕРЕЖЕННЯ */}
        <div className="flex items-center gap-2">
          {autoSaveStatus && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{autoSaveStatus}</span>
            </span>
          )}
          <span className="hidden sm:inline text-[11px] text-neutral-400">
            Ctrl+Z — відмінити · Ctrl+Y — повторити
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* МОДАЛЬНІ ВІКНА (ПОРТАЛИ В DOCUMENT.BODY) */}
      {/* ========================================================================= */}

      {/* 1. ПОСИЛАННЯ */}
      {showLinkModal &&
        createPortal(
          <div
            onClick={() => setShowLinkModal(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 border border-neutral-200 text-black font-sans"
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-black flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-blue-600" />
                  <span>{isEditingExistingLink ? 'Редагувати посилання' : 'Вставити посилання'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="text-neutral-400 hover:text-black cursor-pointer p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-neutral-600 mb-1.5 font-medium">
                    Текст посилання *
                  </label>
                  <input
                    type="text"
                    placeholder="напр. Читайте детальніше в Telegram"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyLink();
                      }
                    }}
                    className="w-full text-sm border border-neutral-300 rounded px-3 py-2 bg-white text-black placeholder-neutral-400 focus:border-[#0089ff] focus:ring-1 focus:ring-[#0089ff] focus:outline-none"
                    autoFocus={!linkText}
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-neutral-600 mb-1.5 font-medium">
                    URL адреса посилання *
                  </label>
                  <input
                    type="text"
                    placeholder="https://t.me/the_impart або https://example.com"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyLink();
                      }
                    }}
                    className="w-full text-sm border border-neutral-300 rounded px-3 py-2 bg-white text-black placeholder-neutral-400 focus:border-[#0089ff] focus:ring-1 focus:ring-[#0089ff] focus:outline-none font-mono text-xs"
                    autoFocus={Boolean(linkText)}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-neutral-100">
                  {isEditingExistingLink ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleRemoveLink}
                      className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                      title="Видалити посилання і залишити звичайний текст"
                    >
                      Видалити посилання
                    </button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowLinkModal(false)}
                      className="px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded cursor-pointer transition-colors"
                    >
                      Скасувати
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleApplyLink}
                      disabled={!linkUrl.trim()}
                      className="px-4 py-2 text-xs font-medium bg-[#0089ff] hover:bg-[#0070d6] text-white rounded transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      {isEditingExistingLink ? 'Зберегти зміни' : 'Вставити посилання'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 2. ТАБЛИЦЯ (з виправленим оновленням колонок) */}
      {showTableModal &&
        createPortal(
          <div
            onClick={() => setShowTableModal(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-lg shadow-2xl max-w-lg w-full p-6 border border-neutral-200"
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-black flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-emerald-600" />
                  <span>Конструктор таблиці (редагується наживо)</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowTableModal(false)}
                  className="text-neutral-400 hover:text-black cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                      Кількість колонок
                    </label>
                    <select
                      value={tableCols}
                      onChange={(e) => handleColsChange(Number(e.target.value))}
                      className="w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:border-black focus:outline-none"
                    >
                      {[2, 3, 4, 5, 6].map((num) => (
                        <option key={num} value={num}>
                          {num} {num < 5 ? 'колонки' : 'колонок'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                      Кількість рядків
                    </label>
                    <select
                      value={tableRows}
                      onChange={(e) => setTableRows(Number(e.target.value))}
                      className="w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:border-black focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5, 6, 8, 10].map((num) => (
                        <option key={num} value={num}>
                          {num} рядків
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                    Заголовки колонок
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {tableHeaders.map((header, idx) => (
                      <input
                        key={idx}
                        type="text"
                        placeholder={`Заголовок колонки ${idx + 1}`}
                        value={header}
                        onChange={(e) => {
                          const updated = [...tableHeaders];
                          updated[idx] = e.target.value;
                          setTableHeaders(updated);
                        }}
                        className="w-full text-sm border border-neutral-300 rounded px-3 py-1.5 focus:border-black focus:outline-none"
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setShowTableModal(false)}
                    className="px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded cursor-pointer"
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertTable}
                    className="px-4 py-2 text-xs font-medium bg-black text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    Вставити таблицю
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 3. ЗОБРАЖЕННЯ (ФАЙЛ АБО URL) */}
      {showImageModal &&
        createPortal(
          <div
            onClick={() => setShowImageModal(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-lg shadow-2xl max-w-lg w-full p-6 border border-neutral-200"
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-black flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-neutral-700" />
                  <span>Вставити фото у статтю</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowImageModal(false)}
                  className="text-neutral-400 hover:text-black cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center border-b border-neutral-200 mb-4">
                <button
                  type="button"
                  onClick={() => setImageTab('upload')}
                  className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition-colors cursor-pointer ${
                    imageTab === 'upload'
                      ? 'border-black text-black font-semibold'
                      : 'border-transparent text-neutral-500 hover:text-black'
                  }`}
                >
                  Завантажити файл з комп'ютера
                </button>
                <button
                  type="button"
                  onClick={() => setImageTab('url')}
                  className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition-colors cursor-pointer ${
                    imageTab === 'url'
                      ? 'border-black text-black font-semibold'
                      : 'border-transparent text-neutral-500 hover:text-black'
                  }`}
                >
                  Вказати посилання (URL)
                </button>
              </div>

              <div className="space-y-4">
                {imageTab === 'upload' ? (
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                      Виберіть фото з пам'яті комп'ютера або телефона *
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-neutral-300 hover:border-black rounded-lg p-6 text-center cursor-pointer transition-colors bg-neutral-50/60 hover:bg-neutral-50"
                    >
                      <Upload className="w-6 h-6 mx-auto text-neutral-400 mb-2" />
                      <div className="text-xs font-medium text-neutral-800">
                        {isUploading ? 'Обробка та оптимізація фото...' : 'Натисніть сюди, щоб вибрати фото'}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-1">
                        PNG, JPG, WEBP, GIF (зберігається на сервері)
                      </div>
                    </div>

                    {uploadError && <div className="text-xs text-red-600 mt-2">{formatErrorMessage(uploadError)}</div>}

                    {imageUrl && (
                      <div className="mt-3 p-2.5 bg-neutral-100 rounded-md flex items-center gap-3 border border-neutral-200">
                        <img
                          src={imageUrl}
                          alt="Прев'ю"
                          className="w-12 h-12 object-cover rounded border border-neutral-300"
                        />
                        <div className="text-xs text-neutral-800 truncate flex-1 font-medium">
                          ✓ Фото завантажено та готове до вставки
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                      URL посилання на зображення *
                    </label>
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/... або пряме посилання"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyImage();
                        }
                      }}
                      className="w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:border-black focus:outline-none font-mono text-xs"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                    Підпис до фото (необов'язково)
                  </label>
                  <input
                    type="text"
                    placeholder="напр. Фото: Reuters / Джерело"
                    value={imageCaption}
                    onChange={(e) => setImageCaption(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyImage();
                      }
                    }}
                    className="w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:border-black focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setShowImageModal(false)}
                    className="px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded cursor-pointer"
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyImage}
                    disabled={!imageUrl || isUploading}
                    className="px-4 py-2 text-xs font-medium bg-black text-white rounded hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Вставити фото у статтю
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 4. YOUTUBE */}
      {showVideoModal &&
        createPortal(
          <div
            onClick={() => setShowVideoModal(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 border border-neutral-200"
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-black flex items-center gap-2">
                  <VideoIcon className="w-4 h-4 text-red-600" />
                  <span>Вставити відео з YouTube</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowVideoModal(false)}
                  className="text-neutral-400 hover:text-black cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                    Посилання на відео (YouTube URL) *
                  </label>
                  <input
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=... або https://youtu.be/..."
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyVideo();
                      }
                    }}
                    className="w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:border-black focus:outline-none font-mono text-xs"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setShowVideoModal(false)}
                    className="px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded cursor-pointer"
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyVideo}
                    disabled={!videoUrl.trim()}
                    className="px-4 py-2 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Вставити відео
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 5. КАРУСЕЛЬ ФОТОГРАФІЙ */}
      {showCarouselModal &&
        createPortal(
          <div
            onClick={() => setShowCarouselModal(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-5 sm:p-6 border border-neutral-200 max-h-[92vh] flex flex-col"
            >
              {/* Заголовок модального вікна */}
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-neutral-100 rounded-md text-neutral-800">
                    <Images className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-black">
                      Карусель з фотографій
                    </h3>
                    <p className="text-xs text-neutral-500 font-sans mt-0.5">
                      Додайте декілька фото. Читачі зможуть перемикати їх стрілками або свайпом.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCarouselModal(false)}
                  className="p-1 text-neutral-400 hover:text-black rounded transition-colors cursor-pointer"
                  title="Закрити (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Тіло модального вікна зі скролом */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                {/* 1. Блок додавання фото (мультизавантаження файлів або URL) */}
                <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-700">
                      1. Додати фотографії
                    </span>
                    <span className="text-xs text-neutral-500 font-mono">
                      Вже додано: {carouselSlides.length}
                    </span>
                  </div>

                  {/* Прихований мульти-інпут файлів */}
                  <input
                    type="file"
                    ref={carouselFileInputRef}
                    multiple
                    accept="image/*"
                    onChange={handleCarouselFiles}
                    className="hidden"
                  />

                  {/* Зона завантаження файлів */}
                  <div
                    onClick={() => carouselFileInputRef.current?.click()}
                    className="border-2 border-dashed border-neutral-300 hover:border-black rounded-lg p-5 text-center cursor-pointer transition-colors bg-white hover:bg-neutral-50"
                  >
                    <Upload className="w-6 h-6 mx-auto text-neutral-400 mb-2" />
                    <div className="text-xs font-medium text-neutral-900">
                      {isUploadingCarousel
                        ? 'Обробка та оптимізація фотографій...'
                        : 'Натисніть сюди, щоб обрати кілька фото з пристрою'}
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-1">
                      Можна вибрати одразу декілька зображень (JPG, PNG, WEBP)
                    </div>
                  </div>

                  {carouselUploadError && (
                    <div className="text-xs text-red-600">{carouselUploadError}</div>
                  )}

                  {/* Або посилання URL */}
                  <div className="pt-2 border-t border-neutral-200">
                    <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
                      Або додати за посиланням (URL)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://images.unsplash.com/... або пряме посилання"
                        value={carouselUrlInput}
                        onChange={(e) => setCarouselUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSlideByUrl();
                          }
                        }}
                        className="flex-1 text-xs border border-neutral-300 rounded px-3 py-1.5 focus:border-black focus:outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleAddSlideByUrl}
                        disabled={!carouselUrlInput.trim()}
                        className="px-3 py-1.5 bg-neutral-900 text-white rounded text-xs font-medium hover:bg-black disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Додати</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Список доданих фотографій зі зміною черговості та підписами */}
                {carouselSlides.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-700">
                      <span>2. Список слайдів (сортування та підписи)</span>
                      <span className="text-[11px] font-normal text-neutral-500 lowercase">
                        стрілками можна міняти черговість
                      </span>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {carouselSlides.map((slide, idx) => (
                        <div
                          key={slide.id}
                          className="flex items-center gap-2.5 p-2 bg-white border border-neutral-200 rounded-lg shadow-2xs hover:border-neutral-300 transition-colors"
                        >
                          {/* Номер та мініатюра */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs font-mono font-semibold text-neutral-400 w-4 text-center">
                              {idx + 1}
                            </span>
                            <img
                              src={slide.url}
                              alt={`Слайд ${idx + 1}`}
                              className="w-12 h-12 object-cover rounded border border-neutral-200"
                            />
                          </div>

                          {/* Інпут підпису до слайда */}
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              placeholder="Підпис до цього фото (необов'язково)"
                              value={slide.caption}
                              onChange={(e) => handleSlideCaptionChange(slide.id, e.target.value)}
                              className="w-full text-xs border border-neutral-200 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                            />
                          </div>

                          {/* Кнопки переміщення вгору / вниз та видалення */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveSlide(idx, 'up')}
                              disabled={idx === 0}
                              title="Перемістити вище"
                              className="p-1 text-neutral-500 hover:text-black disabled:opacity-20 hover:bg-neutral-100 rounded cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveSlide(idx, 'down')}
                              disabled={idx === carouselSlides.length - 1}
                              title="Перемістити нижче"
                              className="p-1 text-neutral-500 hover:text-black disabled:opacity-20 hover:bg-neutral-100 rounded cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveSlide(slide.id)}
                              title="Видалити це фото"
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer ml-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Загальний підпис до всієї каруселі */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-neutral-700 font-semibold mb-1">
                    3. Загальний підпис до каруселі (необов'язково)
                  </label>
                  <input
                    type="text"
                    placeholder="Наприклад: 'Серія знімків презентації' або 'Фото: Reuters'"
                    value={carouselCaption}
                    onChange={(e) => setCarouselCaption(e.target.value)}
                    className="w-full text-xs border border-neutral-300 rounded px-3 py-2 focus:border-black focus:outline-none"
                  />
                </div>

                {/* 4. Інтерактивне прев'ю каруселі прямо в модалці */}
                {carouselSlides.length >= 2 && (
                  <div className="pt-2 border-t border-neutral-200">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">
                      Попередній перегляд слайдера:
                    </div>
                    <PhotoCarousel
                      images={carouselSlides.map((s) => ({ url: s.url, caption: s.caption }))}
                      caption={carouselCaption}
                      isEditor={true}
                      className="my-0 max-h-[360px]"
                    />
                  </div>
                )}
              </div>

              {/* Нижня панель дій */}
              <div className="flex items-center justify-between pt-3 border-t border-neutral-200 mt-4 flex-shrink-0">
                <span className="text-xs text-neutral-500">
                  {carouselSlides.length < 2
                    ? '⚠️ Для каруселі потрібно мінімум 2 фото'
                    : `✓ Готово: ${carouselSlides.length} фото`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCarouselModal(false)}
                    className="px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded cursor-pointer"
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyCarousel}
                    disabled={carouselSlides.length < 2 || isUploadingCarousel}
                    className="px-4 py-2 text-xs font-medium bg-black text-white rounded hover:bg-neutral-800 disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Images className="w-3.5 h-3.5" />
                    <span>Вставити карусель ({carouselSlides.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
