/**
 * Допоміжні функції для серверних обробників API Vercel Serverless та Express.
 */

export function initResponseHelpers(res: any): void {
  if (!res) return;

  if (typeof res.status !== 'function') {
    res.status = function (code: number) {
      this.statusCode = code;
      return this;
    };
  }

  if (typeof res.json !== 'function') {
    res.json = function (data: any) {
      try {
        if (!this.headersSent) {
          this.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
      } catch {}
      this.end(JSON.stringify(data));
      return this;
    };
  }
}

export async function parseRequestBody(req: any): Promise<any> {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return {};
  }

  // 1. Вже розпарсений об'єкт
  if (req.body && typeof req.body === 'object') {
    if (Buffer.isBuffer(req.body)) {
      try {
        return JSON.parse(req.body.toString('utf-8'));
      } catch {
        return {};
      }
    }
    return req.body;
  }

  // 2. Рядок JSON або form-urlencoded
  if (req.body && typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      try {
        const params = new URLSearchParams(req.body);
        const obj: Record<string, any> = {};
        params.forEach((v, k) => {
          obj[k] = v;
        });
        return obj;
      } catch {
        return {};
      }
    }
  }

  // 3. Читання з потоку (stream)
  if (typeof req.on === 'function' && !req.readableEnded && req.readable) {
    try {
      const raw = await new Promise<string>((resolve) => {
        let buf = '';
        req.on('data', (chunk: any) => {
          buf += chunk;
        });
        req.on('end', () => resolve(buf));
        req.on('error', () => resolve(''));
        setTimeout(() => resolve(buf), 1000);
      });
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch {
          try {
            const params = new URLSearchParams(raw);
            const obj: Record<string, any> = {};
            params.forEach((v, k) => {
              obj[k] = v;
            });
            return obj;
          } catch {
            return {};
          }
        }
      }
    } catch {}
  }

  return {};
}
