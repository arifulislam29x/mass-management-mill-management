import { Router } from 'express';
import { z } from 'zod';
import { computeMonthlySummary } from '../calculations.ts';
import { db, getSettingsMap, recordAuditLog } from '../db.ts';
import { clearMessOperationalData, loadDemoDataIntoDb } from '../demo.ts';
import {
  type AuthenticatedRequest,
  createRateLimiter,
  getClientIp,
  isValidSafePhotoUrl,
  monthKeyFromDate,
  requireAdmin,
} from '../security.ts';

export const adminRouter = Router();

const mutationLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  keyPrefix: 'admin_mut',
});

adminRouter.use(requireAdmin);
adminRouter.use(mutationLimiter);

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const monthRegex = /^\d{4}-\d{2}$/;

function assertMonthOpen(monthKey: string): void {
  const closed = db
    .prepare('SELECT is_closed FROM monthly_reports WHERE month_key = ? AND is_closed = 1')
    .get(monthKey) as { is_closed: number } | undefined;
  if (closed) {
    throw new Error(`MONTH_CLOSED:${monthKey}`);
  }
}

function handleMutationError(err: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) {
  if (err instanceof Error && err.message.startsWith('MONTH_CLOSED:')) {
    const mk = err.message.split(':')[1];
    res.status(409).json({
      error: `Month ${mk} is closed. Reopen it from Monthly Reports before modifying records.`,
    });
    return;
  }
  console.error('Admin mutation error:', err);
  res.status(500).json({ error: 'Failed to process request' });
}

// ---------------- MEMBERS ----------------

const memberSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  phone: z.string().trim().max(30).optional().default(''),
  photoUrl: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine((v) => isValidSafePhotoUrl(v), 'Invalid or unsupported photo URL/format'),
  joinDate: z.string().regex(dateRegex, 'Valid join date (YYYY-MM-DD) is required'),
  isActive: z.boolean().optional().default(true),
  notes: z.string().trim().max(300).optional().default(''),
});

adminRouter.post('/members', (req: AuthenticatedRequest, res) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid member data' });
    return;
  }
  const d = parsed.data;
  const info = db
    .prepare(
      `INSERT INTO members (name, phone, photo_url, join_date, is_active, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(d.name, d.phone, d.photoUrl, d.joinDate, d.isActive ? 1 : 0, d.notes);

  const memberId = Number(info.lastInsertRowid);
  recordAuditLog({
    adminId: req.admin!.id,
    adminUsername: req.admin!.username,
    action: 'CREATE',
    entityType: 'member',
    entityId: memberId,
    summary: `Added member '${d.name}'`,
    details: { name: d.name, joinDate: d.joinDate },
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ id: memberId, ok: true });
});

adminRouter.put('/members/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid member ID' });
    return;
  }

  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid member data' });
    return;
  }

  const existing = db.prepare('SELECT id, name FROM members WHERE id = ?').get(id) as
    | { id: number; name: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  const d = parsed.data;
  db.prepare(
    `UPDATE members
     SET name = ?, phone = ?, photo_url = ?, join_date = ?, is_active = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(d.name, d.phone, d.photoUrl, d.joinDate, d.isActive ? 1 : 0, d.notes, id);

  recordAuditLog({
    adminId: req.admin!.id,
    adminUsername: req.admin!.username,
    action: 'UPDATE',
    entityType: 'member',
    entityId: id,
    summary: `Updated member '${d.name}'`,
    details: { isActive: d.isActive },
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true });
});

adminRouter.patch('/members/:id/status', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  const existing = db.prepare('SELECT id, name FROM members WHERE id = ?').get(id) as
    | { id: number; name: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  db.prepare(
    `UPDATE members SET is_active = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(parsed.data.isActive ? 1 : 0, id);

  recordAuditLog({
    adminId: req.admin!.id,
    adminUsername: req.admin!.username,
    action: 'UPDATE',
    entityType: 'member_status',
    entityId: id,
    summary: `${parsed.data.isActive ? 'Activated' : 'Deactivated'} member '${existing.name}'`,
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true });
});

adminRouter.delete('/members/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid member ID' });
    return;
  }

  const existing = db.prepare('SELECT id, name FROM members WHERE id = ?').get(id) as
    | { id: number; name: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  db.prepare('DELETE FROM members WHERE id = ?').run(id);
  recordAuditLog({
    adminId: req.admin!.id,
    adminUsername: req.admin!.username,
    action: 'DELETE',
    entityType: 'member',
    entityId: id,
    summary: `Removed member '${existing.name}' and associated records`,
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true });
});

// ---------------- MEALS ----------------

const mealEntrySchema = z.object({
  memberId: z.number().int().positive(),
  breakfast: z.number().min(0).max(20),
  lunch: z.number().min(0).max(20),
  dinner: z.number().min(0).max(20),
  extraMeal: z.number().min(0).max(20).optional().default(0),
  note: z.string().trim().max(200).optional().default(''),
});

const bulkMealsSchema = z.object({
  mealDate: z.string().regex(dateRegex, 'Valid date (YYYY-MM-DD) is required'),
  entries: z.array(mealEntrySchema).min(1),
});

adminRouter.post('/meals/bulk', (req: AuthenticatedRequest, res) => {
  const parsed = bulkMealsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid meal data' });
    return;
  }

  const { mealDate, entries } = parsed.data;
  const monthKey = monthKeyFromDate(mealDate);

  try {
    assertMonthOpen(monthKey);

    const upsert = db.prepare(
      `INSERT INTO meals (member_id, meal_date, month_key, breakfast, lunch, dinner, extra_meal, total_meal, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(member_id, meal_date) DO UPDATE SET
         breakfast = excluded.breakfast,
         lunch = excluded.lunch,
         dinner = excluded.dinner,
         extra_meal = excluded.extra_meal,
         total_meal = excluded.total_meal,
         note = excluded.note,
         updated_at = datetime('now')`
    );

    const tx = db.transaction(() => {
      let totalSavedMeals = 0;
      for (const e of entries) {
        const totalMeal = Math.round((e.breakfast + e.lunch + e.dinner + e.extraMeal) * 100) / 100;
        totalSavedMeals += totalMeal;
        upsert.run(
          e.memberId,
          mealDate,
          monthKey,
          e.breakfast,
          e.lunch,
          e.dinner,
          e.extraMeal,
          totalMeal,
          e.note
        );
      }

      recordAuditLog({
        adminId: req.admin!.id,
        adminUsername: req.admin!.username,
        action: 'UPDATE',
        entityType: 'meals_bulk',
        entityId: mealDate,
        summary: `Saved daily meal sheet for ${mealDate} (${entries.length} members, ${totalSavedMeals} meals)`,
        ipAddress: getClientIp(req),
      });
    });

    tx();
    res.json({ ok: true });
  } catch (err) {
    handleMutationError(err, res);
  }
});

adminRouter.delete('/meals/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid meal ID' });
    return;
  }

  const existing = db.prepare('SELECT * FROM meals WHERE id = ?').get(id) as
    | { id: number; month_key: string; meal_date: string; member_id: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Meal entry not found' });
    return;
  }

  try {
    assertMonthOpen(existing.month_key);
    db.prepare('DELETE FROM meals WHERE id = ?').run(id);
    recordAuditLog({
      adminId: req.admin!.id,
      adminUsername: req.admin!.username,
      action: 'DELETE',
      entityType: 'meal',
      entityId: id,
      summary: `Deleted meal record for ${existing.meal_date}`,
      ipAddress: getClientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    handleMutationError(err, res);
  }
});

// ---------------- BAZAR TRANSACTIONS & ITEMS ----------------

const bazarItemSchema = z.object({
  itemName: z.string().trim().min(1, 'Item name required').max(100),
  quantity: z.number().positive('Quantity must be greater than 0').max(100000),
  unit: z.string().trim().min(1).max(30),
  unitPrice: z.number().min(0).max(10000000).optional(),
  totalPrice: z.number().min(0).max(10000000),
});

const bazarTxSchema = z.object({
  bazarDate: z.string().regex(dateRegex, 'Valid bazar date (YYYY-MM-DD) required'),
  title: z.string().trim().min(2, 'Bazar title required').max(120),
  shopperMemberId: z.number().int().positive().nullable().optional(),
  shopperName: z.string().trim().max(80).optional().default(''),
  notes: z.string().trim().max(300).optional().default(''),
  items: z.array(bazarItemSchema).min(1, 'At least one bazar item is required'),
});

adminRouter.post('/bazar', (req: AuthenticatedRequest, res) => {
  const parsed = bazarTxSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid bazar payload' });
    return;
  }

  const d = parsed.data;
  const monthKey = monthKeyFromDate(d.bazarDate);

  try {
    assertMonthOpen(monthKey);

    let resolvedShopperName = d.shopperName;
    if (d.shopperMemberId) {
      const mb = db.prepare('SELECT name FROM members WHERE id = ?').get(d.shopperMemberId) as
        | { name: string }
        | undefined;
      if (mb) resolvedShopperName = mb.name;
    }

    const grandTotal =
      Math.round((d.items.reduce((s, it) => s + it.totalPrice, 0) + Number.EPSILON) * 100) / 100;

    const txId = db.transaction(() => {
      const txInfo = db
        .prepare(
          `INSERT INTO bazar_transactions (bazar_date, month_key, title, shopper_member_id, shopper_name, total_amount, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          d.bazarDate,
          monthKey,
          d.title,
          d.shopperMemberId ?? null,
          resolvedShopperName,
          grandTotal,
          d.notes
        );

      const newId = Number(txInfo.lastInsertRowid);
      const insertItem = db.prepare(
        `INSERT INTO bazar_items (transaction_id, item_name, quantity, unit, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      for (const item of d.items) {
        const unitPrice =
          item.unitPrice !== undefined && item.unitPrice >= 0
            ? item.unitPrice
            : item.quantity > 0
              ? Math.round(((item.totalPrice / item.quantity) + Number.EPSILON) * 100) / 100
              : 0;
        insertItem.run(
          newId,
          item.itemName,
          item.quantity,
          item.unit,
          unitPrice,
          Math.round((item.totalPrice + Number.EPSILON) * 100) / 100
        );
      }

      recordAuditLog({
        adminId: req.admin!.id,
        adminUsername: req.admin!.username,
        action: 'CREATE',
        entityType: 'bazar',
        entityId: newId,
        summary: `Added bazar '${d.title}' on ${d.bazarDate} (Total: ${grandTotal})`,
        ipAddress: getClientIp(req),
      });

      return newId;
    })();

    res.status(201).json({ id: txId, totalAmount: grandTotal, ok: true });
  } catch (err) {
    handleMutationError(err, res);
  }
});

adminRouter.put('/bazar/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid bazar ID' });
    return;
  }

  const parsed = bazarTxSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid bazar payload' });
    return;
  }

  const existing = db.prepare('SELECT id, month_key FROM bazar_transactions WHERE id = ?').get(id) as
    | { id: number; month_key: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Bazar transaction not found' });
    return;
  }

  const d = parsed.data;
  const newMonthKey = monthKeyFromDate(d.bazarDate);

  try {
    assertMonthOpen(existing.month_key);
    assertMonthOpen(newMonthKey);

    let resolvedShopperName = d.shopperName;
    if (d.shopperMemberId) {
      const mb = db.prepare('SELECT name FROM members WHERE id = ?').get(d.shopperMemberId) as
        | { name: string }
        | undefined;
      if (mb) resolvedShopperName = mb.name;
    }

    const grandTotal =
      Math.round((d.items.reduce((s, it) => s + it.totalPrice, 0) + Number.EPSILON) * 100) / 100;

    db.transaction(() => {
      db.prepare(
        `UPDATE bazar_transactions
         SET bazar_date = ?, month_key = ?, title = ?, shopper_member_id = ?, shopper_name = ?,
             total_amount = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        d.bazarDate,
        newMonthKey,
        d.title,
        d.shopperMemberId ?? null,
        resolvedShopperName,
        grandTotal,
        d.notes,
        id
      );

      db.prepare('DELETE FROM bazar_items WHERE transaction_id = ?').run(id);
      const insertItem = db.prepare(
        `INSERT INTO bazar_items (transaction_id, item_name, quantity, unit, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      for (const item of d.items) {
        const unitPrice =
          item.unitPrice !== undefined && item.unitPrice >= 0
            ? item.unitPrice
            : item.quantity > 0
              ? Math.round(((item.totalPrice / item.quantity) + Number.EPSILON) * 100) / 100
              : 0;
        insertItem.run(
          id,
          item.itemName,
          item.quantity,
          item.unit,
          unitPrice,
          Math.round((item.totalPrice + Number.EPSILON) * 100) / 100
        );
      }

      recordAuditLog({
        adminId: req.admin!.id,
        adminUsername: req.admin!.username,
        action: 'UPDATE',
        entityType: 'bazar',
        entityId: id,
        summary: `Updated bazar '${d.title}' on ${d.bazarDate} (Total: ${grandTotal})`,
        ipAddress: getClientIp(req),
      });
    })();

    res.json({ ok: true, totalAmount: grandTotal });
  } catch (err) {
    handleMutationError(err, res);
  }
});

adminRouter.delete('/bazar/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid bazar ID' });
    return;
  }

  const existing = db
    .prepare('SELECT id, title, month_key, total_amount FROM bazar_transactions WHERE id = ?')
    .get(id) as { id: number; title: string; month_key: string; total_amount: number } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Bazar transaction not found' });
    return;
  }

  try {
    assertMonthOpen(existing.month_key);
    db.prepare('DELETE FROM bazar_transactions WHERE id = ?').run(id);
    recordAuditLog({
      adminId: req.admin!.id,
      adminUsername: req.admin!.username,
      action: 'DELETE',
      entityType: 'bazar',
      entityId: id,
      summary: `Deleted bazar '${existing.title}' (Amount: ${existing.total_amount})`,
      ipAddress: getClientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    handleMutationError(err, res);
  }
});

// ---------------- INDIVIDUAL & COMMON EXTRA EXPENSES ----------------

const expenseSchema = z
  .object({
    expenseDate: z.string().regex(dateRegex, 'Valid expense date required'),
    expenseType: z.enum(['individual', 'common']),
    memberId: z.number().int().positive().nullable().optional(),
    title: z.string().trim().min(2, 'Description required').max(140),
    amount: z.number().positive('Amount must be greater than 0').max(10000000),
    notes: z.string().trim().max(300).optional().default(''),
  })
  .refine((d) => d.expenseType === 'common' || (d.memberId !== null && d.memberId !== undefined), {
    message: 'Member selection is required for individual expenses',
  });

adminRouter.post('/expenses', (req: AuthenticatedRequest, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid expense data' });
    return;
  }

  const d = parsed.data;
  const monthKey = monthKeyFromDate(d.expenseDate);

  try {
    assertMonthOpen(monthKey);
    const roundedAmt = Math.round((d.amount + Number.EPSILON) * 100) / 100;
    const info = db
      .prepare(
        `INSERT INTO individual_expenses (expense_date, month_key, expense_type, member_id, title, amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        d.expenseDate,
        monthKey,
        d.expenseType,
        d.expenseType === 'individual' ? d.memberId ?? null : null,
        d.title,
        roundedAmt,
        d.notes
      );

    const newId = Number(info.lastInsertRowid);
    recordAuditLog({
      adminId: req.admin!.id,
      adminUsername: req.admin!.username,
      action: 'CREATE',
      entityType: 'expense',
      entityId: newId,
      summary: `Added ${d.expenseType} expense '${d.title}' (${roundedAmt})`,
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ id: newId, ok: true });
  } catch (err) {
    handleMutationError(err, res);
  }
});

adminRouter.put('/expenses/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid expense ID' });
    return;
  }

  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid expense data' });
    return;
  }

  const existing = db.prepare('SELECT id, month_key FROM individual_expenses WHERE id = ?').get(id) as
    | { id: number; month_key: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Expense not found' });
    return;
  }

  const d = parsed.data;
  const newMonthKey = monthKeyFromDate(d.expenseDate);

  try {
    assertMonthOpen(existing.month_key);
    assertMonthOpen(newMonthKey);
    const roundedAmt = Math.round((d.amount + Number.EPSILON) * 100) / 100;

    db.prepare(
      `UPDATE individual_expenses
       SET expense_date = ?, month_key = ?, expense_type = ?, member_id = ?, title = ?, amount = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      d.expenseDate,
      newMonthKey,
      d.expenseType,
      d.expenseType === 'individual' ? d.memberId ?? null : null,
      d.title,
      roundedAmt,
      d.notes,
      id
    );

    recordAuditLog({
      adminId: req.admin!.id,
      adminUsername: req.admin!.username,
      action: 'UPDATE',
      entityType: 'expense',
      entityId: id,
      summary: `Updated ${d.expenseType} expense '${d.title}' (${roundedAmt})`,
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    handleMutationError(err, res);
  }
});

adminRouter.delete('/expenses/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid expense ID' });
    return;
  }

  const existing = db
    .prepare('SELECT id, title, amount, month_key FROM individual_expenses WHERE id = ?')
    .get(id) as { id: number; title: string; amount: number; month_key: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Expense not found' });
    return;
  }

  try {
    assertMonthOpen(existing.month_key);
    db.prepare('DELETE FROM individual_expenses WHERE id = ?').run(id);
    recordAuditLog({
      adminId: req.admin!.id,
      adminUsername: req.admin!.username,
      action: 'DELETE',
      entityType: 'expense',
      entityId: id,
      summary: `Deleted expense '${existing.title}' (${existing.amount})`,
      ipAddress: getClientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    handleMutationError(err, res);
  }
});

// ---------------- DEPOSITS ----------------

const depositSchema = z.object({
  memberId: z.number().int().positive(),
  depositDate: z.string().regex(dateRegex, 'Valid deposit date required'),
  amount: z.number().positive('Deposit amount must be greater than 0').max(10000000),
  paymentMethod: z.enum(['cash', 'bkash', 'nagad', 'bank', 'other']),
  note: z.string().trim().max(300).optional().default(''),
});

adminRouter.post('/deposits', (req: AuthenticatedRequest, res) => {
  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid deposit data' });
    return;
  }

  const d = parsed.data;
  const monthKey = monthKeyFromDate(d.depositDate);

  try {
    assertMonthOpen(monthKey);
    const member = db.prepare('SELECT id, name FROM members WHERE id = ?').get(d.memberId) as
      | { id: number; name: string }
      | undefined;
    if (!member) {
      res.status(404).json({ error: 'Selected member not found' });
      return;
    }

    const roundedAmt = Math.round((d.amount + Number.EPSILON) * 100) / 100;
    const info = db
      .prepare(
        `INSERT INTO deposits (member_id, deposit_date, month_key, amount, payment_method, note)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(d.memberId, d.depositDate, monthKey, roundedAmt, d.paymentMethod, d.note);

    const newId = Number(info.lastInsertRowid);
    recordAuditLog({
      adminId: req.admin!.id,
      adminUsername: req.admin!.username,
      action: 'CREATE',
      entityType: 'deposit',
      entityId: newId,
      summary: `Recorded deposit of ${roundedAmt} for '${member.name}' via ${d.paymentMethod}`,
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ id: newId, ok: true });
  } catch (err) {
    handleMutationError(err, res);
  }
});

adminRouter.put('/deposits/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid deposit ID' });
    return;
  }

  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid deposit data' });
    return;
  }

  const existing = db.prepare('SELECT id, month_key FROM deposits WHERE id = ?').get(id) as
    | { id: number; month_key: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Deposit record not found' });
    return;
  }

  const d = parsed.data;
  const newMonthKey = monthKeyFromDate(d.depositDate);

  try {
    assertMonthOpen(existing.month_key);
    assertMonthOpen(newMonthKey);
    const roundedAmt = Math.round((d.amount + Number.EPSILON) * 100) / 100;

    db.prepare(
      `UPDATE deposits
       SET member_id = ?, deposit_date = ?, month_key = ?, amount = ?, payment_method = ?, note = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(d.memberId, d.depositDate, newMonthKey, roundedAmt, d.paymentMethod, d.note, id);

    recordAuditLog({
      adminId: req.admin!.id,
      adminUsername: req.admin!.username,
      action: 'UPDATE',
      entityType: 'deposit',
      entityId: id,
      summary: `Updated deposit #${id} to ${roundedAmt}`,
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    handleMutationError(err, res);
  }
});

adminRouter.delete('/deposits/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid deposit ID' });
    return;
  }

  const existing = db.prepare('SELECT id, amount, month_key FROM deposits WHERE id = ?').get(id) as
    | { id: number; amount: number; month_key: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Deposit not found' });
    return;
  }

  try {
    assertMonthOpen(existing.month_key);
    db.prepare('DELETE FROM deposits WHERE id = ?').run(id);
    recordAuditLog({
      adminId: req.admin!.id,
      adminUsername: req.admin!.username,
      action: 'DELETE',
      entityType: 'deposit',
      entityId: id,
      summary: `Deleted deposit #${id} (Amount: ${existing.amount})`,
      ipAddress: getClientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    handleMutationError(err, res);
  }
});

// ---------------- MONTHLY CLOSE / REOPEN ----------------

adminRouter.post('/reports/close', (req: AuthenticatedRequest, res) => {
  const parsed = z.object({ monthKey: z.string().regex(monthRegex) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid monthKey (YYYY-MM) is required' });
    return;
  }

  const { monthKey } = parsed.data;
  const existing = db
    .prepare('SELECT is_closed FROM monthly_reports WHERE month_key = ?')
    .get(monthKey) as { is_closed: number } | undefined;

  if (existing?.is_closed === 1) {
    res.status(409).json({ error: `Month ${monthKey} is already closed.` });
    return;
  }

  const summary = computeMonthlySummary(monthKey);
  const snapshotJson = JSON.stringify({ members: summary.members });

  db.transaction(() => {
    db.prepare(
      `INSERT INTO monthly_reports (
         month_key, is_closed, closed_at, closed_by, total_members, total_deposit,
         total_bazar_expense, total_common_extra_expense, total_individual_expense,
         total_meals, meal_rate, total_expense, remaining_balance, snapshot_json, updated_at
       ) VALUES (?, 1, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(month_key) DO UPDATE SET
         is_closed = 1,
         closed_at = datetime('now'),
         closed_by = excluded.closed_by,
         total_members = excluded.total_members,
         total_deposit = excluded.total_deposit,
         total_bazar_expense = excluded.total_bazar_expense,
         total_common_extra_expense = excluded.total_common_extra_expense,
         total_individual_expense = excluded.total_individual_expense,
         total_meals = excluded.total_meals,
         meal_rate = excluded.meal_rate,
         total_expense = excluded.total_expense,
         remaining_balance = excluded.remaining_balance,
         snapshot_json = excluded.snapshot_json,
         updated_at = datetime('now')`
    ).run(
      monthKey,
      req.admin!.username,
      summary.totals.memberCount,
      summary.totals.totalDeposit,
      summary.totals.bazarExpense,
      summary.totals.commonExtraExpense,
      summary.totals.totalIndividualExpense,
      summary.totals.totalMeals,
      summary.totals.mealRate,
      summary.totals.totalMessExpense,
      summary.totals.remainingBalance,
      snapshotJson
    );

    recordAuditLog({
      adminId: req.admin!.id,
      adminUsername: req.admin!.username,
      action: 'CLOSE_MONTH',
      entityType: 'monthly_report',
      entityId: monthKey,
      summary: `Closed month ${monthKey} (Meal Rate: ${summary.totals.mealRate}, Remaining: ${summary.totals.remainingBalance})`,
      ipAddress: getClientIp(req),
    });
  })();

  res.json({ ok: true });
});

adminRouter.post('/reports/reopen', (req: AuthenticatedRequest, res) => {
  const parsed = z.object({ monthKey: z.string().regex(monthRegex) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid monthKey (YYYY-MM) is required' });
    return;
  }

  const { monthKey } = parsed.data;
  db.transaction(() => {
    db.prepare(
      `UPDATE monthly_reports SET is_closed = 0, updated_at = datetime('now') WHERE month_key = ?`
    ).run(monthKey);

    recordAuditLog({
      adminId: req.admin!.id,
      adminUsername: req.admin!.username,
      action: 'REOPEN_MONTH',
      entityType: 'monthly_report',
      entityId: monthKey,
      summary: `Reopened month ${monthKey} for adjustments`,
      ipAddress: getClientIp(req),
    });
  })();

  res.json({ ok: true });
});

// ---------------- SETTINGS, AUDIT LOGS, DEMO MODE, BACKUP & RESTORE ----------------

const settingsSchema = z.object({
  mess_name: z.string().trim().min(1).max(80),
  mess_name_bn: z.string().trim().min(1).max(80),
  currency_symbol: z.string().trim().min(1).max(5),
  enable_breakfast: z.enum(['true', 'false']),
  default_language: z.enum(['bn', 'en']),
});

adminRouter.put('/settings', (req: AuthenticatedRequest, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid settings data' });
    return;
  }

  const update = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );

  db.transaction(() => {
    for (const [k, v] of Object.entries(parsed.data)) {
      update.run(k, v);
    }
    recordAuditLog({
      adminId: req.admin!.id,
      adminUsername: req.admin!.username,
      action: 'SETTINGS_UPDATE',
      entityType: 'settings',
      summary: 'Updated mess system settings',
      details: parsed.data,
      ipAddress: getClientIp(req),
    });
  })();

  res.json({ ok: true, settings: getSettingsMap() });
});

adminRouter.get('/audit-logs', (req: AuthenticatedRequest, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const logs = db
    .prepare(
      `SELECT id, admin_username, action, entity_type, entity_id, summary, ip_address, created_at
       FROM audit_logs
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit);
  res.json({ logs });
});

adminRouter.post('/demo/load', (req: AuthenticatedRequest, res) => {
  loadDemoDataIntoDb();
  recordAuditLog({
    adminId: req.admin!.id,
    adminUsername: req.admin!.username,
    action: 'DEMO_LOAD',
    entityType: 'database',
    summary: 'Loaded sample demo dataset into database',
    ipAddress: getClientIp(req),
  });
  res.json({ ok: true });
});

adminRouter.post('/demo/clear', (req: AuthenticatedRequest, res) => {
  clearMessOperationalData();
  recordAuditLog({
    adminId: req.admin!.id,
    adminUsername: req.admin!.username,
    action: 'DEMO_CLEAR',
    entityType: 'database',
    summary: 'Cleared operational mess data (reset to clean state)',
    ipAddress: getClientIp(req),
  });
  res.json({ ok: true });
});

adminRouter.get('/backup', (req: AuthenticatedRequest, res) => {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: req.admin!.username,
    tables: {
      settings: db.prepare('SELECT key, value, updated_at FROM settings').all(),
      members: db.prepare('SELECT * FROM members ORDER BY id ASC').all(),
      meals: db.prepare('SELECT * FROM meals ORDER BY id ASC').all(),
      bazar_transactions: db.prepare('SELECT * FROM bazar_transactions ORDER BY id ASC').all(),
      bazar_items: db.prepare('SELECT * FROM bazar_items ORDER BY id ASC').all(),
      individual_expenses: db.prepare('SELECT * FROM individual_expenses ORDER BY id ASC').all(),
      deposits: db.prepare('SELECT * FROM deposits ORDER BY id ASC').all(),
      monthly_reports: db.prepare('SELECT * FROM monthly_reports ORDER BY id ASC').all(),
    },
  };

  recordAuditLog({
    adminId: req.admin!.id,
    adminUsername: req.admin!.username,
    action: 'BACKUP',
    entityType: 'database',
    summary: 'Downloaded full database JSON backup',
    ipAddress: getClientIp(req),
  });

  res.json(payload);
});

const restoreSchema = z.object({
  version: z.literal(1),
  tables: z.object({
    settings: z.array(z.object({ key: z.string(), value: z.string() })).optional().default([]),
    members: z.array(z.record(z.string(), z.unknown())),
    meals: z.array(z.record(z.string(), z.unknown())),
    bazar_transactions: z.array(z.record(z.string(), z.unknown())),
    bazar_items: z.array(z.record(z.string(), z.unknown())),
    individual_expenses: z.array(z.record(z.string(), z.unknown())),
    deposits: z.array(z.record(z.string(), z.unknown())),
    monthly_reports: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  }),
});

adminRouter.post('/restore', (req: AuthenticatedRequest, res) => {
  const parsed = restoreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid backup file structure' });
    return;
  }

  const t = parsed.data.tables;

  try {
    db.transaction(() => {
      db.prepare('DELETE FROM bazar_items').run();
      db.prepare('DELETE FROM bazar_transactions').run();
      db.prepare('DELETE FROM meals').run();
      db.prepare('DELETE FROM individual_expenses').run();
      db.prepare('DELETE FROM deposits').run();
      db.prepare('DELETE FROM monthly_reports').run();
      db.prepare('DELETE FROM members').run();

      const insertSetting = db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      );
      for (const s of t.settings) {
        insertSetting.run(s.key, s.value);
      }

      const insertMember = db.prepare(
        `INSERT INTO members (id, name, phone, photo_url, join_date, is_active, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`
      );
      for (const m of t.members) {
        insertMember.run(
          Number(m.id),
          String(m.name || ''),
          String(m.phone || ''),
          isValidSafePhotoUrl(String(m.photo_url || '')) ? String(m.photo_url || '') : '',
          String(m.join_date || '2026-01-01'),
          Number(m.is_active ?? 1),
          String(m.notes || ''),
          m.created_at ? String(m.created_at) : null,
          m.updated_at ? String(m.updated_at) : null
        );
      }

      const insertMeal = db.prepare(
        `INSERT INTO meals (id, member_id, meal_date, month_key, breakfast, lunch, dinner, extra_meal, total_meal, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`
      );
      for (const ml of t.meals) {
        insertMeal.run(
          Number(ml.id),
          Number(ml.member_id),
          String(ml.meal_date),
          String(ml.month_key),
          Number(ml.breakfast ?? 0),
          Number(ml.lunch ?? 0),
          Number(ml.dinner ?? 0),
          Number(ml.extra_meal ?? 0),
          Number(ml.total_meal ?? 0),
          String(ml.note || ''),
          ml.created_at ? String(ml.created_at) : null,
          ml.updated_at ? String(ml.updated_at) : null
        );
      }

      const insertBazar = db.prepare(
        `INSERT INTO bazar_transactions (id, bazar_date, month_key, title, shopper_member_id, shopper_name, total_amount, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`
      );
      for (const b of t.bazar_transactions) {
        insertBazar.run(
          Number(b.id),
          String(b.bazar_date),
          String(b.month_key),
          String(b.title),
          b.shopper_member_id !== null && b.shopper_member_id !== undefined ? Number(b.shopper_member_id) : null,
          String(b.shopper_name || ''),
          Number(b.total_amount ?? 0),
          String(b.notes || ''),
          b.created_at ? String(b.created_at) : null,
          b.updated_at ? String(b.updated_at) : null
        );
      }

      const insertItem = db.prepare(
        `INSERT INTO bazar_items (id, transaction_id, item_name, quantity, unit, unit_price, total_price, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`
      );
      for (const it of t.bazar_items) {
        insertItem.run(
          Number(it.id),
          Number(it.transaction_id),
          String(it.item_name),
          Number(it.quantity),
          String(it.unit),
          Number(it.unit_price ?? 0),
          Number(it.total_price ?? 0),
          it.created_at ? String(it.created_at) : null,
          it.updated_at ? String(it.updated_at) : null
        );
      }

      const insertExp = db.prepare(
        `INSERT INTO individual_expenses (id, expense_date, month_key, expense_type, member_id, title, amount, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`
      );
      for (const e of t.individual_expenses) {
        insertExp.run(
          Number(e.id),
          String(e.expense_date),
          String(e.month_key),
          e.expense_type === 'common' ? 'common' : 'individual',
          e.member_id !== null && e.member_id !== undefined ? Number(e.member_id) : null,
          String(e.title),
          Number(e.amount ?? 0),
          String(e.notes || ''),
          e.created_at ? String(e.created_at) : null,
          e.updated_at ? String(e.updated_at) : null
        );
      }

      const insertDep = db.prepare(
        `INSERT INTO deposits (id, member_id, deposit_date, month_key, amount, payment_method, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`
      );
      for (const dp of t.deposits) {
        insertDep.run(
          Number(dp.id),
          Number(dp.member_id),
          String(dp.deposit_date),
          String(dp.month_key),
          Number(dp.amount ?? 0),
          String(dp.payment_method || 'cash'),
          String(dp.note || ''),
          dp.created_at ? String(dp.created_at) : null,
          dp.updated_at ? String(dp.updated_at) : null
        );
      }

      const insertRep = db.prepare(
        `INSERT INTO monthly_reports (
           id, month_key, is_closed, closed_at, closed_by, total_members, total_deposit,
           total_bazar_expense, total_common_extra_expense, total_individual_expense,
           total_meals, meal_rate, total_expense, remaining_balance, snapshot_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')))`
      );
      for (const r of t.monthly_reports) {
        insertRep.run(
          Number(r.id),
          String(r.month_key),
          Number(r.is_closed ?? 0),
          r.closed_at ? String(r.closed_at) : null,
          r.closed_by ? String(r.closed_by) : null,
          Number(r.total_members ?? 0),
          Number(r.total_deposit ?? 0),
          Number(r.total_bazar_expense ?? 0),
          Number(r.total_common_extra_expense ?? 0),
          Number(r.total_individual_expense ?? 0),
          Number(r.total_meals ?? 0),
          Number(r.meal_rate ?? 0),
          Number(r.total_expense ?? 0),
          Number(r.remaining_balance ?? 0),
          String(r.snapshot_json || '{}'),
          r.created_at ? String(r.created_at) : null,
          r.updated_at ? String(r.updated_at) : null
        );
      }

      recordAuditLog({
        adminId: req.admin!.id,
        adminUsername: req.admin!.username,
        action: 'RESTORE',
        entityType: 'database',
        summary: `Restored full database backup (${t.members.length} members, ${t.meals.length} meals, ${t.bazar_transactions.length} bazar records)`,
        ipAddress: getClientIp(req),
      });
    })();

    res.json({ ok: true });
  } catch (err) {
    console.error('Restore failed:', err);
    res.status(400).json({ error: 'Backup restore failed due to invalid or conflicting data' });
  }
});
