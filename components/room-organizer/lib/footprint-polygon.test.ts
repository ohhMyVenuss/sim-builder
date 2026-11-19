import { describe, expect, it } from 'vitest';
import { ROOM_TEMPLATES } from './constants';
import {
  buildingArea,
  clampToBuilding,
  footprintOutline,
  isInsideBuilding,
  pointInPolygon,
  polygonArea,
} from './footprint';
import { hasCollisions } from './geometry';
import type { RoomLayout } from './types';

describe('Task 3 — Polygon footprint & Vietnamese architecture', () => {
  const taperedLot = [
    { x: -2, z: -5 },
    { x: 2, z: -5 },
    { x: 3, z: 5 },
    { x: -3, z: 5 },
  ];

  it('computes polygon area and point-in-polygon accurately', () => {
    // Trapezoid: top 4m, bottom 6m, height 10m -> (4+6)/2 * 10 = 50 m²
    expect(polygonArea(taperedLot)).toBeCloseTo(50, 5);
    expect(pointInPolygon(taperedLot, 0, 0)).toBe(true);
    expect(pointInPolygon(taperedLot, 2.8, -4.5)).toBe(false);
    expect(pointInPolygon(taperedLot, 2.8, 4.5)).toBe(true);
  });

  it('integrates polygon outline into FootprintBuilding helpers', () => {
    const building = { width: 6, height: 10, footprintOutline: taperedLot };
    expect(buildingArea(building)).toBeCloseTo(50, 5);
    expect(footprintOutline(building)).toHaveLength(4);
    expect(isInsideBuilding(building, 0, 0)).toBe(true);
    expect(isInsideBuilding(building, -2.9, -4.8)).toBe(false);

    const clamped = clampToBuilding(building, { x: -5, z: -5 });
    expect(isInsideBuilding(building, clamped.x, clamped.z)).toBe(true);
  });

  it('validates Vietnamese residential templates have zero initial collisions', () => {
    for (const key of ['nhaOng5x15', 'nhaPho5x20', 'canHo2PN', 'canHo3PN'] as const) {
      const tpl = ROOM_TEMPLATES[key] as Omit<RoomLayout, 'id'>;
      for (const floor of tpl.floors) {
        for (const item of floor.items) {
          const collided = hasCollisions(
            item,
            floor.items,
            tpl.width,
            tpl.height,
            { interiorWalls: floor.interiorWalls ?? [] }
          );
          expect(collided).toBe(false);
        }
      }
    }
  });
});
