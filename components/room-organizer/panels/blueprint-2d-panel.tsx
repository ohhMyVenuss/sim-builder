'use client';

import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRoomEditor } from '../contexts';
import { analyzeBlueprintFile, type Blueprint2DResult } from '../lib/blueprint-2d-to-3d';
import { MAX_FLOORS } from '../lib/constants';
import { notify } from '../lib/editor-notices';
import { MAX_STOREY_HEIGHT, MIN_STOREY_HEIGHT } from '../lib/storeys';
import { Icon } from '../plotcraft/icon';

/**
 * Import a 2D technical drawing (DXF, SVG, PNG, JPG, WebP) and automatically
 * reconstruct the 3D house or active floor's footprint and interior walls.
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

  const runAnalysis = async (file: File, widthValue: string) => {
    setBusy(true);
    setError(null);
    try {
      const parsedW = Number.parseFloat(widthValue);
      const targetW = Number.isFinite(parsedW) && parsedW >= 2 ? parsedW : 10;
      const result = await analyzeBlueprintFile(file, targetW);
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
    void runAnalysis(file, targetWidth);
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
      mode,
      floorCount: floorsNum,
      storeyHeightMeters: storeyNum,
      floorPlanImage: keepUnderlay && preview.imageDataUrl ? preview.imageDataUrl : null,
    });
    notify(
      `Đã dựng mô hình 3D (${preview.width} m × ${preview.depth} m, ${preview.interiorWalls.length} vách ngăn) từ bản vẽ 2D.`
    );
  };

  return (
    <div className="pt-3 border-t space-y-2.5">
      <div>
        <Label className="text-sm font-medium">Dựng nhà 3D từ bản vẽ kỹ thuật 2D</Label>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Hỗ trợ bản vẽ CAD (.dxf), vector (.svg) hoặc ảnh mặt bằng (.png, .jpg, .webp).
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".dxf,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={handleFileChange}
        className="hidden"
      />

      <Button
        type="button"
        variant="default"
        size="sm"
        className="w-full text-xs gap-1.5"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        <Icon name="ruler" size={14} />
        {busy ? 'Đang phân tích bản vẽ…' : selectedFile ? `Đổi bản vẽ (${selectedFile.name})` : 'Chọn bản vẽ kỹ thuật 2D'}
      </Button>

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
            step={0.5}
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
          Giữ ảnh bản vẽ làm nền đối chiếu trên sàn
        </label>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {preview && (
        <div className="rounded-md border bg-muted/40 p-2 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span>
              Kích thước: <strong>{preview.width} m × {preview.depth} m</strong> ({(preview.width * preview.depth).toFixed(1)} m²)
            </span>
            <span className="text-muted-foreground">{preview.interiorWalls.length} vách</span>
          </div>

          <svg
            viewBox={`${-preview.width / 2 - 0.5} ${-preview.depth / 2 - 0.5} ${preview.width + 1} ${preview.depth + 1}`}
            className="w-full h-28 rounded border bg-slate-950/80"
            aria-label="Xem trước cấu trúc tường 2D"
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
          </svg>

          <Button type="button" size="sm" className="w-full text-xs gap-1.5" onClick={handleApply}>
            <Icon name="build" size={14} />
            Dựng mô hình 3D ngay
          </Button>
        </div>
      )}
    </div>
  );
}
