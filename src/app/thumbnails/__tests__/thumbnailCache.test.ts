import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Animation,
  addFrame,
  createAnimation,
  frameDocument,
  removeFrame,
  withFrameDocument,
} from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { createDocument, setLayerCells } from '../../../core/document';
import { applyEdits, keyOf } from '../../../core/grid';
import { SETTLE_MS, ThumbnailCache } from '../thumbnailCache';

/** Три кадра на холсте 8×4. */
function threeFrames(): Animation {
  let anim = createAnimation(createDocument({ width: 8, height: 4, background: '#000000' }));
  anim = addFrame(anim, 0, 'empty');
  return addFrame(anim, 1, 'empty');
}

/** Ставит символ в кадр: получается новый объект кадра, остальные остаются теми же. */
function paint(anim: Animation, index: number): Animation {
  const doc = frameDocument(anim, index);
  const layer = doc.layers[0];
  const cells = applyEdits(layer.cells, new Map([[keyOf(0, 0), makeCell('█', '#ff0000')]]));
  return withFrameDocument(anim, index, setLayerCells(doc, layer.id, cells));
}

describe('ThumbnailCache', () => {
  let cache: ThumbnailCache;
  let notified: number;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new ThumbnailCache(() => 1);
    notified = 0;
    cache.subscribe(() => (notified += 1));
  });

  afterEach(() => {
    cache.stop();
    vi.useRealTimers();
  });

  it('считает миниатюры всех кадров, когда правки стихли', async () => {
    const anim = threeFrames();
    cache.sync(anim, 0);
    expect(cache.get(anim.frames[0].id)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    for (const frame of anim.frames) expect(cache.get(frame.id)).toBeDefined();
    expect(notified).toBeGreaterThan(0);
  });

  it('пока правки идут, не считает ничего', async () => {
    let anim = threeFrames();
    for (let i = 0; i < 5; i++) {
      anim = paint(anim, 0);
      cache.sync(anim, 0);
      await vi.advanceTimersByTimeAsync(SETTLE_MS / 2);
    }
    expect(cache.get(anim.frames[0].id)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(cache.get(anim.frames[0].id)).toBeDefined();
  });

  it('правка кадра пересчитывает только его миниатюру', async () => {
    const before = threeFrames();
    cache.sync(before, 0);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    const untouched = cache.get(before.frames[0].id);
    const old = cache.get(before.frames[1].id);

    const after = paint(before, 1);
    cache.sync(after, 1);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(cache.get(after.frames[0].id)).toBe(untouched);
    const fresh = cache.get(after.frames[1].id);
    expect(fresh).not.toBe(old);
    // Красный символ в углу виден и на миниатюре.
    expect(Array.from(fresh!.data.slice(0, 4))).toEqual([255, 0, 0, 255]);
  });

  it('смена фона холста пересчитывает все кадры', async () => {
    const before = threeFrames();
    cache.sync(before, 0);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    const old = before.frames.map((frame) => cache.get(frame.id));

    const after: Animation = { ...before, background: '#ffffff' };
    cache.sync(after, 0);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    after.frames.forEach((frame, i) => expect(cache.get(frame.id)).not.toBe(old[i]));
  });

  it('забывает удалённые кадры', async () => {
    const before = threeFrames();
    cache.sync(before, 0);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    const removedId = before.frames[2].id;
    cache.sync(removeFrame(before, 2), 0);
    expect(cache.get(removedId)).toBeUndefined();
  });
});
