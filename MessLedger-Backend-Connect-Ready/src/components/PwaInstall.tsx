import { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export function PwaInstall({ lang }: { lang: 'bn' | 'en' }) {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); };
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return <span className="hidden md:inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><Smartphone className="h-3.5 w-3.5" />{lang === 'bn' ? 'অ্যাপ ইনস্টল করা' : 'App installed'}</span>;

  const install = async () => {
    if (!installEvent) { setShowIosHelp(true); return; }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setInstallEvent(null);
  };

  return <>
    <button type="button" onClick={install} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" title={lang === 'bn' ? 'ফোনে অ্যাপ ইনস্টল করুন' : 'Install app'}>
      <Download className="h-3.5 w-3.5" /><span>{lang === 'bn' ? 'অ্যাপ ইনস্টল' : 'Install app'}</span>
    </button>
    {showIosHelp && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setShowIosHelp(false)}>
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{lang === 'bn' ? 'ফোনে অ্যাপ যুক্ত করুন' : 'Add app to your phone'}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{lang === 'bn' ? 'iPhone: Safari-তে Share আইকনে চাপ দিন, তারপর “Add to Home Screen” নির্বাচন করুন। Android: Chrome-এর মেনু থেকে “Install app” বা “Add to Home screen” নির্বাচন করুন।' : 'iPhone: In Safari, tap Share, then choose “Add to Home Screen”. Android: In Chrome, open the menu and choose “Install app” or “Add to Home screen”.'}</p>
        <button type="button" onClick={() => setShowIosHelp(false)} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">{lang === 'bn' ? 'ঠিক আছে' : 'Got it'}</button>
      </div>
    </div>}
  </>;
}
