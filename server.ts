import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import articlesHandler, { getArticles, sanitizePublicArticle } from './api/articles';
import settingsHandler, { getSocialLinks } from './api/settings';
import authHandler, { extractToken, verifyAdminToken } from './api/auth';
import draftsHandler, { getDrafts } from './api/drafts';
import pagesHandler, { getPages } from './api/_pages';
import taxonomiesHandler, { getTaxonomies } from './api/_taxonomies';
import categoriesHandler, { getNavCategories } from './api/_categories';
import statsHandler, { ensureStatsLoaded } from './api/stats';
import { verifyEditorOrAdminToken } from './api/_auth_utils';
import articleImageHandler from './api/_article_image';
import renderPageHandler, { generatePageResponse } from './api/render-page';
import sitemapHandler from './api/sitemap';
import newsSitemapHandler from './api/news-sitemap';
import { triggerSitemapAutoUpdate } from './api/_sitemap_sync';
import { ROBOTS_TXT_BODY } from './api/_robots_txt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ override: true });

// Завантаження збереженої статистики з Neon PostgreSQL при запуску сервера
ensureStatsLoaded().catch(() => {});

// Автоматична синхронізація sitemap.xml та news-sitemap.xml на диску та в кеші при старті
triggerSitemapAutoUpdate();
// Регулярна синхронізація щогодини (для актуалізації 48-годинного вікна Google News sitemap)
setInterval(() => {
  triggerSitemapAutoUpdate();
}, 60 * 60 * 1000);

const app = express();
const PORT = 3000;

// Логування всіх запитів для відстеження
const logFile = '/tmp/server_requests.log';
app.use((req, res, next) => {
  const logLine = `[${new Date().toISOString()}] ${req.method} ${req.url} | Host: ${req.headers.host} | Origin: ${req.headers.origin}\n`;
  try {
    fs.appendFileSync(logFile, logLine);
  } catch {}
  next();
});

// CORS та preflight-запити
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Підтримка великих текстів та зображень (до 50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Обслуговування іконок сайту (favicon.svg та favicon.ico)
app.get('/favicon.svg', (_req, res) => {
  const filePath = path.join(__dirname, 'public', 'favicon.svg');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(filePath);
  }
  res.status(404).end();
});

app.get('/favicon.ico', (_req, res) => {
  const filePath = path.join(__dirname, 'public', 'favicon.ico');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'image/x-icon');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(filePath);
  }
  res.status(404).end();
});

// Обслуговування robots.txt
app.all(['/robots.txt'], (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
  return res.status(200).send(ROBOTS_TXT_BODY);
});

// Динамічна генерація sitemap.xml (та секцій sitemap-N.xml при перевищенні лімітів одного файлу)
app.all([/^\/sitemap(?:-(\d+))?\.xml$/i, '/api/sitemap'], async (req, res) => {
  try {
    await sitemapHandler(req, res);
  } catch (err) {
    console.error('Express /sitemap.xml error:', err);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Retry-After', '120');
      return res.status(503).send('Service Unavailable');
    }
  }
});

// Динамічна генерація news-sitemap.xml для Google News (останні 48 годин, лише опубліковані новини)
app.all([/^\/news-sitemap(?:-([a-zA-Z-]+))?\.xml$/i, '/api/news-sitemap'], async (req, res) => {
  try {
    await newsSitemapHandler(req, res);
  } catch (err) {
    console.error('Express /news-sitemap.xml error:', err);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Retry-After', '120');
      return res.status(503).send('Service Unavailable');
    }
  }
});

// Підключення API ендпоінту серверного рендерингу сторінок та метаданих статей
app.all(['/api/article-meta', '/api/article-meta/*', '/api/render-page', '/api/render-page/*'], async (req, res) => {
  try {
    await renderPageHandler(req, res);
  } catch (err: any) {
    res.status(503).send('Service Unavailable');
  }
});

// Підключення API ендпоінту бінарних обкладинок статей
app.all(['/api/article-image', '/api/article-image/*'], async (req, res) => {
  try {
    await articleImageHandler(req, res);
  } catch (err: any) {
    res.status(503).send('Service Unavailable');
  }
});

// Підключення API ендпоінту статей (з та без слешу, підшляхи)
app.all(['/api/articles', '/api/articles/*'], async (req, res) => {
  try {
    await articlesHandler(req, res);
  } catch (err: any) {
    console.warn('Express /api/articles fallback active:', err);
    if (!res.headersSent) {
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        return res.status(500).json({ error: 'Помилка збереження статті на сервері: ' + (err?.message || err) });
      }
      try {
        const token = extractToken(req);
        const isStaff = Boolean(token && verifyEditorOrAdminToken(token));
        const data = await getArticles();
        res.setHeader('Vary', 'Authorization');
        if (isStaff) {
          res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
          return res.status(200).json(data);
        }
        res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        return res.status(200).json(data.map(sanitizePublicArticle).filter(Boolean));
      } catch {
        return res.status(503).json({ error: 'Сервіс статей тимчасово недоступний' });
      }
    }
  }
});

// Підключення API ендпоінту чернеток редакторів
app.all(['/api/drafts', '/api/drafts/*'], async (req, res) => {
  try {
    await draftsHandler(req, res);
  } catch (err: any) {
    console.warn('Express /api/drafts fallback active:', err);
    if (!res.headersSent) {
      try {
        const data = await getDrafts();
        return res.status(200).json(data);
      } catch {
        return res.status(200).json([]);
      }
    }
  }
});

// Підключення API ендпоінту автентифікації
app.all(['/api/auth', '/api/auth/*'], async (req, res) => {
  try {
    await authHandler(req, res);
  } catch (err: any) {
    console.error('Express /api/auth error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Помилка сервера автентифікації' });
    }
  }
});

// Динамічні HTTPS-обкладинки для статей із Base64 (доступні для Googlebot через /uploads/cover-:id)
app.get('/uploads/cover-:id', async (req, res) => {
  await articleImageHandler(req, res);
});
app.head('/uploads/cover-:id', async (req, res) => {
  await articleImageHandler(req, res);
});

// Роздача завантажених файлів (зображень)
const uploadsDir = path.resolve(__dirname, 'data/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

// Ендпоінт для завантаження зображень (збереження на сервері) — дозволено адміністраторам та редакторам
app.post('/api/upload', (req, res) => {
  try {
    // 1. Перевірка авторизації (адміністратор або редактор)
    const token = extractToken(req);
    if (!verifyEditorOrAdminToken(token)) {
      return res.status(401).json({ error: 'Потрібна авторизація для завантаження медіа' });
    }

    const { data, filename } = req.body || {};
    if (!data || typeof data !== 'string') {
      return res.status(400).json({ error: 'Зображення не передано' });
    }

    const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      // Якщо це вже зовнішній URL
      if (data.startsWith('http://') || data.startsWith('https://')) {
        return res.status(200).json({ url: data });
      }
      return res.status(400).json({ error: 'Недійсний формат зображення (очікується Base64 або URL)' });
    }

    const mimeType = matches[1].toLowerCase();
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowedMimes.includes(mimeType)) {
      return res.status(400).json({ error: 'Дозволені лише формати зображень: JPEG, PNG, WebP, GIF, SVG' });
    }

    const base64Data = matches[2];
    // Обмеження розміру: максимум 20MB
    const estimatedBytes = (base64Data.length * 3) / 4;
    if (estimatedBytes > 20 * 1024 * 1024) {
      return res.status(413).json({ error: 'Розмір зображення не повинен перевищувати 20MB' });
    }

    let ext = 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('gif')) ext = 'gif';
    else if (mimeType.includes('svg')) ext = 'svg';

    const cleanName = (filename || 'image').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const saveName = `${Date.now()}_${cleanName}.${ext}`;
    const filePath = path.join(uploadsDir, saveName);

    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return res.status(200).json({
      url: `/uploads/${saveName}`,
      filename: saveName,
    });
  } catch (err: any) {
    console.error('Upload error in server:', err);
    return res.status(500).json({ error: 'Помилка збереження файлу на сервері' });
  }
});

// Підключення API ендпоінту налаштувань сайту (включаючи соц. мережі)
app.all(['/api/settings', '/api/settings/*'], async (req, res) => {
  try {
    await settingsHandler(req, res);
  } catch (err: any) {
    console.warn('Express /api/settings fallback active:', err);
    if (!res.headersSent) {
      try {
        const data = await getSocialLinks();
        return res.status(200).json(data);
      } catch {
        return res.status(200).json({});
      }
    }
  }
});

// Підключення API ендпоінту статичних сторінок ("Про проєкт", "Контакти")
app.all(['/api/pages', '/api/pages/*'], async (req, res) => {
  try {
    await pagesHandler(req, res);
  } catch (err: any) {
    console.warn('Express /api/pages fallback active:', err);
    if (!res.headersSent) {
      try {
        const data = await getPages();
        return res.status(200).json(data);
      } catch {
        return res.status(200).json({});
      }
    }
  }
});

// Підключення API ендпоінту таксономій (рубрики, теми)
app.all(['/api/taxonomies', '/api/taxonomies/*'], async (req, res) => {
  try {
    await taxonomiesHandler(req, res);
  } catch (err: any) {
    console.warn('Express /api/taxonomies fallback active:', err);
    if (!res.headersSent) {
      try {
        const data = await getTaxonomies();
        return res.status(200).json(data);
      } catch {
        return res.status(200).json({ categories: [], topics: [] });
      }
    }
  }
});

// Підключення API ендпоінту навігаційних категорій (для шапки сайту)
app.all(['/api/categories', '/api/categories/*'], async (req, res) => {
  try {
    await categoriesHandler(req, res);
  } catch (err: any) {
    console.warn('Express /api/categories fallback active:', err);
    if (!res.headersSent) {
      try {
        const data = await getNavCategories();
        return res.status(200).json(data);
      } catch {
        return res.status(200).json([]);
      }
    }
  }
});

// Підключення API ендпоінту статистики та переглядів статей
app.all(['/api/stats', '/api/stats/*'], async (req, res) => {
  try {
    await statsHandler(req, res);
  } catch (err: any) {
    console.error('Express /api/stats error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Помилка сервера статистики' });
    }
  }
});

// Ендпоінт визначення країни відвідувача (геолокація)
const POST_SOVIET_COUNTRIES = new Set([
  'UA', 'KZ', 'UZ', 'GE', 'AZ', 'AM', 'MD', 'KG', 'TJ', 'TM', 'BY', 'LT', 'LV', 'EE', 'RU'
]);

app.get('/api/geo', (req, res) => {
  try {
    const rawCountry =
      req.headers['x-client-geo-country'] ||
      req.headers['cf-ipcountry'] ||
      req.headers['x-appengine-country'] ||
      req.headers['cloudfront-viewer-country'] ||
      req.headers['x-country-code'] ||
      req.headers['x-geo-country'];

    const country = typeof rawCountry === 'string' ? rawCountry.trim().toUpperCase() : null;
    const isPostSoviet = country ? POST_SOVIET_COUNTRIES.has(country) : null;

    res.setHeader('Cache-Control', 'private, no-cache');
    return res.status(200).json({
      country,
      isPostSoviet,
    });
  } catch {
    return res.status(200).json({ country: null, isPostSoviet: null });
  }
});

// Обробка помилок парсингу JSON
app.use((err: any, _req: any, res: any, next: any) => {
  if (err) {
    console.warn('Express body parser notice:', err);
    return res.status(200).json({ success: true });
  }
  next();
});

function isViteOrStaticAssetRequest(pathname: string): boolean {
  if (
    pathname.startsWith('/@') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/node_modules/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/uploads/')
  ) {
    return true;
  }
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|css|map|json|svg|png|jpg|jpeg|webp|gif|avif|ico|woff|woff2|ttf|otf|webmanifest|wasm)$/i.test(
    pathname
  );
}

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });

    app.use(async (req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || isViteOrStaticAssetRequest(req.path)) {
        return next();
      }

      try {
        const rawIndex = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        const viteTemplate = await vite.transformIndexHtml(req.originalUrl, rawIndex);
        const rendered = await generatePageResponse(req, viteTemplate);
        for (const [k, v] of Object.entries(rendered.headers)) {
          res.setHeader(k, v);
        }
        if (req.method === 'HEAD') {
          return res.status(rendered.status).end();
        }
        return res.status(rendered.status).send(rendered.html);
      } catch (err) {
        console.error('Dev SSR render error:', err);
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    app.use(
      '/assets',
      express.static(path.resolve(__dirname, 'dist/assets'), {
        immutable: true,
        maxAge: '365d',
      })
    );
    app.use(
      express.static(path.resolve(__dirname, 'dist'), {
        index: false,
        maxAge: '1h',
      })
    );
    app.get('*', async (req, res) => {
      await renderPageHandler(req, res);
    });
    app.head('*', async (req, res) => {
      await renderPageHandler(req, res);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
