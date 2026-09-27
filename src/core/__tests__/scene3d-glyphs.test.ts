import { describe, expect, it } from 'vitest';
import { composite } from '../compositor';
import { addLayer, createDocument, createLayer } from '../document';
import { composeFrame } from '../frame';
import { keyOf } from '../grid';
import { type Sprite3D, cloudSprites, gridCells } from '../scene3d/glyphs';
import { body3DBounds, pickBody3D } from '../scene3d/pick';
import { scene3DView } from '../scene3d/render';
import { createNode3D, createScene3D } from '../scene3d/scene';
import type { Render3D, Scene3D } from '../scene3d/types';

const W = 60;
const H = 30;

/** Шар на полэкрана, солнце справа спереди, режим — облако. */
function sphereScene(render: Partial<Render3D> = {}, azimuth = 60): Scene3D {
  const base = createScene3D([createNode3D('sphere', 'Шар', { scale: [3, 3, 3] })]);
  return {
    ...base,
    camera: { ...base.camera, position: [0, 0, 6] },
    light: { ...base.light, sunAzimuth: azimuth, sunElevation: 0, ambient: 0.1, sun: 1 },
    render: { ...base.render, mode: 'cloud', ...render },
  };
}

/** Средняя ступень рампы у символов левее или правее середины экрана. */
function density(sprites: readonly Sprite3D[], scene: Scene3D, side: 'left' | 'right'): number {
  const ramp = [...scene.quantize.ramp].map((g) => (g === ' ' ? '' : g));
  const picked = sprites.filter((s) => (side === 'left' ? s.x < W / 2 - 3 : s.x > W / 2 + 3));
  return picked.reduce((sum, s) => sum + ramp.indexOf(s.cell.glyph), 0) / picked.length;
}

describe('облако символов (режим B)', () => {
  it('свет считается на символ: освещённая сторона плотнее, солнце уходит — и плотность за ним', () => {
    const right = sphereScene({}, 70);
    const lit = cloudSprites(right, W, H, []);
    expect(lit.length).toBeGreaterThan(200);
    expect(density(lit, right, 'right')).toBeGreaterThan(density(lit, right, 'left') + 2);
    const left = sphereScene({}, -70);
    const moved = cloudSprites(left, W, H, []);
    expect(density(moved, left, 'left')).toBeGreaterThan(density(moved, left, 'right') + 2);
  });

  it('от дальних к ближним, размер по глубине: ближние крупнее; без него — шаг облака', () => {
    const sprites = cloudSprites(sphereScene({ spacing: 1.5 }), W, H, []);
    for (let i = 1; i < sprites.length; i++) {
      expect(sprites[i].size).toBeGreaterThanOrEqual(sprites[i - 1].size - 1e-6);
    }
    expect(sprites.at(-1)!.size).toBeGreaterThan(sprites[0].size);
    const flat = cloudSprites(sphereScene({ spacing: 1.5, sizeByDepth: false }), W, H, []);
    expect(new Set(flat.map((s) => s.size))).toEqual(new Set([1.5]));
  });

  it('на большом холсте бюджет точек огрубляет выборку, и символы крупнее — без просветов', () => {
    const big = {
      ...sphereScene({ sizeByDepth: false }),
      nodes: [createNode3D('sphere', 'Шар', { scale: [5, 5, 5] })],
    };
    const sprites = cloudSprites(big, 512, 288, []);
    expect(Math.min(...sprites.map((s) => s.size))).toBeGreaterThan(1.2);
    const cells = gridCells({ ...big, render: { ...big.render, mode: 'grid' } }, 512, 288, []);
    for (let y = 134; y < 154; y++) {
      for (let x = 246; x < 266; x++) expect(cells.has(keyOf(x, y))).toBe(true);
    }
  });

  it('туман разрежает по рампе, а не темнит: символов меньше, цвет той же яркости', () => {
    const clear = sphereScene();
    const foggy = sphereScene({ fog: 1 });
    const a = cloudSprites(clear, W, H, []);
    const b = cloudSprites(foggy, W, H, []);
    expect(b.length).toBeLessThan(a.length);
    expect(density(b, foggy, 'right')).toBeLessThan(density(a, clear, 'right'));
    // Яркие цвета: оттенок на полной яркости, туман его не гасит.
    expect(b.every((s) => s.cell.fg === a[0].cell.fg)).toBe(true);
  });

  it('тело спереди закрывает тело сзади: за кубом шара не видно', () => {
    const base = sphereScene();
    const scene: Scene3D = {
      ...base,
      nodes: [
        ...base.nodes,
        createNode3D('box', 'Куб', { position: [0, 0, 2], scale: [1.5, 1.5, 1.5] }),
      ],
    };
    const [sphere, box] = scene.nodes.map((n) => n.id);
    const sprites = cloudSprites(scene, W, H, []);
    const middle = sprites.filter((s) => Math.abs(s.x - W / 2) < 3 && Math.abs(s.y - H / 2) < 3);
    expect(middle.length).toBeGreaterThan(0);
    expect(middle.every((s) => s.body === box)).toBe(true);
    expect(sprites.some((s) => s.body === sphere)).toBe(true);
  });

  it('квадрат виден и с изнанки, а за камерой и за краем экрана символов нет', () => {
    const base = createScene3D([createNode3D('plane', 'Квадрат', { scale: [3, 3, 3] })]);
    const back = { ...base, camera: { ...base.camera, position: [0, 0, -5] as const } };
    expect(
      cloudSprites({ ...back, render: { ...back.render, mode: 'cloud' } }, W, H, []).length,
    ).toBeGreaterThan(50);
    const behind = {
      ...base,
      camera: { ...base.camera, position: [0, 0, -5] as const, target: [0, 0, -10] as const },
    };
    expect(
      cloudSprites({ ...behind, render: { ...behind.render, mode: 'cloud' } }, W, H, []),
    ).toEqual([]);
    const aside = { ...base, nodes: [createNode3D('box', 'Куб', { position: [40, 0, 0] })] };
    expect(
      cloudSprites({ ...aside, render: { ...aside.render, mode: 'cloud' } }, W, H, []),
    ).toEqual([]);
  });
});

describe('символы по сетке (режим B)', () => {
  it('шар — сплошной круг ячеек без дыр, по краю — контур', () => {
    const scene = sphereScene({ mode: 'grid' });
    const cells = gridCells(scene, W, H, []);
    // Радиус шара на экране: касательные из камеры на глубине 6 к шару радиуса 1,5.
    const focal = H / 2 / Math.tan((20 * Math.PI) / 180);
    const radius = (focal * 1.5) / Math.sqrt(36 - 1.5 * 1.5);
    const area = Math.PI * radius * radius;
    expect(cells.size).toBeGreaterThan(area * 0.9);
    expect(cells.size).toBeLessThan(area * 1.15);
    for (let y = H / 2 - 3; y <= H / 2 + 3; y++) {
      for (let x = W / 2 - 3; x <= W / 2 + 3; x++) expect(cells.has(keyOf(x, y))).toBe(true);
    }
    // Крайняя слева ячейка ряда посередине — черта контура, хотя там темно.
    let x = 0;
    while (!cells.has(keyOf(x, H / 2))) x++;
    expect(cells.get(keyOf(x, H / 2))?.glyph).toMatch(/^[-|/\\]$/);
  });

  it('в композиторе: сетка — ячейки слоя, облако — отдельный проход символов и ячейки в тексте', () => {
    const doc3d = (scene: Scene3D) => {
      const doc = createDocument({ width: W, height: H });
      return addLayer(doc, { ...createLayer('3D'), scene }, 1);
    };
    const grid = doc3d(sphereScene({ mode: 'grid' }));
    expect(composeFrame(grid).passes.map((p) => p.kind)).toEqual(['cells']);
    const cloud = doc3d(sphereScene());
    const layer = cloud.layers[1];
    const view = scene3DView(layer, cloud);
    expect(view.cells.size).toBe(0);
    // Та же сцена — тот же результат из кэша.
    expect(scene3DView(layer, cloud)).toBe(view);
    const frame = composeFrame(cloud);
    expect(frame.passes.map((p) => p.kind)).toEqual(['cells', 'glyphs']);
    const pass = frame.passes[1];
    expect(pass.kind === 'glyphs' && pass.batch.count).toBe(view.sprites.length);
    const flat = composite(cloud);
    const centre = Math.floor(H / 2) * W + Math.floor(W / 2);
    expect(flat.glyphs[centre]).not.toBe('');
  });
});

describe('выбор тела на экране', () => {
  it('щелчок берёт ближнее тело под указателем, по пустому месту — ничего', () => {
    const base = sphereScene({ mode: 'raster' });
    const box = createNode3D('box', 'Куб', { position: [0, 0, 2] });
    const scene: Scene3D = { ...base, nodes: [...base.nodes, box] };
    const sphere = scene.nodes[0].id;
    expect(pickBody3D(scene, W, H, [], W / 2, H / 2)).toBe(box.id);
    expect(pickBody3D(scene, W, H, [], W / 2 - 8, H / 2)).toBe(sphere);
    expect(pickBody3D(scene, W, H, [], 1, 1)).toBeNull();
  });

  it('рамка тела — вокруг его символов на экране, для неизвестного тела — null', () => {
    const scene = sphereScene({ mode: 'raster' });
    const meshes: readonly never[] = [];
    const rect = body3DBounds(scene, W, H, meshes, scene.nodes[0].id)!;
    expect(rect.x + rect.w / 2).toBeCloseTo(W / 2, 0);
    expect(rect.y + rect.h / 2).toBeCloseTo(H / 2, 0);
    expect(rect.w).toBeGreaterThan(18);
    expect(rect.w).toBe(rect.h);
    // Та же сцена и те же модели — рамка из кэша.
    expect(body3DBounds(scene, W, H, meshes, scene.nodes[0].id)).toBe(rect);
    expect(body3DBounds(scene, W, H, meshes, 'body-gone')).toBeNull();
  });
});
