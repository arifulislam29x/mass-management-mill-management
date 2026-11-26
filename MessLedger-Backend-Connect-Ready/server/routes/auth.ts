import { Router } from 'express';
import { z } from 'zod';
import { db, recordAuditLog } from '../db.ts';
import {
  type AuthenticatedRequest,
  createRateLimiter,
  createSession,
  getClientIp,
  getEnvAdminConfig,
  hasAnyAdmin,
  hashPassword,
  requireAdmin,
  verifyPassword,
} from '../security.ts';

export const authRouter = Router();

const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 15,
  keyPrefix: 'auth',
});

const setupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username too long')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, dot, underscore, hyphen'),
  displayName: z.string().trim().min(2).max(60).optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

authRouter.get('/status', (_req, res) => {
  const envConfigured = Boolean(getEnvAdminConfig());
  const needsSetup = !envConfigured && !hasAnyAdmin();
  res.json({
    needsSetup,
    envConfigured,
  });
});

authRouter.post('/setup', authRateLimit, (req, res) => {
  if (getEnvAdminConfig()) {
    res.status(403).json({
      error: 'Admin credentials are managed via server environment variables.',
    });
    return;
  }

  if (hasAnyAdmin()) {
    res.status(403).json({
      error: 'Admin account has already been claimed. Please log in.',
    });
    return;
  }

  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid setup input' });
    return;
  }

  const { username, displayName, password } = parsed.data;
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';

  const result = db.transaction(() => {
    if (hasAnyAdmin()) {
      return null;
    }
    const passwordHash = hashPassword(password);
    const info = db
      .prepare(
        `INSERT INTO admins (username, display_name, password_hash, role, is_active, last_login_at)
         VALUES (?, ?, ?, 'admin', 1, datetime('now'))`
      )
      .run(username, displayName || 'Mess Administrator', passwordHash);

    const adminId = Number(info.lastInsertRowid);
    recordAuditLog({
      adminId,
      adminUsername: username,
      action: 'SETUP',
      entityType: 'admin',
      entityId: adminId,
      summary: `Initial admin account '${username}' claimed`,
      ipAddress: ip,
    });
    return adminId;
  })();

  if (!result) {
    res.status(403).json({ error: 'Admin account already exists.' });
    return;
  }

  const session = createSession(result, ip, String(ua));
  res.status(201).json({
    token: session.token,
    expiresAt: session.expiresAt,
    admin: {
      id: result,
      username,
      displayName: displayName || 'Mess Administrator',
      role: 'admin',
    },
  });
});

authRouter.post('/login', authRateLimit, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const { username, password } = parsed.data;
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';

  const envCfg = getEnvAdminConfig();
  if (envCfg && username.toLowerCase() === envCfg.username.toLowerCase()) {
    if (password !== envCfg.password) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
  }

  const admin = db
    .prepare(
      `SELECT id, username, display_name, password_hash, role, is_active
       FROM admins
       WHERE username = ?`
    )
    .get(username) as
    | {
        id: number;
        username: string;
        display_name: string;
        password_hash: string;
        role: string;
        is_active: number;
      }
    | undefined;

  if (!admin || admin.is_active !== 1 || !verifyPassword(password, admin.password_hash)) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  db.prepare(`UPDATE admins SET last_login_at = datetime('now') WHERE id = ?`).run(admin.id);
  recordAuditLog({
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'LOGIN',
    entityType: 'admin',
    entityId: admin.id,
    summary: `Admin '${admin.username}' logged in`,
    ipAddress: ip,
  });

  const session = createSession(admin.id, ip, String(ua));
  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    admin: {
      id: admin.id,
      username: admin.username,
      displayName: admin.display_name,
      role: admin.role,
    },
  });
});

authRouter.get('/me', requireAdmin, (req: AuthenticatedRequest, res) => {
  res.json({ admin: req.admin });
});

authRouter.post('/logout', requireAdmin, (req: AuthenticatedRequest, res) => {
  if (req.sessionTokenHash) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionTokenHash);
  }
  res.json({ ok: true });
});

authRouter.post('/password', requireAdmin, (req: AuthenticatedRequest, res) => {
  if (getEnvAdminConfig()) {
    res.status(403).json({
      error: 'Admin password is managed by server environment variables and cannot be changed here.',
    });
    return;
  }

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password input' });
    return;
  }

  const adminId = req.admin!.id;
  const row = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(adminId) as
    | { password_hash: string }
    | undefined;

  if (!row || !verifyPassword(parsed.data.currentPassword, row.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect' });
    return;
  }

  const newHash = hashPassword(parsed.data.newPassword);
  db.prepare(
    `UPDATE admins SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(newHash, adminId);

  recordAuditLog({
    adminId,
    adminUsername: req.admin!.username,
    action: 'UPDATE',
    entityType: 'admin_password',
    entityId: adminId,
    summary: 'Admin password updated',
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true });
});
