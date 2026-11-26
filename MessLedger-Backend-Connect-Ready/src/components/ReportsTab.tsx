import React, { useState } from 'react';
import { Download, Lock, Printer, Unlock } from 'lucide-react';
import type {
  BazarTransactionRecord,
  DepositRecord,
  ExtraExpenseRecord,
  Language,
  MealEntry,
  MonthlyOverview,
} from '../types.ts';
import { apiRequest } from '../lib/api.ts';
import {
  exportToCsv,
  exportToExcel,
  exportToPdf,
  type ExportTablePayload,
} from '../lib/exportUtils.ts';
import { formatMoney, formatMonthLabel, formatNum, tDict } from '../lib/i18n.ts';
import { ConfirmModal } from './ui.tsx';

type ReportKind =
  | 'complete_statement'
  | 'member_wise'
  | 'daily_meal'
  | 'monthly_meal'
  | 'daily_bazar'
  | 'monthly_expense'
  | 'deposit_report';

export function ReportsTab({
  overview,
  currency,
  lang,
  isAdmin,
  authToken,
  onDataChanged,
  onNotify,
}: {
  overview: MonthlyOverview;
  currency: string;
  lang: Language;
  isAdmin: boolean;
  authToken: string | null;
  onDataChanged: () => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const d = tDict(lang);
  const [reportType, setReportType] = useState<ReportKind>('complete_statement');
  const [exporting, setExporting] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const buildReportPayload = async (kind: ReportKind): Promise<ExportTablePayload> => {
    const mk = overview.monthKey;
    const messTitle =
      lang === 'bn'
        ? overview.settings.mess_name_bn || overview.settings.mess_name || 'MessLedger'
        : overview.settings.mess_name || 'MessLedger';

    if (kind === 'complete_statement' || kind === 'member_wise') {
      return {
        title: `${messTitle} - ${d.reports.types[kind]}`,
        subtitle: `Month: ${mk} | Meal Rate: ${overview.totals.mealRate.toFixed(2)} | Members: ${overview.totals.memberCount}`,
        filenameBase: `${kind}_${mk}`,
        headers: [
          'Member',
          'Deposit',
          'Lunch',
          'Dinner',
          'Other',
          'Total Meals',
          'Meal Cost',
          'Personal Extra',
          'Total Expense',
          'Balance',
        ],
        rows: overview.members.map((m) => [
          m.name,
          m.totalDeposit,
          m.lunchCount,
          m.dinnerCount,
          m.breakfastCount + m.extraMealCount,
          m.totalMeals,
          m.mealCost,
          m.individualExpense,
          m.totalExpense,
          m.balance,
        ]),
        summaryRows: [
          ['Total Members', overview.totals.memberCount],
          ['Total Deposit', overview.totals.totalDeposit],
          ['Total Bazar Expense', overview.totals.bazarExpense],
          ['Common Extra Expense', overview.totals.commonExtraExpense],
          ['Total Individual Expense', overview.totals.totalIndividualExpense],
          ['Total Mess Expense', overview.totals.totalMessExpense],
          ['Total Meals', overview.totals.totalMeals],
          ['Meal Rate', overview.totals.mealRate],
          ['Remaining Balance', overview.totals.remainingBalance],
        ],
      };
    }

    if (kind === 'monthly_meal') {
      return {
        title: `${messTitle} - Monthly Meal Summary`,
        subtitle: `Month: ${mk} | Total Meals: ${overview.totals.totalMeals}`,
        filenameBase: `monthly_meal_${mk}`,
        headers: ['Member', 'Breakfast', 'Lunch', 'Dinner', 'Extra', 'Total Meals', 'Meal Cost'],
        rows: overview.members.map((m) => [
          m.name,
          m.breakfastCount,
          m.lunchCount,
          m.dinnerCount,
          m.extraMealCount,
          m.totalMeals,
          m.mealCost,
        ]),
        summaryRows: [
          ['Total Meals', overview.totals.totalMeals],
          ['Meal Rate', overview.totals.mealRate],
        ],
      };
    }

    if (kind === 'daily_meal') {
      const res = await apiRequest<{ entries: MealEntry[] }>(
        `/api/public/meals?month=${encodeURIComponent(mk)}`
      );
      return {
        title: `${messTitle} - Daily Meal Report`,
        subtitle: `Month: ${mk}`,
        filenameBase: `daily_meal_${mk}`,
        headers: ['Date', 'Member', 'Breakfast', 'Lunch', 'Dinner', 'Extra', 'Total Meal'],
        rows: res.entries.map((e) => [
          e.meal_date,
          e.member_name,
          e.breakfast,
          e.lunch,
          e.dinner,
          e.extra_meal,
          e.total_meal,
        ]),
        summaryRows: [['Total Meals', overview.totals.totalMeals]],
      };
    }

    if (kind === 'daily_bazar') {
      const res = await apiRequest<{ transactions: BazarTransactionRecord[] }>(
        `/api/public/bazar?month=${encodeURIComponent(mk)}`
      );
      const flatRows: Array<Array<string | number>> = [];
      for (const tx of res.transactions) {
        for (const it of tx.items) {
          flatRows.push([
            tx.bazarDate,
            tx.title,
            tx.shopperName,
            it.item_name,
            it.quantity,
            it.unit,
            it.unit_price,
            it.total_price,
          ]);
        }
      }
      return {
        title: `${messTitle} - Daily Bazar Report`,
        subtitle: `Month: ${mk}`,
        filenameBase: `daily_bazar_${mk}`,
        headers: ['Date', 'Bazar', 'Shopper', 'Item', 'Qty', 'Unit', 'Unit Price', 'Total'],
        rows: flatRows,
        summaryRows: [['Total Bazar Expense', overview.totals.bazarExpense]],
      };
    }

    if (kind === 'monthly_expense') {
      const res = await apiRequest<{ expenses: ExtraExpenseRecord[] }>(
        `/api/public/expenses?month=${encodeURIComponent(mk)}`
      );
      return {
        title: `${messTitle} - Monthly Extra & Common Expense Report`,
        subtitle: `Month: ${mk}`,
        filenameBase: `monthly_expense_${mk}`,
        headers: ['Date', 'Type', 'Member', 'Description', 'Amount'],
        rows: res.expenses.map((ex) => [
          ex.expenseDate,
          ex.expenseType,
          ex.expenseType === 'individual' ? ex.memberName : 'Common Pool',
          ex.title,
          ex.amount,
        ]),
        summaryRows: [
          ['Bazar Expense', overview.totals.bazarExpense],
          ['Common Extra Expense', overview.totals.commonExtraExpense],
          ['Individual Extra Expense', overview.totals.totalIndividualExpense],
          ['Total Mess Expense', overview.totals.totalMessExpense],
        ],
      };
    }

    const depRes = await apiRequest<{ deposits: DepositRecord[] }>(
      `/api/public/deposits?month=${encodeURIComponent(mk)}`
    );
    return {
      title: `${messTitle} - Deposit Report`,
      subtitle: `Month: ${mk}`,
      filenameBase: `deposit_report_${mk}`,
      headers: ['Date', 'Member', 'Method', 'Amount', 'Previous', 'Cumulative', 'Note'],
      rows: depRes.deposits.map((dp) => [
        dp.depositDate,
        dp.memberName,
        dp.paymentMethod,
        dp.amount,
        dp.previousDeposit,
        dp.cumulativeDeposit,
        dp.note,
      ]),
      summaryRows: [['Total Deposit', overview.totals.totalDeposit]],
    };
  };

  const handleExport = async (fmt: 'pdf' | 'xlsx' | 'csv') => {
    setExporting(true);
    try {
      const payload = await buildReportPayload(reportType);
      if (fmt === 'csv') exportToCsv(payload);
      else if (fmt === 'xlsx') await exportToExcel(payload);
      else exportToPdf(payload);
      onNotify('success', `Exported ${fmt.toUpperCase()} report`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleToggleCloseMonth = async () => {
    if (!authToken) return;
    setBusy(true);
    try {
      const endpoint = overview.isClosed ? '/api/admin/reports/reopen' : '/api/admin/reports/close';
      await apiRequest(endpoint, {
        method: 'POST',
        token: authToken,
        body: { monthKey: overview.monthKey },
      });
      setConfirmCloseOpen(false);
      onDataChanged();
      onNotify(
        'success',
        overview.isClosed ? 'Month reopened for editing' : 'Month closed and snapshot locked'
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to update month status');
    } finally {
      setBusy(false);
    }
  };

  const { totals, members } = overview;

  return (
    <div className="space-y-6 print-container">
      {/* Toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {d.reports.reportType}
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportKind)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              {(Object.keys(d.reports.types) as ReportKind[]).map((k) => (
                <option key={k} value={k}>
                  {d.reports.types[k]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Printer className="h-4 w-4" />
            {d.common.print}
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => handleExport('pdf')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            {d.common.exportPdf}
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            {d.common.exportExcel}
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            {d.common.exportCsv}
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setConfirmCloseOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-white whitespace-nowrap ${
                overview.isClosed
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700'
              }`}
            >
              {overview.isClosed ? (
                <>
                  <Unlock className="h-4 w-4" />
                  {d.reports.reopenMonth}
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  {d.reports.closeMonth}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Print-Friendly Complete Monthly Statement */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {lang === 'bn'
                ? overview.settings.mess_name_bn || overview.settings.mess_name
                : overview.settings.mess_name}{' '}
              — {formatMonthLabel(overview.monthKey, lang)}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {d.reports.types.complete_statement} ·{' '}
              {overview.isClosed ? d.header.monthClosed : d.header.monthOpen}
            </p>
          </div>
          <div className="text-right font-mono text-xs text-slate-600 dark:text-slate-400">
            <p>
              {d.kpi.mealRate}:{' '}
              <strong className="text-sm text-slate-900 dark:text-slate-100">
                {formatMoney(totals.mealRate, currency, lang)}
              </strong>
            </p>
            <p className="mt-0.5">
              {d.kpi.totalMeals}: {formatNum(totals.totalMeals, lang)}
            </p>
          </div>
        </div>

        <div className="my-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <p className="text-xs text-slate-500">{d.kpi.totalMembers}</p>
            <p className="mt-1 font-mono text-base font-semibold">
              {formatNum(totals.memberCount, lang, 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{d.kpi.totalDeposit}</p>
            <p className="mt-1 font-mono text-base font-semibold">
              {formatMoney(totals.totalDeposit, currency, lang)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{d.kpi.totalBazar}</p>
            <p className="mt-1 font-mono text-base font-semibold">
              {formatMoney(totals.bazarExpense, currency, lang)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{d.kpi.commonExtra}</p>
            <p className="mt-1 font-mono text-base font-semibold">
              {formatMoney(totals.commonExtraExpense, currency, lang)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{d.kpi.individualExtra}</p>
            <p className="mt-1 font-mono text-base font-semibold">
              {formatMoney(totals.totalIndividualExpense, currency, lang)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{d.kpi.remainingBalance}</p>
            <p
              className={`mt-1 font-mono text-base font-semibold ${
                totals.remainingBalance >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatMoney(totals.remainingBalance, currency, lang)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <th className="px-3 py-2.5">{d.common.member}</th>
                <th className="px-3 py-2.5 text-right">{d.members.deposit}</th>
                <th className="px-3 py-2.5 text-right">{d.members.lunch}</th>
                <th className="px-3 py-2.5 text-right">{d.members.dinner}</th>
                <th className="px-3 py-2.5 text-right">{d.members.otherMeal}</th>
                <th className="px-3 py-2.5 text-right">{d.members.totalMeal}</th>
                <th className="px-3 py-2.5 text-right">{d.members.mealCost}</th>
                <th className="px-3 py-2.5 text-right">{d.members.personalCost}</th>
                <th className="px-3 py-2.5 text-right">{d.members.totalCost}</th>
                <th className="px-3 py-2.5 text-right">{d.members.balance}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {members.map((m) => (
                <tr key={m.memberId}>
                  <td className="px-3 py-2.5 font-medium">{m.name}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatMoney(m.totalDeposit, currency, lang)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatNum(m.lunchCount, lang)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatNum(m.dinnerCount, lang)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatNum(m.breakfastCount + m.extraMealCount, lang)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">
                    {formatNum(m.totalMeals, lang)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatMoney(m.mealCost, currency, lang)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatMoney(m.individualExpense, currency, lang)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-medium tabular-nums">
                    {formatMoney(m.totalExpense, currency, lang)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono font-semibold tabular-nums ${
                      m.balance >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {m.balance >= 0 ? '+' : ''}
                    {formatMoney(m.balance, currency, lang)} ·{' '}
                    {m.balance > 0 ? d.common.surplus : m.balance < 0 ? d.common.due : d.common.settled}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={confirmCloseOpen}
        onClose={() => setConfirmCloseOpen(false)}
        onConfirm={handleToggleCloseMonth}
        title={overview.isClosed ? d.reports.reopenMonth : d.reports.closeMonth}
        message={
          overview.isClosed
            ? lang === 'bn'
              ? 'বন্ধ করা মাসটি পুনরায় চালু করলে আবার হিসাব পরিবর্তন করা যাবে। এগোতে চান?'
              : 'Reopening this month allows editing its entries again. Proceed?'
            : d.reports.confirmClose
        }
        confirmLabel={d.common.confirm}
        cancelLabel={d.common.cancel}
        danger={false}
        busy={busy}
      />
    </div>
  );
}
