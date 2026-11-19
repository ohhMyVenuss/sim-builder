import { describe, expect, it } from 'vitest';
import {
  BOQ_TIER_PRICES,
  calculateBoq,
  calculateRoomWallAndFloorArea,
  CSV_UTF8_BOM,
  generateBoqCsv,
  generateBoqHtml,
} from './boq';
import type { FurnitureItem, RoomLayout } from './types';

function makeLayout(partial: Partial<RoomLayout> = {}): RoomLayout {
  return {
    name: 'Biệt thự mẫu',
    width: 5,
    height: 4,
    floors: [
      {
        id: 'ground',
        name: 'Tầng 1',
        height: 3,
        floorColor: '#ffffff',
        items: [],
      },
    ],
    ...partial,
  };
}

describe('BOQ Calculations & Specifications', () => {
  it('tính đúng diện tích sàn và diện tích tường thực đã trừ lỗ cửa cho phòng 5m × 4m cao 3m có 1 cửa 0.9m × 2.05m', () => {
    const res = calculateRoomWallAndFloorArea({
      width: 5,
      depth: 4,
      height: 3,
      openings: [{ width: 0.9, height: 2.05 }],
    });

    // Diện tích sàn: 5 * 4 = 20 m²
    expect(res.floorArea).toBe(20);
    // Chu vi: 2 * (5 + 4) = 18 m
    expect(res.perimeter).toBe(18);
    // Diện tích tường thô: 18 * 3 = 54 m²
    expect(res.grossWallArea).toBe(54);
    // Diện tích cửa: 0.9 * 2.05 = 1.845 m² -> làm tròn 1.85 m² hoặc 1.845
    expect(res.openingsArea).toBeCloseTo(1.845, 2);
    // Diện tích tường thực: 54 - 1.845 = 52.155 m²
    expect(res.netWallArea).toBeCloseTo(52.155, 2);
  });

  it('tính tổng chi phí BOQ = Chi phí nội thất + Chi phí hoàn thiện sàn + Chi phí hoàn thiện tường', () => {
    const doorItem: FurnitureItem = {
      id: 'door-1',
      type: 'door',
      name: 'Cửa đi chính',
      icon: 'door',
      category: 'structure',
      width: 0.9,
      depth: 0.1,
      height: 2.05,
      color: '#8b5a2b',
      price: 3_500_000,
    };

    const sofaItem: FurnitureItem = {
      id: 'sofa-1',
      type: 'sofa',
      name: 'Sofa phòng khách',
      icon: 'sofa',
      category: 'seating',
      width: 2.0,
      depth: 0.9,
      height: 0.8,
      color: '#4a5568',
      price: 12_000_000,
    };

    const layout = makeLayout({
      width: 5,
      height: 4,
      floors: [
        {
          id: 'ground',
          name: 'Tầng 1',
          height: 3,
          floorColor: '#ffffff',
          items: [doorItem, sofaItem],
        },
      ],
    });

    const boq = calculateBoq(layout, { tier: 'standard' });

    expect(boq.totalFloorArea).toBe(20);
    expect(boq.totalNetWallArea).toBeCloseTo(52.155, 1);
    expect(boq.floorPricePerM2).toBe(BOQ_TIER_PRICES.standard.floorPerM2);
    expect(boq.wallPricePerM2).toBe(BOQ_TIER_PRICES.standard.wallPerM2);

    const expectedFloorCost = Math.round(20 * BOQ_TIER_PRICES.standard.floorPerM2);
    const expectedWallCost = Math.round(boq.totalNetWallArea * BOQ_TIER_PRICES.standard.wallPerM2);
    const expectedFurnitureCost = 3_500_000 + 12_000_000;

    expect(boq.totalFloorFinishingCost).toBe(expectedFloorCost);
    expect(boq.totalWallFinishingCost).toBe(expectedWallCost);
    expect(boq.totalFurnitureCost).toBe(expectedFurnitureCost);
    expect(boq.totalBoqCost).toBe(expectedFurnitureCost + expectedFloorCost + expectedWallCost);
  });

  it('hỗ trợ 3 gói phân khúc (Tiết kiệm, Phổ thông, Cao cấp) và đơn giá tùy chỉnh', () => {
    const layout = makeLayout({ width: 6, height: 5 });

    const boqEconomy = calculateBoq(layout, { tier: 'economy' });
    const boqStandard = calculateBoq(layout, { tier: 'standard' });
    const boqPremium = calculateBoq(layout, { tier: 'premium' });

    expect(boqEconomy.floorPricePerM2).toBe(180_000);
    expect(boqStandard.floorPricePerM2).toBe(350_000);
    expect(boqPremium.floorPricePerM2).toBe(750_000);

    expect(boqEconomy.totalFloorFinishingCost).toBeLessThan(boqStandard.totalFloorFinishingCost);
    expect(boqStandard.totalFloorFinishingCost).toBeLessThan(boqPremium.totalFloorFinishingCost);

    // Tùy chỉnh đơn giá
    const boqCustom = calculateBoq(layout, {
      customFloorPricePerM2: 500_000,
      customWallPricePerM2: 100_000,
    });
    expect(boqCustom.floorPricePerM2).toBe(500_000);
    expect(boqCustom.wallPricePerM2).toBe(100_000);
  });

  it('xuất file BOQ .csv có UTF-8 BOM, hiển thị tiếng Việt có dấu và đầy đủ các cột chuẩn', () => {
    const layout = makeLayout({
      name: 'Nhà phố 5x20',
      width: 5,
      height: 20,
      floors: [
        {
          id: 'f1',
          name: 'Tầng trệt',
          height: 3.5,
          floorColor: '#ffffff',
          items: [
            {
              id: 'table-1',
              type: 'dining-table',
              name: 'Bàn ăn 6 ghế',
              icon: 'table',
              category: 'tables',
              width: 1.6,
              depth: 0.8,
              height: 0.75,
              color: '#d97706',
              price: 8_500_000,
            },
          ],
        },
      ],
    });

    const csv = generateBoqCsv(layout, { tier: 'standard' });

    // Phải bắt đầu bằng UTF-8 BOM
    expect(csv.startsWith(CSV_UTF8_BOM)).toBe(true);

    // Chứa đầy đủ header
    expect(csv).toContain('STT,Hạng mục,Phòng,Số lượng,Đơn vị,Đơn giá (VNĐ),Thành tiền (VNĐ)');

    // Chứa nội dung tiếng Việt có dấu
    expect(csv).toContain('Lát sàn hoàn thiện');
    expect(csv).toContain('Sơn nước & hoàn thiện tường');
    expect(csv).toContain('Bàn ăn 6 ghế');
    expect(csv).toContain('Tầng trệt');
    expect(csv).toContain('TỔNG CỘNG BẢNG DỰ TOÁN (BOQ)');
  });

  it('tạo mẫu in ấn HTML / PDF hiển thị đẹp và đầy đủ thông tin dự toán', () => {
    const layout = makeLayout({ name: 'Chung cư 70m2' });
    const html = generateBoqHtml(layout, { tier: 'standard' });

    expect(html).toContain('BẢNG DỰ TOÁN HOÀN THIỆN & NỘI THẤT (BOQ)');
    expect(html).toContain('Chung cư 70m2');
    expect(html).toContain('TỔNG DỰ TOÁN BOQ');
  });
});
