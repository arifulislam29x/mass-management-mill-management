import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import type { AdminUser, Language } from '../types.ts';
import { apiRequest } from '../lib/api.ts';
import { tDict } from '../lib/i18n.ts';
import { Modal } from './ui.tsx';

export function AuthModal({
  open,
  onClose,
  lang,
  onAuthenticated,
}: {
  open: boolean;
  onClose: () => void;
  lang: Language;
  onAuthenticated: (token: string, admin: AdminUser) => void;
}) {
  const d = tDict(lang);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setPassword('');
    setChecking(true);
    apiRequest<{ needsSetup: boolean; envConfigured: boolean }>('/api/auth/status')
      .then((res) => {
        setNeedsSetup(res.needsSetup);
      })
      .catch(() => {
        setNeedsSetup(false);
      })
      .finally(() => setChecking(false));
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const endpoint = needsSetup ? '/api/auth/setup' : '/api/auth/login';
      const body = needsSetup
        ? { username: username.trim(), displayName: displayName.trim() || undefined, password }
        : { username: username.trim(), password };
      const res = await apiRequest<{ token: string; admin: AdminUser }>(endpoint, {
        method: 'POST',
        body,
      });
      onAuthenticated(res.token, res.admin);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={needsSetup ? d.auth.setupTitle : d.auth.loginTitle}
      maxWidthClass="max-w-md"
    >
      {checking ? (
        <div className="py-8 text-center text-sm text-slate-500">{d.common.loading}</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
            {needsSetup ? (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            )}
            <span>{needsSetup ? d.auth.setupDesc : d.auth.loginDesc}</span>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {d.auth.username}
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {needsSetup && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {d.auth.displayName}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Mess Manager"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {d.auth.password}
            </label>
            <input
              type="password"
              required
              minLength={needsSetup ? 8 : 1}
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {d.common.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {needsSetup ? d.auth.setupBtn : d.auth.loginBtn}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
