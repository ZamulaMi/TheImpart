import fs from 'fs';
import path from 'path';
import { initResponseHelpers } from './_helpers.ts';
import { fetchArticlesStrict, SitemapDatabaseError } from './sitemap.ts';
import {
  hasPublishedUkrainianVersion,
  hasPublishedEnglishVersion,
} from '../src/utils/seo.ts';

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/avif',
]);

function extractArticleId(req: any): string | null {
  if (req?.params?.id) {
    return String(req.params.id).trim();
  }
  if (req?.query?.id) {
    return String(Array.isArray(req.query.id) ? req.query.id[0] : req.query.id).trim();
  }
  if (typeof req?.url === 'string') {
    const coverMatch = req.url.match(/\/uploads\/cover-([^?#/]+)/i);
    if (coverMatch) {
      return decodeURIComponent(coverMatch[1]).trim();
    }
  }
  return null;
}

export default async function handler(req: any, res: any) {
  initResponseHelpers(res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return res.status(405).end();
  }

  const articleId = extractArticleId(req);
  if (!articleId) {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    return res.status(404).send('Not Found');
  }

  try {
    const articles = await fetchArticlesStrict();
    const article = articles.find((a) => String(a.id) === articleId);

    const isPublic =
      article &&
      (hasPublishedUkrainianVersion(article) || hasPublishedEnglishVersion(article));

    if (!article || !isPublic || !article.coverImage) {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      return res.status(404).send('Not Found');
    }

    const cover = article.coverImage.trim();

    // 1. Декодування Base64 data:image/* у бінарну HTTP-відповідь для пошукових роботів та браузера
    const dataUriMatch = cover.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
    if (dataUriMatch) {
      const rawMime = dataUriMatch[1].toLowerCase();
      const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
      if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
        res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        return res.status(415).send('Unsupported Media Type');
      }

      const binary = Buffer.from(dataUriMatch[2], 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', String(binary.length));
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');

      if (req.method === 'HEAD') {
        return res.status(200).end();
      }
      return res.status(200).send(binary);
    }

    // 2. Якщо обкладинка вказує на зовнішній HTTPS URL
    if (cover.startsWith('https://') || cover.startsWith('http://')) {
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      res.setHeader('Location', cover);
      return res.status(302).end();
    }

    // 3. Якщо це локальний файл у /data/uploads
    if (cover.startsWith('/uploads/') && !cover.startsWith('/uploads/cover-')) {
      const relativeFile = path.basename(cover);
      const localPath = path.resolve(process.cwd(), 'data', 'uploads', relativeFile);
      if (fs.existsSync(localPath)) {
        const ext = path.extname(localPath).toLowerCase();
        const extMime =
          ext === '.webp'
            ? 'image/webp'
            : ext === '.png'
            ? 'image/png'
            : ext === '.gif'
            ? 'image/gif'
            : ext === '.svg'
            ? 'image/svg+xml'
            : 'image/jpeg';
        const fileBuffer = fs.readFileSync(localPath);
        res.setHeader('Content-Type', extMime);
        res.setHeader('Content-Length', String(fileBuffer.length));
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
        if (req.method === 'HEAD') {
          return res.status(200).end();
        }
        return res.status(200).send(fileBuffer);
      }
    }

    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    return res.status(404).send('Not Found');
  } catch (err) {
    console.error('[article-image] Error serving cover image:', err);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (err instanceof SitemapDatabaseError) {
      res.setHeader('Retry-After', '60');
      return res.status(503).send('Service Unavailable');
    }
    return res.status(500).send('Internal Server Error');
  }
}
