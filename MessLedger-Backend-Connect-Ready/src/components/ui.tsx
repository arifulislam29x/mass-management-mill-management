import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, ServerCrash, X } from 'lucide-react';
import type { Language } from '../types.ts';
import { tDict } from '../lib/i18n.ts';

export function Modal({
  open,
  onClose,
  title,
  maxWidthClass = 'max-w-lg',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
          <h2 id="modal-title" className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = true,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-md">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={`mt-0.5 h-5 w-5 shrink-0 ${
              danger ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
            }`}
          />
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors whitespace-nowrap disabled:opacity-50 ${
              danger
                ? 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ToastBanner({
  toast,
  onDismiss,
}: {
  toast: { type: 'success' | 'error'; message: string } | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;
  const isSuccess = toast.type === 'success';
  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 shadow-lg ${
        isSuccess
          ? 'border-emerald-200 bg-white text-slate-900 dark:border-emerald-900/60 dark:bg-slate-900 dark:text-slate-100'
          : 'border-red-200 bg-white text-slate-900 dark:border-red-900/60 dark:bg-slate-900 dark:text-slate-100'
      }`}
      role="status"
    >
      {isSuccess ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
      )}
      <p className="text-sm font-medium">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/60">
      <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <p className="mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function MemberAvatar({
  name,
  photoUrl,
  size = 'md',
}: {
  name: string;
  photoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const sizeClass =
    size === 'lg'
      ? 'h-14 w-14 text-base'
      : size === 'sm'
        ? 'h-8 w-8 text-xs'
        : 'h-10 w-10 text-sm';

  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-700`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200`}
    >
      {initials || '?'}
    </div>
  );
}

export function PaginationBar({
  page,
  totalPages,
  onPageChange,
  lang,
}: {
  page: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
  lang: Language;
}) {
  if (totalPages <= 1) return null;
  const d = tDict(lang);
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        {d.common.pageOf} {page} / {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {d.common.prev}
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          {d.common.next}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} aria-hidden="true" />;
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-4 h-7 w-28" />
            <Skeleton className="mt-3 h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <Skeleton className="h-4 w-40" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function BackendOffline({
  lang,
  message,
  onRetry,
  retrying,
}: {
  lang: Language;
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const bn = lang === 'bn';
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
        <ServerCrash className="h-7 w-7" />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">
        {bn ? 'সার্ভারের সাথে সংযোগ হচ্ছে না' : 'Cannot reach the server'}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        {bn
          ? 'ব্যাকএন্ড চালু আছে কিনা এবং Netlify-তে VITE_API_BASE_URL সঠিকভাবে সেট করা আছে কিনা যাচাই করুন।'
          : 'Check that the backend is running and that VITE_API_BASE_URL is set correctly on Netlify.'}
      </p>
      <p className="mt-3 rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
        {bn ? 'আবার চেষ্টা করুন' : 'Try again'}
      </button>
    </div>
  );
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; lang: Language },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('UI error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const bn = this.props.lang === 'bn';
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center dark:border-red-900/60 dark:bg-slate-900">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" />
        <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
          {bn ? 'কিছু একটা সমস্যা হয়েছে' : 'Something went wrong'}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ hasError: false })}
          className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          {bn ? 'আবার চেষ্টা করুন' : 'Try again'}
        </button>
      </div>
    );
  }
}
