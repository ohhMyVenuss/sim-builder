import { describe, expect, it } from 'vitest';
import { rotatedHalfExtents } from './footprint';
import { snapOpeningToWall } from './opening-snap';
import { THE_SERENITY_HOUSE } from './the-serenity-house';
import { buildShellColliders, buildWalkColliders, exteriorDoorWall, walkClearance, type ShellBuilding } from './walk-collision';
import { walkSpawn, type WalkSpawnContext } from './walk-spawn';
import { buildWalkWorld } from './walk-world';
import type { FurnitureItem } from './types';

const RADIUS = 0.3;

function shell(template: typeof THE_SERENITY_HOUSE): ShellBuilding {
  return { width: template.width, depth: template.height, floors: template.floors };
}

function context(building: ShellBuilding, floorIndex: number): WalkSpawnContext {
  const floor = building.floors[floorIndex]!;
  return {
    world: buildWalkWorld(building),
    building,
    colliders: [
      ...buildWalkColliders(floor.items, floor.interiorWalls ?? [], { roomWidth: building.width, roomDepth: building.depth, stairsAsRamps: true }),
      ...buildShellColliders(building, floorIndex),
    ],
    radius: RADIUS,
  };
}

/** Pieces whose doors, handles or controls are on local +z. */
const FRONTED: ReadonlySet<string> = new Set(['wardrobe', 'fridge', 'stove', 'kitchen-sink', 'counter', 'bookshelf', 'tv', 'dresser']);
const FRONT_CLEARANCE = 0.5;

function roomInFront(item: FurnitureItem, width: number, depth: number): number {
  const dirX = Math.sin(item.rotation ?? 0);
  const dirZ = Math.cos(item.rotation ?? 0);
  const { halfW, halfD } = rotatedHalfExtents(item);
  const { x, z } = item.position!;
  if (Math.abs(dirX) > Math.abs(dirZ)) return dirX > 0 ? width / 2 - (x + halfW) : x - halfW + width / 2;
  return dirZ > 0 ? depth / 2 - (z + halfD) : z - halfD + depth / 2;
}

function blockedInFront(item: FurnitureItem, others: readonly FurnitureItem[]): FurnitureItem | undefined {
  const dirX = Math.round(Math.sin(item.rotation ?? 0));
  const dirZ = Math.round(Math.cos(item.rotation ?? 0));
  const { halfW, halfD } = rotatedHalfExtents(item);
  const { x, z } = item.position!;
  const strip =
    dirX !== 0
      ? { x0: dirX > 0 ? x + halfW : x - halfW - FRONT_CLEARANCE, x1: dirX > 0 ? x + halfW + FRONT_CLEARANCE : x - halfW, z0: z - halfD, z1: z + halfD }
      : { x0: x - halfW, x1: x + halfW, z0: dirZ > 0 ? z + halfD : z - halfD - FRONT_CLEARANCE, z1: dirZ > 0 ? z + halfD + FRONT_CLEARANCE : z - halfD };
  return others.find((other) => {
    if (other.id === item.id || !other.position || other.type === 'door' || other.type === 'window' || other.height < 0.1) return false;
    const e = rotatedHalfExtents(other);
    const eps = 1e-6;
    return (
      other.position.x + e.halfW > strip.x0 + eps &&
      other.position.x - e.halfW < strip.x1 - eps &&
      other.position.z + e.halfD > strip.z0 + eps &&
      other.position.z - e.halfD < strip.z1 - eps
    );
  });
}

describe('THE SERENITY HOUSE validation', () => {
  it('has an exterior door on the ground floor', () => {
    const doors = THE_SERENITY_HOUSE.floors[0]!.items.filter((item) => item.type === 'door');
    expect(doors.some((door) => exteriorDoorWall(door, [], THE_SERENITY_HOUSE.width, THE_SERENITY_HOUSE.height) !== null)).toBe(true);
  });

  it('has windows on every storey that snap correctly', () => {
    for (const floor of THE_SERENITY_HOUSE.floors) {
      const openings = floor.items.filter((item) => item.type === 'window' || item.type === 'door');
      expect(openings.filter((item) => item.type === 'window').length, floor.id).toBeGreaterThan(0);
      for (const opening of openings) {
        const snap = snapOpeningToWall({
          position: opening.position!,
          itemWidth: opening.width,
          roomWidth: THE_SERENITY_HOUSE.width,
          roomDepth: THE_SERENITY_HOUSE.height,
          ...(floor.interiorWalls ? { interiorWalls: floor.interiorWalls } : {}),
        });
        expect(snap.position.x, `${opening.id} x`).toBeCloseTo(opening.position!.x, 6);
        expect(snap.position.z, `${opening.id} z`).toBeCloseTo(opening.position!.z, 6);
      }
    }
  });

  it('wardrobes, appliances and shelves open onto free floor', () => {
    for (const floor of THE_SERENITY_HOUSE.floors) {
      for (const item of floor.items) {
        if (!FRONTED.has(item.type)) continue;
        expect(roomInFront(item, THE_SERENITY_HOUSE.width, THE_SERENITY_HOUSE.height), `${floor.id}/${item.id}`).toBeGreaterThanOrEqual(FRONT_CLEARANCE);
        expect(blockedInFront(item, floor.items)?.id, `${floor.id}/${item.id}`).toBeUndefined();
      }
    }
  });

  it('lets the walker in EXPLORE walk out through the door', () => {
    const building = shell(THE_SERENITY_HOUSE);
    const ctx = context(building, 0);
    const spawn = walkSpawn(ctx, 0);
    const door = THE_SERENITY_HOUSE.floors[0]!.items.find((item) => item.type === 'door')!.position!;
    expect(Math.hypot(spawn.x - door.x, spawn.z - door.z)).toBeLessThan(1.2);

    const outX = door.x + (door.x - spawn.x) * 0.6;
    const outZ = door.z + (door.z - spawn.z) * 0.6;
    for (let t = 0; t <= 1; t += 0.05) {
      const x = spawn.x + (outX - spawn.x) * t;
      const z = spawn.z + (outZ - spawn.z) * t;
      const inside = Math.abs(x) < THE_SERENITY_HOUSE.width / 2 && Math.abs(z) < THE_SERENITY_HOUSE.height / 2;
      const clr = walkClearance(ctx.colliders, x, z, inside, 0);
      expect(clr, `t ${t.toFixed(2)}`).toBeGreaterThanOrEqual(RADIUS);
    }
  });
});
