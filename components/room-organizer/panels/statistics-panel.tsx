'use client';

import {
  FileSpreadsheet,
  Printer,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRoomEditor } from '../contexts';
import { useActiveFloorIndex, useLayout } from '../hooks/use-layout-store';
import {
  BOQ_TIER_LABELS,
  BOQ_TIER_PRICES,
  calculateBoq,
  generateBoqHtml,
  type BoqTier,
} from '../lib/boq';
import { budgetLimit, furnitureSpend, isHardBudgetOn } from '../lib/budget';
import { CATEGORIES } from '../lib/constants';
import { downloadBoqCsv } from '../lib/file-io';
import { buildingArea } from '../lib/footprint';
import { formatVnd } from '../lib/format';
import { footprintArea, itemCountByCategory } from '../lib/geometry';
import { categoryLabel, UI_TEXT, useLocale } from '../lib/i18n';
import { floorRooms, hasTooManyWalls, MAX_ROOM_WALLS } from '../lib/room-detect';
import { ENTRANCE_DOOR_ID, ENTRANCE_WALL_ID, entrancePlanOutline } from '../lib/street';
import { zoneContains, zoneStats } from '../lib/zones';
import { Icon, iconForItem } from '../plotcraft/icon';

export function StatisticsPanel(): JSX.Element {
  const layout = useLayout();
  const locale = useLocale();
  const statsCopy = UI_TEXT[locale].stats;
  const { collidingIds, actions } = useRoomEditor();
  const budget = budgetLimit(layout);
  const hardBudget = isHardBudgetOn(layout);
  const [budgetInputM, setBudgetInputM] = useState<string>(() => String(Math.round(budget / 1_000_000)));

  // BOQ State
  const [boqTier, setBoqTier] = useState<BoqTier>('standard');
  const [customFloorPrice, setCustomFloorPrice] = useState<string>(() =>
    String(BOQ_TIER_PRICES.standard.floorPerM2)
  );
  const [customWallPrice, setCustomWallPrice] = useState<string>(() =>
    String(BOQ_TIER_PRICES.standard.wallPerM2)
  );

  const collisionsOnActiveFloor = collidingIds.size;
  const activeFloorIndex = useActiveFloorIndex();
  const activeFloorName = layout.floors[activeFloorIndex]?.name ?? 'tầng hiện tại';

  const allItems = useMemo(
    () => layout.floors.flatMap((floor) => floor.items).filter((item) => item.id !== ENTRANCE_DOOR_ID),
    [layout.floors]
  );

  const footprint = useMemo(
    () => layout.floors.reduce((sum, floor) => sum + footprintArea(floor.items), 0),
    [layout.floors]
  );
  const roomArea = buildingArea(layout);
  const totalArea = roomArea * layout.floors.length;
  const density = totalArea > 0 ? Math.min(100, (footprint / totalArea) * 100) : 0;
  const counts = useMemo(() => itemCountByCategory(allItems), [allItems]);

  // BOQ calculation
  const parsedFloorPrice = Number.parseFloat(customFloorPrice);
  const parsedWallPrice = Number.parseFloat(customWallPrice);
  const boqOptions = useMemo(() => {
    const opts: { tier?: BoqTier; customFloorPricePerM2?: number; customWallPricePerM2?: number } = { tier: boqTier };
    if (Number.isFinite(parsedFloorPrice)) opts.customFloorPricePerM2 = parsedFloorPrice;
    if (Number.isFinite(parsedWallPrice)) opts.customWallPricePerM2 = parsedWallPrice;
    return opts;
  }, [boqTier, parsedFloorPrice, parsedWallPrice]);

  const boq = useMemo(() => {
    return calculateBoq(layout, boqOptions);
  }, [layout, boqOptions]);

  const totalBoqCost = boq.totalBoqCost;
  const budgetUsedRatio = budget > 0 ? Math.min(1, totalBoqCost / budget) : 0;
  const overBudget = totalBoqCost > budget;

  const handleTierChange = (tier: BoqTier) => {
    setBoqTier(tier);
    setCustomFloorPrice(String(BOQ_TIER_PRICES[tier].floorPerM2));
    setCustomWallPrice(String(BOQ_TIER_PRICES[tier].wallPerM2));
  };

  const handleExportBoqCsv = () => {
    downloadBoqCsv(layout, boqOptions);
  };

  const handlePrintBoqPdf = () => {
    const html = generateBoqHtml(layout, boqOptions);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  const zoneRows = useMemo(
    () =>
      layout.floors.flatMap((floor, index) =>
        (floor.zones ?? []).map((zone) => ({
          key: `${floor.id}:${zone.id}`,
          label: layout.floors.length > 1 ? `${zone.name} · ${floor.name}` : zone.name,
          color: zone.color,
          ...zoneStats(zone, floor.items, entrancePlanOutline(layout, index)),
        }))
      ),
    [layout]
  );

  const roomRows = useMemo(
    () =>
      layout.floors.flatMap((floor, index) => {
        if (!floor.interiorWalls?.some((wall) => wall.id !== ENTRANCE_WALL_ID)) return [];
        return floorRooms(layout, index).map((room, roomIndex) => {
          const name =
            floor.zones?.find((zone) => zoneContains(zone, room.anchor.x, room.anchor.z))?.name ??
            `Room ${roomIndex + 1}`;
          return {
            key: `${floor.id}:${roomIndex}`,
            label: layout.floors.length > 1 ? `${name} · ${floor.name}` : name,
            area: room.area,
          };
        });
      }),
    [layout]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-1.5">
          <Icon name="panels" size={16} />
          {statsCopy.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <p className="text-muted-foreground">{statsCopy.wholeHouse}</p>
        <StatRow label={statsCopy.items}>{allItems.length}</StatRow>
        <StatRow label={statsCopy.floors}>{layout.floors.length}</StatRow>
        <StatRow label={statsCopy.areaPerFloor}>{roomArea.toFixed(1)} m²</StatRow>
        <StatRow label={statsCopy.totalArea}>{totalArea.toFixed(1)} m²</StatRow>
        <StatRow label={statsCopy.footprint}>
          {footprint.toFixed(1)} m² ({density.toFixed(0)}%)
        </StatRow>
        <ProgressBar value={density / 100} label="Mật độ" intent={density > 70 ? 'warning' : 'normal'} />

        {collisionsOnActiveFloor > 0 && (
          <StatRow label={`Va chạm (${activeFloorName})`} highlight>
            <span className="inline-flex items-center gap-1 text-red-600">
              <Icon name="warn" size={13} />
              <span>{collisionsOnActiveFloor}</span>
            </span>
          </StatRow>
        )}

        {/* BẢNG DỰ TOÁN HOÀN THIỆN (BOQ) */}
        <div className="pt-2 border-t space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-foreground font-semibold flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-primary" />
              <span>Bảng dự toán hoàn thiện (BOQ)</span>
            </span>
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={hardBudget}
                onChange={(e) => actions.setHardBudget(e.target.checked)}
                className="rounded"
              />
              Giới hạn cứng
            </label>
          </div>

          {/* Chọn gói phân khúc giá bình quân thị trường Việt Nam */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Gói phân khúc đơn giá:</span>
              <span className="font-medium text-foreground">{BOQ_TIER_LABELS[boqTier]}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(['economy', 'standard', 'premium'] as const).map((tier) => (
                <Button
                  key={tier}
                  type="button"
                  variant={boqTier === tier ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-[10px] px-1"
                  onClick={() => handleTierChange(tier)}
                >
                  {BOQ_TIER_LABELS[tier]}
                </Button>
              ))}
            </div>
          </div>

          {/* Tùy chỉnh đơn giá lát sàn & sơn tường (VNĐ / m²) */}
          <div className="grid grid-cols-2 gap-2 text-[11px] bg-muted/30 p-2 rounded-md">
            <div>
              <span className="text-muted-foreground">Lát sàn (₫/m²):</span>
              <Input
                type="number"
                step={10000}
                value={customFloorPrice}
                onChange={(e) => setCustomFloorPrice(e.target.value)}
                className="h-6 text-xs mt-0.5"
              />
            </div>
            <div>
              <span className="text-muted-foreground">Sơn tường (₫/m²):</span>
              <Input
                type="number"
                step={5000}
                value={customWallPrice}
                onChange={(e) => setCustomWallPrice(e.target.value)}
                className="h-6 text-xs mt-0.5"
              />
            </div>
          </div>

          {/* Bảng chi tiết thành tiền hoàn thiện và nội thất */}
          <div className="space-y-1 bg-muted/20 p-2 rounded-md text-[11px]">
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground">1. Chi phí nội thất:</span>
              <span className="font-medium">{formatVnd(boq.totalFurnitureCost)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground">2. Hoàn thiện sàn ({boq.totalFloorArea.toFixed(1)} m²):</span>
              <span className="font-medium">{formatVnd(boq.totalFloorFinishingCost)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground">3. Sơn tường thực ({boq.totalNetWallArea.toFixed(1)} m²):</span>
              <span className="font-medium">{formatVnd(boq.totalWallFinishingCost)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-1 border-t border-border font-semibold text-xs">
              <span className="text-foreground">TỔNG DỰ TOÁN (BOQ):</span>
              <span className={overBudget ? 'text-red-600' : 'text-primary'}>
                {formatVnd(totalBoqCost)}
              </span>
            </div>
          </div>

          {/* Thiết lập ngân quỹ ban đầu */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[11px] text-muted-foreground shrink-0">Ngân quỹ:</span>
            <Input
              type="number"
              min={0}
              step={10}
              aria-label="Ngân quỹ ban đầu (triệu VNĐ)"
              value={budgetInputM}
              onChange={(e) => setBudgetInputM(e.target.value)}
              onBlur={() => {
                const n = Number.parseFloat(budgetInputM);
                if (Number.isFinite(n) && n >= 0) actions.setBudgetLimit(Math.round(n * 1_000_000));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const n = Number.parseFloat(budgetInputM);
                  if (Number.isFinite(n) && n >= 0) actions.setBudgetLimit(Math.round(n * 1_000_000));
                }
              }}
              className="h-7 text-xs w-24"
            />
            <span className="text-[11px] text-muted-foreground shrink-0">triệu ₫</span>
            <div className="flex gap-1 ml-auto">
              {[250, 500, 1000].map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={Math.round(budget / 1_000_000) === m ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => {
                    setBudgetInputM(String(m));
                    actions.setBudgetLimit(m * 1_000_000);
                  }}
                >
                  {m >= 1000 ? `${m / 1000}b` : `${m}m`}
                </Button>
              ))}
            </div>
          </div>

          <StatRow label={overBudget ? 'Vượt ngân quỹ' : 'Ngân quỹ còn lại'} highlight={overBudget}>
            {formatVnd(Math.abs(budget - totalBoqCost))}
          </StatRow>
          <ProgressBar value={budgetUsedRatio} label="Tiến độ ngân quỹ" intent={overBudget ? 'danger' : 'normal'} />

          {/* Các nút xuất báo cáo dự toán BOQ */}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px] flex items-center justify-center gap-1"
              onClick={handleExportBoqCsv}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Xuất CSV (Excel)</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px] flex items-center justify-center gap-1"
              onClick={handlePrintBoqPdf}
            >
              <Printer className="w-3.5 h-3.5 text-sky-600" />
              <span>In Bảng BOQ / PDF</span>
            </Button>
          </div>
        </div>

        {counts.size > 0 && (
          <div className="pt-2 border-t space-y-1">
            <p className="text-muted-foreground">{statsCopy.byCategory}</p>
            {CATEGORIES.filter((category) => counts.has(category.key)).map((category) => (
              <StatRow
                key={category.key}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name={iconForItem('', category.key)} size={13} />
                    {categoryLabel(category.key, locale)}
                  </span>
                }
              >
                {counts.get(category.key) ?? 0}
              </StatRow>
            ))}
          </div>
        )}

        {layout.floors.some(hasTooManyWalls) && (
          <p className="pt-2 border-t text-muted-foreground">
            Rooms aren’t listed on a floor with over {MAX_ROOM_WALLS} walls.
          </p>
        )}

        {roomRows.length > 0 && (
          <div className="pt-2 border-t space-y-1" aria-label="Rooms">
            <p className="text-muted-foreground font-medium">Rooms</p>
            {roomRows.map((row) => (
              <StatRow key={row.key} label={row.label}>
                {row.area.toFixed(1)} m²
              </StatRow>
            ))}
          </div>
        )}

        {zoneRows.length > 0 && (
          <div className="pt-2 border-t space-y-1" aria-label="By zone">
            <p className="text-muted-foreground font-medium">Theo khu vực (Zone)</p>
            {zoneRows.map((row) => (
              <div key={row.key} className="flex justify-between items-baseline gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="shrink-0 font-medium">
                  {row.itemCount} · {formatVnd(row.cost, true)} · {row.area.toFixed(1)} m²
                </span>
              </div>
            ))}
          </div>
        )}

        {layout.floors.length > 1 && (
          <div className="pt-2 border-t space-y-1">
            <p className="text-muted-foreground font-medium">Theo từng tầng</p>
            {layout.floors.map((floor) => {
              const floorCost = furnitureSpend({ floors: [floor] });
              return (
                <StatRow key={floor.id} label={floor.name}>
                  {floor.items.length} · {formatVnd(floorCost, true)}
                </StatRow>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface StatRowProps {
  label: React.ReactNode;
  highlight?: boolean;
  children: React.ReactNode;
}

function StatRow({ label, highlight = false, children }: StatRowProps): JSX.Element {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'font-semibold text-red-600' : 'font-medium'}>{children}</span>
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  label: string;
  intent: 'normal' | 'warning' | 'danger';
}

function ProgressBar({ value, label, intent }: ProgressBarProps): JSX.Element {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const tone =
    intent === 'danger' ? 'bg-red-500' : intent === 'warning' ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-1.5 w-full bg-muted rounded-full overflow-hidden"
    >
      <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}
