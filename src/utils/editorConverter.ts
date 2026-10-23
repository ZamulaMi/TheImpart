/**
 * Утиліти для двосторонньої конвертації між Markdown та HTML для візуального редактора (WYSIWYG)
 */

export function markdownToHtml(md: string): string {
  if (!md) return '';

  let html = md.replace(/\r\n/g, '\n');

  // 1. Callout блоки: [callout:variant title="..."]content[/callout]
  html = html.replace(
    /\[callout:(info|warning|success|danger|quote|dark)(?:\s+title="(.*?)")?\]([\s\S]*?)\[\/callout\]/gi,
    (_, variant, title, body) => {
      const v = variant.toLowerCase();
      const configs: Record<string, { bg: string; border: string; color: string; defaultTitle: string }> = {
        info: { bg: '#f0f9ff', border: '#38bdf8', color: '#0369a1', defaultTitle: 'До відома' },
        warning: { bg: '#fefce8', border: '#f59e0b', color: '#b45309', defaultTitle: 'Зверніть увагу' },
        success: { bg: '#f0fdf4', border: '#10b981', color: '#047857', defaultTitle: 'Висновок' },
        danger: { bg: '#fef2f2', border: '#ef4444', color: '#b91c1c', defaultTitle: 'Важливо' },
        quote: { bg: '#fafafa', border: '#737373', color: '#171717', defaultTitle: 'Цитата' },
        dark: { bg: '#171717', border: '#000000', color: '#fafafa', defaultTitle: 'Коментар' },
      };
      const cfg = configs[v] || configs.info;
      const displayTitle = title || cfg.defaultTitle;
      const t = `<div class="callout-title" style="font-weight: 600; font-size: 13px; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.05em; color: ${cfg.color};">${displayTitle}</div>`;
      const textCol = v === 'dark' ? '#fafafa' : '#1f2937';
      return `<div class="callout-box callout-${v}" data-variant="${v}" data-title="${title || ''}" style="margin: 20px 0; padding: 16px; border-radius: 8px; border-left: 4px solid ${cfg.border}; background: ${cfg.bg};">${t}<div class="callout-body" style="color: ${textCol}; line-height: 1.6;">${body.trim().replace(/\n/g, '<br/>')}</div></div>`;
    }
  );

  // 2. YouTube теги: [video: URL] або [youtube: URL]
  html = html.replace(/\[(?:video|youtube):\s*(https?:\/\/[^\s\]]+)\]/gi, (_, url) => {
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = url.match(regExp);
    const vid = match ? match[1] : '';
    if (!vid) return `<p><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`;
    return `<div class="article-video-wrapper" style="margin: 24px 0; aspect-ratio: 16/9; background: #000; border-radius: 8px; overflow: hidden;"><iframe src="https://www.youtube.com/embed/${vid}" style="width: 100%; height: 100%; border: 0;" allowfullscreen></iframe></div>`;
  });

  // 3. Зображення: ![alt](src) або [photo: src "alt"]
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (_, alt, src) => {
    const caption = alt ? `<figcaption style="text-align: center; font-size: 13px; color: #6b7280; font-style: italic; margin-top: 8px;">${alt}</figcaption>` : '';
    return `<figure class="article-image" style="margin: 24px 0; text-align: center;"><img src="${src.trim()}" alt="${alt}" style="max-width: 100%; max-height: 600px; border-radius: 8px; margin: 0 auto; display: block;" />${caption}</figure>`;
  });

  html = html.replace(/\[(?:photo|image|img):\s*([^\s\]]+)(?:\s+"(.*?)")?\]/gi, (_, src, alt) => {
    const caption = alt ? `<figcaption style="text-align: center; font-size: 13px; color: #6b7280; font-style: italic; margin-top: 8px;">${alt}</figcaption>` : '';
    return `<figure class="article-image" style="margin: 24px 0; text-align: center;"><img src="${src.trim()}" alt="${alt || ''}" style="max-width: 100%; max-height: 600px; border-radius: 8px; margin: 0 auto; display: block;" />${caption}</figure>`;
  });

  // 4. Markdown таблиці (якщо ще не HTML таблиця)
  html = html.replace(/(?:^|\n)(\|.+?\|\n\|[-:| ]+?\|\n(?:\|.+?\|\n?)+)/g, (fullTable) => {
    const rows = fullTable.trim().split('\n').map((r) => r.trim()).filter(Boolean);
    if (rows.length < 2) return fullTable;

    const parseCells = (r: string) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const headerCells = parseCells(rows[0]);
    const dataRows = rows.slice(2).map(parseCells);

    const thead = `<thead><tr style="background: #f4f4f5;">${headerCells.map((h) => `<th style="border: 1px solid #e4e4e7; padding: 10px 14px; text-align: left; font-weight: 600;">${h}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${dataRows.map((r, rIdx) => `<tr style="${rIdx % 2 === 1 ? 'background: #fafafa;' : ''}">${r.map((c) => `<td style="border: 1px solid #e4e4e7; padding: 10px 14px;">${c}</td>`).join('')}</tr>`).join('')}</tbody>`;

    return `<div style="overflow-x: auto; margin: 24px 0;"><table class="article-table" style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 14px; border: 1px solid #e4e4e7; border-radius: 6px;">${thead}${tbody}</table></div>`;
  });

  // 5. Telegram спойлер: ||text||
  html = html.replace(/\|\|([\s\S]*?)\|\|/g, '<span class="tg-spoiler" data-spoiler="true">$1</span>');

  // 6. Хайлайтери: [hl:color]text[/hl] та ==text==
  html = html.replace(/\[hl:([a-z0-9#-]+)\]([\s\S]*?)\[\/hl\]/gi, (_, color, text) => {
    const bgColors: Record<string, string> = {
      yellow: '#fef08a',
      green: '#a7f3d0',
      blue: '#bae6fd',
      pink: '#fbcfe8',
      orange: '#fed7aa',
      purple: '#e9d5ff',
    };
    const bg = bgColors[color.toLowerCase()] || '#fef08a';
    return `<mark class="hl-${color}" style="background-color: ${bg}; padding: 2px 5px; border-radius: 3px;">${text}</mark>`;
  });
  html = html.replace(/==(.*?)==/g, '<mark style="background-color: #fef08a; padding: 2px 5px; border-radius: 3px;">$1</mark>');

  // 7. Колір тексту: [color:#hex]text[/color]
  html = html.replace(/\[color:([#a-zA-Z0-9]+)\]([\s\S]*?)\[\/color\]/gi, '<span style="color: $1;">$2</span>');

  // 8. Шрифти: [font:serif|sans|mono]text[/font]
  html = html.replace(/\[font:serif\]([\s\S]*?)\[\/font\]/gi, '<span style="font-family: Georgia, serif;">$1</span>');
  html = html.replace(/\[font:sans\]([\s\S]*?)\[\/font\]/gi, '<span style="font-family: -apple-system, BlinkMacSystemFont, sans-serif;">$1</span>');
  html = html.replace(/\[font:mono\]([\s\S]*?)\[\/font\]/gi, '<span style="font-family: monospace; font-size: 0.9em; background: #f3f4f6; padding: 2px 4px; border-radius: 3px;">$1</span>');

  // 9. Посилання: [label](url)
  html = html.replace(
    /(?<!!)\[(.*?)\]\((.*?)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #0089ff; text-decoration: underline; text-decoration-color: rgba(0, 137, 255, 0.4); text-decoration-thickness: 1px; text-underline-offset: 3px; font-weight: 500;">$1</a>'
  );

  // 10. Інлайн-форматування Markdown: **bold**, *italic*, ~~strike~~, `code`
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  html = html.replace(/`([^`]+)`/g, '<code style="background: #f4f4f5; padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 0.9em;">$1</code>');

  // 11. Якщо контент вже містить блокові теги (<p>, <h[1-6]>, <table> тощо), не огортаємо повторно
  const hasBlockTags = /<(p|h[1-6]|table|blockquote|ul|ol|figure|div)[^>]*>/i.test(html);
  if (hasBlockTags) {
    return html;
  }

  // 12. Заголовки Markdown H1, H2, H3, H4
  html = html.replace(/^###\s+(.+)$/gm, '<h3 style="font-size: 1.4rem; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.5em;">$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2 style="font-size: 1.75rem; font-weight: 700; margin-top: 1.8em; margin-bottom: 0.6em;">$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1 style="font-size: 2rem; font-weight: 700; margin-top: 2em; margin-bottom: 0.6em;">$1</h1>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4 style="font-size: 1.15rem; font-weight: 600; margin-top: 1.2em; margin-bottom: 0.4em;">$1</h4>');

  // 13. Розділювачі ---
  html = html.replace(/^---{1,}$/gm, '<hr class="article-divider" style="border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0;" />');

  // 14. Цитати > ...
  html = html.replace(/^>\s?(.*)$/gm, '<blockquote style="border-left: 3px solid #000; padding-left: 16px; margin: 20px 0; font-style: italic; color: #1f2937;">$1</blockquote>');

  // 15. Чек-листи
  html = html.replace(/^- \[x\]\s*(.*)$/gm, '<div class="checklist-item checked" style="display: flex; align-items: center; gap: 8px; margin: 6px 0;"><input type="checkbox" checked onclick="return false;" /> <span style="text-decoration: line-through; color: #9ca3af;">$1</span></div>');
  html = html.replace(/^- \[ \]\s*(.*)$/gm, '<div class="checklist-item" style="display: flex; align-items: center; gap: 8px; margin: 6px 0;"><input type="checkbox" onclick="return false;" /> <span>$1</span></div>');

  // 16. Марковані списки
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>\n?)+/g, '<ul style="margin: 1em 0; padding-left: 1.5em; list-style-type: disc;">$&</ul>');

  // 17. Абзаци: розбиваємо подвійні нові рядки на <p>
  const paragraphs = html.split(/\n\s*\n/);
  html = paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (/^<(h[1-6]|table|blockquote|ul|ol|figure|div|hr)/i.test(trimmed)) {
        return trimmed;
      }
      return `<p style="margin: 1em 0; line-height: 1.75;">${trimmed.replace(/\n/g, '<br/>')}</p>`;
    })
    .filter(Boolean)
    .join('\n\n');

  return html;
}

export function htmlToMarkdown(html: string): string {
  if (!html) return '';

  const container = document.createElement('div');
  container.innerHTML = html;

  function nodeToMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(nodeToMd).join('');

    switch (tag) {
      case 'h1':
      case 'h2':
        return `\n\n## ${inner.trim()}\n\n`;
      case 'h3':
        return `\n\n### ${inner.trim()}\n\n`;
      case 'h4':
      case 'h5':
      case 'h6':
        return `\n\n#### ${inner.trim()}\n\n`;
      case 'strong':
      case 'b':
        return `**${inner}**`;
      case 'em':
      case 'i':
        return `*${inner}*`;
      case 'u':
        return `<u>${inner}</u>`;
      case 's':
      case 'strike':
      case 'del':
        return `~~${inner}~~`;
      case 'code':
        return `\`${inner}\``;
      case 'p':
        return `\n\n${inner.trim()}\n\n`;
      case 'br':
        return '\n';
      case 'hr':
        return '\n\n---\n\n';
      case 'blockquote':
        return `\n\n> ${inner.trim()}\n\n`;
      case 'mark': {
        const bg = el.style.backgroundColor || '';
        let colorName = 'yellow';
        if (bg.includes('167') || bg.includes('emerald') || bg.includes('green')) colorName = 'green';
        else if (bg.includes('186') || bg.includes('sky') || bg.includes('blue')) colorName = 'blue';
        else if (bg.includes('251') || bg.includes('pink')) colorName = 'pink';
        else if (bg.includes('254') || bg.includes('orange') || bg.includes('amber')) colorName = 'orange';
        else if (bg.includes('233') || bg.includes('purple')) colorName = 'purple';
        return `[hl:${colorName}]${inner}[/hl]`;
      }
      case 'span': {
        if (el.dataset.spoiler === 'true' || el.classList.contains('tg-spoiler')) {
          return `||${inner}||`;
        }
        if (el.style.color) {
          return `[color:${el.style.color}]${inner}[/color]`;
        }
        if (el.style.fontFamily) {
          if (el.style.fontFamily.includes('serif')) return `[font:serif]${inner}[/font]`;
          if (el.style.fontFamily.includes('mono')) return `[font:mono]${inner}[/font]`;
          if (el.style.fontFamily.includes('sans')) return `[font:sans]${inner}[/font]`;
        }
        return inner;
      }
      case 'a': {
        const href = el.getAttribute('href') || '#';
        return `[${inner}](${href})`;
      }
      case 'img': {
        const src = el.getAttribute('src') || '';
        const alt = el.getAttribute('alt') || '';
        return `\n\n![${alt}](${src})\n\n`;
      }
      case 'figure': {
        const img = el.querySelector('img');
        const caption = el.querySelector('figcaption')?.textContent || img?.getAttribute('alt') || '';
        const src = img?.getAttribute('src') || '';
        return src ? `\n\n![${caption}](${src})\n\n` : inner;
      }
      case 'iframe': {
        const src = el.getAttribute('src') || '';
        return src ? `\n\n[video: ${src}]\n\n` : '';
      }
      case 'table': {
        const headers: string[] = [];
        el.querySelectorAll('thead th, thead td, tr:first-child th').forEach((th) => {
          headers.push(th.textContent?.trim() || '');
        });

        const rows: string[][] = [];
        const bodyRows = el.querySelectorAll('tbody tr, tr:not(:first-child)');
        bodyRows.forEach((tr) => {
          const cells: string[] = [];
          tr.querySelectorAll('td').forEach((td) => {
            cells.push(td.textContent?.trim() || '');
          });
          if (cells.length > 0) rows.push(cells);
        });

        if (headers.length === 0 && rows.length > 0) {
          return `\n\n${html}\n\n`;
        }

        const headLine = `| ${headers.join(' | ')} |`;
        const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
        const rowsLines = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');

        return `\n\n${headLine}\n${sepLine}\n${rowsLines}\n\n`;
      }
      case 'div': {
        if (el.dataset.variant || el.classList.contains('callout-box')) {
          const variant = el.dataset.variant || 'info';
          const title = el.dataset.title || el.querySelector('.callout-title')?.textContent || '';
          const bodyEl = el.querySelector('.callout-body');
          const body = bodyEl ? Array.from(bodyEl.childNodes).map(nodeToMd).join('') : inner;
          const titleAttr = title ? ` title="${title}"` : '';
          return `\n\n[callout:${variant}${titleAttr}]\n${body.trim()}\n[/callout]\n\n`;
        }
        return `\n${inner}\n`;
      }
      case 'ul': {
        const items = Array.from(el.querySelectorAll(':scope > li')).map(
          (li) => `- ${Array.from(li.childNodes).map(nodeToMd).join('').trim()}`
        );
        return `\n\n${items.join('\n')}\n\n`;
      }
      case 'ol': {
        const items = Array.from(el.querySelectorAll(':scope > li')).map(
          (li, idx) => `${idx + 1}. ${Array.from(li.childNodes).map(nodeToMd).join('').trim()}`
        );
        return `\n\n${items.join('\n')}\n\n`;
      }
      case 'li':
        return inner;
      default:
        return inner;
    }
  }

  const result = Array.from(container.childNodes).map(nodeToMd).join('');
  return result.replace(/\n{3,}/g, '\n\n').trim();
}
