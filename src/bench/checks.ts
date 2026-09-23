import { makeCell } from '../core/cell';
import { createDocument, setLayerCells } from '../core/document';
import { composeFrame } from '../core/frame';
import { applyEdits, emptyGrid, keyOf } from '../core/grid';
import { addObject, createObject, transformObject } from '../core/object';
import { tileLayout, tilesFromKeys } from '../core/tiles';
import type { SceneView } from '../render/SceneView';

export interface CheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

/**
 * Проверки того, что действительно попало на экран. Не снимки пикселей: их хеш зависит от
 * драйвера и видеокарты, и на другой машине такой тест падал бы без причины. Вместо этого
 * проверяется смысл: нужная ячейка нужного цвета в нужном месте.
 */

/** Цвет пикселя в середине ячейки. Пиксели приходят построчно сверху вниз. */
function cellColor(
  pixels: { width: number; height: number; data: Uint8Array },
  scale: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const px = Math.floor((x + 0.5) * scale);
  const py = Math.floor((y + 0.5) * scale);
  const i = (py * pixels.width + px) * 4;
  return [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2], pixels.data[i + 3]];
}

const bright = (c: readonly number[]): boolean => c[0] + c[1] + c[2] > 120;

export function runChecks(view: SceneView): CheckResult[] {
  const results: CheckResult[] = [];
  const scale = 8;

  const add = (name: string, passed: boolean, detail: string): void => {
    results.push({ name, passed, detail });
  };

  // Документ шире одного тайла: ячейки по углам попадают в разные тайлы.
  let doc = createDocument({ width: 70, height: 40, background: '#000000' });
  const layerId = doc.layers[0].id;
  doc = setLayerCells(
    doc,
    layerId,
    applyEdits(
      emptyGrid(),
      new Map([
        [keyOf(0, 0), makeCell('#', '#ff0000')],
        [keyOf(69, 0), makeCell('#', '#00ff00')],
        [keyOf(0, 39), makeCell('#', '#0000ff')],
        [keyOf(69, 39), makeCell('#', '#ffffff')],
        [keyOf(35, 20), makeCell('', '#ffffff', '#ffff00')],
      ]),
    ),
  );

  const pixels = view.renderPixels(composeFrame(doc), scale);
  const corners: [string, number, number, (c: number[]) => boolean][] = [
    ['левый верхний красный', 0, 0, (c) => c[0] > 120 && c[1] < 90],
    ['правый верхний зелёный', 69, 0, (c) => c[1] > 120 && c[0] < 90],
    ['левый нижний синий', 0, 39, (c) => c[2] > 120 && c[0] < 90],
    ['правый нижний белый', 69, 39, (c) => bright(c) && c[0] > 120 && c[1] > 120 && c[2] > 120],
  ];
  for (const [name, x, y, ok] of corners) {
    const c = cellColor(pixels, scale, x, y);
    add(`Углы: ${name}`, ok([...c]), `rgb ${c[0]},${c[1]},${c[2]}`);
  }

  // Ячейка только с фоном закрашивает клетку целиком.
  const mid = cellColor(pixels, scale, 35, 20);
  add(
    'Фон ячейки без символа',
    mid[0] > 150 && mid[1] > 150 && mid[2] < 90,
    `rgb ${mid[0]},${mid[1]},${mid[2]}`,
  );

  // Пустая клетка остаётся цветом холста.
  const empty = cellColor(pixels, scale, 10, 10);
  add('Пустая клетка не закрашена', !bright([...empty]), `rgb ${empty[0]},${empty[1]},${empty[2]}`);

  // Ось Y смотрит вниз: верхняя ячейка выше нижней на экране.
  add(
    'Ось Y направлена вниз',
    bright([...cellColor(pixels, scale, 0, 0)]) && bright([...cellColor(pixels, scale, 0, 39)]),
    'обе крайние ячейки столбца видны',
  );

  // Частичная пересборка не портит остальной холст.
  const layout = tileLayout(70, 40);
  const previous = composeFrame(doc);
  const edited = setLayerCells(
    doc,
    layerId,
    applyEdits(doc.layers[0].cells, new Map([[keyOf(40, 21), makeCell('#', '#ff00ff')]])),
  );
  const tiles = [...tilesFromKeys(layout, [keyOf(40, 21)])];
  const partial = view.renderPixels(composeFrame(edited, null, previous, [], 0, tiles), scale);
  const added = cellColor(partial, scale, 40, 21);
  const untouched = cellColor(partial, scale, 0, 0);
  add(
    'Частичная пересборка: новая ячейка на месте',
    added[0] > 120 && added[2] > 120,
    `rgb ${added[0]},${added[1]},${added[2]}`,
  );
  add(
    'Частичная пересборка: соседний тайл цел',
    untouched[0] > 120 && untouched[1] < 90,
    `rgb ${untouched[0]},${untouched[1]},${untouched[2]}`,
  );

  // Шахматка — служебная графика: на экране она под прозрачным холстом, а в экспорт
  // прозрачный холст обязан уйти прозрачным. Иначе PNG для движка получил бы серые клетки.
  const transparent = { ...doc, background: null };
  view.setDocument(transparent.width, transparent.height, transparent.background);
  view.setShowChecker(true);
  const exported = view.renderPixels(composeFrame(transparent), scale);
  const hole = cellColor(exported, scale, 10, 10);
  add('Экспорт прозрачного холста без шахматки', hole[3] === 0, `alpha ${hole[3]}`);
  const drawn = cellColor(exported, scale, 0, 0);
  add(
    'Экспорт прозрачного холста: символ на месте',
    drawn[3] > 0 && drawn[0] > 120,
    `rgba ${drawn[0]},${drawn[1]},${drawn[2]},${drawn[3]}`,
  );

  checkTurnedObject(view, scale, add);
  return results;
}

/**
 * Свободный объект рисует отдельный проход символов. Полоска 3×1 из голубого фона после
 * поворота на 90° вокруг своего центра обязана встать столбцом на месте средней ячейки.
 */
function checkTurnedObject(
  view: SceneView,
  scale: number,
  add: (name: string, passed: boolean, detail: string) => void,
): void {
  let doc = createDocument({ width: 70, height: 40, background: '#000000' });
  const cyan = makeCell('', '#ffffff', '#00ffff');
  const cells = applyEdits(
    emptyGrid(),
    new Map([
      [keyOf(0, 0), cyan],
      [keyOf(1, 0), cyan],
      [keyOf(2, 0), cyan],
    ]),
  );
  const bar = createObject({ name: 'bar', layerId: doc.layers[0].id, x: 10, y: 10, cells });
  doc = transformObject(addObject(doc, bar), bar.id, { rot: 90 });
  view.setDocument(doc.width, doc.height, doc.background);
  const pixels = view.renderPixels(composeFrame(doc), scale);
  const isCyan = (c: readonly number[]): boolean => c[0] < 90 && c[1] > 150 && c[2] > 150;
  const top = cellColor(pixels, scale, 11, 9);
  const bottom = cellColor(pixels, scale, 11, 11);
  add(
    'Повёрнутый объект: полоска встала столбцом',
    isCyan(top) && isCyan(bottom),
    `сверху rgb ${top[0]},${top[1]},${top[2]}, снизу rgb ${bottom[0]},${bottom[1]},${bottom[2]}`,
  );
  const left = cellColor(pixels, scale, 10, 10);
  add(
    'Повёрнутый объект: на прежнем месте пусто',
    !isCyan(left),
    `rgb ${left[0]},${left[1]},${left[2]}`,
  );
}
