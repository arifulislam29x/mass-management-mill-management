import React, { useEffect, useState } from 'react';
import { Database, Download, KeyRound, RotateCcw, Upload } from 'lucide-react';
import type { AuditLogRecord, Language } from '../types.ts';
import { apiRequest } from '../lib/api.ts';
import { tDict } from '../lib/i18n.ts';
import { ConfirmModal } from './ui.tsx';

export function AdminSettingsTab({
  settings,
  lang,
  authToken,
  onDataChanged,
  onNotify,
}: {
  settings: Record<string, string>;
  lang: Language;
  authToken: string;
  onDataChanged: () => void;
  onNotify: (type: 'success' | 'error', msg: string) => void;
}) {
  const d = tDict(lang);
  const [messNameEn, setMessNameEn] = useState(settings.mess_name || 'Greenview Mess');
  const [messNameBn, setMessNameBn] = useState(settings.mess_name_bn || 'গ্রিনভিউ মেস');
  const [currency, setCurrency] = useState(settings.currency_symbol || '৳');
  const [enableBreakfast, setEnableBreakfast] = useState(settings.enable_breakfast === 'true');
  const [defaultLang, setDefaultLang] = useState<'bn' | 'en'>(
    settings.default_language === 'en' ? 'en' : 'bn'
  );

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [saving, setSaving] = useState(false);

  const [confirmAction, setConfirmAction] = useState<'load_demo' | 'clear_data' | null>(null);
  const [pendingRestoreJson, setPendingRestoreJson] = useState<unknown | null>(null);

  const loadAuditLogs = async () => {
    try {
      const res = await apiRequest<{ logs: AuditLogRecord[] }>('/api/admin/audit-logs?limit=100', {
        token: authToken,
      });
      setAuditLogs(res.logs);
    } catch {
      setAuditLogs([]);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, [authToken]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PUT',
        token: authToken,
        body: {
          mess_name: messNameEn.trim(),
          mess_name_bn: messNameBn.trim(),
          currency_symbol: currency.trim(),
          enable_breakfast: enableBreakfast ? 'true' : 'false',
          default_language: defaultLang,
        },
      });
      onDataChanged();
      await loadAuditLogs();
      onNotify('success', 'Settings saved');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/auth/password', {
        method: 'POST',
        token: authToken,
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      await loadAuditLogs();
      onNotify('success', 'Admin password updated');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Password update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const data = await apiRequest<unknown>('/api/admin/backup', { token: authToken });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `messledger_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await loadAuditLogs();
      onNotify('success', 'Backup downloaded');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Backup failed');
    }
  };

  const handleSelectRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        setPendingRestoreJson(parsed);
      } catch {
        onNotify('error', 'Invalid JSON backup file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const executeRestore = async () => {
    if (!pendingRestoreJson) return;
    setSaving(true);
    try {
      await apiRequest('/api/admin/restore', {
        method: 'POST',
        token: authToken,
        body: pendingRestoreJson,
      });
      setPendingRestoreJson(null);
      onDataChanged();
      await loadAuditLogs();
      onNotify('success', 'Database restored successfully');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setSaving(false);
    }
  };

  const executeDemoAction = async () => {
    if (!confirmAction) return;
    setSaving(true);
    try {
      const endpoint =
        confirmAction === 'load_demo' ? '/api/admin/demo/load' : '/api/admin/demo/clear';
      await apiRequest(endpoint, { method: 'POST', token: authToken });
      setConfirmAction(null);
      onDataChanged();
      await loadAuditLogs();
      onNotify(
        'success',
        confirmAction === 'load_demo' ? 'Demo dataset loaded' : 'All operational data cleared'
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{d.settings.title}</h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* General Settings */}
        <form
          onSubmit={handleSaveSettings}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <h3 className="text-sm font-semibold">{d.settings.general}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">{d.settings.messNameEn}</label>
              <input
                type="text"
                required
                value={messNameEn}
                onChange={(e) => setMessNameEn(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">{d.settings.messNameBn}</label>
              <input
                type="text"
                required
                value={messNameBn}
                onChange={(e) => setMessNameBn(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">{d.settings.currency}</label>
              <input
                type="text"
                required
                maxLength={5}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">{d.settings.defaultLang}</label>
              <select
                value={defaultLang}
                onChange={(e) => setDefaultLang(e.target.value as 'bn' | 'en')}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="bn">বাংলা</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={enableBreakfast}
              onChange={(e) => setEnableBreakfast(e.target.checked)}
              className="h-4 w-4 rounded accent-emerald-600"
            />
            <span>{d.settings.enableBreakfast}</span>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {d.common.save}
          </button>
        </form>

        {/* Backup, Restore & Demo Controls */}
        <div className="space-y-5">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold">{d.settings.backupRestore}</h3>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <Download className="h-4 w-4" />
                {d.settings.downloadBackup}
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                <Upload className="h-4 w-4" />
                {d.settings.restoreBackup}
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleSelectRestoreFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold">{d.settings.demoSection}</h3>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction('load_demo')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <Database className="h-4 w-4" />
                {d.settings.loadDemo}
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction('clear_data')}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <RotateCcw className="h-4 w-4" />
                {d.settings.clearData}
              </button>
            </div>
          </div>

          <form
            onSubmit={handleChangePassword}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-slate-500" />
              {d.settings.changePassword}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="password"
                required
                placeholder={d.settings.currentPassword}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder={d.settings.newPassword}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {d.common.save}
            </button>
          </form>
        </div>
      </div>

      {/* Audit Log */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h3 className="text-sm font-semibold">{d.settings.auditLog}</h3>
        </div>
        <div className="max-h-96 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <th className="px-4 py-2.5">Time (UTC)</th>
                <th className="px-4 py-2.5">Admin</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2 font-mono text-slate-500">{log.created_at}</td>
                  <td className="px-4 py-2 font-medium">{log.admin_username}</td>
                  <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-300">
                    {log.action} · {log.entity_type}
                  </td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={executeDemoAction}
        title={confirmAction === 'load_demo' ? d.settings.loadDemo : d.settings.clearData}
        message={
          confirmAction === 'load_demo'
            ? lang === 'bn'
              ? 'ডেমো ডাটা লোড করলে বর্তমান মেস ডাটা প্রতিস্থাপিত হবে। এগোতে চান?'
              : 'Loading sample demo data will replace current mess records. Continue?'
            : lang === 'bn'
              ? 'সকল সদস্য, মিল, বাজার, জমা এবং খরচের তথ্য স্থায়ীভাবে মুছে যাবে। নিশ্চিত?'
              : 'This will permanently wipe all members, meals, bazar, deposits, and expenses. Continue?'
        }
        confirmLabel={d.common.confirm}
        cancelLabel={d.common.cancel}
        danger={confirmAction === 'clear_data'}
        busy={saving}
      />

      <ConfirmModal
        open={pendingRestoreJson !== null}
        onClose={() => setPendingRestoreJson(null)}
        onConfirm={executeRestore}
        title={d.settings.restoreBackup}
        message={
          lang === 'bn'
            ? 'ব্যাকআপ ফাইল রিস্টোর করলে বর্তমান সকল হিসাব ডাটা ওই ব্যাকআপ দ্বারা প্রতিস্থাপিত হবে। নিশ্চিত?'
            : 'Restoring this backup will replace all current database tables atomically. Continue?'
        }
        confirmLabel={d.common.confirm}
        cancelLabel={d.common.cancel}
        busy={saving}
      />
    </div>
  );
}
