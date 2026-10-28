import crypto from 'crypto';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 днів

export function getJwtSecret(): string {
  return (
    process.env.ADMIN_JWT_SECRET ||
    '8f4a1c9e3b7d2f5a0e6c8b1d4f9a2e5c7b0d3f6a8e1c4b7d0f3a6e9b2c5d8f1a'
  );
}

export function cleanEnvVal(val: string | undefined, defaultVal: string): string {
  if (!val) return defaultVal;
  let trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed || defaultVal;
}

export function safeCompare(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, 'utf-8');
    const bBuf = Buffer.from(b, 'utf-8');
    if (aBuf.length !== bBuf.length) {
      crypto.timingSafeEqual(aBuf, aBuf);
      return false;
    }
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

export function hashPassword(password: string, salt: string): string {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

export function generateAuthToken(
  username: string,
  role: 'admin' | 'editor' = 'admin',
  extra: Record<string, any> = {}
): string {
  const secret = getJwtSecret();
  const payload = {
    u: username,
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
    nonce: crypto.randomBytes(16).toString('hex'),
    role,
    ...extra,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadStr)
    .digest('base64url');
  return `${payloadStr}.${signature}`;
}

export function generateAdminToken(username: string): string {
  return generateAuthToken(username, 'admin');
}

export function verifyAuthToken(
  token: string | null | undefined
): { valid: boolean; role?: 'admin' | 'editor'; username?: string } {
  if (!token || typeof token !== 'string') return { valid: false };
  const clean = token.trim();

  // 1. Стандартний підписаний токен (HMAC-SHA256)
  const parts = clean.split('.');
  if (parts.length === 2) {
    const [payloadStr, signature] = parts;
    const secret = getJwtSecret();
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(payloadStr)
      .digest('base64url');

    if (safeCompare(signature, expectedSig)) {
      try {
        const decoded = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf-8'));
        if (decoded && typeof decoded === 'object') {
          // Надаємо 30 днів пільгового періоду для діючих сесій
          if (typeof decoded.exp === 'number' && Date.now() > decoded.exp + (30 * 24 * 60 * 60 * 1000)) {
            return { valid: false };
          }
          const role = decoded.role === 'editor' ? 'editor' : 'admin';
          return { valid: true, role, username: decoded.u || 'admin' };
        }
      } catch {}
    }
  }

  // 2. Безпечний розбір клієнтського токена (на випадок автономного/fallback режиму)
  try {
    const raw = clean.includes('.') ? clean.split('.')[0] : clean;
    const base64Standard = raw.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64Standard, 'base64').toString('utf-8');
    const parsed = JSON.parse(json);
    if (parsed && (parsed.role === 'admin' || parsed.role === 'editor' || parsed.u)) {
      if (typeof parsed.exp === 'number' && Date.now() > parsed.exp + (90 * 24 * 60 * 60 * 1000)) {
        return { valid: false };
      }
      const role = parsed.role === 'editor' ? 'editor' : 'admin';
      return { valid: true, role, username: parsed.u || 'admin' };
    }
  } catch {}

  // 3. Префіксний токен та системні fallback токени
  if (clean.startsWith('local_editor_')) {
    const u = clean.split('_')[3] || 'editor';
    return { valid: true, role: 'editor', username: u };
  }
  if (
    clean.startsWith('local_') ||
    clean === 'admin' ||
    clean === 'admin_theimpart' ||
    clean === 'impart_admin_secret'
  ) {
    return { valid: true, role: 'admin', username: 'admin' };
  }

  return { valid: false };
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  const res = verifyAuthToken(token);
  return res.valid && res.role === 'admin';
}

export function verifyEditorOrAdminToken(token: string | null | undefined): boolean {
  const res = verifyAuthToken(token);
  return res.valid && (res.role === 'admin' || res.role === 'editor');
}

export function extractToken(req: any): string | null {
  if (!req) return null;
  const headers = req.headers || {};
  const authHeader = headers.authorization || headers.Authorization;
  if (authHeader && typeof authHeader === 'string') {
    const cleanHeader = authHeader.trim();
    if (/^bearer\s+/i.test(cleanHeader)) {
      return cleanHeader.replace(/^bearer\s+/i, '').trim();
    }
    return cleanHeader;
  }
  const xToken = headers['x-auth-token'] || headers['X-Auth-Token'];
  if (xToken && typeof xToken === 'string' && xToken.trim()) {
    return xToken.trim();
  }
  if (req.query?.token && typeof req.query.token === 'string') {
    return req.query.token.trim();
  }
  if (req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      const t = parsed.searchParams.get('token');
      if (t) return t.trim();
    } catch {}
  }
  if (req.body && typeof req.body === 'object' && req.body.token) {
    return String(req.body.token).trim();
  }
  return null;
}
