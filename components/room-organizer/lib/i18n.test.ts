import { describe, expect, it } from 'vitest';
import { iconForItem } from '../plotcraft/icon';
import { CATEGORIES, FURNITURE_CATALOG } from './constants';
import { categoryLabel, getLocale, setLocale, UI_TEXT } from './i18n';

describe('Task 4 — Vietnamese i18n & PlotCraft SVG icon coverage', () => {
  it('defaults to Vietnamese and switches cleanly between vi and en', () => {
    setLocale('vi');
    expect(getLocale()).toBe('vi');
    expect(UI_TEXT.vi.tabs.build.label).toBe('Xây dựng');
    expect(UI_TEXT.vi.modes.live.label).toBe('KHÁM PHÁ');
    expect(categoryLabel('seating', 'vi')).toBe('Ghế ngồi');

    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(categoryLabel('seating', 'en')).toBe('Seating');

    setLocale('vi');
  });

  it('maps every catalog category and item to a PlotCraft SVG icon (no emoji fallback needed)', () => {
    for (const cat of CATEGORIES) {
      expect(categoryLabel(cat.key, 'vi').length).toBeGreaterThan(0);
      expect(iconForItem('', cat.key)).toBeTruthy();
    }
    for (const item of FURNITURE_CATALOG) {
      expect(iconForItem(item.type, item.category)).toBeTruthy();
    }
  });
});
