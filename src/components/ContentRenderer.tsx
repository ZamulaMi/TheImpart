import React, { useState } from 'react';
import {
  Info,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Quote as QuoteIcon,
  ExternalLink,
  CheckSquare,
  Square,
  ZoomIn,
  X,
} from 'lucide-react';
import { markdownToHtml } from '../utils/editorConverter';
import { PhotoCarousel, CarouselSlide } from './PhotoCarousel';

interface ContentRendererProps {
  content: string;
}

// Видобування YouTube Video ID
export function getYouTubeId(url: string): string | null {
  const clean = url.trim();
  const regExp =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = clean.match(regExp);
  return match ? match[1] : null;
}

// Перевірка на посилання або data-uri зображення
export function isImageUrl(url: string): boolean {
  const clean = url.trim();
  if (clean.startsWith('data:image/')) return true;
  if (/^https?:\/\/.*\.(?:jpg|jpeg|png|webp|gif|svg|avif)(?:[?#].*)?$/i.test(clean)) return true;
  if (/^https?:\/\/images\.unsplash\.com\/.+/i.test(clean)) return true;
  if (clean.startsWith('/uploads/')) return true;
  return false;
}

// Telegram-style Spoiler компонент: чисте розмиття без сірого фону та рамок
export const TelegramSpoiler: React.FC<{ text: string }> = ({ text }) => {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(!revealed);
      }}
      title={revealed ? 'Натисніть, щоб приховати спойлер' : 'Натисніть, щоб переглянути прихований текст'}
      className={`cursor-pointer transition-all duration-300 inline align-baseline ${
        revealed ? 'filter-none select-auto' : 'blur-[5px] select-none hover:blur-[3px]'
      }`}
      style={{
        background: 'transparent',
        border: 'none',
        outline: 'none',
        padding: 0,
      }}
    >
      {renderInlineFormatting(text)}
    </span>
  );
};

// Рендерер інлайн-форматування (Bold, Italic, Strikethrough, Underline, Code, Spoiler, Highlighter, Colors, Fonts, Links)
export const renderInlineFormatting = (text: string): React.ReactNode => {
  if (!text) return null;

  // Виділяємо зображення, які можуть бути в тексті, щоб посилання не перехопило ![alt](url)
  // Паттерни в порядку пріоритету:
  // 1. Spoilers: ||text||
  // 2. Highlighters: [hl:color]text[/hl] or ==text==
  // 3. Colors: [color:#code]text[/color]
  // 4. Fonts: [font:serif|sans|mono]text[/font]
  // 5. Links: [label](url) (але не ![alt](url))
  // 6. Bold: **text** or <b>text</b>
  // 7. Italic: *text* or <i>text</i>
  // 8. Strikethrough: ~~text~~ or <s>text</s>
  // 9. Underline: <u>text</u> or [u]text[/u]
  // 10. Code: `code`

  const regex =
    /(<a\s+[^>]*href=["'][^"']*["'][^>]*>[\s\S]*?<\/a>|\|\|[\s\S]*?\|\||\[hl:([a-z0-9#-]+)\][\s\S]*?\[\/hl\]|==[\s\S]*?==|\[color:([#a-zA-Z0-9]+)\][\s\S]*?\[\/color\]|\[font:(serif|sans|mono)\][\s\S]*?\[\/font\]|(?<!!)\[(.*?)\]\((https?:\/\/[^\s)]+|\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)\)|\*\*([^*]+)\*\*|<b>(.*?)<\/b>|(?<!\*)\*([^*]+)\*(?!\*)|<i>(.*?)<\/i>|~~([^~]+)~~|<s>(.*?)<\/s>|<u>(.*?)<\/u>|\[u\](.*?)\[\/u\]|`([^`]+)`)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    const key = `inline_${matchIndex}_${fullMatch.slice(0, 10)}`;

    // 0. HTML Link: <a href="...">...</a>
    if (fullMatch.startsWith('<a') && fullMatch.endsWith('</a>')) {
      const urlMatch = fullMatch.match(/href=["']([^"']*)["']/i);
      const innerMatch = fullMatch.match(/>([\s\S]*?)<\/a>/i);
      if (urlMatch) {
        const url = urlMatch[1];
        const innerText = innerMatch ? innerMatch[1] : url;
        const isExternal = url.startsWith('http://') || url.startsWith('https://');
        parts.push(
          <a
            key={key}
            href={url}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="inline-flex items-baseline gap-1 font-medium underline underline-offset-3 decoration-1 transition-colors cursor-pointer text-[#0089ff] dark:text-[#58b9ff]"
          >
            <span>{renderInlineFormatting(innerText)}</span>
            {isExternal && <ExternalLink className="w-3 h-3 self-center opacity-70 inline" />}
          </a>
        );
      }
    }
    // 1. Telegram Spoiler: ||text||
    else if (fullMatch.startsWith('||') && fullMatch.endsWith('||')) {
      const inner = fullMatch.slice(2, -2);
      parts.push(<TelegramSpoiler key={key} text={inner} />);
    }
    // 2. Highlighter: [hl:color]text[/hl]
    else if (fullMatch.startsWith('[hl:') && fullMatch.endsWith('[/hl]')) {
      const colorMatch = fullMatch.match(/^\[hl:([a-z0-9#-]+)\]([\s\S]*?)\[\/hl\]$/);
      if (colorMatch) {
        const colorName = colorMatch[1].toLowerCase();
        const inner = colorMatch[2];
        const bgClasses: Record<string, string> = {
          yellow: 'bg-yellow-200 text-neutral-900 border-b border-yellow-400/50',
          green: 'bg-emerald-200 text-neutral-900 border-b border-emerald-400/50',
          blue: 'bg-sky-200 text-neutral-900 border-b border-sky-400/50',
          pink: 'bg-pink-200 text-neutral-900 border-b border-pink-400/50',
          orange: 'bg-amber-200 text-neutral-900 border-b border-amber-400/50',
          purple: 'bg-purple-200 text-neutral-900 border-b border-purple-400/50',
        };
        const cls = bgClasses[colorName] || 'bg-yellow-200 text-neutral-900';
        parts.push(
          <mark key={key} className={`${cls} px-1.5 py-0.5 rounded-xs font-inherit`}>
            {renderInlineFormatting(inner)}
          </mark>
        );
      }
    }
    // 3. Highlighter: ==text==
    else if (fullMatch.startsWith('==') && fullMatch.endsWith('==')) {
      const inner = fullMatch.slice(2, -2);
      parts.push(
        <mark key={key} className="bg-yellow-200 text-neutral-900 px-1.5 py-0.5 rounded-xs font-inherit">
          {renderInlineFormatting(inner)}
        </mark>
      );
    }
    // 4. Color: [color:#hex]text[/color]
    else if (fullMatch.startsWith('[color:') && fullMatch.endsWith('[/color]')) {
      const colorMatch = fullMatch.match(/^\[color:([#a-zA-Z0-9]+)\]([\s\S]*?)\[\/color\]$/);
      if (colorMatch) {
        const colorVal = colorMatch[1];
        const inner = colorMatch[2];
        parts.push(
          <span key={key} style={{ color: colorVal }}>
            {renderInlineFormatting(inner)}
          </span>
        );
      }
    }
    // 5. Font: [font:serif|sans|mono]text[/font]
    else if (fullMatch.startsWith('[font:') && fullMatch.endsWith('[/font]')) {
      const fontMatch = fullMatch.match(/^\[font:(serif|sans|mono)\]([\s\S]*?)\[\/font\]$/);
      if (fontMatch) {
        const fontType = fontMatch[1];
        const inner = fontMatch[2];
        const fontCls =
          fontType === 'serif'
            ? 'font-serif'
            : fontType === 'mono'
            ? 'font-mono text-[0.9em]'
            : 'font-sans';
        parts.push(
          <span key={key} className={fontCls}>
            {renderInlineFormatting(inner)}
          </span>
        );
      }
    }
    // 6. Link: [label](url)
    else if (fullMatch.startsWith('[') && fullMatch.includes('](')) {
      const linkMatch = fullMatch.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        const label = linkMatch[1];
        const url = linkMatch[2];
        const isExternal = url.startsWith('http://') || url.startsWith('https://');
        parts.push(
          <a
            key={key}
            href={url}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="inline-flex items-baseline gap-1 font-medium underline underline-offset-3 decoration-1 transition-colors cursor-pointer text-[#0089ff] dark:text-[#58b9ff] hover:text-[#0070d6] dark:hover:text-[#9cd5ff] decoration-[rgba(0,137,255,0.45)] dark:decoration-[rgba(88,185,255,0.5)]"
          >
            <span>{renderInlineFormatting(label)}</span>
            {isExternal && <ExternalLink className="w-3 h-3 self-center opacity-70 inline" />}
          </a>
        );
      }
    }
    // 7. Bold: **text** or <b>text</b>
    else if (
      (fullMatch.startsWith('**') && fullMatch.endsWith('**')) ||
      (fullMatch.startsWith('<b>') && fullMatch.endsWith('</b>'))
    ) {
      const inner = fullMatch.startsWith('**') ? fullMatch.slice(2, -2) : fullMatch.slice(3, -4);
      parts.push(
        <strong key={key} className="font-bold text-neutral-950 dark:text-[#ffffff]">
          {renderInlineFormatting(inner)}
        </strong>
      );
    }
    // 8. Italic: *text* or <i>text</i>
    else if (
      (fullMatch.startsWith('*') && fullMatch.endsWith('*')) ||
      (fullMatch.startsWith('<i>') && fullMatch.endsWith('</i>'))
    ) {
      const inner = fullMatch.startsWith('*') ? fullMatch.slice(1, -1) : fullMatch.slice(3, -4);
      parts.push(
        <em key={key} className="italic font-serif">
          {renderInlineFormatting(inner)}
        </em>
      );
    }
    // 9. Strikethrough: ~~text~~ or <s>text</s>
    else if (
      (fullMatch.startsWith('~~') && fullMatch.endsWith('~~')) ||
      (fullMatch.startsWith('<s>') && fullMatch.endsWith('</s>'))
    ) {
      const inner = fullMatch.startsWith('~~') ? fullMatch.slice(2, -2) : fullMatch.slice(3, -4);
      parts.push(
        <s key={key} className="line-through text-neutral-400 dark:text-neutral-500">
          {renderInlineFormatting(inner)}
        </s>
      );
    }
    // 10. Underline: <u>text</u> or [u]text[/u]
    else if (
      (fullMatch.startsWith('<u>') && fullMatch.endsWith('</u>')) ||
      (fullMatch.startsWith('[u]') && fullMatch.endsWith('[/u]'))
    ) {
      const inner = fullMatch.startsWith('<u>') ? fullMatch.slice(3, -4) : fullMatch.slice(3, -4);
      parts.push(
        <u key={key} className="underline underline-offset-4 decoration-neutral-500">
          {renderInlineFormatting(inner)}
        </u>
      );
    }
    // 11. Code: `code`
    else if (fullMatch.startsWith('`') && fullMatch.endsWith('`')) {
      parts.push(
        <code
          key={key}
          className="font-mono text-[0.88em] bg-neutral-100 dark:bg-[#181818] text-neutral-900 dark:text-[#e5e5e5] border border-neutral-200 dark:border-[#333333] rounded px-1.5 py-0.5"
        >
          {fullMatch.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(fullMatch);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

// Типи розпізнаних блоків статті
type ParsedBlock =
  | { type: 'youtube'; videoId: string; url: string }
  | { type: 'image'; src: string; caption?: string }
  | { type: 'carousel'; images: CarouselSlide[]; caption?: string }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | {
      type: 'callout';
      variant: 'info' | 'warning' | 'success' | 'danger' | 'quote' | 'dark';
      title?: string;
      content: string;
    }
  | { type: 'quote'; text: string; author?: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'checklist'; items: { checked: boolean; text: string }[] }
  | { type: 'divider' }
  | { type: 'paragraph'; text: string; align?: 'left' | 'center' | 'right' };

// Надійний аналізатор тексту на блоки (Block Parser)
export function parseContentToBlocks(content: string): ParsedBlock[] {
  if (!content) return [];

  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: ParsedBlock[] = [];

  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Пропуск порожніх рядків
    if (!line) {
      i++;
      continue;
    }

    // 0. Карусель фото: [carousel caption="..."]...[/carousel]
    if (line.startsWith('[carousel')) {
      const carouselLines: string[] = [line];
      i++;
      while (i < lines.length && !lines[i].includes('[/carousel]')) {
        carouselLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].includes('[/carousel]')) {
        carouselLines.push(lines[i]);
        i++;
      }
      const fullCarouselText = carouselLines.join('\n');
      const capMatch = fullCarouselText.match(/\[carousel(?:\s+caption=["'](.*?)["'])?\]/i);
      const overallCap = capMatch?.[1];
      const slides: CarouselSlide[] = [];
      const slideMatches = fullCarouselText.matchAll(
        /\[(?:slide|photo|image):\s*([^\s\]]+)(?:\s+["'](.*?)["'])?\]/gi
      );
      for (const sm of slideMatches) {
        slides.push({ url: sm[1].trim(), caption: sm[2]?.trim() || undefined });
      }
      if (slides.length > 0) {
        blocks.push({
          type: 'carousel',
          images: slides,
          caption: overallCap,
        });
        continue;
      }
    }

    // 1. Розділювач: --- або ***
    if (/^---{1,}$/.test(line) || /^\*\*\*{1,}$/.test(line)) {
      blocks.push({ type: 'divider' });
      i++;
      continue;
    }

    // 2. Callout блок: [callout:variant title="..."] ... [/callout]
    const calloutStartMatch = line.match(
      /^\[callout:(info|warning|success|danger|quote|dark)(?:\s+title="(.*?)")?\]/i
    );
    if (calloutStartMatch) {
      const variant = calloutStartMatch[1].toLowerCase() as any;
      const title = calloutStartMatch[2] || undefined;
      const calloutLines: string[] = [];

      // Залишок поточного рядка після відкриваючого тегу
      const startTagLength = calloutStartMatch[0].length;
      let restOfLine = line.substring(startTagLength);

      // Якщо закриваючий тег на тому ж рядку
      if (restOfLine.includes('[/callout]')) {
        const contentInside = restOfLine.replace('[/callout]', '').trim();
        blocks.push({
          type: 'callout',
          variant,
          title,
          content: contentInside,
        });
        i++;
        continue;
      }

      if (restOfLine.trim()) {
        calloutLines.push(restOfLine);
      }

      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (nextLine.includes('[/callout]')) {
          const beforeClose = nextLine.split('[/callout]')[0];
          if (beforeClose.trim()) calloutLines.push(beforeClose);
          i++;
          break;
        }
        calloutLines.push(nextLine);
        i++;
      }

      blocks.push({
        type: 'callout',
        variant,
        title,
        content: calloutLines.join('\n').trim(),
      });
      continue;
    }

    // 3. Markdown Таблиця: починається з | і наступний рядок містить |---|
    if (
      line.startsWith('|') &&
      i + 1 < lines.length &&
      lines[i + 1].trim().startsWith('|') &&
      lines[i + 1].includes('---')
    ) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const parseRow = (r: string) => {
          const trimmedRow = r.replace(/^\|/, '').replace(/\|$/, '');
          return trimmedRow.split('|').map((c) => c.trim());
        };

        const headers = parseRow(tableLines[0]);
        // tableLines[1] — рядок роздільника |---|---|
        const dataRows = tableLines.slice(2).map(parseRow);

        blocks.push({
          type: 'table',
          headers,
          rows: dataRows,
        });
        continue;
      }
    }

    // 4. Заголовки: # H1, ## H1, ### H2, #### H3
    const h1Match = line.match(/^#{1,2}\s+(.+)$/);
    if (h1Match) {
      blocks.push({ type: 'heading', level: 1, text: h1Match[1] });
      i++;
      continue;
    }
    const h2Match = line.match(/^###\s+(.+)$/);
    if (h2Match) {
      blocks.push({ type: 'heading', level: 2, text: h2Match[1] });
      i++;
      continue;
    }
    const h3Match = line.match(/^####\s+(.+)$/);
    if (h3Match) {
      blocks.push({ type: 'heading', level: 3, text: h3Match[1] });
      i++;
      continue;
    }

    // 5. YouTube тег або URL: [video: URL], [youtube: URL], або окреме YouTube посилання
    const videoTagMatch = line.match(/^\[(?:video|youtube):\s*(https?:\/\/[^\s\]]+)\]$/i);
    if (videoTagMatch) {
      const vid = getYouTubeId(videoTagMatch[1]);
      if (vid) {
        blocks.push({ type: 'youtube', videoId: vid, url: videoTagMatch[1] });
        i++;
        continue;
      }
    }

    const singleYtId = getYouTubeId(line);
    if (
      singleYtId &&
      (line.startsWith('http://') || line.startsWith('https://')) &&
      !line.includes(' ')
    ) {
      blocks.push({ type: 'youtube', videoId: singleYtId, url: line });
      i++;
      continue;
    }

    // 6. Зображення Markdown: ![caption](src)
    const mdImgMatch = line.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (mdImgMatch) {
      blocks.push({
        type: 'image',
        src: mdImgMatch[2].trim(),
        caption: mdImgMatch[1]?.trim() || undefined,
      });
      i++;
      continue;
    }

    // 7. Зображення тег: [photo: URL "caption"]
    const photoTagMatch = line.match(
      /^\[(?:photo|image|img):\s*([^\s\]]+)(?:\s+"(.*?)")?\]$/i
    );
    if (photoTagMatch) {
      blocks.push({
        type: 'image',
        src: photoTagMatch[1].trim(),
        caption: photoTagMatch[2]?.trim() || undefined,
      });
      i++;
      continue;
    }

    // 8. Окреме зображення (URL або DataURL) без тегів
    if (isImageUrl(line) && !line.includes(' ')) {
      blocks.push({ type: 'image', src: line });
      i++;
      continue;
    }

    // 9. Блок цитати: > Текст
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', text: quoteLines.join(' ') });
      continue;
    }

    // 10. Чек-лист: - [ ] або - [x]
    if (line.startsWith('- [ ]') || line.startsWith('- [x]')) {
      const checkItems: { checked: boolean; text: string }[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith('- [ ]') || lines[i].trim().startsWith('- [x]'))
      ) {
        const cur = lines[i].trim();
        const isChecked = cur.startsWith('- [x]');
        const itemText = cur.replace(/^- \[[ x]\]\s*/, '').trim();
        checkItems.push({ checked: isChecked, text: itemText });
        i++;
      }
      blocks.push({ type: 'checklist', items: checkItems });
      continue;
    }

    // 11. Марковані списки: - пункт або * пункт
    if (/^[-*•]\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*•]\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'list', ordered: false, items: listItems });
      continue;
    }

    // 12. Нумеровані списки: 1. пункт, 2. пункт
    if (/^\d+\.\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'list', ordered: true, items: listItems });
      continue;
    }

    // 13. Вирівнювання тексту: [align:center]...[/align]
    const alignMatch = line.match(/^\[align:(left|center|right)\]([\s\S]*?)\[\/align\]$/i);
    if (alignMatch) {
      blocks.push({
        type: 'paragraph',
        align: alignMatch[1].toLowerCase() as any,
        text: alignMatch[2].trim(),
      });
      i++;
      continue;
    }

    // 14. Звичайний текстовий абзац (збираємо рядки до наступного порожнього або спецблоку)
    const paraLines: string[] = [rawLine];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('---') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('- [') &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('[callout:') &&
      !lines[i].trim().startsWith('![') &&
      !lines[i].trim().startsWith('[video:') &&
      !lines[i].trim().startsWith('[photo:')
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    blocks.push({
      type: 'paragraph',
      text: paraLines.join('\n').trim(),
    });
  }

  return blocks;
}

// Очищення жорстко закодованих чорних інлайн-стилів та оптимізація вбудованих зображень (lazy-loading, decoding)
function cleanHtmlForTheme(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(
      /<p[^>]*>\s*<span[^>]*style="[^"]*font-size:\s*1\.45rem[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/p>/gi,
      '<h3>$1</h3>'
    )
    .replace(
      /style="([^"]*?)color:\s*(?:rgb\(\s*23\s*,\s*23\s*,\s*23\s*\)|#171717|#0a0a0a|#000000|#1f2937|#262626|black)\s*;?([^"]*?)"/gi,
      (_match, before, after) => {
        const remaining = `${before}${after}`.trim().replace(/^;\s*/, '').replace(/;\s*;+/g, ';');
        return remaining ? `style="${remaining}"` : '';
      }
    )
    .replace(/<img\b([^>]*)>/gi, (_full, attrs: string) => {
      let updated = attrs;
      if (!/\bloading\s*=/i.test(updated)) {
        updated += ' loading="lazy"';
      }
      if (!/\bdecoding\s*=/i.test(updated)) {
        updated += ' decoding="async"';
      }
      return `<img${updated}>`;
    });
}

export const ContentRenderer: React.FC<ContentRendererProps> = ({ content }) => {
  const [lightboxImg, setLightboxImg] = useState<{ src: string; caption?: string } | null>(null);

  if (!content) return null;

  // Якщо контент містить HTML-розмітку від візуального редактора
  const isHtml = /<(p|h[1-6]|table|blockquote|ul|ol|figure|div|mark|a)[^>]*>/i.test(content);

  if (isHtml) {
    const processedHtml = cleanHtmlForTheme(markdownToHtml(content));
    const CAROUSEL_REGEX = /<figure\b[^>]*\bclass=["'][^"']*\barticle-carousel\b[^"']*["'][^>]*>[\s\S]*?<\/figure>/gi;

    if (CAROUSEL_REGEX.test(processedHtml)) {
      CAROUSEL_REGEX.lastIndex = 0;
      const chunks: React.ReactNode[] = [];
      let lastIdx = 0;
      let match: RegExpExecArray | null;

      while ((match = CAROUSEL_REGEX.exec(processedHtml)) !== null) {
        const matchIdx = match.index;
        if (matchIdx > lastIdx) {
          const before = processedHtml.slice(lastIdx, matchIdx);
          chunks.push(
            <div
              key={`html_${lastIdx}`}
              dangerouslySetInnerHTML={{ __html: before }}
            />
          );
        }

        const fullFig = match[0];
        const imagesMatch = fullFig.match(/data-carousel-images=["']([^"']*)["']/i);
        const capMatch = fullFig.match(/data-carousel-caption=["']([^"']*)["']/i);
        let slides: CarouselSlide[] = [];
        if (imagesMatch) {
          try {
            const raw = imagesMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
            slides = JSON.parse(raw);
          } catch {}
        }
        const cap = capMatch ? capMatch[1] : undefined;

        if (slides.length > 0) {
          chunks.push(
            <PhotoCarousel
              key={`carousel_${matchIdx}`}
              images={slides}
              caption={cap}
              onOpenLightbox={(src, c) => setLightboxImg({ src, caption: c })}
            />
          );
        } else {
          chunks.push(
            <div
              key={`raw_${matchIdx}`}
              dangerouslySetInnerHTML={{ __html: fullFig }}
            />
          );
        }

        lastIdx = matchIdx + fullFig.length;
      }

      if (lastIdx < processedHtml.length) {
        chunks.push(
          <div
            key={`html_end_${lastIdx}`}
            dangerouslySetInnerHTML={{ __html: processedHtml.slice(lastIdx) }}
          />
        );
      }

      return (
        <div
          className="article-rendered-html space-y-6 text-neutral-800 dark:text-[#cbcbcb] leading-relaxed font-sans text-base sm:text-lg"
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.tagName.toLowerCase() === 'img' && !target.closest('.article-carousel-wrapper')) {
              const img = target as HTMLImageElement;
              const figcaption = target.closest('figure')?.querySelector('figcaption')?.textContent;
              setLightboxImg({ src: img.src, caption: figcaption || img.alt });
            }
            const spoilerEl = target.closest('.tg-spoiler') as HTMLElement;
            if (spoilerEl) spoilerEl.classList.toggle('revealed');
          }}
        >
          {chunks}
          {lightboxImg && (
            <div
              onClick={() => setLightboxImg(null)}
              className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-fade-in"
            >
              <button
                onClick={() => setLightboxImg(null)}
                className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
                title="Закрити (Esc)"
              >
                <X className="w-6 h-6" />
              </button>
              <div
                onClick={(e) => e.stopPropagation()}
                className="max-w-5xl max-h-[90vh] flex flex-col items-center"
              >
                <img
                  src={lightboxImg.src}
                  alt={lightboxImg.caption || 'Зображення'}
                  className="max-h-[82vh] w-auto max-w-full rounded-md object-contain shadow-2xl"
                />
                {lightboxImg.caption && (
                  <p className="text-white/80 text-xs sm:text-sm mt-3 text-center font-sans max-w-xl">
                    {lightboxImg.caption}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="article-rendered-html space-y-6 text-neutral-800 dark:text-[#cbcbcb] leading-relaxed font-sans text-base sm:text-lg">
        <div
          dangerouslySetInnerHTML={{ __html: processedHtml }}
          onClick={(e) => {
            const target = e.target as HTMLElement;

            // Клік на зображення для зуму
            if (target.tagName.toLowerCase() === 'img' && !target.closest('.article-carousel-wrapper')) {
              const img = target as HTMLImageElement;
              const figcaption = target.closest('figure')?.querySelector('figcaption')?.textContent;
              setLightboxImg({ src: img.src, caption: figcaption || img.alt });
            }

            // Клік на Telegram-спойлер для розкриття/приховування
            const spoilerEl = target.closest('.tg-spoiler') as HTMLElement;
            if (spoilerEl) {
              spoilerEl.classList.toggle('revealed');
            }
          }}
        />

        {/* Lightbox модальне вікно для фотографій */}
        {lightboxImg && (
          <div
            onClick={() => setLightboxImg(null)}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-fade-in"
          >
            <button
              onClick={() => setLightboxImg(null)}
              className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
              title="Закрити (Esc)"
            >
              <X className="w-6 h-6" />
            </button>
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-w-5xl max-h-[90vh] flex flex-col items-center"
            >
              <img
                src={lightboxImg.src}
                alt={lightboxImg.caption || 'Зображення'}
                className="max-h-[82vh] w-auto max-w-full rounded-md object-contain shadow-2xl"
              />
              {lightboxImg.caption && (
                <p className="text-white/80 text-xs sm:text-sm mt-3 text-center font-sans max-w-xl">
                  {lightboxImg.caption}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const normalizedContent = cleanHtmlForTheme(content);
  const blocks = parseContentToBlocks(normalizedContent);

  return (
    <div className="space-y-6 text-neutral-800 dark:text-[#cbcbcb] leading-relaxed font-sans text-base sm:text-lg">
      {blocks.map((block, idx) => {
        // 1. Заголовок
        if (block.type === 'heading') {
          if (block.level === 1) {
            return (
              <h2
                key={idx}
                className="text-2xl sm:text-3xl font-sans font-bold text-neutral-950 dark:text-[#f5f5f5] mt-10 mb-4 first:mt-0 border-none outline-none tracking-tight"
              >
                {renderInlineFormatting(block.text)}
              </h2>
            );
          }
          if (block.level === 2) {
            return (
              <h3
                key={idx}
                className="text-xl sm:text-2xl font-sans font-semibold text-neutral-900 dark:text-[#ececec] mt-8 mb-3 border-none outline-none tracking-tight"
              >
                {renderInlineFormatting(block.text)}
              </h3>
            );
          }
          return (
            <h4
              key={idx}
              className="text-lg sm:text-xl font-sans font-medium text-neutral-800 dark:text-[#e0e0e0] mt-6 mb-2 border-none outline-none tracking-tight"
            >
              {renderInlineFormatting(block.text)}
            </h4>
          );
        }

        // 2. Розділювач
        if (block.type === 'divider') {
          return (
            <div key={idx} className="my-8 flex items-center justify-center gap-2">
              <span className="h-px w-16 bg-neutral-300 dark:bg-[#444444]"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-[#666666]"></span>
              <span className="h-px w-16 bg-neutral-300 dark:bg-[#444444]"></span>
            </div>
          );
        }

        // 3. YouTube
        if (block.type === 'youtube') {
          return (
            <figure key={idx} className="my-8 sm:my-10 not-italic">
              <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black shadow-md border border-neutral-200">
                <iframe
                  src={`https://www.youtube.com/embed/${block.videoId}?rel=0&modestbranding=1`}
                  title="Відео YouTube"
                  className="w-full h-full border-0 absolute top-0 left-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            </figure>
          );
        }

        // 4. Фото / Зображення
        if (block.type === 'image') {
          return (
            <figure key={idx} className="my-8 sm:my-10 not-italic">
              <div
                onClick={() => setLightboxImg({ src: block.src, caption: block.caption })}
                className="group relative overflow-hidden rounded-lg bg-neutral-100 border border-neutral-200/80 shadow-xs cursor-zoom-in"
              >
                <img
                  src={block.src}
                  alt={block.caption || 'Ілюстрація до статті'}
                  width={1200}
                  height={675}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto max-h-[720px] object-cover mx-auto transition-transform duration-300 group-hover:scale-[1.01]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).alt =
                      'Не вдалося завантажити зображення';
                  }}
                />
                <div className="absolute top-3 right-3 p-1.5 bg-black/60 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn className="w-4 h-4" />
                </div>
              </div>
              {block.caption && (
                <figcaption className="text-center text-xs text-neutral-500 mt-2.5 font-sans italic">
                  {renderInlineFormatting(block.caption)}
                </figcaption>
              )}
            </figure>
          );
        }

        // 4.5. Карусель фотографій
        if (block.type === 'carousel') {
          return (
            <PhotoCarousel
              key={idx}
              images={block.images}
              caption={block.caption}
              onOpenLightbox={(src, c) => setLightboxImg({ src, caption: c })}
            />
          );
        }

        // 5. Таблиця
        if (block.type === 'table') {
          return (
            <div key={idx} className="my-8 overflow-x-auto not-italic">
              <div className="inline-block min-w-full align-middle border border-neutral-200 dark:border-[#333333] rounded-lg overflow-hidden shadow-xs">
                <table className="min-w-full divide-y divide-neutral-200 dark:divide-[#333333] font-sans text-sm">
                  <thead className="bg-neutral-100/80 dark:bg-[#161616]">
                    <tr>
                      {block.headers.map((h, hIdx) => (
                        <th
                          key={hIdx}
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-900 dark:text-[#f5f5f5] border-r border-neutral-200 dark:border-[#333333] last:border-r-0"
                        >
                          {renderInlineFormatting(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-[#333333] bg-white dark:bg-[#222222]">
                    {block.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={
                          rIdx % 2 === 0
                            ? 'bg-white dark:bg-[#222222] hover:bg-neutral-50 dark:hover:bg-[#262626]'
                            : 'bg-neutral-50/50 dark:bg-[#1c1c1c] hover:bg-neutral-100/70 dark:hover:bg-[#262626]'
                        }
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="px-4 py-3 text-neutral-800 dark:text-[#cbcbcb] leading-normal border-r border-neutral-200 dark:border-[#333333] last:border-r-0"
                          >
                            {renderInlineFormatting(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        // 6. Кольоровий Callout блок
        if (block.type === 'callout') {
          const styles: Record<
            typeof block.variant,
            { bg: string; border: string; text: string; icon: React.ReactNode }
          > = {
            info: {
              bg: 'bg-sky-50/90',
              border: 'border-sky-400',
              text: 'text-sky-950',
              icon: <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />,
            },
            warning: {
              bg: 'bg-amber-50/90',
              border: 'border-amber-400',
              text: 'text-amber-950',
              icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />,
            },
            success: {
              bg: 'bg-emerald-50/90',
              border: 'border-emerald-400',
              text: 'text-emerald-950',
              icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />,
            },
            danger: {
              bg: 'bg-red-50/90',
              border: 'border-red-400',
              text: 'text-red-950',
              icon: <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />,
            },
            quote: {
              bg: 'bg-neutral-50',
              border: 'border-neutral-400',
              text: 'text-neutral-900',
              icon: <QuoteIcon className="w-5 h-5 text-neutral-500 shrink-0 mt-0.5" />,
            },
            dark: {
              bg: 'bg-neutral-900',
              border: 'border-neutral-950',
              text: 'text-neutral-100',
              icon: <Info className="w-5 h-5 text-neutral-300 shrink-0 mt-0.5" />,
            },
          };

          const cur = styles[block.variant] || styles.info;

          return (
            <div
              key={idx}
              className={`my-7 p-5 rounded-lg border-l-4 ${cur.border} ${cur.bg} ${cur.text} shadow-xs not-italic`}
            >
              <div className="flex items-start gap-3">
                {cur.icon}
                <div className="flex-1 font-sans text-sm sm:text-base">
                  {block.title && (
                    <div className="font-semibold text-xs uppercase tracking-wider mb-1.5 opacity-90">
                      {block.title}
                    </div>
                  )}
                  <div className="leading-relaxed whitespace-pre-line">
                    {renderInlineFormatting(block.content)}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // 7. Цитата
        if (block.type === 'quote') {
          return (
            <blockquote
              key={idx}
              className="my-8 pl-5 sm:pl-7 border-l-3 border-black dark:border-[#cbcbcb] italic text-neutral-900 dark:text-[#e0e0e0] font-serif text-lg sm:text-xl leading-relaxed"
            >
              <p>«{renderInlineFormatting(block.text)}»</p>
              {block.author && (
                <footer className="not-italic text-xs font-sans text-neutral-500 dark:text-[#888888] mt-2 font-medium">
                  — {block.author}
                </footer>
              )}
            </blockquote>
          );
        }

        // 8. Списки
        if (block.type === 'list') {
          if (block.ordered) {
            return (
              <ol key={idx} className="my-5 pl-6 list-decimal space-y-2 font-serif text-neutral-800 dark:text-[#cbcbcb]">
                {block.items.map((it, iIdx) => (
                  <li key={iIdx} className="leading-relaxed">
                    {renderInlineFormatting(it)}
                  </li>
                ))}
              </ol>
            );
          }
          return (
            <ul key={idx} className="my-5 pl-6 list-disc space-y-2 font-serif text-neutral-800 dark:text-[#cbcbcb]">
              {block.items.map((it, iIdx) => (
                <li key={iIdx} className="leading-relaxed">
                  {renderInlineFormatting(it)}
                </li>
              ))}
            </ul>
          );
        }

        // 9. Чек-лист (завдання)
        if (block.type === 'checklist') {
          return (
            <div key={idx} className="my-5 space-y-2 font-sans text-sm sm:text-base">
              {block.items.map((item, cIdx) => (
                <div key={cIdx} className="flex items-start gap-2.5">
                  {item.checked ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600 mt-1 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-neutral-400 mt-1 shrink-0" />
                  )}
                  <span
                    className={
                      item.checked
                        ? 'line-through text-neutral-400 dark:text-neutral-500'
                        : 'text-neutral-800 dark:text-[#cbcbcb]'
                    }
                  >
                    {renderInlineFormatting(item.text)}
                  </span>
                </div>
              ))}
            </div>
          );
        }

        // 10. Звичайний абзац
        const alignClass =
          block.align === 'center'
            ? 'text-center'
            : block.align === 'right'
            ? 'text-right'
            : 'text-left';

        return (
          <p key={idx} className={`whitespace-pre-line leading-relaxed text-neutral-800 dark:text-[#cbcbcb] ${alignClass}`}>
            {renderInlineFormatting(block.text)}
          </p>
        );
      })}

      {/* Lightbox модальне вікно для фотографій */}
      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-fade-in"
        >
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
            title="Закрити (Esc)"
          >
            <X className="w-6 h-6" />
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-5xl max-h-[90vh] flex flex-col items-center"
          >
            <img
              src={lightboxImg.src}
              alt={lightboxImg.caption || 'Зображення'}
              className="max-h-[82vh] w-auto max-w-full rounded-md object-contain shadow-2xl"
            />
            {lightboxImg.caption && (
              <p className="text-white/80 text-xs sm:text-sm mt-3 text-center font-sans max-w-xl">
                {lightboxImg.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
