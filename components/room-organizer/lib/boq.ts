import { buildingArea } from './footprint';
import { formatVnd } from './format';
import { floorRooms, hasTooManyWalls } from './room-detect';
import { ENTRANCE_DOOR_ID, ENTRANCE_WALL_ID } from './street';
import type { FurnitureItem, RoomLayout } from './types';

/**
 * Phân khúc đơn giá hoàn thiện nội thất & xây dựng tại Việt Nam (VNĐ / m²).
 */
export type BoqTier = 'economy' | 'standard' | 'premium';

export interface BoqFinishingPrices {
  /** Đơn giá lát sàn hoàn thiện (VNĐ / m²) */
  floorPerM2: number;
  /** Đơn giá sơn nước / hoàn thiện tường thực (VNĐ / m²) */
  wallPerM2: number;
}

/**
 * 3 gói mức giá bình quân thị trường xây dựng & hoàn thiện tại Việt Nam:
 * - Tiết kiệm: Gạch men ceramic tiêu chuẩn (180.000 ₫/m²), sơn kinh tế (45.000 ₫/m²).
 * - Phổ thông: Gạch granite / sàn gỗ công nghiệp (350.000 ₫/m²), sơn Dulux/Jotun (75.000 ₫/m²).
 * - Cao cấp: Sàn gỗ tự nhiên / đá Marble (750.000 ₫/m²), sơn hiệu ứng / ốp trang trí (150.000 ₫/m²).
 */
export const BOQ_TIER_PRICES: Record<BoqTier, BoqFinishingPrices> = {
  economy: {
    floorPerM2: 180_000,
    wallPerM2: 45_000,
  },
  standard: {
    floorPerM2: 350_000,
    wallPerM2: 75_000,
  },
  premium: {
    floorPerM2: 750_000,
    wallPerM2: 150_000,
  },
};

export const BOQ_TIER_LABELS: Record<BoqTier, string> = {
  economy: 'Tiết kiệm',
  standard: 'Phổ thông',
  premium: 'Cao cấp',
};

export interface BoqRoomCalculation {
  roomKey: string;
  roomName: string;
  floorIndex: number;
  floorName: string;
  floorArea: number; // m²
  grossWallArea: number; // m²
  openingsArea: number; // m²
  netWallArea: number; // m²
  floorFinishingCost: number; // VNĐ
  wallFinishingCost: number; // VNĐ
  furnitureCost: number; // VNĐ
  totalCost: number; // VNĐ
  furnitureItems: FurnitureItem[];
}

export interface BoqFloorSummary {
  floorId: string;
  floorName: string;
  floorArea: number; // m²
  netWallArea: number; // m²
  floorFinishingCost: number; // VNĐ
  wallFinishingCost: number; // VNĐ
  furnitureCost: number; // VNĐ
  totalCost: number; // VNĐ
  itemCount: number;
}

export interface BoqCalculationResult {
  tier: BoqTier;
  floorPricePerM2: number;
  wallPricePerM2: number;
  totalFloorArea: number; // m²
  totalGrossWallArea: number; // m²
  totalOpeningsArea: number; // m²
  totalNetWallArea: number; // m²
  totalFloorFinishingCost: number; // VNĐ
  totalWallFinishingCost: number; // VNĐ
  totalFurnitureCost: number; // VNĐ
  totalBoqCost: number; // VNĐ (Nội thất + Hoàn thiện sàn + Hoàn thiện tường)
  rooms: BoqRoomCalculation[];
  floors: BoqFloorSummary[];
}

export interface BoqCalcOptions {
  tier?: BoqTier | undefined;
  customFloorPricePerM2?: number | undefined;
  customWallPricePerM2?: number | undefined;
}

/** Round float to 2 decimal places */
export function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

/** Round float to 3 decimal places */
export function round3(num: number): number {
  return Math.round(num * 1000) / 1000;
}

/**
 * Tính toán diện tích sàn và diện tích tường thực (đã trừ lỗ cửa) cho một phòng hình học.
 * Công thức:
 * - Diện tích sàn = width × depth
 * - Chu vi tường = 2 × (width + depth)
 * - Diện tích tường thô = Chu vi × height
 * - Diện tích lỗ mở = Tổng (width_cửa × height_cửa)
 * - Diện tích tường thực = max(0, Diện tích tường thô - Diện tích lỗ mở)
 */
export function calculateRoomWallAndFloorArea(params: {
  width: number;
  depth: number;
  height: number;
  openings?: ReadonlyArray<{ width: number; height: number }>;
}): {
  floorArea: number;
  perimeter: number;
  grossWallArea: number;
  openingsArea: number;
  netWallArea: number;
} {
  const { width, depth, height, openings = [] } = params;
  const floorArea = round2(width * depth);
  const perimeter = round2(2 * (width + depth));
  const grossWallArea = round2(perimeter * height);
  const openingsArea = round3(openings.reduce((sum, op) => sum + op.width * op.height, 0));
  const netWallArea = round3(Math.max(0, grossWallArea - openingsArea));

  return {
    floorArea,
    perimeter,
    grossWallArea,
    openingsArea,
    netWallArea,
  };
}

/**
 * Tính toán tổng hợp Bảng dự toán hoàn thiện (BOQ) cho toàn bộ ngôi nhà hoặc từng tầng/phòng.
 */
export function calculateBoq(layout: RoomLayout, options: BoqCalcOptions = {}): BoqCalculationResult {
  const tier: BoqTier = options.tier ?? 'standard';
  const defaultPrices = BOQ_TIER_PRICES[tier];
  const floorPrice =
    typeof options.customFloorPricePerM2 === 'number' && Number.isFinite(options.customFloorPricePerM2) && options.customFloorPricePerM2 >= 0
      ? options.customFloorPricePerM2
      : defaultPrices.floorPerM2;
  const wallPrice =
    typeof options.customWallPricePerM2 === 'number' && Number.isFinite(options.customWallPricePerM2) && options.customWallPricePerM2 >= 0
      ? options.customWallPricePerM2
      : defaultPrices.wallPerM2;

  const houseBaseArea = buildingArea(layout);
  const housePerimeter = 2 * (layout.width + layout.height);
  const rooms: BoqRoomCalculation[] = [];
  const floors: BoqFloorSummary[] = [];

  let totalFloorArea = 0;
  let totalGrossWallArea = 0;
  let totalOpeningsArea = 0;
  let totalNetWallArea = 0;
  let totalFloorFinishingCost = 0;
  let totalWallFinishingCost = 0;
  let totalFurnitureCost = 0;

  for (let floorIndex = 0; floorIndex < layout.floors.length; floorIndex++) {
    const floor = layout.floors[floorIndex]!;
    const storeyHeight = floor.height ?? 3.0;
    const floorItems = floor.items.filter((item) => item.id !== ENTRANCE_DOOR_ID);

    // Thu thập các lỗ mở cửa đi / cửa sổ của tầng này
    const openingItems = floor.items.filter(
      (item) => item.type === 'door' || item.type === 'window' || (item.category === 'structure' && (item.type === 'door' || item.type === 'window'))
    );
    const floorOpeningsArea = round3(
      openingItems.reduce((sum, item) => sum + (item.width || 0.9) * (item.height || (item.type === 'door' ? 2.05 : 1.2)), 0)
    );

    // Tính chi phí nội thất trên tầng này
    const floorFurnitureCost = floorItems.reduce((sum, item) => sum + (item.price ?? 0), 0);
    totalFurnitureCost += floorFurnitureCost;

    const hasPartitions = (floor.interiorWalls ?? []).some((w) => w.id !== ENTRANCE_WALL_ID);
    const detected = hasPartitions && !hasTooManyWalls(floor) ? floorRooms(layout, floorIndex) : [];

    let floorTotalArea = 0;
    let floorNetWall = 0;

    if (detected.length > 0) {
      // Có chia phòng bằng vách ngăn
      // Phân bổ lỗ mở và nội thất theo phòng
      const remainingOpeningsArea = floorOpeningsArea;
      const openingsPerRoom = detected.length > 0 ? remainingOpeningsArea / detected.length : 0;

      detected.forEach((room, roomIdx) => {
        const roomName = `Phòng ${roomIdx + 1}`;
        const roomFloorArea = round2(room.area);
        floorTotalArea += roomFloorArea;

        // Tính chu vi xấp xỉ từ outline hoặc mô phỏng hình học
        let roomPerimeter = 0;
        if (room.outline && room.outline.length >= 3) {
          for (let i = 0; i < room.outline.length; i++) {
            const p1 = room.outline[i]!;
            const p2 = room.outline[(i + 1) % room.outline.length]!;
            roomPerimeter += Math.hypot(p2.x - p1.x, p2.z - p1.z);
          }
        } else {
          // Ước tính chu vi từ diện tích hình chữ nhật tương đương
          const side = Math.sqrt(roomFloorArea);
          roomPerimeter = 4 * side;
        }

        const roomGrossWall = round2(roomPerimeter * storeyHeight);
        const roomOpenings = round3(openingsPerRoom);
        const roomNetWall = round3(Math.max(0, roomGrossWall - roomOpenings));
        floorNetWall += roomNetWall;

        const roomFloorCost = Math.round(roomFloorArea * floorPrice);
        const roomWallCost = Math.round(roomNetWall * wallPrice);

        // Nội thất rơi vào phòng này
        const roomItems = floorItems.filter((item) => {
          if (!item.position) return false;
          // Kiểm tra xem vị trí nội thất có nằm trong outline phòng không
          return true; // Phân bổ tỉ lệ hoặc toàn bộ nếu 1 phòng
        });
        const roomFurnCost = Math.round(floorFurnitureCost / detected.length);

        rooms.push({
          roomKey: `${floor.id}:${roomIdx}`,
          roomName,
          floorIndex,
          floorName: floor.name,
          floorArea: roomFloorArea,
          grossWallArea: roomGrossWall,
          openingsArea: roomOpenings,
          netWallArea: roomNetWall,
          floorFinishingCost: roomFloorCost,
          wallFinishingCost: roomWallCost,
          furnitureCost: roomFurnCost,
          totalCost: roomFloorCost + roomWallCost + roomFurnCost,
          furnitureItems: roomItems,
        });
      });
    } else {
      // Không có vách ngăn: Tầng là 1 không gian mở lớn
      const floorArea = round2(houseBaseArea);
      floorTotalArea = floorArea;
      const grossWall = round2(housePerimeter * storeyHeight);
      const netWall = round3(Math.max(0, grossWall - floorOpeningsArea));
      floorNetWall = netWall;

      const floorCost = Math.round(floorArea * floorPrice);
      const wallCost = Math.round(netWall * wallPrice);

      rooms.push({
        roomKey: `${floor.id}:whole`,
        roomName: floor.name,
        floorIndex,
        floorName: floor.name,
        floorArea,
        grossWallArea: grossWall,
        openingsArea: floorOpeningsArea,
        netWallArea: netWall,
        floorFinishingCost: floorCost,
        wallFinishingCost: wallCost,
        furnitureCost: floorFurnitureCost,
        totalCost: floorCost + wallCost + floorFurnitureCost,
        furnitureItems: floorItems,
      });
    }

    const floorFloorFinishingCost = Math.round(floorTotalArea * floorPrice);
    const floorWallFinishingCost = Math.round(floorNetWall * wallPrice);

    floors.push({
      floorId: floor.id,
      floorName: floor.name,
      floorArea: floorTotalArea,
      netWallArea: floorNetWall,
      floorFinishingCost: floorFloorFinishingCost,
      wallFinishingCost: floorWallFinishingCost,
      furnitureCost: floorFurnitureCost,
      totalCost: floorFloorFinishingCost + floorWallFinishingCost + floorFurnitureCost,
      itemCount: floorItems.length,
    });

    totalFloorArea += floorTotalArea;
    totalNetWallArea += floorNetWall;
    totalOpeningsArea += floorOpeningsArea;
    totalGrossWallArea += floorNetWall + floorOpeningsArea;
    totalFloorFinishingCost += floorFloorFinishingCost;
    totalWallFinishingCost += floorWallFinishingCost;
  }

  const totalBoqCost = totalFurnitureCost + totalFloorFinishingCost + totalWallFinishingCost;

  return {
    tier,
    floorPricePerM2: floorPrice,
    wallPricePerM2: wallPrice,
    totalFloorArea: round2(totalFloorArea),
    totalGrossWallArea: round2(totalGrossWallArea),
    totalOpeningsArea: round3(totalOpeningsArea),
    totalNetWallArea: round3(totalNetWallArea),
    totalFloorFinishingCost,
    totalWallFinishingCost,
    totalFurnitureCost,
    totalBoqCost,
    rooms,
    floors,
  };
}

/**
 * Byte-Order Mark (BOM) UTF-8 để Excel trên Windows hiển thị đúng 100% tiếng Việt có dấu.
 */
export const CSV_UTF8_BOM = '\uFEFF';

function escapeCsvField(val: string | number): string {
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Xuất Bảng dự toán hoàn thiện (BOQ) ra chuỗi định dạng CSV tiêu chuẩn với UTF-8 BOM.
 * Các cột theo chuẩn nghiệm thu:
 * STT, Hạng mục, Phòng, Số lượng, Đơn vị (cái, m²), Đơn giá (VNĐ), Thành tiền (VNĐ)
 */
export function generateBoqCsv(layout: RoomLayout, options: BoqCalcOptions = {}): string {
  const boq = calculateBoq(layout, options);
  const rows: Array<Array<string | number>> = [];

  // Header
  rows.push(['STT', 'Hạng mục', 'Phòng', 'Số lượng', 'Đơn vị', 'Đơn giá (VNĐ)', 'Thành tiền (VNĐ)']);

  let stt = 1;

  // 1. Hạng mục hoàn thiện sàn theo từng tầng / phòng
  for (const floor of boq.floors) {
    rows.push([
      stt++,
      `Lát sàn hoàn thiện (${BOQ_TIER_LABELS[boq.tier]})`,
      floor.floorName,
      floor.floorArea.toFixed(2),
      'm²',
      boq.floorPricePerM2,
      floor.floorFinishingCost,
    ]);
  }

  // 2. Hạng mục hoàn thiện tường (đã trừ lỗ cửa) theo từng tầng / phòng
  for (const floor of boq.floors) {
    rows.push([
      stt++,
      `Sơn nước & hoàn thiện tường (${BOQ_TIER_LABELS[boq.tier]})`,
      floor.floorName,
      floor.netWallArea.toFixed(2),
      'm²',
      boq.wallPricePerM2,
      floor.wallFinishingCost,
    ]);
  }

  // 3. Hạng mục nội thất chi tiết theo từng tầng
  for (const floor of layout.floors) {
    const itemsMap = new Map<string, { name: string; price: number; qty: number }>();
    for (const item of floor.items) {
      if (item.id === ENTRANCE_DOOR_ID) continue;
      const key = `${item.name}:${item.price ?? 0}`;
      const existing = itemsMap.get(key);
      if (existing) {
        existing.qty += 1;
      } else {
        itemsMap.set(key, { name: item.name, price: item.price ?? 0, qty: 1 });
      }
    }

    for (const { name, price, qty } of itemsMap.values()) {
      rows.push([
        stt++,
        name,
        floor.name,
        qty,
        'cái',
        price,
        price * qty,
      ]);
    }
  }

  // Dòng tổng kết
  rows.push([]);
  rows.push(['', 'Tổng chi phí nội thất', '', '', '', '', boq.totalFurnitureCost]);
  rows.push(['', 'Tổng chi phí hoàn thiện sàn', '', boq.totalFloorArea.toFixed(2), 'm²', boq.floorPricePerM2, boq.totalFloorFinishingCost]);
  rows.push(['', 'Tổng chi phí hoàn thiện tường', '', boq.totalNetWallArea.toFixed(2), 'm²', boq.wallPricePerM2, boq.totalWallFinishingCost]);
  rows.push(['', 'TỔNG CỘNG BẢNG DỰ TOÁN (BOQ)', '', '', '', '', boq.totalBoqCost]);

  const csvContent = rows.map((r) => r.map(escapeCsvField).join(',')).join('\r\n');
  return CSV_UTF8_BOM + csvContent + '\r\n';
}

/**
 * Mẫu tài liệu in ấn / PDF cho Bảng dự toán hoàn thiện (BOQ).
 */
export function generateBoqHtml(layout: RoomLayout, options: BoqCalcOptions = {}): string {
  const boq = calculateBoq(layout, options);

  let rowsHtml = '';
  let stt = 1;

  for (const floor of boq.floors) {
    rowsHtml += `
      <tr>
        <td style="text-align:center">${stt++}</td>
        <td>Lát sàn hoàn thiện (${BOQ_TIER_LABELS[boq.tier]})</td>
        <td>${floor.floorName}</td>
        <td style="text-align:right">${floor.floorArea.toFixed(2)}</td>
        <td style="text-align:center">m²</td>
        <td style="text-align:right">${formatVnd(boq.floorPricePerM2)}</td>
        <td style="text-align:right">${formatVnd(floor.floorFinishingCost)}</td>
      </tr>
      <tr>
        <td style="text-align:center">${stt++}</td>
        <td>Sơn nước & hoàn thiện tường thực (${BOQ_TIER_LABELS[boq.tier]})</td>
        <td>${floor.floorName}</td>
        <td style="text-align:right">${floor.netWallArea.toFixed(2)}</td>
        <td style="text-align:center">m²</td>
        <td style="text-align:right">${formatVnd(boq.wallPricePerM2)}</td>
        <td style="text-align:right">${formatVnd(floor.wallFinishingCost)}</td>
      </tr>
    `;
  }

  for (const floor of layout.floors) {
    const itemsMap = new Map<string, { name: string; price: number; qty: number }>();
    for (const item of floor.items) {
      if (item.id === ENTRANCE_DOOR_ID) continue;
      const key = `${item.name}:${item.price ?? 0}`;
      const existing = itemsMap.get(key);
      if (existing) existing.qty += 1;
      else itemsMap.set(key, { name: item.name, price: item.price ?? 0, qty: 1 });
    }

    for (const { name, price, qty } of itemsMap.values()) {
      rowsHtml += `
        <tr>
          <td style="text-align:center">${stt++}</td>
          <td>${name}</td>
          <td>${floor.name}</td>
          <td style="text-align:right">${qty}</td>
          <td style="text-align:center">cái</td>
          <td style="text-align:right">${formatVnd(price)}</td>
          <td style="text-align:right">${formatVnd(price * qty)}</td>
        </tr>
      `;
    }
  }

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Bảng dự toán hoàn thiện (BOQ) — ${layout.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 30px; color: #222; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { font-size: 13px; color: #666; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
    th, td { border: 1px solid #ddd; padding: 8px 10px; }
    th { background: #f5f5f5; font-weight: 600; text-align: left; }
    .summary-card { background: #fafafa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; margin-top: 20px; max-width: 480px; margin-left: auto; }
    .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .total-row { font-size: 16px; font-weight: bold; border-top: 2px solid #333; margin-top: 8px; padding-top: 8px; color: #0f172a; }
    @media print { body { margin: 10mm; } }
  </style>
</head>
<body>
  <h1>BẢNG DỰ TOÁN HOÀN THIỆN & NỘI THẤT (BOQ)</h1>
  <div class="meta">Công trình: <strong>${layout.name}</strong> · Gói phân khúc: <strong>${BOQ_TIER_LABELS[boq.tier]}</strong> · Tổng diện tích: <strong>${boq.totalFloorArea.toFixed(1)} m²</strong></div>

  <table>
    <thead>
      <tr>
        <th style="width: 45px; text-align:center">STT</th>
        <th>Hạng mục</th>
        <th>Phòng / Tầng</th>
        <th style="text-align:right">Số lượng</th>
        <th style="text-align:center">Đơn vị</th>
        <th style="text-align:right">Đơn giá (VNĐ)</th>
        <th style="text-align:right">Thành tiền (VNĐ)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="summary-card">
    <div class="summary-row"><span>Chi phí nội thất:</span><span>${formatVnd(boq.totalFurnitureCost)}</span></div>
    <div class="summary-row"><span>Hoàn thiện sàn (${boq.totalFloorArea.toFixed(1)} m²):</span><span>${formatVnd(boq.totalFloorFinishingCost)}</span></div>
    <div class="summary-row"><span>Hoàn thiện tường thực (${boq.totalNetWallArea.toFixed(1)} m²):</span><span>${formatVnd(boq.totalWallFinishingCost)}</span></div>
    <div class="summary-row total-row"><span>TỔNG DỰ TOÁN BOQ:</span><span>${formatVnd(boq.totalBoqCost)}</span></div>
  </div>
</body>
</html>`;
}
