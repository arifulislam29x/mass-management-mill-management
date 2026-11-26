import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Save, Search, Trash2 } from 'lucide-react';
import type { DailyMealSheetRow, Language, MealEntry } from '../types.ts';
import { apiRequest } from '../lib/api.ts';
import { formatNum, tDict } from '../lib/i18n.ts';
import { ConfirmModal, EmptyState, PaginationBar } from './ui.tsx';

export function MealsTab({
  monthKey,
  lang,
  isAdmin,
  authToken,
  onDataChanged,
  onNotify,
}: {
  monthKey: string;
  lang: Language;
  isAdmin: boolean;
  authToken: string | null;
  onDataChanged: () => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const d = tDict(lang);
  const defaultDate = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return today.startsWith(monthKey) ? today : `${monthKey}-01`;
  }, [monthKey]);

  const [selectedDate, setSelectedDate] = useState(defaultDate);
  useEffect(() => {
    setSelectedDate(defaultDate);
  }, [defaultDate]);

  const [enableBreakfast, setEnableBreakfast] = useState(false);
  const [sheet, setSheet] = useState<DailyMealSheetRow[]>([]);
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchMeals = async () => {
    setLoading(true);
    try {
      const [sheetRes, allRes] = await Promise.all([
        apiRequest<{
          enableBreakfast: boolean;
          dailySheet: DailyMealSheetRow[];
        }>(`/api/public/meals?month=${encodeURIComponent(monthKey)}&date=${encodeURIComponent(selectedDate)}`),
        apiRequest<{
          enableBreakfast: boolean;
          entries: MealEntry[];
        }>(`/api/public/meals?month=${encodeURIComponent(monthKey)}`),
      ]);
      setEnableBreakfast(sheetRes.enableBreakfast);
      setSheet(sheetRes.dailySheet);
      setEntries(allRes.entries);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load meals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeals();
  }, [monthKey, selectedDate]);

  const updateRowField = (
    memberId: number,
    field: 'breakfast' | 'lunch' | 'dinner' | 'extraMeal',
    value: number
  ) => {
    const clean = Number.isFinite(value) ? Math.max(0, Math.min(20, value)) : 0;
    setSheet((prev) =>
      prev.map((row) => {
        if (row.memberId !== memberId) return row;
        const updated = { ...row, [field]: clean };
        updated.totalMeal =
          Math.round(
            (updated.breakfast + updated.lunch + updated.dinner + updated.extraMeal) * 100
          ) / 100;
        return updated;
      })
    );
  };

  const setAllStandard = (val: 0 | 1) => {
    setSheet((prev) =>
      prev.map((row) => {
        if (!row.isActive) return row;
        const lunch = val;
        const dinner = val;
        const breakfast = enableBreakfast ? val : 0;
        const extraMeal = 0;
        return {
          ...row,
          breakfast,
          lunch,
          dinner,
          extraMeal,
          totalMeal: breakfast + lunch + dinner + extraMeal,
        };
      })
    );
  };

  const handleSaveSheet = async () => {
    if (!authToken || sheet.length === 0) return;
    setSaving(true);
    try {
      await apiRequest('/api/admin/meals/bulk', {
        method: 'POST',
        token: authToken,
        body: {
          mealDate: selectedDate,
          entries: sheet.map((r) => ({
            memberId: r.memberId,
            breakfast: r.breakfast,
            lunch: r.lunch,
            dinner: r.dinner,
            extraMeal: r.extraMeal,
            note: r.note,
          })),
        },
      });
      await fetchMeals();
      onDataChanged();
      onNotify('success', `Saved daily meal sheet for ${selectedDate}`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save meals');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!authToken || !deleteId) return;
    setSaving(true);
    try {
      await apiRequest(`/api/admin/meals/${deleteId}`, {
        method: 'DELETE',
        token: authToken,
      });
      setDeleteId(null);
      await fetchMeals();
      onDataChanged();
      onNotify('success', 'Meal entry deleted');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.member_name.toLowerCase().includes(q) || e.meal_date.includes(q)
    );
  }, [entries, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const pagedEntries = filteredEntries.slice((page - 1) * pageSize, page * pageSize);

  const sheetTotals = sheet.reduce(
    (acc, r) => ({
      breakfast: acc.breakfast + r.breakfast,
      lunch: acc.lunch + r.lunch,
      dinner: acc.dinner + r.dinner,
      extraMeal: acc.extraMeal + r.extraMeal,
      totalMeal: acc.totalMeal + r.totalMeal,
    }),
    { breakfast: 0, lunch: 0, dinner: 0, extraMeal: 0, totalMeal: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{d.meals.title}</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
            <Calendar className="h-4 w-4 text-slate-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-mono text-slate-900 focus:outline-none dark:text-slate-100"
            />
          </div>
          {isAdmin && sheet.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setAllStandard(1)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                {d.meals.setAllOne}
              </button>
              <button
                type="button"
                onClick={() => setAllStandard(0)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                {d.meals.setAllZero}
              </button>
              <button
                type="button"
                onClick={handleSaveSheet}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
              >
                <Save className="h-4 w-4" />
                {d.meals.saveSheet}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Daily Sheet */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {d.meals.dailySheet} · <span className="font-mono">{selectedDate}</span>
          </h3>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {d.common.total}: {formatNum(sheetTotals.totalMeal, lang)}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">{d.common.loading}</div>
        ) : sheet.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={d.common.noData}
              description={
                lang === 'bn'
                  ? 'দৈনিক মিল হিসাব রাখার জন্য প্রথমে সদস্য যোগ করুন।'
                  : 'Add active members first to track daily meals.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <th className="px-4 py-3">{d.common.member}</th>
                  {enableBreakfast && <th className="px-3 py-3 text-right">{d.meals.breakfast}</th>}
                  <th className="px-3 py-3 text-right">{d.meals.lunch}</th>
                  <th className="px-3 py-3 text-right">{d.meals.dinner}</th>
                  <th className="px-3 py-3 text-right">{d.meals.extra}</th>
                  <th className="px-4 py-3 text-right">{d.meals.total}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sheet.map((row) => (
                  <tr key={row.memberId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {row.memberName}
                      {!row.isActive && (
                        <span className="ml-2 text-xs text-slate-400">({d.common.inactive})</span>
                      )}
                    </td>
                    {enableBreakfast && (
                      <td className="px-3 py-2 text-right">
                        {isAdmin ? (
                          <input
                            type="number"
                            min={0}
                            max={20}
                            step="0.5"
                            value={row.breakfast}
                            onChange={(e) =>
                              updateRowField(row.memberId, 'breakfast', Number(e.target.value))
                            }
                            className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                          />
                        ) : (
                          <span className="font-mono tabular-nums">{formatNum(row.breakfast, lang)}</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
                      {isAdmin ? (
                        <input
                          type="number"
                          min={0}
                          max={20}
                          step="0.5"
                          value={row.lunch}
                          onChange={(e) =>
                            updateRowField(row.memberId, 'lunch', Number(e.target.value))
                          }
                          className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                        />
                      ) : (
                        <span className="font-mono tabular-nums">{formatNum(row.lunch, lang)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin ? (
                        <input
                          type="number"
                          min={0}
                          max={20}
                          step="0.5"
                          value={row.dinner}
                          onChange={(e) =>
                            updateRowField(row.memberId, 'dinner', Number(e.target.value))
                          }
                          className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                        />
                      ) : (
                        <span className="font-mono tabular-nums">{formatNum(row.dinner, lang)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin ? (
                        <input
                          type="number"
                          min={0}
                          max={20}
                          step="0.5"
                          value={row.extraMeal}
                          onChange={(e) =>
                            updateRowField(row.memberId, 'extraMeal', Number(e.target.value))
                          }
                          className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
                        />
                      ) : (
                        <span className="font-mono tabular-nums">{formatNum(row.extraMeal, lang)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatNum(row.totalMeal, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold dark:border-slate-800 dark:bg-slate-800/60">
                  <td className="px-4 py-3">{d.common.total}</td>
                  {enableBreakfast && (
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatNum(sheetTotals.breakfast, lang)}
                    </td>
                  )}
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {formatNum(sheetTotals.lunch, lang)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {formatNum(sheetTotals.dinner, lang)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    {formatNum(sheetTotals.extraMeal, lang)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatNum(sheetTotals.totalMeal, lang)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Monthly Meal History */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {d.meals.monthlyLog} ({filteredEntries.length})
          </h3>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={d.common.search}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>

        {pagedEntries.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">{d.common.noData}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                    <th className="px-4 py-2.5">{d.common.date}</th>
                    <th className="px-4 py-2.5">{d.common.member}</th>
                    {enableBreakfast && <th className="px-3 py-2.5 text-right">{d.meals.breakfast}</th>}
                    <th className="px-3 py-2.5 text-right">{d.meals.lunch}</th>
                    <th className="px-3 py-2.5 text-right">{d.meals.dinner}</th>
                    <th className="px-3 py-2.5 text-right">{d.meals.extra}</th>
                    <th className="px-4 py-2.5 text-right">{d.meals.total}</th>
                    {isAdmin && <th className="px-4 py-2.5 text-right">{d.common.actions}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pagedEntries.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {row.meal_date}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{row.member_name}</td>
                      {enableBreakfast && (
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {formatNum(row.breakfast, lang)}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatNum(row.lunch, lang)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatNum(row.dinner, lang)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatNum(row.extra_meal, lang)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                        {formatNum(row.total_meal, lang)}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setDeleteId(row.id)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                            title={d.common.delete}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} lang={lang} />
          </>
        )}
      </div>

      <ConfirmModal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeleteEntry}
        title={d.common.delete}
        message={
          lang === 'bn'
            ? 'এই দিনের মিল রেকর্ডটি মুছে ফেলতে চান?'
            : 'Delete this meal entry permanently?'
        }
        confirmLabel={d.common.delete}
        cancelLabel={d.common.cancel}
        busy={saving}
      />
    </div>
  );
}
