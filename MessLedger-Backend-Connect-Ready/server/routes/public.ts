import { Router } from 'express';
import { computeMonthlySummary, getAvailableMonths } from '../calculations.ts';
import { db, getSettingsMap } from '../db.ts';
import { getCurrentMonthKey } from '../security.ts';

export const publicRouter = Router();

function resolveMonth(queryMonth: unknown): string {
  if (typeof queryMonth === 'string' && /^\d{4}-\d{2}$/.test(queryMonth)) {
    return queryMonth;
  }
  return getCurrentMonthKey();
}

publicRouter.get('/months', (_req, res) => {
  const currentMonth = getCurrentMonthKey();
  const months = getAvailableMonths(currentMonth);
  const closedRows = db
    .prepare('SELECT month_key FROM monthly_reports WHERE is_closed = 1')
    .all() as Array<{ month_key: string }>;
  res.json({
    currentMonth,
    months,
    closedMonths: closedRows.map((r) => r.month_key),
  });
});

publicRouter.get('/overview', (req, res) => {
  const monthKey = resolveMonth(req.query.month);
  const summary = computeMonthlySummary(monthKey);
  res.json(summary);
});

publicRouter.get('/members', (req, res) => {
  const monthKey = resolveMonth(req.query.month);
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  const summary = computeMonthlySummary(monthKey);
  const allMembers = db
    .prepare(
      `SELECT id, name, phone, photo_url, join_date, is_active, notes, created_at, updated_at
       FROM members
       ORDER BY is_active DESC, name COLLATE NOCASE ASC`
    )
    .all() as Array<{
    id: number;
    name: string;
    phone: string;
    photo_url: string;
    join_date: string;
    is_active: number;
    notes: string;
    created_at: string;
    updated_at: string;
  }>;

  const summaryMap = new Map(summary.members.map((m) => [m.memberId, m]));

  let list = allMembers.map((m) => {
    const s = summaryMap.get(m.id);
    return {
      id: m.id,
      name: m.name,
      phone: m.phone,
      photoUrl: m.photo_url,
      joinDate: m.join_date,
      isActive: m.is_active === 1,
      notes: m.notes,
      totalDeposit: s?.totalDeposit ?? 0,
      breakfastCount: s?.breakfastCount ?? 0,
      lunchCount: s?.lunchCount ?? 0,
      dinnerCount: s?.dinnerCount ?? 0,
      extraMealCount: s?.extraMealCount ?? 0,
      totalMeals: s?.totalMeals ?? 0,
      mealCost: s?.mealCost ?? 0,
      individualExpense: s?.individualExpense ?? 0,
      totalExpense: s?.totalExpense ?? 0,
      balance: s?.balance ?? 0,
    };
  });

  if (statusFilter === 'active') {
    list = list.filter((m) => m.isActive);
  } else if (statusFilter === 'inactive') {
    list = list.filter((m) => !m.isActive);
  }

  if (search) {
    list = list.filter(
      (m) => m.name.toLowerCase().includes(search) || m.phone.toLowerCase().includes(search)
    );
  }

  res.json({
    monthKey,
    mealRate: summary.totals.mealRate,
    members: list,
  });
});

publicRouter.get('/members/:id', (req, res) => {
  const memberId = Number(req.params.id);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    res.status(400).json({ error: 'Invalid member ID' });
    return;
  }

  const monthKey = resolveMonth(req.query.month);
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId) as
    | {
        id: number;
        name: string;
        phone: string;
        photo_url: string;
        join_date: string;
        is_active: number;
        notes: string;
      }
    | undefined;

  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  const summary = computeMonthlySummary(monthKey);
  const memberStats = summary.members.find((m) => m.memberId === memberId);

  const deposits = db
    .prepare(
      `SELECT id, deposit_date, amount, payment_method, note, created_at
       FROM deposits
       WHERE member_id = ? AND month_key = ?
       ORDER BY deposit_date DESC, id DESC`
    )
    .all(memberId, monthKey);

  const expenses = db
    .prepare(
      `SELECT id, expense_date, title, amount, notes, created_at
       FROM individual_expenses
       WHERE member_id = ? AND month_key = ? AND expense_type = 'individual'
       ORDER BY expense_date DESC, id DESC`
    )
    .all(memberId, monthKey);

  const meals = db
    .prepare(
      `SELECT id, meal_date, breakfast, lunch, dinner, extra_meal, total_meal, note
       FROM meals
       WHERE member_id = ? AND month_key = ?
       ORDER BY meal_date DESC`
    )
    .all(memberId, monthKey);

  res.json({
    monthKey,
    mealRate: summary.totals.mealRate,
    member: {
      id: member.id,
      name: member.name,
      phone: member.phone,
      photoUrl: member.photo_url,
      joinDate: member.join_date,
      isActive: member.is_active === 1,
      notes: member.notes,
    },
    stats: memberStats ?? {
      memberId: member.id,
      name: member.name,
      phone: member.phone,
      photoUrl: member.photo_url,
      joinDate: member.join_date,
      isActive: member.is_active === 1,
      notes: member.notes,
      totalDeposit: 0,
      breakfastCount: 0,
      lunchCount: 0,
      dinnerCount: 0,
      extraMealCount: 0,
      totalMeals: 0,
      mealCost: 0,
      individualExpense: 0,
      totalExpense: 0,
      balance: 0,
    },
    deposits,
    expenses,
    meals,
  });
});

publicRouter.get('/meals', (req, res) => {
  const monthKey = resolveMonth(req.query.month);
  const dateFilter =
    typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : null;
  const memberIdFilter = req.query.memberId ? Number(req.query.memberId) : null;

  const settings = getSettingsMap();
  const activeMembers = db
    .prepare(
      `SELECT id, name, is_active FROM members ORDER BY is_active DESC, name COLLATE NOCASE ASC`
    )
    .all() as Array<{ id: number; name: string; is_active: number }>;

  let sql = `
    SELECT m.id, m.member_id, mb.name AS member_name, mb.is_active AS member_active,
           m.meal_date, m.month_key, m.breakfast, m.lunch, m.dinner, m.extra_meal, m.total_meal, m.note,
           m.created_at, m.updated_at
    FROM meals m
    JOIN members mb ON mb.id = m.member_id
    WHERE m.month_key = ?
  `;
  const params: Array<string | number> = [monthKey];

  if (dateFilter) {
    sql += ' AND m.meal_date = ?';
    params.push(dateFilter);
  }
  if (memberIdFilter && Number.isInteger(memberIdFilter)) {
    sql += ' AND m.member_id = ?';
    params.push(memberIdFilter);
  }

  sql += ' ORDER BY m.meal_date DESC, mb.name COLLATE NOCASE ASC';

  const entries = db.prepare(sql).all(...params);

  let dailySheet: Array<{
    memberId: number;
    memberName: string;
    isActive: boolean;
    breakfast: number;
    lunch: number;
    dinner: number;
    extraMeal: number;
    totalMeal: number;
    note: string;
    hasEntry: boolean;
  }> = [];

  if (dateFilter) {
    const existingForDate = db
      .prepare('SELECT * FROM meals WHERE meal_date = ?')
      .all(dateFilter) as Array<{
      member_id: number;
      breakfast: number;
      lunch: number;
      dinner: number;
      extra_meal: number;
      total_meal: number;
      note: string;
    }>;
    const byMember = new Map(existingForDate.map((r) => [r.member_id, r]));

    dailySheet = activeMembers
      .filter((m) => m.is_active === 1 || byMember.has(m.id))
      .map((m) => {
        const ex = byMember.get(m.id);
        return {
          memberId: m.id,
          memberName: m.name,
          isActive: m.is_active === 1,
          breakfast: ex?.breakfast ?? 0,
          lunch: ex?.lunch ?? 0,
          dinner: ex?.dinner ?? 0,
          extraMeal: ex?.extra_meal ?? 0,
          totalMeal: ex?.total_meal ?? 0,
          note: ex?.note ?? '',
          hasEntry: Boolean(ex),
        };
      });
  }

  res.json({
    monthKey,
    date: dateFilter,
    enableBreakfast: settings.enable_breakfast === 'true',
    entries,
    dailySheet,
  });
});

publicRouter.get('/bazar', (req, res) => {
  const monthKey = resolveMonth(req.query.month);
  const dateFilter =
    typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : null;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  let sql = `
    SELECT bt.*, m.name AS linked_member_name
    FROM bazar_transactions bt
    LEFT JOIN members m ON m.id = bt.shopper_member_id
    WHERE bt.month_key = ?
  `;
  const params: Array<string> = [monthKey];
  if (dateFilter) {
    sql += ' AND bt.bazar_date = ?';
    params.push(dateFilter);
  }
  sql += ' ORDER BY bt.bazar_date DESC, bt.id DESC';

  const transactions = db.prepare(sql).all(...params) as Array<{
    id: number;
    bazar_date: string;
    month_key: string;
    title: string;
    shopper_member_id: number | null;
    shopper_name: string;
    linked_member_name: string | null;
    total_amount: number;
    notes: string;
    created_at: string;
    updated_at: string;
  }>;

  const txIds = transactions.map((t) => t.id);
  const itemsByTx = new Map<number, Array<Record<string, unknown>>>();

  if (txIds.length > 0) {
    const placeholders = txIds.map(() => '?').join(',');
    const items = db
      .prepare(`SELECT * FROM bazar_items WHERE transaction_id IN (${placeholders}) ORDER BY id ASC`)
      .all(...txIds) as Array<Record<string, unknown> & { transaction_id: number }>;

    for (const item of items) {
      const list = itemsByTx.get(item.transaction_id) ?? [];
      list.push(item);
      itemsByTx.set(item.transaction_id, list);
    }
  }

  let enriched = transactions.map((t) => ({
    id: t.id,
    bazarDate: t.bazar_date,
    monthKey: t.month_key,
    title: t.title,
    shopperMemberId: t.shopper_member_id,
    shopperName: t.linked_member_name || t.shopper_name,
    totalAmount: t.total_amount,
    notes: t.notes,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    items: itemsByTx.get(t.id) ?? [],
  }));

  if (search) {
    enriched = enriched.filter(
      (tx) =>
        tx.title.toLowerCase().includes(search) ||
        tx.shopperName.toLowerCase().includes(search) ||
        tx.items.some((it) => String(it.item_name || '').toLowerCase().includes(search))
    );
  }

  const totalBazarExpense = enriched.reduce((sum, tx) => sum + tx.totalAmount, 0);

  res.json({
    monthKey,
    totalBazarExpense: Math.round((totalBazarExpense + Number.EPSILON) * 100) / 100,
    transactions: enriched,
  });
});

publicRouter.get('/expenses', (req, res) => {
  const monthKey = resolveMonth(req.query.month);
  const expenseType =
    req.query.type === 'individual' || req.query.type === 'common' ? req.query.type : null;
  const memberIdFilter = req.query.memberId ? Number(req.query.memberId) : null;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  let sql = `
    SELECT ie.*, m.name AS member_name
    FROM individual_expenses ie
    LEFT JOIN members m ON m.id = ie.member_id
    WHERE ie.month_key = ?
  `;
  const params: Array<string | number> = [monthKey];

  if (expenseType) {
    sql += ' AND ie.expense_type = ?';
    params.push(expenseType);
  }
  if (memberIdFilter && Number.isInteger(memberIdFilter)) {
    sql += ' AND ie.member_id = ?';
    params.push(memberIdFilter);
  }
  sql += ' ORDER BY ie.expense_date DESC, ie.id DESC';

  let rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    expense_date: string;
    month_key: string;
    expense_type: string;
    member_id: number | null;
    member_name: string | null;
    title: string;
    amount: number;
    notes: string;
    created_at: string;
    updated_at: string;
  }>;

  if (search) {
    rows = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(search) ||
        (r.member_name ?? '').toLowerCase().includes(search)
    );
  }

  const individualTotal = rows
    .filter((r) => r.expense_type === 'individual')
    .reduce((s, r) => s + r.amount, 0);
  const commonTotal = rows
    .filter((r) => r.expense_type === 'common')
    .reduce((s, r) => s + r.amount, 0);

  res.json({
    monthKey,
    individualTotal: Math.round((individualTotal + Number.EPSILON) * 100) / 100,
    commonTotal: Math.round((commonTotal + Number.EPSILON) * 100) / 100,
    expenses: rows.map((r) => ({
      id: r.id,
      expenseDate: r.expense_date,
      monthKey: r.month_key,
      expenseType: r.expense_type,
      memberId: r.member_id,
      memberName: r.member_name ?? '',
      title: r.title,
      amount: r.amount,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

publicRouter.get('/deposits', (req, res) => {
  const monthKey = resolveMonth(req.query.month);
  const memberIdFilter = req.query.memberId ? Number(req.query.memberId) : null;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  const summary = computeMonthlySummary(monthKey);
  const summaryMap = new Map(summary.members.map((m) => [m.memberId, m]));

  let sql = `
    SELECT d.*, m.name AS member_name
    FROM deposits d
    JOIN members m ON m.id = d.member_id
    WHERE d.month_key = ?
  `;
  const params: Array<string | number> = [monthKey];

  if (memberIdFilter && Number.isInteger(memberIdFilter)) {
    sql += ' AND d.member_id = ?';
    params.push(memberIdFilter);
  }
  sql += ' ORDER BY d.deposit_date ASC, d.id ASC';

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    member_id: number;
    member_name: string;
    deposit_date: string;
    month_key: string;
    amount: number;
    payment_method: string;
    note: string;
    created_at: string;
    updated_at: string;
  }>;

  const runningByMember = new Map<number, number>();
  let computed = rows.map((r) => {
    const prev = runningByMember.get(r.member_id) ?? 0;
    const after = prev + r.amount;
    runningByMember.set(r.member_id, after);
    const memberStat = summaryMap.get(r.member_id);

    return {
      id: r.id,
      memberId: r.member_id,
      memberName: r.member_name,
      depositDate: r.deposit_date,
      monthKey: r.month_key,
      amount: r.amount,
      previousDeposit: Math.round((prev + Number.EPSILON) * 100) / 100,
      cumulativeDeposit: Math.round((after + Number.EPSILON) * 100) / 100,
      currentBalance: memberStat?.balance ?? 0,
      paymentMethod: r.payment_method,
      note: r.note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

  computed = computed.reverse();

  if (search) {
    computed = computed.filter(
      (d) =>
        d.memberName.toLowerCase().includes(search) ||
        d.paymentMethod.toLowerCase().includes(search) ||
        d.note.toLowerCase().includes(search)
    );
  }

  res.json({
    monthKey,
    totalDeposit: summary.totals.totalDeposit,
    deposits: computed,
  });
});

publicRouter.get('/reports', (req, res) => {
  const monthKey = resolveMonth(req.query.month);
  const summary = computeMonthlySummary(monthKey);
  const savedReports = db
    .prepare(
      `SELECT month_key, is_closed, closed_at, closed_by, total_members, total_deposit,
              total_bazar_expense, total_common_extra_expense, total_individual_expense,
              total_meals, meal_rate, total_expense, remaining_balance
       FROM monthly_reports
       ORDER BY month_key DESC`
    )
    .all();

  res.json({
    summary,
    savedReports,
  });
});
