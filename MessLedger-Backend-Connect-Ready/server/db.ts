import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const configuredPath = process.env.DB_PATH?.trim();
const dbPath = configuredPath
  ? path.resolve(configuredPath)
  : path.resolve(process.cwd(), 'data', 'mess.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      photo_url TEXT DEFAULT '',
      join_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      meal_date TEXT NOT NULL,
      month_key TEXT NOT NULL,
      breakfast REAL NOT NULL DEFAULT 0 CHECK (breakfast >= 0),
      lunch REAL NOT NULL DEFAULT 0 CHECK (lunch >= 0),
      dinner REAL NOT NULL DEFAULT 0 CHECK (dinner >= 0),
      extra_meal REAL NOT NULL DEFAULT 0 CHECK (extra_meal >= 0),
      total_meal REAL NOT NULL DEFAULT 0 CHECK (total_meal >= 0),
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (member_id, meal_date),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bazar_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bazar_date TEXT NOT NULL,
      month_key TEXT NOT NULL,
      title TEXT NOT NULL,
      shopper_member_id INTEGER,
      shopper_name TEXT NOT NULL DEFAULT '',
      total_amount REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (shopper_member_id) REFERENCES members(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS bazar_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      quantity REAL NOT NULL CHECK (quantity > 0),
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      total_price REAL NOT NULL CHECK (total_price >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (transaction_id) REFERENCES bazar_transactions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS individual_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      month_key TEXT NOT NULL,
      expense_type TEXT NOT NULL DEFAULT 'individual' CHECK (expense_type IN ('individual', 'common')),
      member_id INTEGER,
      title TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount >= 0),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      deposit_date TEXT NOT NULL,
      month_key TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      payment_method TEXT NOT NULL DEFAULT 'cash',
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS monthly_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_key TEXT NOT NULL UNIQUE,
      is_closed INTEGER NOT NULL DEFAULT 0,
      closed_at TEXT,
      closed_by TEXT,
      total_members INTEGER NOT NULL DEFAULT 0,
      total_deposit REAL NOT NULL DEFAULT 0,
      total_bazar_expense REAL NOT NULL DEFAULT 0,
      total_common_extra_expense REAL NOT NULL DEFAULT 0,
      total_individual_expense REAL NOT NULL DEFAULT 0,
      total_meals REAL NOT NULL DEFAULT 0,
      meal_rate REAL NOT NULL DEFAULT 0,
      total_expense REAL NOT NULL DEFAULT 0,
      remaining_balance REAL NOT NULL DEFAULT 0,
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      admin_username TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT DEFAULT '',
      summary TEXT NOT NULL,
      details_json TEXT DEFAULT '{}',
      ip_address TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_meals_month_date ON meals(month_key, meal_date);
    CREATE INDEX IF NOT EXISTS idx_bazar_month_date ON bazar_transactions(month_key, bazar_date);
    CREATE INDEX IF NOT EXISTS idx_bazar_items_tx ON bazar_items(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_month ON individual_expenses(month_key, expense_date);
    CREATE INDEX IF NOT EXISTS idx_deposits_month ON deposits(month_key, deposit_date);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    -- Additive Group Management schema; existing ledger tables remain untouched.
    CREATE TABLE IF NOT EXISTS mess_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      group_name TEXT NOT NULL,
      mess_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      manager_name TEXT NOT NULL,
      profile_image TEXT NOT NULL DEFAULT '',
      owner_admin_id INTEGER NOT NULL,
      join_mode TEXT NOT NULL DEFAULT 'approval' CHECK (join_mode IN ('approval','instant')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(owner_admin_id) REFERENCES admins(id)
    );
    CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_id INTEGER,
      admin_id INTEGER,
      member_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','meal_manager','member')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','removed')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(group_id, member_id),
      UNIQUE(group_id, admin_id),
      FOREIGN KEY(group_id) REFERENCES mess_groups(id) ON DELETE CASCADE,
      FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS group_join_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      requester_name TEXT NOT NULL,
      requester_phone TEXT NOT NULL DEFAULT '',
      requester_email TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(group_id) REFERENCES mess_groups(id) ON DELETE CASCADE,
      FOREIGN KEY(reviewed_by) REFERENCES admins(id)
    );
    CREATE TABLE IF NOT EXISTS group_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      actor_admin_id INTEGER,
      action TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(group_id) REFERENCES mess_groups(id) ON DELETE CASCADE,
      FOREIGN KEY(actor_admin_id) REFERENCES admins(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id,status);
    CREATE INDEX IF NOT EXISTS idx_group_requests_group ON group_join_requests(group_id,status,created_at);
    CREATE INDEX IF NOT EXISTS idx_group_activity_group ON group_activity(group_id,created_at DESC);
  `);

  const defaultSettings: Array<[string, string]> = [
    ['mess_name', 'Greenview Mess'],
    ['mess_name_bn', 'গ্রিনভিউ মেস'],
    ['currency_symbol', '৳'],
    ['enable_breakfast', 'false'],
    ['default_language', 'bn'],
    ['demo_mode', 'false'],
  ];

  const insertSetting = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`
  );
  const tx = db.transaction(() => {
    for (const [key, value] of defaultSettings) {
      insertSetting.run(key, value);
    }
  });
  tx();
}

export function getSettingsMap(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

export function recordAuditLog(params: {
  adminId: number | null;
  adminUsername: string;
  action: string;
  entityType: string;
  entityId?: string | number;
  summary: string;
  details?: unknown;
  ipAddress?: string;
}): void {
  db.prepare(
    `INSERT INTO audit_logs (admin_id, admin_username, action, entity_type, entity_id, summary, details_json, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.adminId,
    params.adminUsername,
    params.action,
    params.entityType,
    params.entityId !== undefined ? String(params.entityId) : '',
    params.summary,
    JSON.stringify(params.details ?? {}),
    params.ipAddress ?? ''
  );
}
