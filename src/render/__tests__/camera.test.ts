import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  type ViewSize,
  clampZoom,
  fitCamera,
  lerpCamera,
  screenToWorld,
  zoomAroundPoint,
} from '../camera';

const view: ViewSize = { width: 800, height: 600 };
const camera = { centerX: 10, centerY: -5, zoom: 16 };

describe('screenToWorld', () => {
  it('центр экрана это центр камеры', () => {
    expect(screenToWorld(camera, view, 400, 300)).toEqual({ x: 10, y: -5 });
  });

  it('вправо по экрану это вправо по миру', () => {
    // 16 пикселей на ячейку: сдвиг на 160 пикселей это 10 ячеек.
    expect(screenToWorld(camera, view, 560, 300).x).toBeCloseTo(20);
  });

  it('вниз по экрану это вниз по миру, а ось Y мира смотрит вверх', () => {
    expect(screenToWorld(camera, view, 400, 460).y).toBeCloseTo(-15);
  });
});

describe('zoomAroundPoint', () => {
  it('точка под курсором остаётся на месте', () => {
    const px = 620;
    const py = 140;
    const before = screenToWorld(camera, view, px, py);
    const zoomed = zoomAroundPoint(camera, view, px, py, 2);
    const after = screenToWorld(zoomed, view, px, py);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('масштабирование в центре не двигает камеру', () => {
    const zoomed = zoomAroundPoint(camera, view, 400, 300, 2);
    expect(zoomed.centerX).toBeCloseTo(camera.centerX);
    expect(zoomed.centerY).toBeCloseTo(camera.centerY);
    expect(zoomed.zoom).toBe(32);
  });

  it('зум не выходит за границы', () => {
    expect(zoomAroundPoint(camera, view, 400, 300, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAroundPoint(camera, view, 400, 300, 0.0001).zoom).toBe(MIN_ZOOM);
  });

  it('на границе зума точка под курсором всё равно не уезжает', () => {
    const px = 700;
    const py = 500;
    const at = { centerX: 0, centerY: 0, zoom: MAX_ZOOM };
    const before = screenToWorld(at, view, px, py);
    const after = screenToWorld(zoomAroundPoint(at, view, px, py, 4), view, px, py);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});

describe('lerpCamera', () => {
  const to = { centerX: 20, centerY: -15, zoom: 64 };

  it('на краях даёт исходные состояния', () => {
    expect(lerpCamera(camera, to, 0)).toEqual(camera);
    const end = lerpCamera(camera, to, 1);
    expect(end.centerX).toBeCloseTo(to.centerX);
    expect(end.zoom).toBeCloseTo(to.zoom);
  });

  it('зум идёт геометрически, а не линейно', () => {
    // Середина между 16 и 64 по множителю это 32, а по прибавке было бы 40.
    expect(lerpCamera(camera, to, 0.5).zoom).toBeCloseTo(32);
  });

  it('центр идёт линейно', () => {
    expect(lerpCamera(camera, to, 0.5).centerX).toBeCloseTo(15);
  });
});

describe('fitCamera', () => {
  it('вписывает документ по узкой стороне', () => {
    // 800 минус отступы делить на 64 даёт 11.75, 600 минус отступы делить на 32 даёт 17.25.
    expect(fitCamera(view, 64, 32).zoom).toBe(11);
  });

  it('ставит центр в середину документа', () => {
    const fitted = fitCamera(view, 64, 32);
    expect(fitted.centerX).toBe(32);
    expect(fitted.centerY).toBe(-16);
  });

  it('зум целый, чтобы пиксели глифов оставались ровными', () => {
    expect(Number.isInteger(fitCamera(view, 37, 19).zoom)).toBe(true);
  });

  it('крошечное окно упирается в минимальный зум, а не уходит в ноль', () => {
    expect(fitCamera({ width: 10, height: 10 }, 64, 32).zoom).toBe(MIN_ZOOM);
  });
});

describe('clampZoom', () => {
  it('держит зум в границах', () => {
    expect(clampZoom(1)).toBe(MIN_ZOOM);
    expect(clampZoom(1000)).toBe(MAX_ZOOM);
    expect(clampZoom(16)).toBe(16);
  });
});
