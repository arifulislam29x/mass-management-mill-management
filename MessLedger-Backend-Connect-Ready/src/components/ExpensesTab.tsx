import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { ExtraExpenseRecord, Language, MemberListItem } from '../types.ts';
import { apiRequest } from '../lib/api.ts';
import { formatMoney, tDict } from '../lib/i18n.ts';
import { ConfirmModal, EmptyState, Modal, PaginationBar } from './ui.tsx';

export function ExpensesTab({
  monthKey,
  currency,
  lang,
  isAdmin,
  authToken,
  onDataChanged,
  onNotify,
}: {
  monthKey: string;
  currency: string;
  lang: Language;
  isAdmin: boolean;
  authToken: string | null;
  onDataChanged: () => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const d = tDict(lang);
  const [expenses, setExpenses] = useState<ExtraExpenseRecord[]>([]);
  const [individualTotal, setIndividualTotal] = useState(0);
  const [commonTotal, setCommonTotal] = useState(0);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState<'all' | 'individual' | 'common'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExtraExpenseRecord | null>(null);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenseType, setExpenseType] = useState<'individual' | 'common'>('individual');
  const [memberId, setMemberId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExtraExpenseRecord | null>(null);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ month: monthKey });
      if (typeFilter !== 'all') qs.set('type', typeFilter);
      if (search.trim()) qs.set('search', search.trim());

      const [expRes, memRes] = await Promise.all([
        apiRequest<{
          individualTotal: number;
          commonTotal: number;
          expenses: ExtraExpenseRecord[];
        }>(`/api/public/expenses?${qs.toString()}`),
        apiRequest<{ members: MemberListItem[] }>(
          `/api/public/members?month=${encodeURIComponent(monthKey)}&status=active`
        ),
      ]);
      setExpenses(expRes.expenses);
      setIndividualTotal(expRes.individualTotal);
      setCommonTotal(expRes.commonTotal);
      setMembers(memRes.members);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [monthKey, typeFilter, search]);

  const openAdd = () => {
    setEditing(null);
    const today = new Date().toISOString().slice(0, 10);
    setExpenseDate(today.startsWith(monthKey) ? today : `${monthKey}-01`);
    setExpenseType('individual');
    setMemberId(members[0] ? String(members[0].id) : '');
    setTitle('');
    setAmount('');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (ex: ExtraExpenseRecord) => {
    setEditing(ex);
    setExpenseDate(ex.expenseDate);
    setExpenseType(ex.expenseType);
    setMemberId(ex.memberId ? String(ex.memberId) : members[0] ? String(members[0].id) : '');
    setTitle(ex.title);
    setAmount(String(ex.amount));
    setNotes(ex.notes);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    setSaving(true);
    try {
      const payload = {
        expenseDate,
        expenseType,
        memberId: expenseType === 'individual' ? Number(memberId) : null,
        title: title.trim(),
        amount: Number(amount),
        notes: notes.trim(),
      };
      if (editing) {
        await apiRequest(`/api/admin/expenses/${editing.id}`, {
          method: 'PUT',
          token: authToken,
          body: payload,
        });
      } else {
        await apiRequest('/api/admin/expenses', {
          method: 'POST',
          token: authToken,
          body: payload,
        });
      }
      setModalOpen(false);
      await fetchExpenses();
      onDataChanged();
      onNotify('success', editing ? 'Expense updated' : 'Expense recorded');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!authToken || !deleteTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/admin/expenses/${deleteTarget.id}`, {
        method: 'DELETE',
        token: authToken,
      });
      setDeleteTarget(null);
      await fetchExpenses();
      onDataChanged();
      onNotify('success', 'Expense deleted');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(expenses.length / pageSize));
  const paged = expenses.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {d.expenses.title}
          </h2>
          <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
            {d.expenses.individual}: {formatMoney(individualTotal, currency, lang)} ·{' '}
            {d.expenses.common}: {formatMoney(commonTotal, currency, lang)}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            {d.expenses.addExpense}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={d.common.search}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(['all', 'individual', 'common'] as const).map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => {
                setTypeFilter(tp);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                typeFilter === tp
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {tp === 'all'
                ? d.common.all
                : tp === 'individual'
                  ? d.expenses.individual
                  : d.expenses.common}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          {d.common.loading}
        </div>
      ) : paged.length === 0 ? (
        <EmptyState
          title={search ? d.common.noSearchMatch : d.common.noData}
          description={
            isAdmin
              ? lang === 'bn'
                ? 'সদস্যের ব্যক্তিগত খরচ বা সাধারণ অতিরিক্ত খরচ যোগ করুন।'
                : 'Log an individual member extra or common mess expense.'
              : lang === 'bn'
                ? 'এই মাসে কোনো অতিরিক্ত খরচ যোগ করা হয়নি।'
                : 'No extra expenses recorded for this month.'
          }
          actionLabel={isAdmin ? d.expenses.addExpense : undefined}
          onAction={isAdmin ? openAdd : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <th className="px-4 py-3">{d.common.date}</th>
                  <th className="px-4 py-3">{d.expenses.type}</th>
                  <th className="px-4 py-3">{d.common.member}</th>
                  <th className="px-4 py-3">{d.expenses.description}</th>
                  <th className="px-4 py-3 text-right">{d.common.amount}</th>
                  {isAdmin && <th className="px-4 py-3 text-right">{d.common.actions}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((ex) => (
                  <tr key={ex.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {ex.expenseDate}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      <span
                        className={
                          ex.expenseType === 'individual'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-sky-700 dark:text-sky-400'
                        }
                      >
                        {ex.expenseType === 'individual'
                          ? d.expenses.individual
                          : d.expenses.common}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200">
                      {ex.expenseType === 'individual'
                        ? ex.memberName
                        : lang === 'bn'
                          ? 'সকল সদস্য (সাধারণ)'
                          : 'Shared Mess Pool'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{ex.title}</p>
                      {ex.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{ex.notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                      {formatMoney(ex.amount, currency, lang)}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(ex)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                            title={d.common.edit}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(ex)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                            title={d.common.delete}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} lang={lang} />
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? d.expenses.editExpense : d.expenses.addExpense}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setExpenseType('individual')}
              className={`rounded-md py-2 text-xs font-medium transition-colors ${
                expenseType === 'individual'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {d.expenses.individual}
            </button>
            <button
              type="button"
              onClick={() => setExpenseType('common')}
              className={`rounded-md py-2 text-xs font-medium transition-colors ${
                expenseType === 'common'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {d.expenses.common}
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {expenseType === 'individual' ? d.expenses.individualHint : d.expenses.commonHint}
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">{d.common.date} *</label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">{d.common.amount} *</label>
              <input
                type="number"
                required
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          {expenseType === 'individual' && (
            <div>
              <label className="mb-1 block text-xs font-medium">{d.common.member} *</label>
              <select
                required
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium">{d.expenses.description} *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={lang === 'bn' ? 'যেমন: বিকালের নাস্তা বা গ্যাস বিল' : 'e.g. Snacks or Gas Cylinder'}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium">{d.common.note}</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium dark:border-slate-700"
            >
              {d.common.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {d.common.save}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={d.common.delete}
        message={
          lang === 'bn'
            ? `'${deleteTarget?.title}' খরচটি মুছে ফেলতে চান?`
            : `Delete expense '${deleteTarget?.title}'?`
        }
        confirmLabel={d.common.delete}
        cancelLabel={d.common.cancel}
        busy={saving}
      />
    </div>
  );
}
