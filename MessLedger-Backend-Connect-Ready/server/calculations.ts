import { db, getSettingsMap } from './db.ts';

export interface MemberMonthlySummary {
  memberId: number;
  name: string;
  phone: string;
  photoUrl: string;
  joinDate: string;
  isActive: boolean;
  notes: string;
  totalDeposit: number;
  breakfastCount: number;
  lunchCount: number;
  dinnerCount: number;
  extraMealCount: number;
  totalMeals: number;
  mealCost: number;
  individualExpense: number;
  totalExpense: number;
  balance: number;
}

export interface MonthlySummaryResponse {
  monthKey: string;
  isClosed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  settings: Record<string, string>;
  totals: {
    memberCount: number;
    activeMemberCount: number;
    totalDeposit: number;
    bazarExpense: number;
    commonExtraExpense: number;
    totalCommonExpense: number;
    totalIndividualExpense: number;
    totalMessExpense: number;
    totalMeals: number;
    mealRate: number;
    remainingBalance: number;
  };
  members: MemberMonthlySummary[];
  charts: {
    dailyExpenses: Array<{
      date: string;
      bazar: number;
      commonExtra: number;
      individualExtra: number;
      total: number;
      meals: number;
    }>;
    monthlyHistory: Array<{
      monthKey: string;
      totalDeposit: number;
      totalExpense: number;
      bazarExpense: number;
      totalMeals: number;
      mealRate: number;
    }>;
  };
}

function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function computeMonthlySummary(monthKey: string): MonthlySummaryResponse {
  const settings = getSettingsMap();

  const closedReport = db
    .prepare('SELECT * FROM monthly_reports WHERE month_key = ? AND is_closed = 1')
    .get(monthKey) as
    | {
        month_key: string;
        is_closed: number;
        closed_at: string | null;
        closed_by: string | null;
        total_members: number;
        total_deposit: number;
        total_bazar_expense: number;
        total_common_extra_expense: number;
        total_individual_expense: number;
        total_meals: number;
        meal_rate: number;
        total_expense: number;
        remaining_balance: number;
        snapshot_json: string;
      }
    | undefined;

  const charts = computeChartSeries(monthKey);

  if (closedReport) {
    let snapshotMembers: MemberMonthlySummary[] = [];
    try {
      const parsed = JSON.parse(closedReport.snapshot_json) as {
        members?: MemberMonthlySummary[];
      };
      snapshotMembers = Array.isArray(parsed.members) ? parsed.members : [];
    } catch {
      snapshotMembers = [];
    }

    return {
      monthKey,
      isClosed: true,
      closedAt: closedReport.closed_at,
      closedBy: closedReport.closed_by,
      settings,
      totals: {
        memberCount: closedReport.total_members,
        activeMemberCount: snapshotMembers.filter((m) => m.isActive).length,
        totalDeposit: closedReport.total_deposit,
        bazarExpense: closedReport.total_bazar_expense,
        commonExtraExpense: closedReport.total_common_extra_expense,
        totalCommonExpense: roundMoney(
          closedReport.total_bazar_expense + closedReport.total_common_extra_expense
        ),
        totalIndividualExpense: closedReport.total_individual_expense,
        totalMessExpense: closedReport.total_expense,
        totalMeals: closedReport.total_meals,
        mealRate: closedReport.meal_rate,
        remainingBalance: closedReport.remaining_balance,
      },
      members: snapshotMembers,
      charts,
    };
  }

  const allMembers = db
    .prepare(
      `SELECT id, name, phone, photo_url, join_date, is_active, notes
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
  }>;

  const mealRows = db
    .prepare(
      `SELECT member_id,
              COALESCE(SUM(breakfast), 0) AS breakfast_count,
              COALESCE(SUM(lunch), 0) AS lunch_count,
              COALESCE(SUM(dinner), 0) AS dinner_count,
              COALESCE(SUM(extra_meal), 0) AS extra_meal_count,
              COALESCE(SUM(total_meal), 0) AS total_meals
       FROM meals
       WHERE month_key = ?
       GROUP BY member_id`
    )
    .all(monthKey) as Array<{
    member_id: number;
    breakfast_count: number;
    lunch_count: number;
    dinner_count: number;
    extra_meal_count: number;
    total_meals: number;
  }>;

  const depositRows = db
    .prepare(
      `SELECT member_id, COALESCE(SUM(amount), 0) AS total_deposit
       FROM deposits
       WHERE month_key = ?
       GROUP BY member_id`
    )
    .all(monthKey) as Array<{ member_id: number; total_deposit: number }>;

  const individualExpenseRows = db
    .prepare(
      `SELECT member_id, COALESCE(SUM(amount), 0) AS total_individual
       FROM individual_expenses
       WHERE month_key = ? AND expense_type = 'individual' AND member_id IS NOT NULL
       GROUP BY member_id`
    )
    .all(monthKey) as Array<{ member_id: number; total_individual: number }>;

  const bazarSumRow = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS total_bazar
       FROM bazar_transactions
       WHERE month_key = ?`
    )
    .get(monthKey) as { total_bazar: number };

  const commonExtraRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total_common_extra
       FROM individual_expenses
       WHERE month_key = ? AND expense_type = 'common'`
    )
    .get(monthKey) as { total_common_extra: number };

  const mealMap = new Map(mealRows.map((r) => [r.member_id, r]));
  const depositMap = new Map(depositRows.map((r) => [r.member_id, r.total_deposit]));
  const indivMap = new Map(individualExpenseRows.map((r) => [r.member_id, r.total_individual]));

  // Include active members + any deactivated member who has financial/meal records in this month
  const relevantMembers = allMembers.filter((m) => {
    if (m.is_active === 1) return true;
    return mealMap.has(m.id) || depositMap.has(m.id) || indivMap.has(m.id);
  });

  const totalMeals = roundMoney(mealRows.reduce((acc, r) => acc + r.total_meals, 0));
  const bazarExpense = roundMoney(bazarSumRow.total_bazar);
  const commonExtraExpense = roundMoney(commonExtraRow.total_common_extra);
  const totalCommonExpense = roundMoney(bazarExpense + commonExtraExpense);
  const mealRate = totalMeals > 0 ? roundMoney(totalCommonExpense / totalMeals) : 0;

  // Use exact unrounded ratio for member meal cost to preserve balance reconciliation, rounded to 2 decimals
  const exactRate = totalMeals > 0 ? totalCommonExpense / totalMeals : 0;

  let totalDeposit = 0;
  let totalIndividualExpense = 0;

  const memberSummaries: MemberMonthlySummary[] = relevantMembers.map((m) => {
    const mealStat = mealMap.get(m.id);
    const deposit = roundMoney(depositMap.get(m.id) ?? 0);
    const indiv = roundMoney(indivMap.get(m.id) ?? 0);
    const mTotalMeals = roundMoney(mealStat?.total_meals ?? 0);
    const mealCost = roundMoney(mTotalMeals * exactRate);
    const totalExpense = roundMoney(mealCost + indiv);
    const balance = roundMoney(deposit - totalExpense);

    totalDeposit += deposit;
    totalIndividualExpense += indiv;

    return {
      memberId: m.id,
      name: m.name,
      phone: m.phone || '',
      photoUrl: m.photo_url || '',
      joinDate: m.join_date,
      isActive: m.is_active === 1,
      notes: m.notes || '',
      totalDeposit: deposit,
      breakfastCount: roundMoney(mealStat?.breakfast_count ?? 0),
      lunchCount: roundMoney(mealStat?.lunch_count ?? 0),
      dinnerCount: roundMoney(mealStat?.dinner_count ?? 0),
      extraMealCount: roundMoney(mealStat?.extra_meal_count ?? 0),
      totalMeals: mTotalMeals,
      mealCost,
      individualExpense: indiv,
      totalExpense,
      balance,
    };
  });

  totalDeposit = roundMoney(totalDeposit);
  totalIndividualExpense = roundMoney(totalIndividualExpense);
  const totalMessExpense = roundMoney(totalCommonExpense + totalIndividualExpense);
  const remainingBalance = roundMoney(totalDeposit - totalMessExpense);

  return {
    monthKey,
    isClosed: false,
    closedAt: null,
    closedBy: null,
    settings,
    totals: {
      memberCount: relevantMembers.length,
      activeMemberCount: allMembers.filter((m) => m.is_active === 1).length,
      totalDeposit,
      bazarExpense,
      commonExtraExpense,
      totalCommonExpense,
      totalIndividualExpense,
      totalMessExpense,
      totalMeals,
      mealRate,
      remainingBalance,
    },
    members: memberSummaries,
    charts,
  };
}

function computeChartSeries(monthKey: string): MonthlySummaryResponse['charts'] {
  const bazarByDate = db
    .prepare(
      `SELECT bazar_date AS dt, COALESCE(SUM(total_amount), 0) AS amt
       FROM bazar_transactions
       WHERE month_key = ?
       GROUP BY bazar_date`
    )
    .all(monthKey) as Array<{ dt: string; amt: number }>;

  const extraByDate = db
    .prepare(
      `SELECT expense_date AS dt, expense_type, COALESCE(SUM(amount), 0) AS amt
       FROM individual_expenses
       WHERE month_key = ?
       GROUP BY expense_date, expense_type`
    )
    .all(monthKey) as Array<{ dt: string; expense_type: string; amt: number }>;

  const mealsByDate = db
    .prepare(
      `SELECT meal_date AS dt, COALESCE(SUM(total_meal), 0) AS cnt
       FROM meals
       WHERE month_key = ?
       GROUP BY meal_date`
    )
    .all(monthKey) as Array<{ dt: string; cnt: number }>;

  const dateMap = new Map<
    string,
    { bazar: number; commonExtra: number; individualExtra: number; meals: number }
  >();

  const ensureDate = (dt: string) => {
    let entry = dateMap.get(dt);
    if (!entry) {
      entry = { bazar: 0, commonExtra: 0, individualExtra: 0, meals: 0 };
      dateMap.set(dt, entry);
    }
    return entry;
  };

  for (const row of bazarByDate) {
    ensureDate(row.dt).bazar += row.amt;
  }
  for (const row of extraByDate) {
    const entry = ensureDate(row.dt);
    if (row.expense_type === 'common') entry.commonExtra += row.amt;
    else entry.individualExtra += row.amt;
  }
  for (const row of mealsByDate) {
    ensureDate(row.dt).meals += row.cnt;
  }

  const dailyExpenses = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      bazar: roundMoney(v.bazar),
      commonExtra: roundMoney(v.commonExtra),
      individualExtra: roundMoney(v.individualExtra),
      total: roundMoney(v.bazar + v.commonExtra + v.individualExtra),
      meals: roundMoney(v.meals),
    }));

  const monthRows = db
    .prepare(
      `SELECT month_key FROM (
         SELECT month_key FROM meals
         UNION SELECT month_key FROM bazar_transactions
         UNION SELECT month_key FROM deposits
         UNION SELECT month_key FROM individual_expenses
         UNION SELECT month_key FROM monthly_reports
       )
       ORDER BY month_key DESC
       LIMIT 6`
    )
    .all() as Array<{ month_key: string }>;

  const monthlyKeys = monthRows.map((r) => r.month_key).reverse();
  if (!monthlyKeys.includes(monthKey)) {
    monthlyKeys.push(monthKey);
    monthlyKeys.sort();
  }

  const monthlyHistory = monthlyKeys.slice(-6).map((mk) => {
    const dep = (
      db
        .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM deposits WHERE month_key = ?')
        .get(mk) as { s: number }
    ).s;
    const baz = (
      db
        .prepare('SELECT COALESCE(SUM(total_amount), 0) AS s FROM bazar_transactions WHERE month_key = ?')
        .get(mk) as { s: number }
    ).s;
    const com = (
      db
        .prepare(
          "SELECT COALESCE(SUM(amount), 0) AS s FROM individual_expenses WHERE month_key = ? AND expense_type = 'common'"
        )
        .get(mk) as { s: number }
    ).s;
    const ind = (
      db
        .prepare(
          "SELECT COALESCE(SUM(amount), 0) AS s FROM individual_expenses WHERE month_key = ? AND expense_type = 'individual'"
        )
        .get(mk) as { s: number }
    ).s;
    const mls = (
      db
        .prepare('SELECT COALESCE(SUM(total_meal), 0) AS s FROM meals WHERE month_key = ?')
        .get(mk) as { s: number }
    ).s;

    const commonTotal = baz + com;
    const rate = mls > 0 ? roundMoney(commonTotal / mls) : 0;

    return {
      monthKey: mk,
      totalDeposit: roundMoney(dep),
      totalExpense: roundMoney(commonTotal + ind),
      bazarExpense: roundMoney(baz),
      totalMeals: roundMoney(mls),
      mealRate: rate,
    };
  });

  return { dailyExpenses, monthlyHistory };
}

export function getAvailableMonths(currentMonthKey: string): string[] {
  const rows = db
    .prepare(
      `SELECT month_key FROM (
         SELECT month_key FROM meals
         UNION SELECT month_key FROM bazar_transactions
         UNION SELECT month_key FROM deposits
         UNION SELECT month_key FROM individual_expenses
         UNION SELECT month_key FROM monthly_reports
       )
       ORDER BY month_key DESC`
    )
    .all() as Array<{ month_key: string }>;

  const set = new Set<string>(rows.map((r) => r.month_key));
  set.add(currentMonthKey);
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}
