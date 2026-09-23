import { type Animation, createAnimation, createFrame } from '../../animation';
import { makeCell } from '../../cell';
import { createDocument } from '../../document';
import { keyOf } from '../../grid';
import { addObject, createObject } from '../../object';
import { setKey } from '../../tracks';

export const BALL = 'ball';

/**
 * Сцена 8×4: один слой и объект «ball» — символ `O` в ячейке (1, 1). С `frames` больше единицы
 * кадры по 100 мс, и в каждом свой символ мяча: так видно, какой кадр спрайт-трека показан.
 */
export function ballScene(frames = 1): { anim: Animation; layerId: string } {
  const base = createDocument({ width: 8, height: 4, background: null });
  const layerId = base.layers[0].id;
  const glyphs = ['O', 'o', '0', 'Q'];
  const docs = Array.from({ length: frames }, (_, i) =>
    addObject(
      base,
      createObject({
        id: BALL,
        name: 'Ball',
        layerId,
        x: 1,
        y: 1,
        cells: new Map([[keyOf(0, 0), makeCell(glyphs[i % glyphs.length], '#ffffff')]]),
      }),
    ),
  );
  const anim = createAnimation(docs[0]);
  return {
    anim: { ...anim, frames: docs.map((d) => createFrame(d.layers, d.objects, 100)) },
    layerId,
  };
}

/** Мяч катится из (1, 1) в (5, 1) за секунду. */
export function rollingBall(frames = 1): { anim: Animation; layerId: string } {
  const scene = ballScene(frames);
  const target = { node: 'object', id: BALL, property: 'position' } as const;
  let tracks = setKey([], target, 0, [1, 1]);
  tracks = setKey(tracks, target, 1000, [5, 1]);
  return { anim: { ...scene.anim, tracks }, layerId: scene.layerId };
}
