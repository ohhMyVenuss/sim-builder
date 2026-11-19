'use client';

import { Building2, Check, Crop, FileUp, Ruler } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRoomEditor } from '../contexts';
import {
  analyzeBlueprintFile,
  calibrateScale2D,
  type Blueprint2DResult,
  type CropROI,
} from '../lib/blueprint-2d-to-3d';
import { MAX_FLOORS } from '../lib/constants';
import { notify } from '../lib/editor-notices';
import { MAX_STOREY_HEIGHT, MIN_STOREY_HEIGHT } from '../lib/storeys';

/**
 * Import a 2D technical drawing (DXF, SVG, PDF, PNG, JPG, WebP) and automatically
 * reconstruct the 3D house or active floor's footprint, interior walls, and openings.
 */
export function Blueprint2DPanel(): JSX.Element {
  const { actions, history } = useRoomEditor();
  const fileRef = useRef<HTMLInputElement>(null);
  const widthId = useId();
  const modeId = useId();
  const floorsId = useId();
  const heightId = useId();
  const underlayId = useId();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetWidth, setTargetWidth] = useState<string>('10');
  const [mode, setMode] = useState<'new-house' | 'current-floor'>('new-house');
  const [floorCount, setFloorCount] = useState<string>('1');
  const [storeyHeightM, setStoreyHeightM] = useState<string>('3');
  const [keepUnderlay, setKeepUnderlay] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Blueprint2DResult | null>(null);

  // ROI Crop state
  const [enableRoi, setEnableRoi] = useState<boolean>(false);
  const [roiX, setRoiX] = useState<string>('0');
  const [roiY, setRoiY] = useState<string>('0');
  const [roiW, setRoiW] = useState<string>('100');
  const [roiH, setRoiH] = useState<string>('100');

  // 2-Point Calibration state
  const [enableCalibration, setEnableCalibration] = useState<boolean>(false);
  const [calibP1X, setCalibP1X] = useState<string>('0');
  const [calibP1Y, setCalibP1Y] = useState<string>('0');
  const [calibP2X, setCalibP2X] = useState<string>('784.4');
  const [calibP2Y, setCalibP2Y] = useState<string>('0');
  const [calibRealDist, setCalibRealDist] = useState<string>('7.844');

  const runAnalysis = async (file: File, widthValue: string, roiOptions?: CropROI) => {
    setBusy(true);
    setError(null);
    try {
      const parsedW = Number.parseFloat(widthValue);
      const targetW = Number.isFinite(parsedW) && parsedW >= 2 ? parsedW : 10;
      const result = await analyzeBlueprintFile(file, targetW, roiOptions ? { roi: roiOptions } : undefined);
      setPreview(result);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Không thể phân tích bản vẽ 2D.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSelectedFile(file);
    const activeRoi = enableRoi
      ? {
          x: (Number.parseFloat(roiX) || 0) / 100,
          y: (Number.parseFloat(roiY) || 0) / 100,
          width: (Number.parseFloat(roiW) || 100) / 100,
          height: (Number.parseFloat(roiH) || 100) / 100,
        }
      : undefined;
    void runAnalysis(file, targetWidth, activeRoi);
  };

  const handleApplyRoi = () => {
    if (!selectedFile) return;
    const activeRoi: CropROI = {
      x: (Number.parseFloat(roiX) || 0) / 100,
      y: (Number.parseFloat(roiY) || 0) / 100,
      width: (Number.parseFloat(roiW) || 100) / 100,
      height: (Number.parseFloat(roiH) || 100) / 100,
    };
    void runAnalysis(selectedFile, targetWidth, activeRoi);
    notify('Đã cập nhật vùng chọn mặt bằng (ROI Crop).');
  };

  const handleApplyCalibration = () => {
    try {
      const p1 = { x: Number.parseFloat(calibP1X) || 0, y: Number.parseFloat(calibP1Y) || 0 };
      const p2 = { x: Number.parseFloat(calibP2X) || 0, y: Number.parseFloat(calibP2Y) || 0 };
      const realDist = Number.parseFloat(calibRealDist) || 7.844;
      const metersPerPixel = calibrateScale2D(p1, p2, realDist);
      if (preview && preview.rawWidth > 0) {
        const calculatedWidth = (preview.rawWidth * metersPerPixel).toFixed(2);
        setTargetWidth(calculatedWidth);
        if (selectedFile) void runAnalysis(selectedFile, calculatedWidth);
        notify(`Hiệu chuẩn tỷ lệ 2 điểm thành công: quy đổi ${calculatedWidth} m.`);
      } else {
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const calcW = Math.max(2, Math.round(dist * metersPerPixel * 100) / 100);
        setTargetWidth(String(calcW));
        if (selectedFile) void runAnalysis(selectedFile, String(calcW));
        notify(`Đã tính chiều rộng theo 2 điểm: ${calcW} m.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi hiệu chuẩn 2 điểm.');
    }
  };

  const handleApply = () => {
    if (!preview) return;
    const floorsNum = Math.max(1, Math.min(MAX_FLOORS, Number.parseInt(floorCount, 10) || 1));
    const storeyNum = Math.max(
      MIN_STOREY_HEIGHT,
      Math.min(MAX_STOREY_HEIGHT, Number.parseFloat(storeyHeightM) || 3)
    );
    history.commitNow();
    actions.applyBlueprint2D({
      width: preview.width,
      depth: preview.depth,
      interiorWalls: preview.interiorWalls,
      ...(preview.openings ? { openings: preview.openings } : {}),
      mode,
      floorCount: floorsNum,
      storeyHeightMeters: storeyNum,
      floorPlanImage: keepUnderlay && preview.imageDataUrl ? preview.imageDataUrl : null,
    });
    const openingMsg = preview.openings?.length ? `, ${preview.openings.length} cửa đi/cửa sổ` : '';
    notify(
      `Đã dựng mô hình 3D (${preview.width} m × ${preview.depth} m, ${preview.interiorWalls.length} vách ngăn${openingMsg}) từ bản vẽ 2D.`
    );
  };

  return (
    <div className="pt-3 border-t space-y-2.5">
      <div>
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Building2 className="w-4 h-4 text-primary" />
          <span>Dựng nhà 3D từ bản vẽ kỹ thuật 2D</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Hỗ trợ hồ sơ thiết kế PDF (.pdf), bản vẽ CAD (.dxf), vector (.svg) hoặc ảnh (.png, .jpg, .webp).
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".dxf,.svg,.pdf,image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      <Button
        type="button"
        variant="default"
        size="sm"
        className="w-full text-xs flex items-center justify-center gap-1.5"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        <FileUp className="w-3.5 h-3.5" />
        {busy ? 'Đang phân tích bản vẽ…' : selectedFile ? `Đổi bản vẽ (${selectedFile.name})` : 'Chọn bản vẽ kỹ thuật 2D'}
      </Button>

      {/* Tùy chọn ROI Crop (Khoanh vùng mặt bằng chính) */}
      <div className="rounded-md border p-2 space-y-1.5 bg-muted/20">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[11px] font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={enableRoi}
              onChange={(e) => {
                setEnableRoi(e.target.checked);
                if (!e.target.checked && selectedFile) {
                  void runAnalysis(selectedFile, targetWidth);
                }
              }}
              className="rounded"
            />
            <Crop className="w-3 h-3 text-muted-foreground" />
            <span>Khoanh vùng mặt bằng (ROI Crop)</span>
          </label>
        </div>

        {enableRoi && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] text-muted-foreground">
              Loại bỏ khung tên, bảng ghi chú và đường gióng kích thước xung quanh ảnh:
            </p>
            <div className="grid grid-cols-4 gap-1 text-[10px]">
              <div>
                <span>X (%)</span>
                <Input value={roiX} onChange={(e) => setRoiX(e.target.value)} className="h-6 text-[10px] px-1" />
              </div>
              <div>
                <span>Y (%)</span>
                <Input value={roiY} onChange={(e) => setRoiY(e.target.value)} className="h-6 text-[10px] px-1" />
              </div>
              <div>
                <span>Rộng (%)</span>
                <Input value={roiW} onChange={(e) => setRoiW(e.target.value)} className="h-6 text-[10px] px-1" />
              </div>
              <div>
                <span>Cao (%)</span>
                <Input value={roiH} onChange={(e) => setRoiH(e.target.value)} className="h-6 text-[10px] px-1" />
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" className="w-full h-6 text-[10px]" onClick={handleApplyRoi}>
              Áp dụng vùng chọn
            </Button>
          </div>
        )}
      </div>

      {/* Tùy chọn Hiệu chỉnh 2 điểm (2-Point Calibration) */}
      <div className="rounded-md border p-2 space-y-1.5 bg-muted/20">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[11px] font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={enableCalibration}
              onChange={(e) => setEnableCalibration(e.target.checked)}
              className="rounded"
            />
            <Ruler className="w-3 h-3 text-muted-foreground" />
            <span>Hiệu chỉnh tỷ lệ 2 điểm (Calibration)</span>
          </label>
        </div>

        {enableCalibration && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] text-muted-foreground">
              Nhập tọa độ 2 điểm trên ảnh bản vẽ và chiều dài thực tế (mét) để tính tỷ lệ chính xác:
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div>
                <span>Điểm 1 (X, Y px)</span>
                <div className="flex gap-1">
                  <Input value={calibP1X} onChange={(e) => setCalibP1X(e.target.value)} placeholder="X" className="h-6 text-[10px] px-1" />
                  <Input value={calibP1Y} onChange={(e) => setCalibP1Y(e.target.value)} placeholder="Y" className="h-6 text-[10px] px-1" />
                </div>
              </div>
              <div>
                <span>Điểm 2 (X, Y px)</span>
                <div className="flex gap-1">
                  <Input value={calibP2X} onChange={(e) => setCalibP2X(e.target.value)} placeholder="X" className="h-6 text-[10px] px-1" />
                  <Input value={calibP2Y} onChange={(e) => setCalibP2Y(e.target.value)} placeholder="Y" className="h-6 text-[10px] px-1" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span>Khoảng cách thực:</span>
              <Input
                type="number"
                step={0.001}
                value={calibRealDist}
                onChange={(e) => setCalibRealDist(e.target.value)}
                className="h-6 text-[10px] w-20"
              />
              <span>mét</span>
              <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] ml-auto" onClick={handleApplyCalibration}>
                Tính tỷ lệ
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={widthId} className="text-[11px]">
            Chiều rộng thực tế (m)
          </Label>
          <Input
            id={widthId}
            type="number"
            min={2}
            max={40}
            step={0.1}
            value={targetWidth}
            onChange={(e) => setTargetWidth(e.target.value)}
            onBlur={() => {
              if (selectedFile) void runAnalysis(selectedFile, targetWidth);
            }}
            className="h-7 text-xs"
          />
        </div>
        <div>
          <Label htmlFor={heightId} className="text-[11px]">
            Chiều cao tầng (m)
          </Label>
          <Input
            id={heightId}
            type="number"
            min={MIN_STOREY_HEIGHT}
            max={MAX_STOREY_HEIGHT}
            step={0.1}
            value={storeyHeightM}
            onChange={(e) => setStoreyHeightM(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={modeId} className="text-[11px]">
            Chế độ dựng
          </Label>
          <select
            id={modeId}
            value={mode}
            onChange={(e) => setMode(e.target.value as 'new-house' | 'current-floor')}
            className="w-full h-7 rounded-md border bg-background px-2 text-xs"
          >
            <option value="new-house">Tạo nhà mới</option>
            <option value="current-floor">Áp dụng tầng hiện tại</option>
          </select>
        </div>
        {mode === 'new-house' && (
          <div>
            <Label htmlFor={floorsId} className="text-[11px]">
              Số tầng
            </Label>
            <Input
              id={floorsId}
              type="number"
              min={1}
              max={MAX_FLOORS}
              step={1}
              value={floorCount}
              onChange={(e) => setFloorCount(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
        )}
      </div>

      {preview?.imageDataUrl && (
        <label htmlFor={underlayId} className="flex items-center gap-2 text-[11px] cursor-pointer">
          <input
            id={underlayId}
            type="checkbox"
            checked={keepUnderlay}
            onChange={(e) => setKeepUnderlay(e.target.checked)}
            className="rounded"
          />
          <span>Giữ ảnh bản vẽ làm nền đối chiếu trên sàn</span>
        </label>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {preview && (
        <div className="rounded-md border bg-muted/40 p-2 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span>
              Kích thước: <strong>{preview.width} m × {preview.depth} m</strong> ({(preview.width * preview.depth).toFixed(1)} m²)
            </span>
            <span className="text-muted-foreground">
              {preview.interiorWalls.length} vách{preview.openings?.length ? `, ${preview.openings.length} cửa` : ''}
            </span>
          </div>

          <svg
            viewBox={`${-preview.width / 2 - 0.5} ${-preview.depth / 2 - 0.5} ${preview.width + 1} ${preview.depth + 1}`}
            className="w-full h-28 rounded border bg-slate-950/80"
            aria-label="Xem trước cấu trúc tường và cửa 2D"
          >
            <rect
              x={-preview.width / 2}
              y={-preview.depth / 2}
              width={preview.width}
              height={preview.depth}
              fill="rgba(56, 189, 248, 0.08)"
              stroke="#38bdf8"
              strokeWidth={0.14}
            />
            {preview.interiorWalls.map((w, idx) => (
              <line
                key={idx}
                x1={w.x1}
                y1={w.z1}
                x2={w.x2}
                y2={w.z2}
                stroke="#f59e0b"
                strokeWidth={0.12}
                strokeLinecap="round"
              />
            ))}
            {preview.openings?.map((op, idx) => (
              <circle
                key={`op-${idx}`}
                cx={op.x}
                cy={op.z}
                r={op.width / 4}
                fill={op.type === 'door' ? '#10b981' : '#06b6d4'}
                stroke="#ffffff"
                strokeWidth={0.05}
              />
            ))}
          </svg>

          <Button type="button" size="sm" className="w-full text-xs flex items-center justify-center gap-1.5" onClick={handleApply}>
            <Check className="w-3.5 h-3.5" />
            <span>Dựng mô hình 3D ngay</span>
          </Button>
        </div>
      )}
    </div>
  );
}
