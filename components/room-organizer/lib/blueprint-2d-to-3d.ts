import { MAX_ROOM_DIMENSION } from './constants';
import { MAX_INTERIOR_WALLS_PER_FLOOR } from './schema';
import type { InteriorWall } from './types';

export type BlueprintSourceKind = 'dxf' | 'svg' | 'image' | 'pdf';

export interface WallSegment2D {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface DetectedOpening {
  type: 'door' | 'window';
  x: number; // Tọa độ tâm 3D (mét, gốc giữa nhà)
  z: number;
  rotation: number; // Góc xoay (radians)
  width: number; // Chiều rộng (mét)
  height?: number | undefined; // Chiều cao (mét)
}

export interface Blueprint2DResult {
  width: number;
  depth: number;
  interiorWalls: ReadonlyArray<Omit<InteriorWall, 'id'>>;
  openings?: ReadonlyArray<DetectedOpening>;
  sourceKind: BlueprintSourceKind;
  rawWidth: number;
  rawHeight: number;
  /** Non-empty when an image was analysed, for optional reference underlay. */
  imageDataUrl?: string;
}

export interface CropROI {
  x: number; // Tọa độ góc trên bên trái (0..1 hoặc pixel)
  y: number;
  width: number; // Chiều rộng vùng chọn
  height: number; // Chiều cao vùng chọn
}

export interface Point2D {
  x: number;
  y: number;
}

export interface DxfLayerConfig {
  wallLayers?: RegExp;
  doorLayers?: RegExp;
  windowLayers?: RegExp;
  ignoreLayers?: RegExp;
}

export const DEFAULT_DXF_LAYER_CONFIG: DxfLayerConfig = {
  wallLayers: /wall|tuong|kien_truc|arch|column|struc/i,
  doorLayers: /door|cua|cua_di|swing/i,
  windowLayers: /window|cuaso|cua_so|glaz/i,
  ignoreLayers: /dim|text|title|khung|ghi_chu|note|anno|hatch|center/i,
};

const MIN_HOUSE_DIM = 2;
const MAX_IMPORT_DIM = Math.min(40, MAX_ROOM_DIMENSION);
const MIN_WALL_LENGTH_M = 0.35;
const EXTERIOR_EDGE_TOLERANCE_M = 0.28;
const ENDPOINT_SNAP_M = 0.25;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampHouseDims(width: number, depth: number): { width: number; depth: number } {
  return {
    width: round2(Math.max(MIN_HOUSE_DIM, Math.min(MAX_IMPORT_DIM, width))),
    depth: round2(Math.max(MIN_HOUSE_DIM, Math.min(MAX_IMPORT_DIM, depth))),
  };
}

/**
 * Hiệu chỉnh tỷ lệ bản vẽ bằng 2 điểm click chọn và khoảng cách thực tế (mét).
 * Trả về hệ số quy đổi mét trên pixel (metersPerPixel).
 */
export function calibrateScale2D(p1: Point2D, p2: Point2D, realDistanceMeters: number): number {
  const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (pixelDist <= 0 || !Number.isFinite(pixelDist) || realDistanceMeters <= 0 || !Number.isFinite(realDistanceMeters)) {
    throw new Error('Khoảng cách pixel hoặc khoảng cách thực tế không hợp lệ.');
  }
  return realDistanceMeters / pixelDist;
}

/**
 * Cắt vùng đệm pixel ảnh theo khung chọn ROI (Region of Interest) để loại bỏ khung tên và đường gióng.
 */
export function cropImagePixels(
  pixels: { data: Uint8ClampedArray; width: number; height: number },
  roi: CropROI
): { data: Uint8ClampedArray; width: number; height: number } {
  const { data, width: imgW, height: imgH } = pixels;
  if (imgW <= 0 || imgH <= 0 || data.length === 0) return pixels;

  // Hỗ trợ tọa độ chuẩn hóa 0..1 hoặc pixel trực tiếp
  const isNorm = roi.x <= 1 && roi.y <= 1 && roi.width <= 1 && roi.height <= 1;
  const rx = Math.max(0, Math.min(imgW - 1, Math.round(isNorm ? roi.x * imgW : roi.x)));
  const ry = Math.max(0, Math.min(imgH - 1, Math.round(isNorm ? roi.y * imgH : roi.y)));
  const rw = Math.max(1, Math.min(imgW - rx, Math.round(isNorm ? roi.width * imgW : roi.width)));
  const rh = Math.max(1, Math.min(imgH - ry, Math.round(isNorm ? roi.height * imgH : roi.height)));

  const out = new Uint8ClampedArray(rw * rh * 4);
  for (let y = 0; y < rh; y++) {
    const srcRowStart = ((ry + y) * imgW + rx) * 4;
    const dstRowStart = y * rw * 4;
    out.set(data.subarray(srcRowStart, srcRowStart + rw * 4), dstRowStart);
  }

  return { data: out, width: rw, height: rh };
}

/** Remove segments that lie directly on the exterior shell boundary. */
function isExteriorEdge(seg: WallSegment2D, halfW: number, halfD: number): boolean {
  const onLeft = Math.abs(seg.x1 + halfW) < EXTERIOR_EDGE_TOLERANCE_M && Math.abs(seg.x2 + halfW) < EXTERIOR_EDGE_TOLERANCE_M;
  const onRight = Math.abs(seg.x1 - halfW) < EXTERIOR_EDGE_TOLERANCE_M && Math.abs(seg.x2 - halfW) < EXTERIOR_EDGE_TOLERANCE_M;
  const onTop = Math.abs(seg.z1 + halfD) < EXTERIOR_EDGE_TOLERANCE_M && Math.abs(seg.z2 + halfD) < EXTERIOR_EDGE_TOLERANCE_M;
  const onBottom = Math.abs(seg.z1 - halfD) < EXTERIOR_EDGE_TOLERANCE_M && Math.abs(seg.z2 - halfD) < EXTERIOR_EDGE_TOLERANCE_M;
  return onLeft || onRight || onTop || onBottom;
}

/** Snap segment endpoints to nearby existing endpoints or exterior walls so rooms close cleanly. */
function snapAndCleanSegments(
  raw: readonly WallSegment2D[],
  width: number,
  depth: number
): Array<Omit<InteriorWall, 'id'>> {
  const halfW = width / 2;
  const halfD = depth / 2;

  // 1. Filter out tiny segments and exterior boundary segments.
  const filtered = raw
    .map((s) => ({
      x1: Math.max(-halfW, Math.min(halfW, s.x1)),
      z1: Math.max(-halfD, Math.min(halfD, s.z1)),
      x2: Math.max(-halfW, Math.min(halfW, s.x2)),
      z2: Math.max(-halfD, Math.min(halfD, s.z2)),
    }))
    .filter((s) => Math.hypot(s.x2 - s.x1, s.z2 - s.z1) >= MIN_WALL_LENGTH_M)
    .filter((s) => !isExteriorEdge(s, halfW, halfD));

  // 2. Snap endpoints to exterior edges if close.
  const snapEdge = (v: number, half: number): number => {
    if (Math.abs(v + half) <= ENDPOINT_SNAP_M) return -half;
    if (Math.abs(v - half) <= ENDPOINT_SNAP_M) return half;
    return v;
  };

  const snapped = filtered.map((s) => ({
    x1: snapEdge(s.x1, halfW),
    z1: snapEdge(s.z1, halfD),
    x2: snapEdge(s.x2, halfW),
    z2: snapEdge(s.z2, halfD),
  }));

  // 3. Snap nearby endpoints together (cluster within ENDPOINT_SNAP_M).
  const points: Array<{ x: number; z: number }> = [];
  const snapPoint = (x: number, z: number): { x: number; z: number } => {
    for (const p of points) {
      if (Math.hypot(p.x - x, p.z - z) <= ENDPOINT_SNAP_M) return p;
    }
    const created = { x: round2(x), z: round2(z) };
    points.push(created);
    return created;
  };

  const result: Array<Omit<InteriorWall, 'id'>> = [];
  for (const s of snapped) {
    const p1 = snapPoint(s.x1, s.z1);
    const p2 = snapPoint(s.x2, s.z2);
    if (Math.hypot(p2.x - p1.x, p2.z - p1.z) < MIN_WALL_LENGTH_M) continue;
    // Deduplicate identical/reversed segments.
    const dup = result.some(
      (r) =>
        (Math.hypot(r.x1 - p1.x, r.z1 - p1.z) < 0.15 && Math.hypot(r.x2 - p2.x, r.z2 - p2.z) < 0.15) ||
        (Math.hypot(r.x1 - p2.x, r.z1 - p2.z) < 0.15 && Math.hypot(r.x2 - p1.x, r.z2 - p1.z) < 0.15)
    );
    if (!dup) {
      result.push({ x1: p1.x, z1: p1.z, x2: p2.x, z2: p2.z });
    }
    if (result.length >= MAX_INTERIOR_WALLS_PER_FLOOR) break;
  }

  return result;
}

/** Normalize raw 2D segments and openings into centred metres of size (width × depth). */
function normalizeSegmentsAndOpenings(
  segments: readonly WallSegment2D[],
  openings: readonly DetectedOpening[] = [],
  targetWidthMeters?: number,
  unitScale = 1
): Blueprint2DResult {
  if (segments.length === 0 && openings.length === 0) {
    const w = targetWidthMeters && targetWidthMeters >= MIN_HOUSE_DIM ? targetWidthMeters : 10;
    return {
      width: round2(Math.min(MAX_IMPORT_DIM, w)),
      depth: round2(Math.min(MAX_IMPORT_DIM, w * 0.8)),
      interiorWalls: [],
      openings: [],
      sourceKind: 'dxf',
      rawWidth: 0,
      rawHeight: 0,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  if (segments.length > 0) {
    for (const s of segments) {
      minX = Math.min(minX, s.x1, s.x2);
      maxX = Math.max(maxX, s.x1, s.x2);
      minZ = Math.min(minZ, s.z1, s.z2);
      maxZ = Math.max(maxZ, s.z1, s.z2);
    }
  } else {
    for (const op of openings) {
      minX = Math.min(minX, op.x);
      maxX = Math.max(maxX, op.x);
      minZ = Math.min(minZ, op.z);
      maxZ = Math.max(maxZ, op.z);
    }
  }

  const rawW = Math.max(1e-6, maxX - minX);
  const rawH = Math.max(1e-6, maxZ - minZ);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  let scale = unitScale;
  if (targetWidthMeters !== undefined && targetWidthMeters > 0) {
    scale = targetWidthMeters / rawW;
  } else {
    const naturalW = rawW * unitScale;
    if (naturalW > MAX_IMPORT_DIM || naturalW < MIN_HOUSE_DIM) {
      scale = Math.min(MAX_IMPORT_DIM, Math.max(MIN_HOUSE_DIM, 10)) / rawW;
    }
  }

  const { width, depth } = clampHouseDims(rawW * scale, rawH * scale);
  const effectiveScale = width / rawW;

  const scaled = segments.map((s) => ({
    x1: (s.x1 - cx) * effectiveScale,
    z1: (s.z1 - cz) * effectiveScale,
    x2: (s.x2 - cx) * effectiveScale,
    z2: (s.z2 - cz) * effectiveScale,
  }));

  const scaledOpenings: DetectedOpening[] = openings.map((op) => ({
    type: op.type,
    x: round2((op.x - cx) * effectiveScale),
    z: round2((op.z - cz) * effectiveScale),
    rotation: round2(op.rotation),
    width: round2(Math.max(0.6, op.width * effectiveScale)),
    ...(op.height !== undefined ? { height: op.height } : {}),
  }));

  return {
    width,
    depth,
    interiorWalls: snapAndCleanSegments(scaled, width, depth),
    openings: scaledOpenings,
    sourceKind: 'dxf',
    rawWidth: rawW,
    rawHeight: rawH,
  };
}

// ---------------------------------------------------------------------------
// 1. DXF Parser với Layer Classification (WALL, DOOR, WINDOW)
// ---------------------------------------------------------------------------

export function parseDxfToBlueprint(
  dxfText: string,
  targetWidthMeters?: number,
  layerConfig: DxfLayerConfig = DEFAULT_DXF_LAYER_CONFIG
): Blueprint2DResult {
  const lines = dxfText.split(/\r?\n/);
  const pairs: Array<{ code: number; value: string }> = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i]!.trim(), 10);
    const value = lines[i + 1]!.trim();
    if (Number.isFinite(code)) pairs.push({ code, value });
  }

  let insunits = 0;
  let inEntities = false;
  let entityType = '';
  let currentLayer = '0';
  let x1 = 0;
  let y1 = 0;
  let x2 = 0;
  let y2 = 0;
  let centerX = 0;
  let centerY = 0;
  let radius = 0;
  let startAngle = 0;
  let polyPoints: Array<{ x: number; y: number }> = [];
  let polyClosed = false;
  let currentPolyX: number | null = null;

  const wallSegments: WallSegment2D[] = [];
  const detectedOpenings: DetectedOpening[] = [];

  const wallRe = layerConfig.wallLayers ?? DEFAULT_DXF_LAYER_CONFIG.wallLayers!;
  const doorRe = layerConfig.doorLayers ?? DEFAULT_DXF_LAYER_CONFIG.doorLayers!;
  const windowRe = layerConfig.windowLayers ?? DEFAULT_DXF_LAYER_CONFIG.windowLayers!;
  const ignoreRe = layerConfig.ignoreLayers ?? DEFAULT_DXF_LAYER_CONFIG.ignoreLayers!;

  const flushEntity = () => {
    if (!entityType || ignoreRe.test(currentLayer)) {
      entityType = '';
      polyPoints = [];
      polyClosed = false;
      currentPolyX = null;
      return;
    }

    const isDoorLayer = doorRe.test(currentLayer);
    const isWindowLayer = windowRe.test(currentLayer);
    const isWallLayer = wallRe.test(currentLayer) || (!isDoorLayer && !isWindowLayer);

    if (entityType === 'LINE') {
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (isDoorLayer) {
        // Cửa trên layer DOOR
        const midX = (x1 + x2) / 2;
        const midZ = -(y1 + y2) / 2;
        const rot = Math.atan2(-(y2 - y1), x2 - x1);
        detectedOpenings.push({
          type: 'door',
          x: midX,
          z: midZ,
          rotation: rot,
          width: len,
        });
      } else if (isWindowLayer) {
        // Cửa sổ trên layer WINDOW
        const midX = (x1 + x2) / 2;
        const midZ = -(y1 + y2) / 2;
        const rot = Math.atan2(-(y2 - y1), x2 - x1);
        detectedOpenings.push({
          type: 'window',
          x: midX,
          z: midZ,
          rotation: rot,
          width: len,
        });
      } else if (isWallLayer) {
        // Mặc định hoặc layer WALL
        wallSegments.push({ x1, z1: -y1, x2, z2: -y2 });
      }
    } else if (entityType === 'ARC') {
      // Ký hiệu cung tròn mở cửa (Door swing arc)
      if (isDoorLayer || (radius >= 0.5 && radius <= 1.5)) {
        detectedOpenings.push({
          type: 'door',
          x: centerX,
          z: -centerY,
          rotation: (startAngle * Math.PI) / 180,
          width: radius,
        });
      }
    } else if (entityType === 'LWPOLYLINE' && polyPoints.length >= 2) {
      if (isDoorLayer || isWindowLayer) {
        const type = isDoorLayer ? 'door' : 'window';
        for (let i = 0; i + 1 < polyPoints.length; i++) {
          const p1 = polyPoints[i]!;
          const p2 = polyPoints[i + 1]!;
          detectedOpenings.push({
            type,
            x: (p1.x + p2.x) / 2,
            z: -(p1.y + p2.y) / 2,
            rotation: Math.atan2(-(p2.y - p1.y), p2.x - p1.x),
            width: Math.hypot(p2.x - p1.x, p2.y - p1.y),
          });
        }
      } else {
        for (let i = 0; i + 1 < polyPoints.length; i++) {
          wallSegments.push({
            x1: polyPoints[i]!.x,
            z1: -polyPoints[i]!.y,
            x2: polyPoints[i + 1]!.x,
            z2: -polyPoints[i + 1]!.y,
          });
        }
        if (polyClosed && polyPoints.length >= 3) {
          const first = polyPoints[0]!;
          const last = polyPoints[polyPoints.length - 1]!;
          wallSegments.push({ x1: last.x, z1: -last.y, x2: first.x, z2: -first.y });
        }
      }
    }

    entityType = '';
    polyPoints = [];
    polyClosed = false;
    currentPolyX = null;
  };

  for (let i = 0; i < pairs.length; i++) {
    const { code, value } = pairs[i]!;
    if (code === 9 && value === '$INSUNITS' && i + 1 < pairs.length && pairs[i + 1]!.code === 70) {
      insunits = Number.parseInt(pairs[i + 1]!.value, 10) || 0;
      continue;
    }
    if (code === 2 && value === 'ENTITIES') {
      inEntities = true;
      continue;
    }
    if (code === 0 && value === 'ENDSEC' && inEntities) {
      flushEntity();
      inEntities = false;
      continue;
    }
    if (!inEntities) continue;

    if (code === 0) {
      flushEntity();
      entityType = value;
      x1 = 0;
      y1 = 0;
      x2 = 0;
      y2 = 0;
      centerX = 0;
      centerY = 0;
      radius = 0;
      startAngle = 0;
      currentLayer = '0';
      continue;
    }

    if (code === 8) {
      currentLayer = value;
      continue;
    }

    if (entityType === 'LINE') {
      const num = Number.parseFloat(value);
      if (!Number.isFinite(num)) continue;
      if (code === 10) x1 = num;
      else if (code === 20) y1 = num;
      else if (code === 11) x2 = num;
      else if (code === 21) y2 = num;
    } else if (entityType === 'ARC') {
      const num = Number.parseFloat(value);
      if (!Number.isFinite(num)) continue;
      if (code === 10) centerX = num;
      else if (code === 20) centerY = num;
      else if (code === 40) radius = num;
      else if (code === 50) startAngle = num;
    } else if (entityType === 'LWPOLYLINE') {
      if (code === 70) {
        polyClosed = (Number.parseInt(value, 10) & 1) === 1;
      } else if (code === 10) {
        const num = Number.parseFloat(value);
        if (Number.isFinite(num)) currentPolyX = num;
      } else if (code === 20 && currentPolyX !== null) {
        const num = Number.parseFloat(value);
        if (Number.isFinite(num)) {
          polyPoints.push({ x: currentPolyX, y: num });
          currentPolyX = null;
        }
      }
    }
  }
  flushEntity();

  // Đơn vị quy đổi
  let unitScale = 1;
  if (insunits === 4) unitScale = 0.001; // mm
  else if (insunits === 5) unitScale = 0.01; // cm
  else if (insunits === 1) unitScale = 0.0254; // inch
  else if (insunits === 2) unitScale = 0.3048; // foot
  else if (wallSegments.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const s of wallSegments) {
      minX = Math.min(minX, s.x1, s.x2);
      maxX = Math.max(maxX, s.x1, s.x2);
    }
    const maxSpan = maxX - minX;
    if (maxSpan > 500) unitScale = 0.001;
    else if (maxSpan > 60) unitScale = 0.01;
  }

  const result = normalizeSegmentsAndOpenings(wallSegments, detectedOpenings, targetWidthMeters, unitScale);
  return {
    ...result,
    sourceKind: 'dxf',
  };
}

// ---------------------------------------------------------------------------
// 2. SVG Parser (<line>, <rect>, <polyline>, <polygon>)
// ---------------------------------------------------------------------------

function attrNum(attrs: string, name: string, fallback = 0): number {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attrs);
  if (!m) return fallback;
  const v = Number.parseFloat(m[1]!);
  return Number.isFinite(v) ? v : fallback;
}

function attrStr(attrs: string, name: string): string {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attrs);
  return m ? m[1]! : '';
}

function parsePointsList(raw: string): Array<{ x: number; z: number }> {
  const nums = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number.parseFloat)
    .filter(Number.isFinite);
  const pts: Array<{ x: number; z: number }> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i]!, z: nums[i + 1]! });
  }
  return pts;
}

export function parseSvgToBlueprint(svgText: string, targetWidthMeters = 10): Blueprint2DResult {
  const segments: WallSegment2D[] = [];

  for (const m of svgText.matchAll(/<line\b([^>]*)\/?>/gi)) {
    const a = m[1]!;
    segments.push({
      x1: attrNum(a, 'x1'),
      z1: attrNum(a, 'y1'),
      x2: attrNum(a, 'x2'),
      z2: attrNum(a, 'y2'),
    });
  }

  for (const m of svgText.matchAll(/<rect\b([^>]*)\/?>/gi)) {
    const a = m[1]!;
    const x = attrNum(a, 'x');
    const y = attrNum(a, 'y');
    const w = attrNum(a, 'width');
    const h = attrNum(a, 'height');
    if (w > 0 && h > 0) {
      segments.push({ x1: x, z1: y, x2: x + w, z2: y });
      segments.push({ x1: x + w, z1: y, x2: x + w, z2: y + h });
      segments.push({ x1: x + w, z1: y + h, x2: x, z2: y + h });
      segments.push({ x1: x, z1: y + h, x2: x, z2: y });
    }
  }

  for (const m of svgText.matchAll(/<(polyline|polygon)\b([^>]*)\/?>/gi)) {
    const tag = m[1]!.toLowerCase();
    const pts = parsePointsList(attrStr(m[2]!, 'points'));
    for (let i = 0; i + 1 < pts.length; i++) {
      segments.push({ x1: pts[i]!.x, z1: pts[i]!.z, x2: pts[i + 1]!.x, z2: pts[i + 1]!.z });
    }
    if (tag === 'polygon' && pts.length >= 3) {
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      segments.push({ x1: last.x, z1: last.z, x2: first.x, z2: first.z });
    }
  }

  return {
    ...normalizeSegmentsAndOpenings(segments, [], targetWidthMeters, 1),
    sourceKind: 'svg',
  };
}

// ---------------------------------------------------------------------------
// 3. Raster Image & PDF Parser (ROI Crop, Otsu, Hough/Diagonal Walls, Openings)
// ---------------------------------------------------------------------------

export function computeOtsuThreshold(luminance: Uint8Array): { threshold: number; darkForeground: boolean } {
  const hist = new Int32Array(256);
  for (let i = 0; i < luminance.length; i++) {
    const bin = luminance[i]!;
    hist[bin] = (hist[bin] ?? 0) + 1;
  }

  const total = luminance.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t]!;

  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  let darkCount = 0;
  for (let t = 0; t <= threshold; t++) darkCount += hist[t]!;
  return { threshold, darkForeground: darkCount <= total * 0.55 };
}

interface RawRun {
  pos: number;
  start: number;
  end: number;
}

function mergeParallelRuns(runs: readonly RawRun[], posGap: number, spanGap: number): RawRun[] {
  if (runs.length === 0) return [];
  const sorted = [...runs].sort((a, b) => a.pos - b.pos || a.start - b.start);
  const clusters: Array<{ posSum: number; count: number; maxPos: number; start: number; end: number }> = [];

  for (const r of sorted) {
    let matched = false;
    for (let i = clusters.length - 1; i >= 0; i--) {
      const c = clusters[i]!;
      if (r.pos - c.maxPos > posGap) break;
      if (r.start <= c.end + spanGap && r.end >= c.start - spanGap) {
        c.posSum += r.pos;
        c.count += 1;
        c.maxPos = Math.max(c.maxPos, r.pos);
        c.start = Math.min(c.start, r.start);
        c.end = Math.max(c.end, r.end);
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({ posSum: r.pos, count: 1, maxPos: r.pos, start: r.start, end: r.end });
    }
  }

  return clusters.map((c) => ({
    pos: c.posSum / c.count,
    start: c.start,
    end: c.end,
  }));
}

/**
 * Trích xuất tường ngang, tường dọc, tường chéo và cửa đi/cửa sổ từ pixel bản vẽ 2D.
 */
export function extractWallsFromImagePixels(
  pixels: { data: Uint8ClampedArray; width: number; height: number },
  targetWidthMeters = 10,
  roi?: CropROI
): Blueprint2DResult {
  // Áp dụng ROI crop trước khi phân tích nếu có yêu cầu
  const activePixels = roi ? cropImagePixels(pixels, roi) : pixels;
  const { data, width: imgW, height: imgH } = activePixels;
  const total = imgW * imgH;

  if (total === 0) {
    return { width: 10, depth: 8, interiorWalls: [], openings: [], sourceKind: 'image', rawWidth: 0, rawHeight: 0 };
  }

  const lum = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    lum[i] = Math.round(0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!);
  }

  const { threshold, darkForeground } = computeOtsuThreshold(lum);
  const mask = new Uint8Array(total);
  const rowCounts = new Int32Array(imgH);
  const colCounts = new Int32Array(imgW);

  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const i = y * imgW + x;
      const isFg = darkForeground ? lum[i]! <= threshold : lum[i]! >= threshold;
      if (isFg) {
        mask[i] = 1;
        rowCounts[y]!++;
        colCounts[x]!++;
      }
    }
  }

  // Xác định bounding box của nội dung mặt bằng
  const minRowFg = Math.max(2, Math.floor(imgW * 0.01));
  const minColFg = Math.max(2, Math.floor(imgH * 0.01));
  let minY = 0;
  let maxY = imgH - 1;
  let minX = 0;
  let maxX = imgW - 1;
  while (minY < maxY && rowCounts[minY]! < minRowFg) minY++;
  while (maxY > minY && rowCounts[maxY]! < minRowFg) maxY--;
  while (minX < maxX && colCounts[minX]! < minColFg) minX++;
  while (maxX > minX && colCounts[maxX]! < minColFg) maxX--;

  const contentW = Math.max(1, maxX - minX + 1);
  const contentH = Math.max(1, maxY - minY + 1);
  const minRunH = Math.max(6, Math.round(contentW * 0.06));
  const minRunV = Math.max(6, Math.round(contentH * 0.06));
  const maxGap = 2;

  // 1. Quét đoạn thẳng ngang (Horizontal)
  const hRuns: RawRun[] = [];
  for (let y = minY; y <= maxY; y++) {
    let runStart = -1;
    let gap = 0;
    for (let x = minX; x <= maxX; x++) {
      if (mask[y * imgW + x] === 1) {
        if (runStart < 0) runStart = x;
        gap = 0;
      } else if (runStart >= 0) {
        gap++;
        if (gap > maxGap) {
          const end = x - gap;
          if (end - runStart + 1 >= minRunH) hRuns.push({ pos: y, start: runStart, end });
          runStart = -1;
          gap = 0;
        }
      }
    }
    if (runStart >= 0) {
      const end = maxX - gap;
      if (end - runStart + 1 >= minRunH) hRuns.push({ pos: y, start: runStart, end });
    }
  }

  // 2. Quét đoạn thẳng dọc (Vertical)
  const vRuns: RawRun[] = [];
  for (let x = minX; x <= maxX; x++) {
    let runStart = -1;
    let gap = 0;
    for (let y = minY; y <= maxY; y++) {
      if (mask[y * imgW + x] === 1) {
        if (runStart < 0) runStart = y;
        gap = 0;
      } else if (runStart >= 0) {
        gap++;
        if (gap > maxGap) {
          const end = y - gap;
          if (end - runStart + 1 >= minRunV) vRuns.push({ pos: x, start: runStart, end });
          runStart = -1;
          gap = 0;
        }
      }
    }
    if (runStart >= 0) {
      const end = maxY - gap;
      if (end - runStart + 1 >= minRunV) vRuns.push({ pos: x, start: runStart, end });
    }
  }

  // 3. Quét tường chéo (Diagonal / angled walls ~45° và ~135°)
  const diagonalSegments: WallSegment2D[] = [];
  const minDiagLen = Math.max(8, Math.round(Math.hypot(contentW, contentH) * 0.05));

  // Chéo 1: x + y = const (góc 135° / -45°)
  for (let d = minX + minY; d <= maxX + maxY; d += 4) {
    let dStart = -1;
    let dGap = 0;
    const startX = Math.max(minX, d - maxY);
    const endX = Math.min(maxX, d - minY);
    for (let x = startX; x <= endX; x++) {
      const y = d - x;
      if (mask[y * imgW + x] === 1) {
        if (dStart < 0) dStart = x;
        dGap = 0;
      } else if (dStart >= 0) {
        dGap++;
        if (dGap > maxGap) {
          const xEnd = x - dGap;
          const yEnd = d - xEnd;
          const yStart = d - dStart;
          if (Math.hypot(xEnd - dStart, yEnd - yStart) >= minDiagLen) {
            diagonalSegments.push({ x1: dStart, z1: yStart, x2: xEnd, z2: yEnd });
          }
          dStart = -1;
          dGap = 0;
        }
      }
    }
  }

  // Chéo 2: x - y = const (góc 45°)
  for (let d = minX - maxY; d <= maxX - minY; d += 4) {
    let dStart = -1;
    let dGap = 0;
    const startX = Math.max(minX, minY + d);
    const endX = Math.min(maxX, maxY + d);
    for (let x = startX; x <= endX; x++) {
      const y = x - d;
      if (mask[y * imgW + x] === 1) {
        if (dStart < 0) dStart = x;
        dGap = 0;
      } else if (dStart >= 0) {
        dGap++;
        if (dGap > maxGap) {
          const xEnd = x - dGap;
          const yEnd = xEnd - d;
          const yStart = dStart - d;
          if (Math.hypot(xEnd - dStart, yEnd - yStart) >= minDiagLen) {
            diagonalSegments.push({ x1: dStart, z1: yStart, x2: xEnd, z2: yEnd });
          }
          dStart = -1;
          dGap = 0;
        }
      }
    }
  }

  const thicknessTol = Math.max(4, Math.round(Math.max(contentW, contentH) * 0.025));
  const spanTol = Math.max(4, Math.round(Math.max(contentW, contentH) * 0.02));
  const mergedH = mergeParallelRuns(hRuns, thicknessTol, spanTol);
  const mergedV = mergeParallelRuns(vRuns, thicknessTol, spanTol);

  const segments: WallSegment2D[] = [
    ...mergedH.map((r) => ({ x1: r.start, z1: r.pos, x2: r.end, z2: r.pos })),
    ...mergedV.map((r) => ({ x1: r.pos, z1: r.start, x2: r.pos, z2: r.end })),
    ...diagonalSegments,
  ];

  // 4. Nhận diện cửa đi & cửa sổ (Wall Openings) từ các khoảng hở giữa tường
  const detectedOpenings: DetectedOpening[] = [];
  const { width, depth } = clampHouseDims(
    targetWidthMeters,
    targetWidthMeters * (contentH / contentW)
  );
  const scale = width / contentW;
  const cx = (minX + maxX) / 2;
  const cz = (minY + maxY) / 2;

  // Tìm khoảng hở tiêu chuẩn (0.7m - 1.2m cho cửa đi, 0.8m - 2.5m cho cửa sổ) giữa các đoạn tường ngang
  for (let i = 0; i < mergedH.length; i++) {
    for (let j = i + 1; j < mergedH.length; j++) {
      const w1 = mergedH[i]!;
      const w2 = mergedH[j]!;
      if (Math.abs(w1.pos - w2.pos) <= thicknessTol) {
        const gapDist = Math.min(Math.abs(w2.start - w1.end), Math.abs(w1.start - w2.end));
        const gapMeters = gapDist * scale;
        if (gapMeters >= 0.7 && gapMeters <= 1.2) {
          const midX = (Math.min(w1.end, w2.end) + Math.max(w1.start, w2.start)) / 2;
          detectedOpenings.push({
            type: 'door',
            x: (midX - cx) * scale,
            z: (w1.pos - cz) * scale,
            rotation: 0,
            width: round2(gapMeters),
          });
        } else if (gapMeters > 1.2 && gapMeters <= 2.5) {
          const midX = (Math.min(w1.end, w2.end) + Math.max(w1.start, w2.start)) / 2;
          detectedOpenings.push({
            type: 'window',
            x: (midX - cx) * scale,
            z: (w1.pos - cz) * scale,
            rotation: 0,
            width: round2(gapMeters),
          });
        }
      }
    }
  }

  // Tương tự cho tường dọc
  for (let i = 0; i < mergedV.length; i++) {
    for (let j = i + 1; j < mergedV.length; j++) {
      const w1 = mergedV[i]!;
      const w2 = mergedV[j]!;
      if (Math.abs(w1.pos - w2.pos) <= thicknessTol) {
        const gapDist = Math.min(Math.abs(w2.start - w1.end), Math.abs(w1.start - w2.end));
        const gapMeters = gapDist * scale;
        if (gapMeters >= 0.7 && gapMeters <= 1.2) {
          const midZ = (Math.min(w1.end, w2.end) + Math.max(w1.start, w2.start)) / 2;
          detectedOpenings.push({
            type: 'door',
            x: (w1.pos - cx) * scale,
            z: (midZ - cz) * scale,
            rotation: Math.PI / 2,
            width: round2(gapMeters),
          });
        } else if (gapMeters > 1.2 && gapMeters <= 2.5) {
          const midZ = (Math.min(w1.end, w2.end) + Math.max(w1.start, w2.start)) / 2;
          detectedOpenings.push({
            type: 'window',
            x: (w1.pos - cx) * scale,
            z: (midZ - cz) * scale,
            rotation: Math.PI / 2,
            width: round2(gapMeters),
          });
        }
      }
    }
  }

  const worldSegments = segments.map((s) => ({
    x1: (s.x1 - cx) * scale,
    z1: (s.z1 - cz) * scale,
    x2: (s.x2 - cx) * scale,
    z2: (s.z2 - cz) * scale,
  }));

  return {
    width,
    depth,
    interiorWalls: snapAndCleanSegments(worldSegments, width, depth),
    openings: detectedOpenings,
    sourceKind: 'image',
    rawWidth: contentW,
    rawHeight: contentH,
  };
}

/**
 * Render trang PDF đầu tiên ra Canvas2D để phục vụ trích xuất tường và mở cửa.
 */
export async function renderPdfToCanvas(
  pdfBuffer: ArrayBuffer,
  pageNumber = 1
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number; dataUrl: string }> {
  const pdfjs = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  }

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2.0 });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Không thể khởi tạo Canvas 2D để hiển thị PDF.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext = { canvasContext: ctx, viewport } as unknown as Parameters<typeof page.render>[0];
  await page.render(renderContext).promise;
  const dataUrl = canvas.toDataURL('image/png');
  return { canvas, width: canvas.width, height: canvas.height, dataUrl };
}

/**
 * Phân tích file bản vẽ kỹ thuật (DXF, SVG, PNG/JPG/WebP hoặc PDF) và tự động dựng mô hình 3D.
 */
export async function analyzeBlueprintFile(
  file: File,
  targetWidthMeters = 10,
  options?: { roi?: CropROI }
): Promise<Blueprint2DResult> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.dxf')) {
    const text = await file.text();
    return parseDxfToBlueprint(text, targetWidthMeters > 0 ? targetWidthMeters : undefined);
  }

  if (lower.endsWith('.svg') || file.type === 'image/svg+xml') {
    const text = await file.text();
    return parseSvgToBlueprint(text, targetWidthMeters);
  }

  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    const buffer = await file.arrayBuffer();
    const { canvas, width: w, height: h, dataUrl } = await renderPdfToCanvas(buffer);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D để phân tích PDF.');
    const imageData = ctx.getImageData(0, 0, w, h);
    const result = extractWallsFromImagePixels(imageData, targetWidthMeters, options?.roi);
    return { ...result, sourceKind: 'pdf', imageDataUrl: dataUrl };
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Vui lòng chọn file bản vẽ 2D hợp lệ (.png, .jpg, .webp, .svg, .dxf hoặc .pdf).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Không thể đọc file ảnh bản vẽ.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Không thể giải mã ảnh bản vẽ.'));
    image.src = dataUrl;
  });

  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D để phân tích bản vẽ.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

  const result = extractWallsFromImagePixels(imageData, targetWidthMeters, options?.roi);
  return { ...result, imageDataUrl: dataUrl };
}
