import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Search, Trash2, UserCheck, UserX } from 'lucide-react';
import type { Language, MemberListItem, MemberSummary } from '../types.ts';
import { apiRequest } from '../lib/api.ts';
import { formatMoney, formatNum, tDict } from '../lib/i18n.ts';
import { ConfirmModal, EmptyState, MemberAvatar, Modal } from './ui.tsx';

interface MemberDetailResponse {
  monthKey: string;
  mealRate: number;
  member: {
    id: number;
    name: string;
    phone: string;
    photoUrl: string;
    joinDate: string;
    isActive: boolean;
    notes: string;
  };
  stats: MemberSummary;
  deposits: Array<{
    id: number;
    deposit_date: string;
    amount: number;
    payment_method: string;
    note: string;
  }>;
  expenses: Array<{
    id: number;
    expense_date: string;
    title: string;
    amount: number;
    notes: string;
  }>;
  meals: Array<{
    id: number;
    meal_date: string;
    breakfast: number;
    lunch: number;
    dinner: number;
    extra_meal: number;
    total_meal: number;
  }>;
}

export function MembersTab({
  monthKey,
  currency,
  lang,
  isAdmin,
  authToken,
  selectedMemberId,
  onClearSelectedMember,
  onDataChanged,
  onNotify,
}: {
  monthKey: string;
  currency: string;
  lang: Language;
  isAdmin: boolean;
  authToken: string | null;
  selectedMemberId: number | null;
  onClearSelectedMember: () => void;
  onDataChanged: () => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const d = tDict(lang);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberListItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPhotoUrl, setFormPhotoUrl] = useState('');
  const [formJoinDate, setFormJoinDate] = useState(new Date().toISOString().slice(0, 10));
  const [formNotes, setFormNotes] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MemberListItem | null>(null);
  const [profileId, setProfileId] = useState<number | null>(selectedMemberId);
  const [profileData, setProfileData] = useState<MemberDetailResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (selectedMemberId) setProfileId(selectedMemberId);
  }, [selectedMemberId]);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ members: MemberListItem[] }>(
        `/api/public/members?month=${encodeURIComponent(monthKey)}&status=${statusFilter}&search=${encodeURIComponent(search)}`
      );
      setMembers(res.members);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [monthKey, statusFilter, search]);

  useEffect(() => {
    if (!profileId) {
      setProfileData(null);
      return;
    }
    setProfileLoading(true);
    apiRequest<MemberDetailResponse>(
      `/api/public/members/${profileId}?month=${encodeURIComponent(monthKey)}`
    )
      .then(setProfileData)
      .catch(() => setProfileData(null))
      .finally(() => setProfileLoading(false));
  }, [profileId, monthKey]);

  const openAddModal = () => {
    setEditingMember(null);
    setFormName('');
    setFormPhone('');
    setFormPhotoUrl('');
    setFormJoinDate(new Date().toISOString().slice(0, 10));
    setFormNotes('');
    setFormActive(true);
    setFormOpen(true);
  };

  const openEditModal = (m: MemberListItem) => {
    setEditingMember(m);
    setFormName(m.name);
    setFormPhone(m.phone);
    setFormPhotoUrl(m.photoUrl);
    setFormJoinDate(m.joinDate);
    setFormNotes(m.notes);
    setFormActive(m.isActive);
    setFormOpen(true);
  };

  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      onNotify('error', 'Only PNG, JPEG, or WebP images are supported');
      return;
    }
    if (file.size > 400_000) {
      onNotify('error', 'Image must be under 400KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setFormPhotoUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        phone: formPhone.trim(),
        photoUrl: formPhotoUrl.trim(),
        joinDate: formJoinDate,
        isActive: formActive,
        notes: formNotes.trim(),
      };
      if (editingMember) {
        await apiRequest(`/api/admin/members/${editingMember.id}`, {
          method: 'PUT',
          body: payload,
          token: authToken,
        });
      } else {
        await apiRequest('/api/admin/members', {
          method: 'POST',
          body: payload,
          token: authToken,
        });
      }
      setFormOpen(false);
      await fetchMembers();
      onDataChanged();
      onNotify('success', editingMember ? 'Member updated' : 'Member added');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save member');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (m: MemberListItem) => {
    if (!authToken) return;
    try {
      await apiRequest(`/api/admin/members/${m.id}/status`, {
        method: 'PATCH',
        body: { isActive: !m.isActive },
        token: authToken,
      });
      await fetchMembers();
      onDataChanged();
      onNotify('success', !m.isActive ? 'Member activated' : 'Member deactivated');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Action failed');
    }
  };

  const handleDelete = async () => {
    if (!authToken || !deleteTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/admin/members/${deleteTarget.id}`, {
        method: 'DELETE',
        token: authToken,
      });
      setDeleteTarget(null);
      await fetchMembers();
      onDataChanged();
      onNotify('success', 'Member removed');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{d.members.title}</h2>
        {isAdmin && (
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            {d.members.addMember}
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder={d.common.search}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(['all', 'active', 'inactive'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {st === 'all' ? d.common.all : st === 'active' ? d.common.active : d.common.inactive}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          {d.common.loading}
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          title={search ? d.common.noSearchMatch : d.common.noData}
          description={
            isAdmin
              ? lang === 'bn'
                ? 'মেসের প্রথম সদস্য যোগ করুন।'
                : 'Add your first mess member.'
              : lang === 'bn'
                ? 'এখনো কোনো সদস্য যুক্ত করা হয়নি।'
                : 'No members added yet.'
          }
          actionLabel={isAdmin ? d.members.addMember : undefined}
          onAction={isAdmin ? openAddModal : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <th className="px-4 py-3">{d.common.member}</th>
                  <th className="px-3 py-3">{d.members.joinDate}</th>
                  <th className="px-3 py-3 text-right">{d.members.deposit}</th>
                  <th className="px-3 py-3 text-right">{d.members.lunch}</th>
                  <th className="px-3 py-3 text-right">{d.members.dinner}</th>
                  <th className="px-3 py-3 text-right">{d.members.otherMeal}</th>
                  <th className="px-3 py-3 text-right">{d.members.totalMeal}</th>
                  <th className="px-3 py-3 text-right">{d.members.personalCost}</th>
                  <th className="px-3 py-3 text-right">{d.members.totalCost}</th>
                  <th className="px-4 py-3 text-right">{d.members.balance}</th>
                  {isAdmin && <th className="px-4 py-3 text-right">{d.common.actions}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.map((m) => (
                  <tr
                    key={m.id}
                    className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td
                      className="cursor-pointer px-4 py-3"
                      onClick={() => setProfileId(m.id)}
                    >
                      <div className="flex items-center gap-3">
                        <MemberAvatar name={m.name} photoUrl={m.photoUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900 hover:text-emerald-600 dark:text-slate-100 dark:hover:text-emerald-400">
                            {m.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {m.isActive ? d.common.active : d.common.inactive}
                            {m.phone ? ` · ${m.phone}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {m.joinDate}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatMoney(m.totalDeposit, currency, lang)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {formatNum(m.lunchCount, lang)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {formatNum(m.dinnerCount, lang)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {formatNum(m.breakfastCount + m.extraMealCount, lang)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums">
                      {formatNum(m.totalMeals, lang)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatMoney(m.individualExpense, currency, lang)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-medium tabular-nums">
                      {formatMoney(m.totalExpense, currency, lang)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${
                        m.balance >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {m.balance >= 0 ? '+' : ''}
                      {formatMoney(m.balance, currency, lang)}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(m)}
                            title={d.common.edit}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(m)}
                            title={m.isActive ? d.members.deactivate : d.members.activate}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-amber-600 dark:text-slate-400 dark:hover:bg-slate-800"
                          >
                            {m.isActive ? (
                              <UserX className="h-4 w-4" />
                            ) : (
                              <UserCheck className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(m)}
                            title={d.common.delete}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
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
        </div>
      )}

      {/* Member Profile Modal */}
      <Modal
        open={profileId !== null}
        onClose={() => {
          setProfileId(null);
          onClearSelectedMember();
        }}
        title={d.members.profileTitle}
        maxWidthClass="max-w-2xl"
      >
        {profileLoading || !profileData ? (
          <div className="py-10 text-center text-sm text-slate-500">{d.common.loading}</div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
              <MemberAvatar
                name={profileData.member.name}
                photoUrl={profileData.member.photoUrl}
                size="lg"
              />
              <div>
                <h3 className="text-lg font-semibold">{profileData.member.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {profileData.member.isActive ? d.common.active : d.common.inactive}
                  {' · '}
                  {d.members.joinDate}: {profileData.member.joinDate}
                  {profileData.member.phone ? ` · ${profileData.member.phone}` : ''}
                </p>
                {profileData.member.notes && (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {profileData.member.notes}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs text-slate-500">{d.members.deposit}</p>
                <p className="mt-1 font-mono text-base font-semibold">
                  {formatMoney(profileData.stats.totalDeposit, currency, lang)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs text-slate-500">{d.members.totalMeal}</p>
                <p className="mt-1 font-mono text-base font-semibold">
                  {formatNum(profileData.stats.totalMeals, lang)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {d.meals.lunch}: {formatNum(profileData.stats.lunchCount, lang)} ·{' '}
                  {d.meals.dinner}: {formatNum(profileData.stats.dinnerCount, lang)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs text-slate-500">{d.members.totalCost}</p>
                <p className="mt-1 font-mono text-base font-semibold">
                  {formatMoney(profileData.stats.totalExpense, currency, lang)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {d.members.mealCost}: {formatMoney(profileData.stats.mealCost, currency, lang)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs text-slate-500">{d.members.balance}</p>
                <p
                  className={`mt-1 font-mono text-base font-semibold ${
                    profileData.stats.balance >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {profileData.stats.balance >= 0 ? '+' : ''}
                  {formatMoney(profileData.stats.balance, currency, lang)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {d.nav.deposits} ({profileData.deposits.length})
                </h4>
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-800">
                  {profileData.deposits.length === 0 ? (
                    <p className="text-slate-400">{d.common.noData}</p>
                  ) : (
                    profileData.deposits.map((dep) => (
                      <div key={dep.id} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-slate-500">
                          {dep.deposit_date} · {dep.payment_method}
                        </span>
                        <span className="font-mono font-medium">
                          {formatMoney(dep.amount, currency, lang)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {d.members.personalCost} ({profileData.expenses.length})
                </h4>
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-800">
                  {profileData.expenses.length === 0 ? (
                    <p className="text-slate-400">{d.common.noData}</p>
                  ) : (
                    profileData.expenses.map((ex) => (
                      <div key={ex.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-slate-600 dark:text-slate-300">
                          {ex.expense_date} · {ex.title}
                        </span>
                        <span className="font-mono font-medium">
                          {formatMoney(ex.amount, currency, lang)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Add / Edit Member Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingMember ? d.members.editMember : d.members.addMember}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {d.members.name} *
            </label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {d.members.phone}
              </label>
              <input
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {d.members.joinDate} *
              </label>
              <input
                type="date"
                required
                value={formJoinDate}
                onChange={(e) => setFormJoinDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {d.members.photoUrl}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={formPhotoUrl}
                onChange={(e) => setFormPhotoUrl(e.target.value)}
                placeholder="https://..."
                className="min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                {lang === 'bn' ? 'ফাইল বাছাই' : 'Upload'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePhotoFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {d.members.notes}
            </label>
            <input
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          {editingMember && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-600"
              />
              <span>{d.common.active}</span>
            </label>
          )}
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
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
        message={d.members.confirmDelete}
        confirmLabel={d.common.delete}
        cancelLabel={d.common.cancel}
        busy={saving}
      />
    </div>
  );
}
