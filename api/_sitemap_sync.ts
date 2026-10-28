import fs from 'fs';
import path from 'path';
import { getArticles } from './articles.ts';
import { fetchSitemapSourceData, collectSitemapEntries, buildSitemapDocuments } from './sitemap.ts';
import { collectNewsSitemapEntries, renderNewsSitemapXml } from './news-sitemap.ts';
import { invalidateSitemapCache } from './_sitemap_cache.ts';

/**
 * Автоматична генерація та синхронізація фізичних файлів sitemap.xml та news-sitemap.xml
 * на диску (public/, dist/ та /tmp), а також інвалідація серверного кешу.
 */
export async function syncSitemapFilesToDisk(): Promise<{
  sitemapEntriesCount: number;
  newsEntriesCount: number;
} | null> {
  try {
    const sourceData = await fetchSitemapSourceData();
    const sitemapEntries = collectSitemapEntries(sourceData);
    const docs = buildSitemapDocuments(sitemapEntries);

    const articles = await getArticles();
    const newsEntries = collectNewsSitemapEntries(articles);
    const newsXml = renderNewsSitemapXml(newsEntries);

    invalidateSitemapCache();

    const cwd = process.cwd();
    const publicDir = path.resolve(cwd, 'public');
    const distDir = path.resolve(cwd, 'dist');
    const tmpDir = '/tmp';

    const sitemapTargets = [
      path.join(publicDir, 'sitemap.xml'),
      path.join(tmpDir, 'sitemap.xml'),
    ];
    if (fs.existsSync(distDir)) {
      sitemapTargets.push(path.join(distDir, 'sitemap.xml'));
    }

    const newsTargets = [
      path.join(publicDir, 'news-sitemap.xml'),
      path.join(tmpDir, 'news-sitemap.xml'),
    ];
    if (fs.existsSync(distDir)) {
      newsTargets.push(path.join(distDir, 'news-sitemap.xml'));
    }

    for (const target of sitemapTargets) {
      try {
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(target, docs.rootXml, 'utf-8');
      } catch (e) {
        // Ігноруємо помилки доступу на read-only ФС
      }
    }

    if (docs.isIndex && docs.partsXml.length > 0) {
      docs.partsXml.forEach((partXml, idx) => {
        try {
          fs.writeFileSync(path.join(publicDir, `sitemap-${idx + 1}.xml`), partXml, 'utf-8');
          fs.writeFileSync(path.join(tmpDir, `sitemap-${idx + 1}.xml`), partXml, 'utf-8');
          if (fs.existsSync(distDir)) {
            fs.writeFileSync(path.join(distDir, `sitemap-${idx + 1}.xml`), partXml, 'utf-8');
          }
        } catch {}
      });
    }

    for (const target of newsTargets) {
      try {
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(target, newsXml, 'utf-8');
      } catch (e) {
        // Ігноруємо помилки доступу на read-only ФС
      }
    }

    return {
      sitemapEntriesCount: sitemapEntries.length,
      newsEntriesCount: newsEntries.length,
    };
  } catch (err) {
    console.warn('[sitemap-sync] Notice during auto-updating sitemaps:', err);
    return null;
  }
}

/**
 * Асинхронний виклик оновлення sitemap без блокування основної відповіді API
 */
export function triggerSitemapAutoUpdate(): void {
  syncSitemapFilesToDisk().catch(() => {});
}
