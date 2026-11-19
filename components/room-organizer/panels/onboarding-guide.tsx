'use client';

import { useState } from 'react';
import { UI_TEXT, useLocale } from '../lib/i18n';
import { Icon, type PlotcraftIconName } from '../plotcraft/icon';

const STEP_ICONS: readonly PlotcraftIconName[] = ['ruler', 'coin', 'buy', 'live'];
const STORAGE_KEY = 'pc-onboarding-dismissed';

export function OnboardingGuide(): JSX.Element | null {
  const locale = useLocale();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;
  const copy = UI_TEXT[locale].onboarding;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore storage errors
    }
  };

  return (
    <div
      className="pc-glass pc-glass--dark rounded-xl px-3 py-2 text-[11px] flex flex-wrap items-center gap-3"
      role="region"
      aria-label={copy.title}
    >
      <span className="font-semibold text-amber-300 flex items-center gap-1.5 shrink-0">
        <Icon name="sparkle" size={14} />
        {copy.title}
      </span>
      <div className="flex flex-wrap items-center gap-2.5">
        {copy.steps.map((step, idx) => (
          <span key={step} className="flex items-center gap-1 text-slate-200">
            <Icon name={STEP_ICONS[idx] ?? 'sparkle'} size={13} className="text-sky-300 shrink-0" />
            <span>{step}</span>
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={copy.dismiss}
        title={copy.dismiss}
        className="ml-auto inline-flex items-center gap-1 text-slate-300 hover:text-white px-1.5 py-0.5 rounded"
      >
        <Icon name="close" size={12} />
        <span className="hidden sm:inline">{copy.dismiss}</span>
      </button>
    </div>
  );
}
