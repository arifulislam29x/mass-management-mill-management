import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export interface AuthenticatedAdmin {
  id: number;
  username: string;
  displayName: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  admin?: AuthenticatedAdmin;
  sessionTokenHash?: string;
}

const SESSION_TTL_HOURS = 12;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(
  adminId: number,
  ipAddress: string,
  userAgent: string
): { token: string; expiresAt: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  db.prepare(
    `DELETE FROM sessions WHERE expires_at <= datetime('now')`
  ).run();

  db.prepare(
    `INSERT INTO sessions (token_hash, admin_id, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`
  ).run(tokenHash, adminId, expiresAt, ipAddress, userAgent.slice(0, 200));

  return { token: rawToken, expiresAt };
}

export function getEnvAdminConfig(): { username: string; password: string } | null {
  const envPass = process.env.ADMIN_PASSWORD?.trim();
  if (!envPass) return null;
  const envUser = process.env.ADMIN_USERNAME?.trim() || 'admin';
  return { username: envUser, password: envPass };
}

export function hasAnyAdmin(): boolean {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM admins WHERE is_active = 1').get() as {
    cnt: number;
  };
  return row.cnt > 0;
}

export function syncEnvAdminIfConfigured(): void {
  const envCfg = getEnvAdminConfig();
  if (!envCfg) return;

  const existing = db
    .prepare('SELECT id, password_hash FROM admins WHERE username = ?')
    .get(envCfg.username) as { id: number; password_hash: string } | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO admins (username, display_name, password_hash, role, is_active)
       VALUES (?, 'Mess Administrator', ?, 'admin', 1)`
    ).run(envCfg.username, hashPassword(envCfg.password));
  } else if (!verifyPassword(envCfg.password, existing.password_hash)) {
    db.prepare(
      `UPDATE admins SET password_hash = ?, is_active = 1, updated_at = datetime('now') WHERE id = ?`
    ).run(hashPassword(envCfg.password), existing.id);
  }
}

export function getClientIp(req: Request): string {
  // Express derives req.ip using the configured trusted-proxy boundary.
  // Do not read X-Forwarded-For directly: clients can spoof it when the app is
  // reachable without a trusted reverse proxy, bypassing IP-based rate limits.
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token || token.length < 32) {
    res.status(401).json({ error: 'Invalid session token' });
    return;
  }

  const tokenHash = hashSessionToken(token);
  const row = db
    .prepare(
      `SELECT s.token_hash, s.expires_at, a.id, a.username, a.display_name, a.role, a.is_active
       FROM sessions s
       JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        token_hash: string;
        expires_at: string;
        id: number;
        username: string;
        display_name: string;
        role: string;
        is_active: number;
      }
    | undefined;

  if (!row || row.is_active !== 1) {
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    res.status(401).json({ error: 'Session expired' });
    return;
  }

  if (row.role !== 'admin') {
    res.status(403).json({ error: 'Admin privileges required' });
    return;
  }

  req.admin = {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
  };
  req.sessionTokenHash = tokenHash;
  next();
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();
    const existing = rateBuckets.get(key);

    if (!existing || existing.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.maxRequests) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Too many requests. Please wait before trying again.',
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    existing.count += 1;
    next();
  };
}

export function isValidSafePhotoUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed.length <= 700_000;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function monthKeyFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
