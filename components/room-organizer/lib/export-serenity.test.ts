// @vitest-environment jsdom
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { describe, expect, it } from 'vitest';
import { disposeObject } from '../three/builder-utils';
import { buildExportBuilding, prepareExportBuilding } from '../three/building-export';
import * as THREE from '../three/three-runtime';
import { buildingToSvg } from './plan-export/svg';
import { THE_SERENITY_HOUSE } from './the-serenity-house';

describe('Export THE SERENITY HOUSE delivery artifacts', () => {
  const deliveryDir = path.resolve(process.cwd(), 'THE_SERENITY_HOUSE_DELIVERY');

  it('generates delivery folder and files', async () => {
    if (!fs.existsSync(deliveryDir)) {
      fs.mkdirSync(deliveryDir, { recursive: true });
    }

    // 1. JSON
    const jsonPath = path.join(deliveryDir, 'THE_SERENITY_HOUSE.json');
    fs.writeFileSync(jsonPath, JSON.stringify(THE_SERENITY_HOUSE, null, 2), 'utf-8');
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.statSync(jsonPath).size).toBeGreaterThan(1000);

    // 2. SVG Floor Plan
    const svgContent = buildingToSvg(THE_SERENITY_HOUSE);
    const svgPath = path.join(deliveryDir, 'THE_SERENITY_HOUSE_floor-plan.svg');
    fs.writeFileSync(svgPath, svgContent, 'utf-8');
    expect(fs.existsSync(svgPath)).toBe(true);
    expect(fs.statSync(svgPath).size).toBeGreaterThan(500);

    // 3. GLB 3D Model
    await prepareExportBuilding(THREE, THE_SERENITY_HOUSE);
    const building = buildExportBuilding(THREE, THE_SERENITY_HOUSE);
    try {
      const exporter = new GLTFExporter();
      const glbResult = await exporter.parseAsync(building, { binary: true });
      const glbPath = path.join(deliveryDir, 'THE_SERENITY_HOUSE.glb');
      if (glbResult instanceof ArrayBuffer) {
        fs.writeFileSync(glbPath, Buffer.from(glbResult));
      } else {
        fs.writeFileSync(glbPath, Buffer.from(JSON.stringify(glbResult)));
      }
      expect(fs.existsSync(glbPath)).toBe(true);
      expect(fs.statSync(glbPath).size).toBeGreaterThan(1000);
    } finally {
      disposeObject(building);
    }
  });
});
