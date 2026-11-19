import { describe, expect, it } from 'vitest';
import {
  computeOtsuThreshold,
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

  it('extracts interior walls from raster floor-plan pixels', () => {
    const w = 100;
    const h = 80;
    const data = new Uint8ClampedArray(w * h * 4);
    // Fill white background
    data.fill(255);
    const setBlack = (x: number, y: number) => {
      const idx = (y * w + x) * 4;
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
    };
    // Draw outer border (10..89, 10..69)
    for (let x = 10; x <= 89; x++) {
      setBlack(x, 10);
      setBlack(x, 69);
    }
    for (let y = 10; y <= 69; y++) {
      setBlack(10, y);
      setBlack(89, y);
    }
    // Draw interior vertical wall at x=50
    for (let y = 10; y <= 69; y++) {
      setBlack(50, y);
      setBlack(51, y);
    }

    const res = extractWallsFromImagePixels({ data, width: w, height: h }, 10);
    expect(res.width).toBe(10);
    expect(res.depth).toBe(7.5);
    expect(res.interiorWalls.length).toBeGreaterThanOrEqual(1);
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
