import { describe, expect, it } from 'vitest';
import { createDocument } from '../../../core/document';
import { createCanvasTool } from '../canvasTool';
import { atPoint, makeToolEnv } from './testEnv';

const setup = () => makeToolEnv(createDocument({ width: 20, height: 10 }), { zoom: 16 });

describe('инструмент «Холст»', () => {
  it('правый край наружу: рамка по ходу, размер на отпускании, якорь слева', () => {
    const { env, calls } = setup();
    const tool = createCanvasTool();
    tool.onPointerDown?.(env, atPoint(20.1, 5));
    tool.onPointerMove?.(env, atPoint(23.2, 5));
    expect(calls.frames.at(-1)).toEqual({ x: 0, y: 0, w: 23, h: 10 });
    tool.onPointerUp?.(env, atPoint(23.2, 5));
    expect(calls.resizes).toEqual([{ width: 23, height: 10, anchor: 'left' }]);
    expect(calls.frames.at(-1)).toBeNull();
  });

  it('верхний левый угол внутрь обрезает холст к правому нижнему углу', () => {
    const { env, calls } = setup();
    const tool = createCanvasTool();
    tool.onPointerDown?.(env, atPoint(0, 0));
    tool.onPointerUp?.(env, atPoint(4, 2));
    expect(calls.resizes).toEqual([{ width: 16, height: 8, anchor: 'bottom-right' }]);
  });

  it('середина холста ничего не хватает, Escape снимает жест без изменения', () => {
    const { env, calls } = setup();
    const tool = createCanvasTool();
    tool.onPointerDown?.(env, atPoint(10, 5));
    tool.onPointerUp?.(env, atPoint(15, 5));
    expect(calls.resizes).toEqual([]);
    expect(tool.hoverCursor?.(env, atPoint(10, 10))).toBe('ns-resize');
    tool.onPointerDown?.(env, atPoint(10, 10));
    tool.onPointerMove?.(env, atPoint(10, 14));
    const escape = { key: 'Escape' } as KeyboardEvent;
    expect(tool.onKeyDown?.(env, escape)).toBe(true);
    tool.onPointerUp?.(env, atPoint(10, 14));
    expect(calls.resizes).toEqual([]);
  });
});
