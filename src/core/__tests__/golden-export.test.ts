import { describe, expect, it } from 'vitest';
import { frameDocument } from '../animation';
import { makeCell } from '../cell';
import { type Ghost, composite } from '../compositor';
import { addLayer, createDocument, createLayer, setLayerCells, updateLayer } from '../document';
import { createEffect } from '../effects';
import { applyEdits, emptyGrid, keyOf } from '../grid';
import { groupSelection } from '../grouping';
import { selectionFromRect } from '../selection';
import { deserialize } from '../serialization';
import { bufferToText } from '../text';
import v1 from './fixtures/v1-single-frame.bp.json?raw';
import v2 from './fixtures/v2-objects.bp.json?raw';
import { dumpFrame } from './helpers/dumpFrame';

/**
 * Золотые тесты фиксируют наблюдаемый результат композитора и текстового экспорта. Любое
 * изменение правил смешивания обязано быть видно в диффе снимка, а не проехать молча.
 *
 * Пиксельные снимки PNG сюда не входят: путь до картинки идёт через WebGL, которого в node нет.
 * Здесь закреплена детерминированная часть — то, что попадает в рендерер и в текстовый экспорт.
 */

/** Пути снимков разрешаются относительно этого файла. */
const snapshot = (name: string): string => `./golden/${name}.txt`;

describe('текстовый экспорт', () => {
  it('переводит кадр в текст, срезая хвостовые пробелы', () => {
    const doc = frameDocument(deserialize(v1), 0);
    // Ячейка (5,2) содержит только фон, поэтому последняя строка остаётся пустой.
    expect(bufferToText(composite(doc))).toBe('BP\n  1\n');
  });

  it('пустой документ даёт пустые строки, а не мусор', () => {
    const doc = createDocument({ width: 3, height: 2 });
    expect(bufferToText(composite(doc))).toBe('\n');
  });

  it('объект впечатывается в текст на своём месте', () => {
    expect(bufferToText(composite(frameDocument(deserialize(v2), 0)))).toBe('B2\n  **\n    t');
  });
});

describe('золотые снимки композитора', () => {
  it('стопка слоёв с непрозрачностью и фоном', async () => {
    let doc = createDocument({ width: 4, height: 2, background: null });
    const baseId = doc.layers[0].id;
    doc = setLayerCells(
      doc,
      baseId,
      applyEdits(
        emptyGrid(),
        new Map([
          [keyOf(0, 0), makeCell('A', '#ff0000', '#101010')],
          [keyOf(1, 0), makeCell('B', '#00ff00')],
          [keyOf(2, 0), makeCell('', '#ffffff', '#0000ff')],
        ]),
      ),
    );
    doc = addLayer(doc, createLayer('Top'));
    const topId = doc.layers[1].id;
    doc = setLayerCells(
      doc,
      topId,
      applyEdits(
        emptyGrid(),
        new Map([
          // Полупрозрачный фон без глифа просвечивает символ снизу, а не стирает его.
          [keyOf(1, 0), makeCell('', '#ffffff', '#ffffff80')],
          // Непрозрачный фон без глифа закрашивает символ снизу.
          [keyOf(0, 0), makeCell('', '#ffffff', '#00ffff')],
          [keyOf(3, 1), makeCell('C', '#ffff00')],
        ]),
      ),
    );
    doc = updateLayer(doc, topId, { opacity: 0.5 });
    await expect(dumpFrame(composite(doc))).toMatchFileSnapshot(snapshot('layer-stack'));
  });

  it('объект поверх растра своего слоя', async () => {
    let doc = createDocument({ width: 5, height: 2, background: '#000000' });
    const layerId = doc.layers[0].id;
    doc = setLayerCells(
      doc,
      layerId,
      applyEdits(
        emptyGrid(),
        new Map([
          [keyOf(0, 0), makeCell('r', '#888888', '#222222')],
          [keyOf(1, 0), makeCell('r', '#888888')],
          [keyOf(2, 0), makeCell('r', '#888888')],
        ]),
      ),
    );
    const grouped = groupSelection(
      doc,
      layerId,
      selectionFromRect({ x: 1, y: 0, w: 2, h: 1 }, doc.width, doc.height)!,
      'Grouped',
    );
    if (!grouped) throw new Error('groupSelection вернул null, фикстура теста сломана');
    await expect(dumpFrame(composite(grouped.doc))).toMatchFileSnapshot(
      snapshot('object-over-raster'),
    );
  });

  it('onion skin: соседний кадр просвечивает там, где текущий пуст', async () => {
    const base = createDocument({ width: 4, height: 1, background: null });
    const id = base.layers[0].id;
    const current = setLayerCells(
      base,
      id,
      applyEdits(emptyGrid(), new Map([[keyOf(0, 0), makeCell('N', '#ffffff')]])),
    );
    const ghostDoc = setLayerCells(
      base,
      id,
      applyEdits(
        emptyGrid(),
        new Map([
          [keyOf(0, 0), makeCell('G', '#ff0000')],
          [keyOf(2, 0), makeCell('G', '#ff0000')],
        ]),
      ),
    );
    const ghosts: Ghost[] = [{ doc: ghostDoc, opacity: 0.3 }];
    await expect(dumpFrame(composite(current, null, undefined, ghosts))).toMatchFileSnapshot(
      snapshot('onion-skin'),
    );
  });
});

describe('детерминизм эффектов', () => {
  const fireDoc = () => {
    let doc = createDocument({ width: 6, height: 4, background: '#000000' });
    const id = doc.layers[0].id;
    doc = setLayerCells(
      doc,
      id,
      applyEdits(
        emptyGrid(),
        new Map([
          [keyOf(1, 3), makeCell('#', '#ffa300')],
          [keyOf(2, 3), makeCell('#', '#ffa300')],
          [keyOf(3, 3), makeCell('#', '#ffa300')],
        ]),
      ),
    );
    return updateLayer(doc, id, {
      effects: [createEffect('fire', 'effect-fire')],
    });
  };

  it('огонь на фиксированном времени даёт один и тот же кадр', async () => {
    const doc = fireDoc();
    const first = dumpFrame(composite(doc, null, undefined, [], 500));
    const second = dumpFrame(composite(doc, null, undefined, [], 500));
    // Эффект без состояния: предпросмотр и экспорт обязаны совпасть на одном времени.
    expect(second).toBe(first);
    await expect(first).toMatchFileSnapshot(snapshot('fire-t500'));
  });

  it('разное время даёт разные кадры', () => {
    const doc = fireDoc();
    const a = dumpFrame(composite(doc, null, undefined, [], 0));
    const b = dumpFrame(composite(doc, null, undefined, [], 500));
    expect(a).not.toBe(b);
  });

  it('переиспользование буфера не тянет данные из предыдущего кадра', () => {
    const doc = fireDoc();
    const target = composite(doc, null, undefined, [], 500);
    const reused = dumpFrame(composite(doc, null, target, [], 500));
    expect(reused).toBe(dumpFrame(composite(doc, null, undefined, [], 500)));
  });
});
