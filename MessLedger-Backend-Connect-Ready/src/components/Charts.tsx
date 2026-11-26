import React, { useState } from 'react';
import type { Language, MonthlyOverview } from '../types.ts';
import { formatMoney, formatMonthLabel, formatNum, tDict } from '../lib/i18n.ts';

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {subtitle && (
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function NoChartData({ lang }: { lang: Language }) {
  return (
    <div className="flex h-48 items-center justify-center text-xs text-slate-400 dark:text-slate-500">
      {tDict(lang).common.noData}
    </div>
  );
}

export function DashboardChartsGrid({
  overview,
  currency,
  lang,
}: {
  overview: MonthlyOverview;
  currency: string;
  lang: Language;
}) {
  const d = tDict(lang);
  const [hoverDailyIdx, setHoverDailyIdx] = useState<number | null>(null);
  const [hoverHistIdx, setHoverHistIdx] = useState<number | null>(null);

  const daily = overview.charts.dailyExpenses;
  const history = overview.charts.monthlyHistory;
  const members = overview.members;

  const maxDaily = Math.max(1, ...daily.map((x) => x.total));
  const maxHistExpense = Math.max(1, ...history.map((x) => Math.max(x.totalDeposit, x.totalExpense)));
  const maxMemberMeal = Math.max(1, ...members.map((m) => m.totalMeals));
  const maxMemberDeposit = Math.max(1, ...members.map((m) => m.totalDeposit));
  const maxAbsBalance = Math.max(1, ...members.map((m) => Math.abs(m.balance)));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* 1. Daily Expense Chart */}
      <ChartCard
        title={d.charts.dailyExpense}
        subtitle={
          hoverDailyIdx !== null && daily[hoverDailyIdx]
            ? `${daily[hoverDailyIdx].date} · ${formatMoney(daily[hoverDailyIdx].total, currency, lang)}`
            : `${daily.length} ${lang === 'bn' ? 'দিন' : 'days'}`
        }
      >
        {daily.length === 0 ? (
          <NoChartData lang={lang} />
        ) : (
          <div className="relative h-52">
            <svg viewBox="0 0 420 175" className="h-full w-full overflow-visible">
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const y = 140 - t * 120;
                return (
                  <g key={t}>
                    <line
                      x1="36"
                      y1={y}
                      x2="412"
                      y2={y}
                      className="stroke-slate-100 dark:stroke-slate-800"
                      strokeWidth="1"
                    />
                    <text
                      x="30"
                      y={y + 3}
                      textAnchor="end"
                      className="fill-slate-400 text-[9px] font-mono"
                    >
                      {Math.round(maxDaily * t)}
                    </text>
                  </g>
                );
              })}

              {daily.map((pt, idx) => {
                const slotW = 368 / Math.max(daily.length, 1);
                const barW = Math.min(24, Math.max(6, slotW * 0.62));
                const x = 42 + idx * slotW + (slotW - barW) / 2;
                const hBazar = (pt.bazar / maxDaily) * 120;
                const hExtra = ((pt.commonExtra + pt.individualExtra) / maxDaily) * 120;
                const isHover = hoverDailyIdx === idx;
                return (
                  <g
                    key={pt.date}
                    onMouseEnter={() => setHoverDailyIdx(idx)}
                    onMouseLeave={() => setHoverDailyIdx(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={x}
                      y={140 - hBazar}
                      width={barW}
                      height={Math.max(0, hBazar)}
                      rx="2"
                      className={
                        isHover
                          ? 'fill-emerald-500'
                          : 'fill-emerald-600/85 dark:fill-emerald-500/80'
                      }
                    />
                    {hExtra > 0 && (
                      <rect
                        x={x}
                        y={140 - hBazar - hExtra}
                        width={barW}
                        height={hExtra}
                        rx="2"
                        className="fill-amber-500/85"
                      />
                    )}
                    <text
                      x={x + barW / 2}
                      y="157"
                      textAnchor="middle"
                      className="fill-slate-500 text-[9px] font-mono dark:fill-slate-400"
                    >
                      {pt.date.slice(8)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="mt-1 flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
                {lang === 'bn' ? 'বাজার' : 'Bazar'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" />
                {lang === 'bn' ? 'অতিরিক্ত খরচ' : 'Extra'}
              </span>
            </div>
          </div>
        )}
      </ChartCard>

      {/* 2. Monthly Income (Deposit) vs Expense Chart */}
      <ChartCard
        title={d.charts.incomeVsExpense}
        subtitle={
          hoverHistIdx !== null && history[hoverHistIdx]
            ? `${formatMonthLabel(history[hoverHistIdx].monthKey, lang)}`
            : `${history.length} ${lang === 'bn' ? 'মাস' : 'months'}`
        }
      >
        {history.length === 0 ? (
          <NoChartData lang={lang} />
        ) : (
          <div className="relative h-52">
            <svg viewBox="0 0 420 175" className="h-full w-full overflow-visible">
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const y = 140 - t * 120;
                return (
                  <g key={t}>
                    <line
                      x1="44"
                      y1={y}
                      x2="412"
                      y2={y}
                      className="stroke-slate-100 dark:stroke-slate-800"
                      strokeWidth="1"
                    />
                    <text
                      x="38"
                      y={y + 3}
                      textAnchor="end"
                      className="fill-slate-400 text-[9px] font-mono"
                    >
                      {Math.round(maxHistExpense * t)}
                    </text>
                  </g>
                );
              })}
              {history.map((h, idx) => {
                const slotW = 360 / Math.max(history.length, 1);
                const barW = Math.min(20, Math.max(8, slotW * 0.28));
                const cx = 48 + idx * slotW + slotW / 2;
                const hDep = (h.totalDeposit / maxHistExpense) * 120;
                const hExp = (h.totalExpense / maxHistExpense) * 120;
                return (
                  <g
                    key={h.monthKey}
                    onMouseEnter={() => setHoverHistIdx(idx)}
                    onMouseLeave={() => setHoverHistIdx(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={cx - barW - 2}
                      y={140 - hDep}
                      width={barW}
                      height={Math.max(0, hDep)}
                      rx="2"
                      className="fill-sky-600/85 dark:fill-sky-500/85"
                    />
                    <rect
                      x={cx + 2}
                      y={140 - hExp}
                      width={barW}
                      height={Math.max(0, hExp)}
                      rx="2"
                      className="fill-slate-700 dark:fill-slate-400"
                    />
                    <text
                      x={cx}
                      y="157"
                      textAnchor="middle"
                      className="fill-slate-500 text-[9px] font-mono dark:fill-slate-400"
                    >
                      {h.monthKey.slice(2)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="mt-1 flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-sky-600" />
                {d.kpi.totalDeposit}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-slate-700 dark:bg-slate-400" />
                {lang === 'bn' ? 'মোট খরচ' : 'Total Expense'}
              </span>
            </div>
          </div>
        )}
      </ChartCard>

      {/* 3. Monthly Expense Trend */}
      <ChartCard title={d.charts.monthlyTrend}>
        {history.length === 0 ? (
          <NoChartData lang={lang} />
        ) : (
          <div className="space-y-3">
            {history.map((h) => {
              const pct = Math.min(100, (h.totalExpense / maxHistExpense) * 100);
              return (
                <div key={h.monthKey} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {formatMonthLabel(h.monthKey, lang)}
                    </span>
                    <span className="font-mono text-slate-600 dark:text-slate-300">
                      {formatMoney(h.totalExpense, currency, lang)} ·{' '}
                      {formatNum(h.mealRate, lang)}/{d.kpi.perMeal}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all dark:bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>

      {/* 4. Meal Comparison Chart */}
      <ChartCard title={d.charts.mealComparison}>
        {members.length === 0 ? (
          <NoChartData lang={lang} />
        ) : (
          <div className="space-y-3">
            {members.map((m) => {
              const lunchPct = (m.lunchCount / maxMemberMeal) * 100;
              const dinnerPct = (m.dinnerCount / maxMemberMeal) * 100;
              const otherPct = ((m.breakfastCount + m.extraMealCount) / maxMemberMeal) * 100;
              return (
                <div key={m.memberId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                      {m.name}
                    </span>
                    <span className="font-mono text-slate-600 dark:text-slate-400">
                      {formatNum(m.totalMeals, lang)} ({d.meals.lunch}:{formatNum(m.lunchCount, lang)} ·{' '}
                      {d.meals.dinner}:{formatNum(m.dinnerCount, lang)})
                    </span>
                  </div>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full bg-emerald-600 dark:bg-emerald-500"
                      style={{ width: `${lunchPct}%` }}
                    />
                    <div
                      className="h-full bg-sky-500"
                      style={{ width: `${dinnerPct}%` }}
                    />
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${otherPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-4 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
                {d.meals.lunch}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-sky-500" />
                {d.meals.dinner}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" />
                {d.meals.extra}
              </span>
            </div>
          </div>
        )}
      </ChartCard>

      {/* 5. Member Deposit Chart */}
      <ChartCard title={d.charts.memberDeposit}>
        {members.length === 0 ? (
          <NoChartData lang={lang} />
        ) : (
          <div className="space-y-3">
            {members.map((m) => {
              const pct = Math.min(100, (m.totalDeposit / maxMemberDeposit) * 100);
              return (
                <div key={m.memberId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                      {m.name}
                    </span>
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                      {formatMoney(m.totalDeposit, currency, lang)}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-sky-600 dark:bg-sky-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>

      {/* 6. Remaining Balance Chart */}
      <ChartCard title={d.charts.remainingBalance}>
        {members.length === 0 ? (
          <NoChartData lang={lang} />
        ) : (
          <div className="space-y-3">
            {members.map((m) => {
              const isSurplus = m.balance >= 0;
              const pct = Math.min(100, (Math.abs(m.balance) / maxAbsBalance) * 100);
              return (
                <div key={m.memberId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                      {m.name}
                    </span>
                    <span
                      className={`font-mono font-medium ${
                        isSurplus
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {isSurplus ? '+' : ''}
                      {formatMoney(m.balance, currency, lang)} ·{' '}
                      {isSurplus ? d.common.surplus : d.common.due}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full ${
                        isSurplus
                          ? 'bg-emerald-600 dark:bg-emerald-500'
                          : 'bg-red-600 dark:bg-red-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>
    </div>
  );
}
