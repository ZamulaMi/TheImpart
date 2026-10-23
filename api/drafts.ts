import fs from 'fs';
import path from 'path';
import { safeExecuteSql } from './_db.ts';
import {
  verifyAdminToken,
  verifyEditorOrAdminToken,
  verifyAuthToken,
  extractToken,
} from './_auth_utils.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';
import { saveArticle, deleteArticle } from './articles.ts';

export interface ArticleDraft {
  id: string;
  type: 'new' | 'update';
  articleId?: string;
  originalArticleTitle?: string;
  authorUsername: string;
  authorDisplayName: string;
  articleData: any;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  moderatorNote?: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DRAFTS_FILE = path.join(DATA_DIR, 'drafts.json');
const DRAFTS_TMP_FILE = '/tmp/impart_drafts.json';

function readDraftsFromFile(): ArticleDraft[] {
  const paths = [DRAFTS_TMP_FILE, DRAFTS_FILE];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      }
    } catch {}
  }
  return [];
}

function writeDraftsToFile(drafts: ArticleDraft[]): void {
  const payload = JSON.stringify(drafts, null, 2);
  try {
    fs.writeFileSync(DRAFTS_TMP_FILE, payload, 'utf-8');
  } catch {}
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DRAFTS_FILE, payload, 'utf-8');
  } catch {}
}

let inMemoryDrafts: ArticleDraft[] = readDraftsFromFile();
let isDraftsLoaded = false;

export async function ensureDraftsLoaded(): Promise<ArticleDraft[]> {
  if (isDraftsLoaded && inMemoryDrafts.length > 0) return inMemoryDrafts;

  try {
    const rows = await safeExecuteSql(async (sql) => {
      await sql`
        CREATE TABLE IF NOT EXISTS site_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;
      const settingsKey = 'article_drafts';
      return await sql`SELECT value FROM site_settings WHERE key = ${settingsKey} LIMIT 1;`;
    }, 2500);

    if (rows && rows.length > 0 && rows[0].value) {
      const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      if (Array.isArray(parsed)) {
        inMemoryDrafts = parsed;
        writeDraftsToFile(parsed);
        isDraftsLoaded = true;
        return inMemoryDrafts;
      }
    }
  } catch (err) {
    console.warn('Could not read article_drafts from PostgreSQL (fallback active):', err);
  }

  const fromFile = readDraftsFromFile();
  if (fromFile && fromFile.length > 0) {
    inMemoryDrafts = fromFile;
  }
  isDraftsLoaded = true;
  return inMemoryDrafts;
}

export async function persistDrafts(drafts: ArticleDraft[]): Promise<void> {
  inMemoryDrafts = drafts;
  isDraftsLoaded = true;
  writeDraftsToFile(drafts);

  try {
    await safeExecuteSql(async (sql) => {
      const settingsKey = 'article_drafts';
      const jsonStr = JSON.stringify(drafts);
      await sql`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES (${settingsKey}, ${jsonStr}, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
      `;
    }, 3000);
  } catch (err) {
    console.warn('Could not persist article_drafts to PostgreSQL:', err);
  }
}

export async function getDrafts(): Promise<ArticleDraft[]> {
  return await ensureDraftsLoaded();
}

export async function saveDraft(draft: ArticleDraft): Promise<ArticleDraft> {
  const drafts = await ensureDraftsLoaded();
  const existingIdx = drafts.findIndex((d) => d.id === draft.id);

  const updatedDraft: ArticleDraft = {
    ...draft,
    updatedAt: new Date().toISOString(),
  };

  let updatedList: ArticleDraft[];
  if (existingIdx >= 0) {
    updatedList = [...drafts];
    updatedList[existingIdx] = updatedDraft;
  } else {
    updatedList = [updatedDraft, ...drafts];
  }

  await persistDrafts(updatedList);
  return updatedDraft;
}

export async function deleteDraft(id: string): Promise<boolean> {
  const drafts = await ensureDraftsLoaded();
  const filtered = drafts.filter((d) => d.id !== id);
  await persistDrafts(filtered);
  return true;
}

export default async function draftsHandler(req: any, res: any) {
  initResponseHelpers(res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = extractToken(req);
  const auth = verifyAuthToken(token);

  if (!auth.valid) {
    return res.status(401).json({ error: 'Потрібна авторизація для доступу до чернеток' });
  }

  const isAdmin = auth.role === 'admin';
  const isEditor = auth.role === 'editor';
  const currentUsername = auth.username || '';

  try {
    // 1. GET - список чернеток
    if (req.method === 'GET') {
      const drafts = await ensureDraftsLoaded();
      // Адміністратор бачить усі чернетки; редактор бачить усі свої або загальні очікуючі
      return res.status(200).json(drafts);
    }

    // 2. POST / PUT - створення, збереження або модерація
    if (req.method === 'POST' || req.method === 'PUT') {
      let body = await parseRequestBody(req);
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: 'Недійсний JSON' });
        }
      }

      const action = body?.action || req.query?.action;

      // 2.1 Схвалення та публікація чорнетки (тільки адміністратор)
      if (action === 'approve') {
        if (!isAdmin) {
          return res.status(403).json({ error: 'Тільки адміністратор може схвалювати та публікувати чорнетки' });
        }

        const draftId = String(body?.draftId || body?.id || req.query?.id || '').trim();
        if (!draftId) {
          return res.status(400).json({ error: 'ID чорнетки обов\'язковий' });
        }

        const drafts = await ensureDraftsLoaded();
        const draft = drafts.find((d) => d.id === draftId);
        if (!draft) {
          return res.status(404).json({ error: 'Чорнетку не знайдено' });
        }

        // Публікуємо статтю в основну базу даних
        const articleToPublish = {
          ...draft.articleData,
          id: draft.type === 'update' && draft.articleId ? draft.articleId : (draft.articleData.id || Date.now().toString()),
          published: body?.published !== undefined ? Boolean(body.published) : (draft.articleData.published !== false),
          publishedEn: body?.publishedEn !== undefined ? Boolean(body.publishedEn) : Boolean(draft.articleData.publishedEn),
        };

        const saved = await saveArticle(articleToPublish);

        // Позначаємо чорнетку як схвалену або видаляємо її
        draft.status = 'approved';
        draft.updatedAt = new Date().toISOString();
        draft.moderatorNote = body?.moderatorNote || 'Схвалено та опубліковано адміністратором';
        await persistDrafts(drafts);

        return res.status(200).json({
          success: true,
          message: `Чорнетку «${saved.title}» успішно опубліковано!`,
          article: saved,
          draft,
        });
      }

      // 2.2 Відхилення чорнетки (тільки адміністратор)
      if (action === 'reject') {
        if (!isAdmin) {
          return res.status(403).json({ error: 'Тільки адміністратор може відхиляти чорнетки' });
        }

        const draftId = String(body?.draftId || body?.id || req.query?.id || '').trim();
        const note = String(body?.moderatorNote || 'Відхилено адміністратором').trim();

        const drafts = await ensureDraftsLoaded();
        const draft = drafts.find((d) => d.id === draftId);
        if (!draft) {
          return res.status(404).json({ error: 'Чорнетку не знайдено' });
        }

        draft.status = 'rejected';
        draft.moderatorNote = note;
        draft.updatedAt = new Date().toISOString();
        await persistDrafts(drafts);

        return res.status(200).json({
          success: true,
          message: 'Чорнетку відхилено.',
          draft,
        });
      }

      // 2.3 Створення або оновлення чорнетки (редактор або адміністратор)
      const articleData = body?.articleData || body;
      if (!articleData || !articleData.title || !String(articleData.title).trim()) {
        return res.status(400).json({ error: 'Заголовок статті є обов\'язковим для створення чорнетки' });
      }

      const draftId = body?.id || `draft-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const type: 'new' | 'update' = body?.type === 'update' ? 'update' : (body?.articleId ? 'update' : 'new');
      const articleId = body?.articleId || (type === 'update' ? articleData.id : undefined);

      const newDraft: ArticleDraft = {
        id: draftId,
        type,
        articleId,
        originalArticleTitle: body?.originalArticleTitle || (type === 'update' ? articleData.title : undefined),
        authorUsername: currentUsername || 'editor',
        authorDisplayName: body?.authorDisplayName || (isAdmin ? 'Адміністратор' : currentUsername || 'Редактор'),
        articleData: {
          ...articleData,
          id: articleData.id || Date.now().toString(),
        },
        createdAt: body?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'pending',
        moderatorNote: body?.moderatorNote,
      };

      const savedDraft = await saveDraft(newDraft);

      return res.status(200).json({
        success: true,
        message: 'Чорнетку успішно збережено та надіслано на розгляд',
        draft: savedDraft,
      });
    }

    // 3. DELETE - видалення чорнетки
    if (req.method === 'DELETE') {
      const id = String(req.query?.id || req.body?.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'ID чорнетки є обов\'язковим' });
      }

      const drafts = await ensureDraftsLoaded();
      const draft = drafts.find((d) => d.id === id);
      if (!draft) {
        return res.status(404).json({ error: 'Чорнетку не знайдено' });
      }

      // Видаляти можуть адміністратор або автор чорнетки
      if (!isAdmin && draft.authorUsername !== currentUsername) {
        return res.status(403).json({ error: 'Ви можете видаляти лише власні чорнетки' });
      }

      await deleteDraft(id);
      return res.status(200).json({ success: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('API /api/drafts error:', err);
    return res.status(500).json({ error: err.message || 'Помилка сервера' });
  }
}
