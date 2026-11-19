import { useSyncExternalStore } from 'react';
import type { FurnitureCategory } from './types';

export type Locale = 'vi' | 'en';

let currentLocale: Locale = 'vi';
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(next: Locale): void {
  if (currentLocale === next) return;
  currentLocale = next;
  for (const fn of listeners) fn();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

export const CATEGORY_LABELS_VI: Readonly<Record<FurnitureCategory, string>> = {
  seating: 'Ghế ngồi',
  tables: 'Bàn',
  bedroom: 'Phòng ngủ',
  storage: 'Lưu trữ',
  kitchen: 'Nhà bếp',
  bathroom: 'Phòng tắm',
  electronics: 'Điện tử',
  security: 'An ninh',
  decor: 'Trang trí',
  outdoor: 'Ngoại thất',
  people: 'Nhân vật',
  structure: 'Cấu trúc',
};

export const CATEGORY_LABELS_EN: Readonly<Record<FurnitureCategory, string>> = {
  seating: 'Seating',
  tables: 'Tables',
  bedroom: 'Bedroom',
  storage: 'Storage',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  electronics: 'Electronics',
  security: 'Security',
  decor: 'Decor',
  outdoor: 'Outdoor',
  people: 'People',
  structure: 'Structure',
};

export function categoryLabel(category: FurnitureCategory, locale: Locale = currentLocale): string {
  return locale === 'vi' ? CATEGORY_LABELS_VI[category] : CATEGORY_LABELS_EN[category];
}

export const UI_TEXT = {
  vi: {
    tabs: {
      build: { label: 'Xây dựng', hint: 'Tầng, tường, mái, kích thước' },
      buy: { label: 'Nội thất', hint: 'Danh mục đồ đạc & bố trí' },
      style: { label: 'Phong cách', hint: 'Chủ đề, ánh sáng, vật liệu' },
      manage: { label: 'Quản lý', hint: 'Mẫu nhà, lưu trữ, thống kê' },
    },
    modes: {
      live: { label: 'KHÁM PHÁ', hint: 'Đi bộ tham quan ngôi nhà ở góc nhìn thứ nhất' },
      build: { label: 'THIẾT KẾ', hint: 'Tường, cửa đi, cửa sổ, cầu thang' },
      buy: { label: 'BỐ TRÍ', hint: 'Danh mục nội thất & dự toán chi phí' },
    },
    header: {
      items: 'Món đồ',
      floors: 'Tầng',
      room: 'Kích thước',
      cost: 'Chi phí',
    },
    catalog: {
      title: 'Danh mục nội thất',
      searchPlaceholder: 'Tìm kiếm nội thất...',
      all: 'Tất cả',
      empty: 'Không tìm thấy món đồ phù hợp.',
      hint: 'Nhấn để chọn rồi đặt lên sàn, kéo thả vào cảnh 3D hoặc nhấn Enter.',
    },
    stats: {
      title: 'Thống kê & Dự toán',
      wholeHouse: 'Toàn bộ ngôi nhà',
      items: 'Số món đồ',
      floors: 'Số tầng',
      areaPerFloor: 'Diện tích mỗi tầng',
      totalArea: 'Tổng diện tích sàn',
      footprint: 'Diện tích chiếm chỗ',
      byCategory: 'Theo danh mục',
    },
    onboarding: {
      title: 'Hướng dẫn nhanh 4 bước',
      dismiss: 'Ẩn hướng dẫn',
      steps: [
        '1. Nhập bản vẽ 2D hoặc chỉnh kích thước nhà',
        '2. Thiết lập ngân quỹ ban đầu (VNĐ)',
        '3. Kéo thả nội thất & kiểm tra va chạm',
        '4. Xem 3D, đi bộ khám phá & kiểm tra chi phí',
      ],
    },
  },
  en: {
    tabs: {
      build: { label: 'Build', hint: 'Floors, walls, roof, dimensions' },
      buy: { label: 'Buy', hint: 'Catalogue, sets, placed items' },
      style: { label: 'Style', hint: 'Themes, time of day, finishes' },
      manage: { label: 'Manage', hint: 'Templates, library, actions, stats' },
    },
    modes: {
      live: { label: 'EXPLORE', hint: 'Explore — walk through the house in first person' },
      build: { label: 'DESIGN', hint: 'Design — walls, doors, windows, stairs' },
      buy: { label: 'FURNISH', hint: 'Furnish — the furniture catalogue' },
    },
    header: {
      items: 'Items',
      floors: 'Floors',
      room: 'Room',
      cost: 'Cost',
    },
    catalog: {
      title: 'Catalogue',
      searchPlaceholder: 'Search furniture...',
      all: 'All',
      empty: 'No items match this filter.',
      hint: 'Click to pick up, then click to place, drag onto the view, or press Enter.',
    },
    stats: {
      title: 'Statistics',
      wholeHouse: 'Whole house',
      items: 'Items',
      floors: 'Floors',
      areaPerFloor: 'Area per floor',
      totalArea: 'Total floor area',
      footprint: 'Furniture footprint',
      byCategory: 'By category',
    },
    onboarding: {
      title: '4-Step Quick Guide',
      dismiss: 'Dismiss',
      steps: [
        '1. Import 2D plan or set room size',
        '2. Set initial budget (VND)',
        '3. Place furniture & check layout',
        '4. Explore 3D & review budget',
      ],
    },
  },
} as const;
