import { describe, expect, it } from 'vitest';
import { type Cell, makeCell } from '../cell';
import { type CellBuffer, canRebuildTiles, composite } from '../compositor';
import {
  type Document,
  addLayer,
  createDocument,
  createLayer,
  setLayerCells,
  updateLayer,
} from '../document';
import { createEffect } from '../effects';
import { type CellKey, applyEdits, emptyGrid, keyOf } from '../grid';
import { groupSelection } from '../object';
import { tileLayout, tilesFromKeys } from '../tiles';

interface CompositeArgs {
  preview: Parameters<typeof composite>[1];
  ghosts: Parameters<typeof composite>[3];
}

/**
 * Частичная пересборка не имеет права отличаться от полной ни в одной ячейке. Это единственная
 * проверка, которая действительно защищает оптимизацию: всё остальное — детали реализации.
 */
function expectSameAsFull(
  doc: Document,
  dirty: Iterable<number>,
  previous: CellBuffer,
  options: Partial<CompositeArgs> = {},
): void {
  const full = composite(doc, options.preview ?? null, undefined, options.ghosts ?? [], 0);
  const partial = composite(doc, options.preview ?? null, previous, options.ghosts ?? [], 0, dirty);
  expect(partial.glyphs).toEqual(full.glyphs);
  expect([...partial.fg]).toEqual([...full.fg]);
  expect([...partial.bg]).toEqual([...full.bg]);
}

/** Документ 70×40: крайние тайлы обрезаны, а это самый частый источник ошибок в индексах. */
function sampleDoc(): { doc: Document; layerId: string; topId: string } {
  let doc = createDocument({ width: 70, height: 40, background: null });
  const layerId = doc.layers[0].id;
  const cells = new Map<CellKey, Cell | null>();
  // Разбрасываем ячейки по всем тайлам, включая обрезанные края.
  for (let y = 0; y < 40; y += 3) {
    for (let x = 0; x < 70; x += 5) {
      cells.set(keyOf(x, y), makeCell('#', '#ff0000', x % 10 === 0 ? '#001122' : null));
    }
  }
  doc = setLayerCells(doc, layerId, applyEdits(emptyGrid(), cells));
  doc = addLayer(doc, createLayer('Top'));
  const topId = doc.layers[1].id;
  doc = setLayerCells(
    doc,
    topId,
    applyEdits(emptyGrid(), new Map([[keyOf(35, 20), makeCell('@', '#00ff00')]])),
  );
  return { doc, layerId, topId };
}

const layout = tileLayout(70, 40);
const tilesOf = (...keys: CellKey[]) => tilesFromKeys(layout, keys);

describe('частичная пересборка кадра', () => {
  it('правка одной ячейки даёт тот же кадр, что и полная пересборка', () => {
    const { doc, layerId } = sampleDoc();
    const previous = composite(doc);
    const edited = setLayerCells(
      doc,
      layerId,
      applyEdits(doc.layers[0].cells, new Map([[keyOf(40, 21), makeCell('X', '#ffffff')]])),
    );
    expectSameAsFull(edited, tilesOf(keyOf(40, 21)), previous);
  });

  it('стирание ячейки тоже совпадает: тайл сначала очищается', () => {
    const { doc, layerId } = sampleDoc();
    const previous = composite(doc);
    const erased = setLayerCells(
      doc,
      layerId,
      applyEdits(doc.layers[0].cells, new Map([[keyOf(35, 21), null]])),
    );
    expectSameAsFull(erased, tilesOf(keyOf(35, 21)), previous);
  });

  it('правка в обрезанном крайнем тайле совпадает', () => {
    const { doc, layerId } = sampleDoc();
    const previous = composite(doc);
    const edited = setLayerCells(
      doc,
      layerId,
      applyEdits(doc.layers[0].cells, new Map([[keyOf(69, 39), makeCell('E', '#ffff00')]])),
    );
    expectSameAsFull(edited, tilesOf(keyOf(69, 39)), previous);
  });

  it('превью инструмента совпадает', () => {
    const { doc, layerId } = sampleDoc();
    const previous = composite(doc);
    const keys = [keyOf(10, 10), keyOf(11, 10), keyOf(12, 10)];
    const preview = {
      layerId,
      edits: new Map(keys.map((k) => [k, makeCell('p', '#ff00ff')] as const)),
    };
    expectSameAsFull(doc, tilesFromKeys(layout, keys), previous, { preview });
  });

  it('мазок через границу тайлов совпадает', () => {
    const { doc, layerId } = sampleDoc();
    const previous = composite(doc);
    const keys = [keyOf(30, 5), keyOf(31, 5), keyOf(32, 5), keyOf(33, 5)];
    const preview = {
      layerId,
      edits: new Map(keys.map((k) => [k, makeCell('/', '#00ffff')] as const)),
    };
    expectSameAsFull(doc, tilesFromKeys(layout, keys), previous, { preview });
  });

  it('объект поверх растра совпадает', () => {
    const { doc, layerId } = sampleDoc();
    const grouped = groupSelection(doc, layerId, { x: 5, y: 5, w: 10, h: 6 }, 'Obj');
    if (!grouped) throw new Error('groupSelection вернул null');
    const previous = composite(grouped.doc);
    const moved = {
      ...grouped.doc,
      objects: grouped.doc.objects.map((o) => ({ ...o, x: o.x + 1 })),
    };
    // Объект задевает и старое, и новое место.
    const tiles = tilesFromKeys(layout, [keyOf(5, 5), keyOf(16, 11)]);
    expectSameAsFull(moved, tiles, previous);
  });

  it('призраки соседних кадров совпадают', () => {
    const { doc, layerId } = sampleDoc();
    const ghostDoc = setLayerCells(
      doc,
      layerId,
      applyEdits(emptyGrid(), new Map([[keyOf(20, 20), makeCell('g', '#0000ff')]])),
    );
    const ghosts = [{ doc: ghostDoc, opacity: 0.3 }];
    const previous = composite(doc, null, undefined, ghosts, 0);
    const preview = { layerId, edits: new Map([[keyOf(21, 20), makeCell('n', '#ffffff')]]) };
    expectSameAsFull(doc, tilesOf(keyOf(21, 20)), previous, { preview, ghosts });
  });

  it('скрытый слой не оставляет следов', () => {
    const { doc, topId } = sampleDoc();
    const previous = composite(doc);
    const hidden = updateLayer(doc, topId, { visible: false });
    expectSameAsFull(hidden, tilesOf(keyOf(35, 20)), previous);
  });
});

describe('когда частичная пересборка запрещена', () => {
  it('слой с активным эффектом пересобирается целиком', () => {
    const { doc, layerId } = sampleDoc();
    const withFire = updateLayer(doc, layerId, { effects: [createEffect('fire', 'fx')] });
    expect(canRebuildTiles(withFire)).toBe(false);

    // Даже с узким списком тайлов результат обязан совпасть с полным.
    const previous = composite(withFire, null, undefined, [], 0);
    const partial = composite(withFire, null, previous, [], 500, tilesOf(keyOf(0, 0)));
    const full = composite(withFire, null, undefined, [], 500);
    expect(partial.glyphs).toEqual(full.glyphs);
  });

  it('выключенный эффект частичную пересборку не запрещает', () => {
    const { doc, layerId } = sampleDoc();
    const off = updateLayer(doc, layerId, {
      effects: [{ ...createEffect('fire', 'fx'), enabled: false }],
    });
    expect(canRebuildTiles(off)).toBe(true);
  });

  it('эффект в призраке тоже запрещает', () => {
    const { doc, layerId } = sampleDoc();
    const ghostDoc = updateLayer(doc, layerId, { effects: [createEffect('wave', 'fx')] });
    expect(canRebuildTiles(doc, [{ doc: ghostDoc, opacity: 0.3 }])).toBe(false);
  });

  it('чужой буфер не переиспользуется: размер не совпал — пересобираем всё', () => {
    const { doc } = sampleDoc();
    const wrongSize = composite(createDocument({ width: 10, height: 10 }));
    const partial = composite(doc, null, wrongSize, [], 0, tilesOf(keyOf(0, 0)));
    expect(partial.glyphs).toEqual(composite(doc).glyphs);
  });
});
