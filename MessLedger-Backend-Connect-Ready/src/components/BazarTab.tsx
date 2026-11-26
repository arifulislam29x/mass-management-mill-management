import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { BazarTransactionRecord, Language, MemberListItem } from '../types.ts';
import { apiRequest } from '../lib/api.ts';
import { formatMoney, formatNum, tDict } from '../lib/i18n.ts';
import { ConfirmModal, EmptyState, Modal, PaginationBar } from './ui.tsx';

interface DraftItem {
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

const UNITS = ['কেজি', 'গ্রাম', 'লিটার', 'পিস', 'প্যাকেট', 'ডজন', 'kg', 'g', 'liter', 'pcs'];

export function BazarTab({
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
  const [transactions, setTransactions] = useState<BazarTransactionRecord[]>([]);
  const [totalBazar, setTotalBazar] = useState(0);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<BazarTransactionRecord | null>(null);
  const [bazarDate, setBazarDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [shopperMemberId, setShopperMemberId] = useState<string>('');
  const [shopperName, setShopperName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([
    { itemName: '', quantity: 1, unit: 'কেজি', unitPrice: 0, totalPrice: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BazarTransactionRecord | null>(null);

  const fetchBazar = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ month: monthKey });
      if (dateFilter) qs.set('date', dateFilter);
      if (search.trim()) qs.set('search', search.trim());

      const [bazRes, memRes] = await Promise.all([
        apiRequest<{ totalBazarExpense: number; transactions: BazarTransactionRecord[] }>(
          `/api/public/bazar?${qs.toString()}`
        ),
        apiRequest<{ members: MemberListItem[] }>(
          `/api/public/members?month=${encodeURIComponent(monthKey)}&status=active`
        ),
      ]);
      setTransactions(bazRes.transactions);
      setTotalBazar(bazRes.totalBazarExpense);
      setMembers(memRes.members);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load bazar records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBazar();
  }, [monthKey, dateFilter, search]);

  const openAdd = () => {
    setEditingTx(null);
    const today = new Date().toISOString().slice(0, 10);
    setBazarDate(today.startsWith(monthKey) ? today : `${monthKey}-01`);
    setTitle('');
    setShopperMemberId(members[0] ? String(members[0].id) : '');
    setShopperName('');
    setNotes('');
    setItems([{ itemName: '', quantity: 1, unit: lang === 'bn' ? 'কেজি' : 'kg', unitPrice: 0, totalPrice: 0 }]);
    setModalOpen(true);
  };

  const openEdit = (tx: BazarTransactionRecord) => {
    setEditingTx(tx);
    setBazarDate(tx.bazarDate);
    setTitle(tx.title);
    setShopperMemberId(tx.shopperMemberId ? String(tx.shopperMemberId) : '');
    setShopperName(tx.shopperName);
    setNotes(tx.notes);
    setItems(
      tx.items.length > 0
        ? tx.items.map((it) => ({
            itemName: it.item_name,
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unit_price,
            totalPrice: it.total_price,
          }))
        : [{ itemName: '', quantity: 1, unit: 'কেজি', unitPrice: 0, totalPrice: 0 }]
    );
    setModalOpen(true);
  };

  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        if ('quantity' in patch || 'unitPrice' in patch) {
          next.totalPrice = Math.round(next.quantity * next.unitPrice * 100) / 100;
        } else if ('totalPrice' in patch && next.quantity > 0) {
          next.unitPrice = Math.round((next.totalPrice / next.quantity) * 100) / 100;
        }
        return next;
      })
    );
  };

  const draftGrandTotal = Math.round(items.reduce((s, it) => s + (it.totalPrice || 0), 0) * 100) / 100;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    const validItems = items.filter((it) => it.itemName.trim().length > 0 && it.quantity > 0);
    if (validItems.length === 0) {
      onNotify('error', 'Please add at least one valid item');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        bazarDate,
        title: title.trim(),
        shopperMemberId: shopperMemberId ? Number(shopperMemberId) : null,
        shopperName: shopperName.trim(),
        notes: notes.trim(),
        items: validItems.map((it) => ({
          itemName: it.itemName.trim(),
          quantity: Number(it.quantity),
          unit: it.unit.trim(),
          unitPrice: Number(it.unitPrice),
          totalPrice: Number(it.totalPrice),
        })),
      };
      if (editingTx) {
        await apiRequest(`/api/admin/bazar/${editingTx.id}`, {
          method: 'PUT',
          token: authToken,
          body: payload,
        });
      } else {
        await apiRequest('/api/admin/bazar', {
          method: 'POST',
          token: authToken,
          body: payload,
        });
      }
      setModalOpen(false);
      await fetchBazar();
      onDataChanged();
      onNotify('success', editingTx ? 'Bazar entry updated' : 'Bazar entry saved');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save bazar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!authToken || !deleteTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/admin/bazar/${deleteTarget.id}`, {
        method: 'DELETE',
        token: authToken,
      });
      setDeleteTarget(null);
      await fetchBazar();
      onDataChanged();
      onNotify('success', 'Bazar entry deleted');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(transactions.length / pageSize));
  const paged = transactions.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{d.bazar.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
            {d.bazar.grandTotal}: {formatMoney(totalBazar, currency, lang)}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            {d.bazar.addBazar}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={d.bazar.searchPlaceholder}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-800"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              {d.common.all}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          {d.common.loading}
        </div>
      ) : paged.length === 0 ? (
        <EmptyState
          title={search || dateFilter ? d.common.noSearchMatch : d.common.noData}
          description={
            isAdmin
              ? lang === 'bn'
                ? 'দৈনিক বাজারের বিস্তারিত তালিকা যোগ করুন।'
                : 'Add your first daily bazar transaction.'
              : lang === 'bn'
                ? 'এই মাসে এখনো কোনো বাজারের তথ্য যোগ করা হয়নি।'
                : 'No bazar transactions recorded yet.'
          }
          actionLabel={isAdmin ? d.bazar.addBazar : undefined}
          onAction={isAdmin ? openAdd : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {paged.map((tx) => {
              const expanded = expandedId === tx.id;
              return (
                <div key={tx.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : tx.id)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      {expanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{tx.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{tx.bazarDate}</span>
                          {tx.shopperName ? ` · ${tx.shopperName}` : ''}
                          {` · ${tx.items.length} ${d.bazar.itemsCount}`}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatMoney(tx.totalAmount, currency, lang)}
                      </span>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(tx)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                            title={d.common.edit}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(tx)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                            title={d.common.delete}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/30">
                      {tx.notes && (
                        <p className="mb-2.5 text-xs text-slate-600 dark:text-slate-400">{tx.notes}</p>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[480px] border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                              <th className="py-1.5 text-left font-medium">{d.bazar.itemName}</th>
                              <th className="py-1.5 text-right font-medium">{d.bazar.quantity}</th>
                              <th className="py-1.5 text-left pl-3 font-medium">{d.bazar.unit}</th>
                              <th className="py-1.5 text-right font-medium">{d.bazar.unitPrice}</th>
                              <th className="py-1.5 text-right font-medium">{d.bazar.totalPrice}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/60">
                            {tx.items.map((it) => (
                              <tr key={it.id}>
                                <td className="py-1.5 font-medium text-slate-800 dark:text-slate-200">
                                  {it.item_name}
                                </td>
                                <td className="py-1.5 text-right font-mono tabular-nums">
                                  {formatNum(it.quantity, lang)}
                                </td>
                                <td className="py-1.5 pl-3 text-slate-600 dark:text-slate-400">
                                  {it.unit}
                                </td>
                                <td className="py-1.5 text-right font-mono tabular-nums">
                                  {formatMoney(it.unit_price, currency, lang)}
                                </td>
                                <td className="py-1.5 text-right font-mono font-medium tabular-nums">
                                  {formatMoney(it.total_price, currency, lang)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} lang={lang} />
        </div>
      )}

      {/* Add / Edit Bazar Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTx ? d.bazar.editBazar : d.bazar.addBazar}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium">{d.common.date} *</label>
              <input
                type="date"
                required
                value={bazarDate}
                onChange={(e) => setBazarDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium">{d.bazar.bazarTitle} *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={lang === 'bn' ? 'যেমন: সকালের কাঁচাবাজার' : 'e.g. Morning Grocery Run'}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">{d.bazar.shopper}</label>
              <select
                value={shopperMemberId}
                onChange={(e) => setShopperMemberId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="">{lang === 'bn' ? '-- বাইরে/অন্যান্য --' : '-- Custom Name --'}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            {!shopperMemberId && (
              <div>
                <label className="mb-1 block text-xs font-medium">
                  {lang === 'bn' ? 'ক্রেতার নাম' : 'Shopper Name'}
                </label>
                <input
                  type="text"
                  value={shopperName}
                  onChange={(e) => setShopperName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </div>
            )}
            <div className={shopperMemberId ? '' : 'sm:col-span-2'}>
              <label className="mb-1 block text-xs font-medium">{d.common.note}</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          {/* Items Builder */}
          <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {d.bazar.itemName} & {d.bazar.totalPrice}
              </span>
              <button
                type="button"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    {
                      itemName: '',
                      quantity: 1,
                      unit: lang === 'bn' ? 'কেজি' : 'kg',
                      unitPrice: 0,
                      totalPrice: 0,
                    },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                <Plus className="h-3.5 w-3.5" />
                {d.bazar.addItem}
              </button>
            </div>

            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 items-center gap-2">
                  <input
                    type="text"
                    required
                    placeholder={d.bazar.itemName}
                    value={it.itemName}
                    onChange={(e) => updateItem(idx, { itemName: e.target.value })}
                    className="col-span-12 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs sm:col-span-4 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <input
                    type="number"
                    required
                    min={0.01}
                    step="0.01"
                    placeholder={d.bazar.quantity}
                    value={it.quantity}
                    onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                    className="col-span-3 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-right font-mono text-xs sm:col-span-2 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <select
                    value={it.unit}
                    onChange={(e) => updateItem(idx, { unit: e.target.value })}
                    className="col-span-3 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs sm:col-span-2 dark:border-slate-700 dark:bg-slate-800"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={d.bazar.unitPrice}
                    value={it.unitPrice}
                    onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                    className="col-span-3 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-right font-mono text-xs sm:col-span-2 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <div className="col-span-3 flex items-center gap-1 sm:col-span-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder={d.bazar.totalPrice}
                      value={it.totalPrice}
                      onChange={(e) => updateItem(idx, { totalPrice: Number(e.target.value) })}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-slate-400 hover:text-red-600"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 pt-2.5 text-sm font-semibold dark:border-slate-800">
              <span>{d.common.total}: </span>
              <span className="ml-2 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatMoney(draftGrandTotal, currency, lang)}
              </span>
            </div>
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
            ? `'${deleteTarget?.title}' বাজার এন্ট্রিটি মুছে ফেলতে চান?`
            : `Delete bazar entry '${deleteTarget?.title}'?`
        }
        confirmLabel={d.common.delete}
        cancelLabel={d.common.cancel}
        busy={saving}
      />
    </div>
  );
}
