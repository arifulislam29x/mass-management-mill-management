import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { DepositRecord, Language, MemberListItem } from '../types.ts';
import { apiRequest } from '../lib/api.ts';
import { formatMoney, tDict } from '../lib/i18n.ts';
import { ConfirmModal, EmptyState, Modal, PaginationBar } from './ui.tsx';

export function DepositsTab({
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
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [totalDeposit, setTotalDeposit] = useState(0);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DepositRecord | null>(null);
  const [memberId, setMemberId] = useState('');
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bkash' | 'nagad' | 'bank' | 'other'>(
    'cash'
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DepositRecord | null>(null);

  const fetchDeposits = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ month: monthKey });
      if (search.trim()) qs.set('search', search.trim());

      const [depRes, memRes] = await Promise.all([
        apiRequest<{ totalDeposit: number; deposits: DepositRecord[] }>(
          `/api/public/deposits?${qs.toString()}`
        ),
        apiRequest<{ members: MemberListItem[] }>(
          `/api/public/members?month=${encodeURIComponent(monthKey)}&status=active`
        ),
      ]);
      setDeposits(depRes.deposits);
      setTotalDeposit(depRes.totalDeposit);
      setMembers(memRes.members);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load deposits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeposits();
  }, [monthKey, search]);

  const openAdd = () => {
    setEditing(null);
    const today = new Date().toISOString().slice(0, 10);
    setDepositDate(today.startsWith(monthKey) ? today : `${monthKey}-01`);
    setMemberId(members[0] ? String(members[0].id) : '');
    setAmount('');
    setPaymentMethod('cash');
    setNote('');
    setModalOpen(true);
  };

  const openEdit = (dp: DepositRecord) => {
    setEditing(dp);
    setDepositDate(dp.depositDate);
    setMemberId(String(dp.memberId));
    setAmount(String(dp.amount));
    setPaymentMethod(dp.paymentMethod);
    setNote(dp.note);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    setSaving(true);
    try {
      const payload = {
        memberId: Number(memberId),
        depositDate,
        amount: Number(amount),
        paymentMethod,
        note: note.trim(),
      };
      if (editing) {
        await apiRequest(`/api/admin/deposits/${editing.id}`, {
          method: 'PUT',
          token: authToken,
          body: payload,
        });
      } else {
        await apiRequest('/api/admin/deposits', {
          method: 'POST',
          token: authToken,
          body: payload,
        });
      }
      setModalOpen(false);
      await fetchDeposits();
      onDataChanged();
      onNotify('success', editing ? 'Deposit updated' : 'Deposit added');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save deposit');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!authToken || !deleteTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/admin/deposits/${deleteTarget.id}`, {
        method: 'DELETE',
        token: authToken,
      });
      setDeleteTarget(null);
      await fetchDeposits();
      onDataChanged();
      onNotify('success', 'Deposit removed');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(deposits.length / pageSize));
  const paged = deposits.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {d.deposits.title}
          </h2>
          <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
            {d.kpi.totalDeposit}: {formatMoney(totalDeposit, currency, lang)}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            {d.deposits.addDeposit}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative max-w-sm">
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
                ? 'সদস্যের জমার হিসাব যোগ করুন।'
                : 'Record the first member deposit for this month.'
              : lang === 'bn'
                ? 'এই মাসে এখনো কোনো টাকা জমা যোগ করা হয়নি।'
                : 'No deposits recorded for this month.'
          }
          actionLabel={isAdmin ? d.deposits.addDeposit : undefined}
          onAction={isAdmin ? openAdd : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <th className="px-4 py-3">{d.common.date}</th>
                  <th className="px-4 py-3">{d.common.member}</th>
                  <th className="px-4 py-3">{d.deposits.method}</th>
                  <th className="px-3 py-3 text-right">{d.deposits.previousDeposit}</th>
                  <th className="px-3 py-3 text-right">{d.common.amount}</th>
                  <th className="px-3 py-3 text-right">{d.deposits.cumulativeDeposit}</th>
                  <th className="px-4 py-3 text-right">{d.deposits.currentBalance}</th>
                  {isAdmin && <th className="px-4 py-3 text-right">{d.common.actions}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((dp) => (
                  <tr key={dp.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {dp.depositDate}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {dp.memberName}
                      </p>
                      {dp.note && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{dp.note}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {d.deposits.methods[dp.paymentMethod] || dp.paymentMethod}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {formatMoney(dp.previousDeposit, currency, lang)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{formatMoney(dp.amount, currency, lang)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatMoney(dp.cumulativeDeposit, currency, lang)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-medium tabular-nums ${
                        dp.currentBalance >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {dp.currentBalance >= 0 ? '+' : ''}
                      {formatMoney(dp.currentBalance, currency, lang)}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(dp)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                            title={d.common.edit}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(dp)}
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
        title={editing ? d.deposits.editDeposit : d.deposits.addDeposit}
      >
        <form onSubmit={handleSave} className="space-y-4">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">{d.common.date} *</label>
              <input
                type="date"
                required
                value={depositDate}
                onChange={(e) => setDepositDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">{d.common.amount} *</label>
              <input
                type="number"
                required
                min={1}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">{d.deposits.method}</label>
            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as 'cash' | 'bkash' | 'nagad' | 'bank' | 'other')
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="cash">{d.deposits.methods.cash}</option>
              <option value="bkash">{d.deposits.methods.bkash}</option>
              <option value="nagad">{d.deposits.methods.nagad}</option>
              <option value="bank">{d.deposits.methods.bank}</option>
              <option value="other">{d.deposits.methods.other}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">{d.common.note}</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
            ? `${deleteTarget?.memberName}-এর এই জমা এন্ট্রিটি মুছে ফেলতে চান?`
            : `Delete deposit record for ${deleteTarget?.memberName}?`
        }
        confirmLabel={d.common.delete}
        cancelLabel={d.common.cancel}
        busy={saving}
      />
    </div>
  );
}
