import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

// Завантаження змінних із .env з пріоритетом (перезапис застарілих системних змінних)
dotenv.config({ override: true });

// Очищення рядка підключення: автоматично витягує чистий postgresql://...
export function cleanConnectionString(raw?: string): string | undefined {
  if (!raw) return undefined;
  const str = raw.trim();

  const match = str.match(/postgres(?:ql)?:\/\/[^\s"'`]+/i);
  if (match) {
    let extracted = match[0].trim();
    extracted = extracted.replace(/[;"'`\\]+$/, '').trim();
    return extracted;
  }

  return undefined;
}

// Перевірка сумісності з HTTP-клієнтом Neon (відсікає несумісні raw-TCP хости на зразок vercel-storage)
export function isCompatibleNeonUrl(url?: string): boolean {
  if (!url) return false;
  if (url.includes('vercel-storage.com')) return false;
  return true;
}

// Отримання клієнта Neon (виключно зі змінних середовища)
export function getNeonSql(): any | null {
  // Оновлюємо змінні з .env на випадок динамічних змін
  try {
    dotenv.config({ override: true });
  } catch {}

  const candidateKeys = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_URL_NO_SSL',
  ] as const;

  let connectionString: string | undefined;

  // Спочатку шукаємо повністю сумісний URL (наприклад, *.neon.tech)
  for (const k of candidateKeys) {
    const val = cleanConnectionString(process.env[k]);
    if (val && isCompatibleNeonUrl(val)) {
      connectionString = val;
      break;
    }
  }

  // Якщо не знайдено сумісного, пробуємо будь-який вказаний
  if (!connectionString) {
    for (const k of candidateKeys) {
      const val = cleanConnectionString(process.env[k]);
      if (val) {
        connectionString = val;
        break;
      }
    }
  }

  // Якщо рядок передано через окремі змінні PGHOST / PGUSER
  if (!connectionString && process.env.PGUSER && process.env.PGHOST && process.env.PGDATABASE) {
    const user = process.env.PGUSER;
    const pass = process.env.PGPASSWORD || '';
    const host = process.env.PGHOST;
    const db = process.env.PGDATABASE;
    connectionString = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/${db}?sslmode=require`;
  }

  if (!connectionString) {
    return null;
  }

  try {
    return neon(connectionString);
  } catch (err) {
    console.warn('Neon client initialization error:', err);
    return null;
  }
}

// Безпечне виконання SQL-запиту з тайм-аутом (запобігає зависанню Vercel Serverless Function)
export async function safeExecuteSql<T = any>(
  sqlFn: (sql: any) => Promise<T>,
  timeoutMs: number = 3500
): Promise<T | null> {
  const sql = getNeonSql();
  if (!sql) return null;

  try {
    const result = await Promise.race([
      sqlFn(sql),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('SQL query timeout')), timeoutMs)
      ),
    ]);
    return result;
  } catch (err) {
    console.warn('Safe SQL query execution warning:', err);
    return null;
  }
}
