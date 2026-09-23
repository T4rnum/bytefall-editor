import { describe, expect, it } from 'vitest';
import { createAnimation } from '../../../core/animation';
import { createDocument, updateLayer } from '../../../core/document';
import { createEffect } from '../../../core/effects';
import { addObject, createObject } from '../../../core/object';
import { setKey } from '../../../core/tracks';
import { timelineRows } from '../timelineRows';

function scene() {
  let doc = createDocument({ width: 8, height: 4 });
  const layerId = doc.layers[0].id;
  doc = updateLayer(doc, layerId, { effects: [createEffect('fire', 'fx-fire')] });
  doc = addObject(doc, createObject({ id: 'a', name: 'Мяч', layerId, x: 0, y: 0 }));
  doc = addObject(doc, createObject({ id: 'b', name: 'Флаг', layerId, x: 2, y: 0 }));
  let tracks = setKey([], { node: 'object', id: 'b', property: 'rotation' }, 0, [0]);
  tracks = setKey(tracks, { node: 'effect', id: 'fx-fire', property: 'height' }, 0, [3]);
  tracks = setKey(tracks, { node: 'layer', id: layerId, property: 'opacity' }, 0, [1]);
  tracks = setKey(tracks, { node: 'object', id: 'b', property: 'position' }, 0, [2, 0]);
  return { anim: { ...createAnimation(doc), tracks }, doc };
}

const labels = (rows: ReturnType<typeof timelineRows>) =>
  rows.map((r) => (r.kind === 'node' ? `# ${r.label}` : `${r.label}${r.track ? ' ◆' : ''}`));

describe('строки таймлайна', () => {
  it('без выбора — только анимированные узлы с их свойствами', () => {
    const { anim, doc } = scene();
    expect(labels(timelineRows(anim, doc, null))).toEqual([
      '# Флаг',
      'Поворот ◆',
      'Положение ◆',
      '# Огонь · Слой 1',
      'Высота ◆',
      '# Слой 1',
      'Непрозрачность слоя ◆',
    ]);
  });

  it('выбранный объект первым и со всеми свойствами, даже неанимированными', () => {
    const { anim, doc } = scene();
    const rows = labels(timelineRows(anim, doc, 'a'));
    expect(rows.slice(0, 6)).toEqual([
      '# Мяч',
      'Положение',
      'Поворот',
      'Масштаб',
      'Непрозрачность',
      'Оттенок',
    ]);
    const flag = labels(timelineRows(anim, doc, 'b'));
    // Анимированный выбранный объект не повторяется ниже.
    expect(flag.filter((l) => l === '# Флаг')).toHaveLength(1);
    expect(flag.slice(0, 3)).toEqual(['# Флаг', 'Положение ◆', 'Поворот ◆']);
  });

  it('выбранный объект, которого нет в кадре, строк не даёт', () => {
    const { anim, doc } = scene();
    expect(labels(timelineRows(anim, doc, 'ghost'))[0]).toBe('# Флаг');
  });
});
