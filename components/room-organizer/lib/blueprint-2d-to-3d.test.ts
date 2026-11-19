import { describe, expect, it } from 'vitest';
import {
  calibrateScale2D,
  computeOtsuThreshold,
  cropImagePixels,
  extractWallsFromImagePixels,
  parseDxfToBlueprint,
  parseSvgToBlueprint,
} from './blueprint-2d-to-3d';
import { formatVnd } from './format';

describe('blueprint-2d-to-3d', () => {
  it('parses DXF millimeter plans into centred metre walls', () => {
    const dxf = [
      '0', 'SECTION', '2', 'HEADER',
      '9', '$INSUNITS', '70', '4',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      // Outer 10000mm x 8000mm rectangle
      '0', 'LWPOLYLINE', '70', '1',
      '10', '0', '20', '0',
      '10', '10000', '20', '0',
      '10', '10000', '20', '8000',
      '10', '0', '20', '8000',
      // Interior vertical wall at x=4000mm
      '0', 'LINE',
      '10', '4000', '20', '0',
      '11', '4000', '21', '8000',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n');

    const res = parseDxfToBlueprint(dxf);
    expect(res.width).toBe(10);
    expect(res.depth).toBe(8);
    expect(res.interiorWalls).toHaveLength(1);
    expect(res.interiorWalls[0]!.x1).toBeCloseTo(-1, 1);
    expect(res.interiorWalls[0]!.x2).toBeCloseTo(-1, 1);
  });

  it('phân tách chính xác layer DXF: WALL, DOOR, WINDOW và bỏ qua annotation/dim/title', () => {
    const dxf = [
      '0', 'SECTION', '2', 'HEADER',
      '9', '$INSUNITS', '70', '4',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      // Tường bao trên layer WALL
      '0', 'LWPOLYLINE', '8', 'WALL', '70', '1',
      '10', '0', '20', '0',
      '10', '8000', '20', '0',
      '10', '8000', '20', '6000',
      '10', '0', '20', '6000',
      // Vách ngăn trên layer TUONG
      '0', 'LINE', '8', 'TUONG_NGAN',
      '10', '4000', '20', '0',
      '11', '4000', '21', '6000',
      // Cửa đi trên layer DOOR
      '0', 'LINE', '8', 'DOOR',
      '10', '4000', '20', '2000',
      '11', '4000', '21', '2900',
      // Cửa sổ trên layer WINDOW
      '0', 'LINE', '8', 'WINDOW',
      '10', '8000', '20', '2000',
      '11', '8000', '21', '3500',
      // Đường gióng kích thước & khung tên (phải bị bỏ qua)
      '0', 'LINE', '8', 'DIMENSIONS',
      '10', '-1000', '20', '0',
      '11', '-1000', '21', '6000',
      '0', 'LINE', '8', 'TITLE_BLOCK',
      '10', '9000', '20', '0',
      '11', '10000', '21', '6000',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n');

    const res = parseDxfToBlueprint(dxf);
    expect(res.width).toBe(8);
    expect(res.depth).toBe(6);
    // Vách ngăn interior wall
    expect(res.interiorWalls.length).toBeGreaterThanOrEqual(1);

    // Kiểm tra cửa đi & cửa sổ được phân tách vào openings
    expect(res.openings).toBeDefined();
    expect(res.openings!.some((op) => op.type === 'door')).toBe(true);
    expect(res.openings!.some((op) => op.type === 'window')).toBe(true);
  });

  it('2-Point Calibration: Click 2 điểm trên cạnh dài 7.844m và nhập 7.844 -> sai số < ±0.05m', () => {
    // 2 điểm cách nhau 784.4 pixel trên ảnh
    const p1 = { x: 50, y: 100 };
    const p2 = { x: 834.4, y: 100 };
    const realMeters = 7.844;

    const scaleMetersPerPixel = calibrateScale2D(p1, p2, realMeters);
    expect(scaleMetersPerPixel).toBeCloseTo(0.01, 4);

    // Kích thước đo được trong pixel là 784.4 px
    const measuredMeters = (p2.x - p1.x) * scaleMetersPerPixel;
    const error = Math.abs(measuredMeters - realMeters);
    expect(error).toBeLessThan(0.05);
  });

  it('ROI Crop: Cắt vùng mặt bằng chính, loại bỏ khung tên và đường kích thước bên ngoài', () => {
    const w = 200;
    const h = 100;
    const data = new Uint8ClampedArray(w * h * 4);
    data.fill(255); // Trắng

    const setBlack = (x: number, y: number) => {
      const idx = (y * w + x) * 4;
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
    };

    // 1. Mặt bằng nhà chính nằm ở x: 20..100, y: 20..80
    for (let x = 20; x <= 100; x++) {
      setBlack(x, 20);
      setBlack(x, 80);
    }
    for (let y = 20; y <= 80; y++) {
      setBlack(20, y);
      setBlack(100, y);
    }
    // Vách ngăn bên trong mặt bằng x = 60
    for (let y = 20; y <= 80; y++) {
      setBlack(60, y);
      setBlack(61, y);
    }

    // 2. Khung tên bên phải ở x: 130..190 (bên ngoài mặt bằng)
    for (let x = 130; x <= 190; x++) {
      setBlack(x, 10);
      setBlack(x, 90);
    }
    for (let y = 10; y <= 90; y++) {
      setBlack(130, y);
      setBlack(190, y);
    }

    // A. Khi chưa crop: Khung tên bên phải sẽ làm phình to kích thước hoặc nhận nhầm
    const uncropped = extractWallsFromImagePixels({ data, width: w, height: h }, 10);
    expect(uncropped.rawWidth).toBeGreaterThan(150);

    // B. Khi khoanh vùng ROI chọn đúng mặt bằng x: 15..105, y: 15..85
    const roi = { x: 15, y: 15, width: 90, height: 70 };
    const croppedPixels = cropImagePixels({ data, width: w, height: h }, roi);
    expect(croppedPixels.width).toBe(90);
    expect(croppedPixels.height).toBe(70);

    const croppedRes = extractWallsFromImagePixels({ data, width: w, height: h }, 10, roi);
    // Khung tên bị loại bỏ hoàn toàn, chỉ nhận diện mặt bằng chính
    expect(croppedRes.rawWidth).toBeLessThanOrEqual(90);
    expect(croppedRes.interiorWalls.length).toBeGreaterThanOrEqual(1);
  });

  it('nhận diện tường chéo (diagonal walls) trong ảnh bản vẽ', () => {
    const w = 120;
    const h = 120;
    const data = new Uint8ClampedArray(w * h * 4);
    data.fill(255);

    const setBlack = (x: number, y: number) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const idx = (y * w + x) * 4;
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
    };

    // Vẽ tường bao hình vuông (20..100, 20..100)
    for (let x = 20; x <= 100; x++) {
      setBlack(x, 20);
      setBlack(x, 100);
    }
    for (let y = 20; y <= 100; y++) {
      setBlack(20, y);
      setBlack(100, y);
    }

    // Vẽ tường chéo góc 45 độ từ (30, 30) đến (70, 70)
    for (let i = 30; i <= 70; i++) {
      setBlack(i, i);
      setBlack(i + 1, i);
    }

    const res = extractWallsFromImagePixels({ data, width: w, height: h }, 10);
    expect(res.width).toBe(10);
    // Nhận diện được vách ngăn bên trong bao gồm tường chéo
    expect(res.interiorWalls.length).toBeGreaterThanOrEqual(1);
  });

  it('parses SVG rect and interior lines scaled to targetWidthMeters', () => {
    const svg = `
      <svg width="200" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="200" height="100" />
        <line x1="100" y1="0" x2="100" y2="100" />
      </svg>
    `;
    const res = parseSvgToBlueprint(svg, 12);
    expect(res.width).toBe(12);
    expect(res.depth).toBe(6);
    expect(res.interiorWalls).toHaveLength(1);
    expect(res.interiorWalls[0]!.x1).toBeCloseTo(0, 1);
    expect(res.interiorWalls[0]!.z1).toBeCloseTo(-3, 1);
    expect(res.interiorWalls[0]!.z2).toBeCloseTo(3, 1);
  });

  it('computes Otsu threshold separating dark lines from light background', () => {
    const lum = new Uint8Array(100);
    lum.fill(240);
    for (let i = 0; i < 15; i++) lum[i] = 20;
    const { threshold, darkForeground } = computeOtsuThreshold(lum);
    expect(darkForeground).toBe(true);
    expect(threshold).toBeGreaterThanOrEqual(20);
    expect(threshold).toBeLessThan(240);
  });
});

describe('formatVnd', () => {
  it('formats Vietnamese Dong in full and compact modes', () => {
    expect(formatVnd(12_500_000)).toContain('12.500.000');
    expect(formatVnd(12_500_000)).toContain('₫');
    expect(formatVnd(12_500_000, true)).toBe('12,5 tr ₫');
    expect(formatVnd(1_500_000_000, true)).toBe('1,5 tỷ ₫');
  });
});
