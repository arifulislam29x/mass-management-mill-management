import React, { useMemo, useState } from 'react';
import { AlertCircle, MessageCircle, Search } from 'lucide-react';
import type { Language, MonthlyOverview, NavTab } from '../types.ts';
import { formatMoney, formatMonthLabel, formatNum, tDict } from '../lib/i18n.ts';
import { DashboardChartsGrid } from './Charts.tsx';
import { EmptyState, MemberAvatar } from './ui.tsx';

export function OverviewTab({
  overview,
  currency,
  lang,
  isAdmin,
  onNavigate,
  onOpenAuth,
  onSelectMember,
}: {
  overview: MonthlyOverview;
  currency: string;
  lang: Language;
  isAdmin: boolean;
  onNavigate: (tab: NavTab) => void;
  onOpenAuth: () => void;
  onSelectMember: (memberId: number) => void;
}) {
  const d = tDict(lang);
  const { totals, members } = overview;
  const showBreakfast = overview.settings.enable_breakfast === 'true';
  const [query, setQuery] = useState('');
  const bn = lang === 'bn';

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q) || m.phone.includes(q));
  }, [members, query]);

  const dueMembers = useMemo(
    () => members.filter((m) => m.isActive && m.balance < 0).sort((a, b) => a.balance - b.balance),
    [members]
  );

  const buildReminderLink = (name: string, phone: string, amount: number) => {
    // Bangladesh numbers: 01XXXXXXXXX -> 8801XXXXXXXXX for wa.me
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = `88${digits}`;
    if (!digits) return null;
    const msg = bn
      ? `আসসালামু আলাইকুম ${name}, ${formatMonthLabel(overview.monthKey, lang)} মাসে মেসে আপনার বকেয়া ${formatMoney(Math.abs(amount), currency, lang)}। অনুগ্রহ করে দ্রুত পরিশোধ করুন। ধন্যবাদ।`
      : `Hi ${name}, your mess dues for ${formatMonthLabel(overview.monthKey, lang)} are ${formatMoney(Math.abs(amount), currency, lang)}. Please settle at your earliest convenience. Thank you.`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
  };

  const kpis = [
    {
      label: d.kpi.totalMembers,
      value: formatNum(totals.memberCount, lang, 0),
      meta: `${formatNum(totals.activeMemberCount, lang, 0)} ${d.kpi.activeMembers}`,
      tone: 'neutral',
    },
    {
      label: d.kpi.totalDeposit,
      value: formatMoney(totals.totalDeposit, currency, lang),
      meta: overview.monthKey,
      tone: 'neutral',
    },
    {
      label: d.kpi.totalBazar,
      value: formatMoney(totals.bazarExpense, currency, lang),
      meta:
        totals.commonExtraExpense > 0
          ? `+ ${formatMoney(totals.commonExtraExpense, currency, lang)} ${d.kpi.commonExtra}`
          : d.kpi.commonExtra + ': 0',
      tone: 'neutral',
    },
    {
      label: d.kpi.remainingBalance,
      value: formatMoney(totals.remainingBalance, currency, lang),
      meta:
        totals.remainingBalance >= 0
          ? d.common.surplus
          : d.common.due,
      tone: totals.remainingBalance >= 0 ? 'positive' : 'negative',
    },
    {
      label: d.kpi.totalMeals,
      value: formatNum(totals.totalMeals, lang),
      meta: `${d.kpi.individualExtra}: ${formatMoney(totals.totalIndividualExpense, currency, lang)}`,
      tone: 'neutral',
    },
    {
      label: d.kpi.mealRate,
      value: formatMoney(totals.mealRate, currency, lang),
      meta: d.kpi.perMeal,
      tone: 'accent',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 6 Core KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{item.label}</p>
            <p
              className={`mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums ${
                item.tone === 'positive'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : item.tone === 'negative'
                    ? 'text-red-600 dark:text-red-400'
                    : item.tone === 'accent'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {item.value}
            </p>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{item.meta}</p>
          </div>
        ))}
      </div>

      {members.length === 0 ? (
        <EmptyState
          title={d.common.noData}
          description={
            isAdmin
              ? lang === 'bn'
                ? 'মেসের হিসাব শুরু করতে প্রথমে সদস্য যোগ করুন অথবা অ্যাডমিন সেটিংস থেকে ডেমো ডাটা লোড করুন।'
                : 'Add your first mess members or load sample demo data from Admin Settings to begin.'
              : lang === 'bn'
                ? 'অ্যাডমিন এখনো এই মাসের সদস্য বা হিসাব যোগ করেননি। অ্যাডমিন হিসেবে লগইন করে তথ্য যোগ করুন।'
                : 'No members or records have been added for this month yet. Sign in as Admin to begin.'
          }
          actionLabel={isAdmin ? d.members.addMember : d.header.adminLogin}
          onAction={() => (isAdmin ? onNavigate('members') : onOpenAuth())}
        />
      ) : (
        <>
          {dueMembers.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-5 dark:border-red-900/50 dark:bg-red-950/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
                  {bn
                    ? `${formatNum(dueMembers.length, lang, 0)} জন সদস্যের বকেয়া আছে`
                    : `${formatNum(dueMembers.length, lang, 0)} member(s) with outstanding dues`}
                </h2>
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {dueMembers.map((m) => {
                  const link = isAdmin ? buildReminderLink(m.name, m.phone, m.balance) : null;
                  return (
                    <li
                      key={m.memberId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-red-100 bg-white px-3 py-2 dark:border-red-900/40 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectMember(m.memberId)}
                        className="flex min-w-0 items-center gap-2.5 text-left"
                      >
                        <MemberAvatar name={m.name} photoUrl={m.photoUrl} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {m.name}
                          </span>
                          <span className="block font-mono text-xs font-semibold text-red-600 dark:text-red-400">
                            {formatMoney(Math.abs(m.balance), currency, lang)}
                          </span>
                        </span>
                      </button>
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                          title={bn ? 'হোয়াটসঅ্যাপে রিমাইন্ডার পাঠান' : 'Send WhatsApp reminder'}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          {bn ? 'রিমাইন্ড' : 'Remind'}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Complete Member Financial Ledger Summary */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {d.members.title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'bn'
                    ? 'সদস্যের নামের ওপর ক্লিক করে ব্যক্তিগত বিস্তারিত হিসাব দেখুন'
                    : 'Click any member row to inspect their complete personal profile and history'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={bn ? 'নাম বা ফোন খুঁজুন' : 'Search name or phone'}
                    aria-label={bn ? 'সদস্য খুঁজুন' : 'Search members'}
                    className="w-44 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:w-56"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('reports')}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  {d.nav.reports}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                    <th className="px-4 py-3">{d.common.member}</th>
                    <th className="px-3 py-3 text-right">{d.members.deposit}</th>
                    {showBreakfast && <th className="px-3 py-3 text-right">{d.members.breakfast}</th>}
                    <th className="px-3 py-3 text-right">{d.members.lunch}</th>
                    <th className="px-3 py-3 text-right">{d.members.dinner}</th>
                    <th className="px-3 py-3 text-right">{d.members.totalMeal}</th>
                    <th className="px-3 py-3 text-right">{d.members.mealCost}</th>
                    <th className="px-3 py-3 text-right">{d.members.personalCost}</th>
                    <th className="px-3 py-3 text-right">{d.members.totalCost}</th>
                    <th className="px-4 py-3 text-right">{d.members.balance}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMembers.map((m) => {
                    const isPositive = m.balance >= 0;
                    return (
                      <tr
                        key={m.memberId}
                        onClick={() => onSelectMember(m.memberId)}
                        className="cursor-pointer transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <MemberAvatar name={m.name} photoUrl={m.photoUrl} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                                {m.name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {m.isActive ? d.common.active : d.common.inactive}
                                {m.phone ? ` · ${m.phone}` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {formatMoney(m.totalDeposit, currency, lang)}
                        </td>
                        {showBreakfast && (
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                            {formatNum(m.breakfastCount, lang)}
                          </td>
                        )}
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {formatNum(m.lunchCount, lang)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {formatNum(m.dinnerCount, lang)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatNum(m.totalMeals, lang)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatMoney(m.mealCost, currency, lang)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatMoney(m.individualExpense, currency, lang)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                          {formatMoney(m.totalExpense, currency, lang)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${
                            isPositive
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {formatMoney(m.balance, currency, lang)}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredMembers.length === 0 && (
                    <tr>
                      <td
                        colSpan={showBreakfast ? 10 : 9}
                        className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400"
                      >
                        {bn ? 'কোনো সদস্য পাওয়া যায়নি' : 'No members match your search'}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold dark:border-slate-800 dark:bg-slate-800/60">
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{d.common.total}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatMoney(totals.totalDeposit, currency, lang)}
                    </td>
                    {showBreakfast && (
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {formatNum(
                          members.reduce((s, m) => s + m.breakfastCount, 0),
                          lang
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatNum(
                        members.reduce((s, m) => s + m.lunchCount, 0),
                        lang
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatNum(
                        members.reduce((s, m) => s + m.dinnerCount, 0),
                        lang
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatNum(totals.totalMeals, lang)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatMoney(
                        members.reduce((s, m) => s + m.mealCost, 0),
                        currency,
                        lang
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatMoney(totals.totalIndividualExpense, currency, lang)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatMoney(totals.totalMessExpense, currency, lang)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono tabular-nums ${
                        totals.remainingBalance >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {totals.remainingBalance >= 0 ? '+' : ''}
                      {formatMoney(totals.remainingBalance, currency, lang)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* 6 Data-Driven Analytics Charts */}
          <DashboardChartsGrid overview={overview} currency={currency} lang={lang} />
        </>
      )}
    </div>
  );
}
