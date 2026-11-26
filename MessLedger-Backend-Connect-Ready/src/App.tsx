import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Calendar,
  FileSpreadsheet,
  Globe,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Settings,
  ShoppingBasket,
  Sun,
  Users,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import type { AdminUser, Language, MonthlyOverview, NavTab, ThemeMode } from './types.ts';
import { apiRequest } from './lib/api.ts';
import { formatMonthLabel, tDict } from './lib/i18n.ts';
import { AuthModal } from './components/AuthModal.tsx';
import { PwaInstall } from './components/PwaInstall.tsx';
import { OverviewTab } from './components/OverviewTab.tsx';
import {
  BackendOffline,
  DashboardSkeleton,
  ErrorBoundary,
  ToastBanner,
} from './components/ui.tsx';

const AdminSettingsTab = lazy(() =>
  import('./components/AdminSettingsTab.tsx').then((m) => ({ default: m.AdminSettingsTab }))
);
const BazarTab = lazy(() =>
  import('./components/BazarTab.tsx').then((m) => ({ default: m.BazarTab }))
);
const DepositsTab = lazy(() =>
  import('./components/DepositsTab.tsx').then((m) => ({ default: m.DepositsTab }))
);
const ExpensesTab = lazy(() =>
  import('./components/ExpensesTab.tsx').then((m) => ({ default: m.ExpensesTab }))
);
const MealsTab = lazy(() =>
  import('./components/MealsTab.tsx').then((m) => ({ default: m.MealsTab }))
);
const MembersTab = lazy(() =>
  import('./components/MembersTab.tsx').then((m) => ({ default: m.MembersTab }))
);
const ReportsTab = lazy(() =>
  import('./components/ReportsTab.tsx').then((m) => ({ default: m.ReportsTab }))
);

const VALID_TABS: NavTab[] = [
  'overview',
  'members',
  'meals',
  'bazar',
  'expenses',
  'deposits',
  'reports',
  'settings',
];

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch {
    // storage unavailable (private mode) — use fallback
  }
  return fallback;
}

function readInitialTheme(): ThemeMode {
  const stored = readStored<ThemeMode>('messledger.theme', ['light', 'dark'], 'light');
  try {
    if (!window.localStorage.getItem('messledger.theme')) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  } catch {
    // ignore
  }
  return stored;
}

function readHashTab(): NavTab {
  const h = window.location.hash.replace('#', '') as NavTab;
  return VALID_TABS.includes(h) ? h : 'overview';
}

function getDefaultMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function App() {
  const [lang, setLang] = useState<Language>(() =>
    readStored<Language>('messledger.lang', ['bn', 'en'], 'bn')
  );
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);
  const [activeTab, setActiveTab] = useState<NavTab>(readHashTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [monthKey, setMonthKey] = useState<string>(getDefaultMonthKey());
  const [availableMonths, setAvailableMonths] = useState<string[]>([getDefaultMonthKey()]);
  const [overview, setOverview] = useState<MonthlyOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Security: Keep Admin Bearer token strictly in React memory (never localStorage/sessionStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const d = tDict(lang);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      window.localStorage.setItem('messledger.lang', lang);
    } catch {
      // ignore
    }
  }, [lang]);

  useEffect(() => {
    try {
      window.localStorage.setItem('messledger.theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Keep the active tab in the URL hash so refresh / back button / shared links work
  useEffect(() => {
    if (window.location.hash.replace('#', '') !== activeTab) {
      window.history.replaceState(null, '', `#${activeTab}`);
    }
    window.scrollTo({ top: 0 });
  }, [activeTab]);

  useEffect(() => {
    const onHash = () => setActiveTab(readHashTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadDashboardData = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const [monthsRes, overviewRes] = await Promise.all([
        apiRequest<{ currentMonth: string; months: string[] }>('/api/public/months'),
        apiRequest<MonthlyOverview>(`/api/public/overview?month=${encodeURIComponent(monthKey)}`),
      ]);
      setAvailableMonths(monthsRes.months);
      setOverview(overviewRes);
      setLoadError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load mess data';
      setLoadError(msg);
      notify('error', msg);
    } finally {
      setLoadingOverview(false);
    }
  }, [monthKey, notify]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, refreshTick]);

  const triggerRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  const handleLogout = async () => {
    if (authToken) {
      try {
        await apiRequest('/api/auth/logout', { method: 'POST', token: authToken });
      } catch {
        // Ignore network errors on logout cleanup
      }
    }
    setAuthToken(null);
    setAdminUser(null);
    if (activeTab === 'settings') setActiveTab('overview');
    notify('success', lang === 'bn' ? 'অ্যাডমিন সেশন লগআউট হয়েছে' : 'Logged out');
  };

  const isAdmin = Boolean(authToken && adminUser);
  const messName =
    overview &&
    (lang === 'bn'
      ? overview.settings.mess_name_bn || overview.settings.mess_name
      : overview.settings.mess_name);
  const currency = overview?.settings.currency_symbol || '৳';

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode; adminOnly?: boolean }> =
    [
      { id: 'overview', label: d.nav.overview, icon: <LayoutDashboard className="h-4 w-4" /> },
      { id: 'members', label: d.nav.members, icon: <Users className="h-4 w-4" /> },
      { id: 'meals', label: d.nav.meals, icon: <Utensils className="h-4 w-4" /> },
      { id: 'bazar', label: d.nav.bazar, icon: <ShoppingBasket className="h-4 w-4" /> },
      { id: 'expenses', label: d.nav.expenses, icon: <Receipt className="h-4 w-4" /> },
      { id: 'deposits', label: d.nav.deposits, icon: <Wallet className="h-4 w-4" /> },
      { id: 'reports', label: d.nav.reports, icon: <FileSpreadsheet className="h-4 w-4" /> },
      {
        id: 'settings',
        label: d.nav.settings,
        icon: <Settings className="h-4 w-4" />,
        adminOnly: true,
      },
    ];

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  const handleSelectNav = (tab: NavTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const handleInspectMember = (memberId: number) => {
    setSelectedMemberId(memberId);
    setActiveTab('members');
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <button
            type="button"
            onClick={() => handleSelectNav('overview')}
            className="flex items-center gap-2.5 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/30">
              <BarChart3 className="h-4 w-4" />
            </span>
            <span className="truncate text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {messName || 'MessLedger'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1 text-slate-500 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleNavItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectNav(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-50 text-emerald-700 shadow-[inset_3px_0_0_0_#059669] dark:bg-emerald-950/60 dark:text-emerald-400 dark:shadow-[inset_3px_0_0_0_#34d399]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <p className="font-medium text-slate-700 dark:text-slate-300">
            {isAdmin ? `${d.adminActive} · ${adminUser?.username}` : d.publicReadOnly}
          </p>
          <p className="mt-1">{d.appTagline}</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                {navItems.find((i) => i.id === activeTab)?.label}
              </h1>
              {overview && (
                <p className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">
                  {formatMonthLabel(monthKey, lang)} ·{' '}
                  {overview.isClosed ? d.header.monthClosed : d.header.monthOpen}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PwaInstall lang={lang} />
            {/* Month Switcher */}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800">
              <Calendar className="hidden h-3.5 w-3.5 text-slate-500 sm:block" />
              <input
                type="month"
                aria-label={d.header.selectMonth}
                value={monthKey}
                onChange={(e) => {
                  if (e.target.value) setMonthKey(e.target.value);
                }}
                list="available-months-list"
                className="bg-transparent font-mono text-xs font-medium text-slate-800 focus:outline-none dark:text-slate-100"
              />
              <datalist id="available-months-list">
                {availableMonths.map((mk) => (
                  <option key={mk} value={mk} />
                ))}
              </datalist>
            </div>

            {/* Language Toggle */}
            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'bn' ? 'en' : 'bn'))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
              title="Switch Language"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{lang === 'bn' ? 'EN' : 'বাংলা'}</span>
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shrink-0"
              aria-label={theme === 'light' ? d.header.darkMode : d.header.lightMode}
              title={theme === 'light' ? d.header.darkMode : d.header.lightMode}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* Admin Auth Action */}
            {isAdmin ? (
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{d.header.logout}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 whitespace-nowrap shrink-0"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>{d.header.adminLogin}</span>
              </button>
            )}
          </div>
        </header>

        {/* Viewport Body */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6">
          {loadingOverview && !overview && !loadError ? (
            <DashboardSkeleton />
          ) : !overview && loadError ? (
            <BackendOffline
              lang={lang}
              message={loadError}
              onRetry={triggerRefresh}
              retrying={loadingOverview}
            />
          ) : (
            <ErrorBoundary lang={lang} key={activeTab}>
            <Suspense fallback={<DashboardSkeleton />}>
            <div className="page-enter">
              {activeTab === 'overview' && overview && (
                <OverviewTab
                  overview={overview}
                  currency={currency}
                  lang={lang}
                  isAdmin={isAdmin}
                  onNavigate={setActiveTab}
                  onOpenAuth={() => setAuthModalOpen(true)}
                  onSelectMember={handleInspectMember}
                />
              )}

              {activeTab === 'members' && (
                <MembersTab
                  monthKey={monthKey}
                  currency={currency}
                  lang={lang}
                  isAdmin={isAdmin}
                  authToken={authToken}
                  selectedMemberId={selectedMemberId}
                  onClearSelectedMember={() => setSelectedMemberId(null)}
                  onDataChanged={triggerRefresh}
                  onNotify={notify}
                />
              )}

              {activeTab === 'meals' && (
                <MealsTab
                  monthKey={monthKey}
                  lang={lang}
                  isAdmin={isAdmin}
                  authToken={authToken}
                  onDataChanged={triggerRefresh}
                  onNotify={notify}
                />
              )}

              {activeTab === 'bazar' && (
                <BazarTab
                  monthKey={monthKey}
                  currency={currency}
                  lang={lang}
                  isAdmin={isAdmin}
                  authToken={authToken}
                  onDataChanged={triggerRefresh}
                  onNotify={notify}
                />
              )}

              {activeTab === 'expenses' && (
                <ExpensesTab
                  monthKey={monthKey}
                  currency={currency}
                  lang={lang}
                  isAdmin={isAdmin}
                  authToken={authToken}
                  onDataChanged={triggerRefresh}
                  onNotify={notify}
                />
              )}

              {activeTab === 'deposits' && (
                <DepositsTab
                  monthKey={monthKey}
                  currency={currency}
                  lang={lang}
                  isAdmin={isAdmin}
                  authToken={authToken}
                  onDataChanged={triggerRefresh}
                  onNotify={notify}
                />
              )}

              {activeTab === 'reports' && overview && (
                <ReportsTab
                  overview={overview}
                  currency={currency}
                  lang={lang}
                  isAdmin={isAdmin}
                  authToken={authToken}
                  onDataChanged={triggerRefresh}
                  onNotify={notify}
                />
              )}

              {activeTab === 'settings' && isAdmin && overview && authToken && (
                <AdminSettingsTab
                  settings={overview.settings}
                  lang={lang}
                  authToken={authToken}
                  onDataChanged={triggerRefresh}
                  onNotify={notify}
                />
              )}
            </div>
            </Suspense>
            </ErrorBoundary>
          )}
        </main>
      </div>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        lang={lang}
        onAuthenticated={(token, admin) => {
          setAuthToken(token);
          setAdminUser(admin);
          notify(
            'success',
            lang === 'bn'
              ? `স্বাগতম, ${admin.displayName}`
              : `Signed in as ${admin.displayName}`
          );
        }}
      />

      <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
