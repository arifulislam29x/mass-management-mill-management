export type Language = 'bn' | 'en';
export type ThemeMode = 'light' | 'dark';

export type NavTab =
  | 'overview'
  | 'members'
  | 'meals'
  | 'bazar'
  | 'expenses'
  | 'deposits'
  | 'reports'
  | 'settings';

export interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
}

export interface MemberSummary {
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

export interface MemberListItem extends MemberSummary {
  id: number;
}

export interface MonthlyOverview {
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
  members: MemberSummary[];
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

export interface MealEntry {
  id: number;
  member_id: number;
  member_name: string;
  member_active: number;
  meal_date: string;
  month_key: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  extra_meal: number;
  total_meal: number;
  note: string;
}

export interface DailyMealSheetRow {
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
}

export interface BazarItemRecord {
  id: number;
  transaction_id: number;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
}

export interface BazarTransactionRecord {
  id: number;
  bazarDate: string;
  monthKey: string;
  title: string;
  shopperMemberId: number | null;
  shopperName: string;
  totalAmount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  items: BazarItemRecord[];
}

export interface ExtraExpenseRecord {
  id: number;
  expenseDate: string;
  monthKey: string;
  expenseType: 'individual' | 'common';
  memberId: number | null;
  memberName: string;
  title: string;
  amount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepositRecord {
  id: number;
  memberId: number;
  memberName: string;
  depositDate: string;
  monthKey: string;
  amount: number;
  previousDeposit: number;
  cumulativeDeposit: number;
  currentBalance: number;
  paymentMethod: 'cash' | 'bkash' | 'nagad' | 'bank' | 'other';
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: number;
  admin_username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  ip_address: string;
  created_at: string;
}
