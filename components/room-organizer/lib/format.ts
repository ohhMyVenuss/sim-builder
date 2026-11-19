/**
 * The one way the UI writes lengths and ages (#438): a space before the unit,
 * as in "2.00 m", and ages spelled so they can't be read as metres.
 */

/** "2.00 m". `decimals` omitted prints the number as it is ("8 m", "2.5 m"). */
export function formatMetres(value: number, decimals?: number): string {
  const text = decimals === undefined ? String(Number(value.toFixed(2))) : value.toFixed(decimals);
  return `${text} m`;
}

/** "8 m × 6 m": a footprint or an item's plan size. */
export function formatSize(width: number, depth: number, decimals?: number): string {
  return `${formatMetres(width, decimals)} × ${formatMetres(depth, decimals)}`;
}

/** "14:05" today, "28 Oct, 14:05" on another day, in the viewer's locale and time zone. */
export function formatClock(at: number, now: number = Date.now()): string {
  const date = new Date(at);
  const time = { hour: '2-digit', minute: '2-digit' } as const;
  return date.toDateString() === new Date(now).toDateString()
    ? date.toLocaleTimeString([], time)
    : date.toLocaleString([], { day: 'numeric', month: 'short', ...time });
}

/** "just now", "40 s ago", "3 min ago", "2 h ago", "4 days ago". */
export function formatAge(ms: number, options: { seconds?: boolean } = {}): string {
  const threshold = options.seconds ? 5_000 : 60_000;
  if (ms < threshold) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)} s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h ago`;
  const days = Math.floor(ms / 86_400_000);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** Format a Vietnamese Dong amount, e.g. "12.500.000 ₫" or compact "12,5 tr ₫". */
export function formatVnd(amount: number, compact = false): string {
  const rounded = Math.round(amount);
  const abs = Math.abs(rounded);
  const sign = rounded < 0 ? '-' : '';
  if (compact) {
    if (abs >= 1_000_000_000) {
      const ty = (abs / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
      return `${sign}${ty} tỷ ₫`;
    }
    if (abs >= 1_000_000) {
      const tr = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',');
      return `${sign}${tr} tr ₫`;
    }
    if (abs >= 1_000) {
      const k = Math.round(abs / 1_000);
      return `${sign}${k.toLocaleString('vi-VN')}k ₫`;
    }
  }
  return `${rounded.toLocaleString('vi-VN')} ₫`;
}
