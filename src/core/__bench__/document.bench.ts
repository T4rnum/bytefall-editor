import { describe, it } from 'vitest';
import { createAnimation, createFrame } from '../animation';
import { applyEdits } from '../grid';
import { deserialize, serialize, toFileObject } from '../serialization';
import { BENCH_SIZES, benchDocument, benchGrid, benchStroke } from './fixtures';

/**
 * Стоимость правок и файловых операций.
 *
 * applyEdits копирует всю сетку слоя, поэтому один мазок стоит как весь слой. Это второй кандидат
 * на оптимизацию после рендера: пока сетка это Map, дешевле не станет.
 *
 * serialize и deserialize идут в главном потоке и блокируют интерфейс. Числа отсюда решают,
 * когда именно их пора уносить в воркер.
 */
for (const size of BENCH_SIZES) {
  const doc = benchDocument(size);
  const cells = doc.layers[0].cells;
  const one = benchStroke(size, 1);
  const short = benchStroke(size, 64);
  const long = benchStroke(size, size.width);

  describe(`правки ${size.label}`, () => {
    it('applyEdits', async ({ bench }) => {
      await bench.compare(
        bench('одна ячейка', () => {
          applyEdits(cells, one);
        }),
        bench('мазок в 64 ячейки', () => {
          applyEdits(cells, short);
        }),
        bench('мазок во всю ширину', () => {
          applyEdits(cells, long);
        }),
      );
    });
  });
}

/**
 * Склеенные подстановкой куски V8 хранит «верёвкой» и склеивает при первом чтении символа —
 * в настоящей записи это случится при сохранении. Замер без этого мерил бы только ссылки.
 */
const flat = (text: string): number => text.charCodeAt(text.length - 1);

for (const size of BENCH_SIZES) {
  const anim = createAnimation(benchDocument(size));
  const text = serialize(anim);

  describe(`файл ${size.label}, ${Math.round(text.length / 1024)} КБ`, () => {
    it('serialize и deserialize', async ({ bench }) => {
      await bench.compare(
        bench('serialize, без кэша', () => {
          flat(JSON.stringify(toFileObject(anim)));
        }),
        bench('serialize, сетки из кэша', () => {
          flat(serialize(anim));
        }),
        bench('deserialize', () => {
          deserialize(text);
        }),
      );
    });
  });
}

/**
 * Автосохранение пишет весь документ после каждой паузы в правках, а правка обычно трогает один
 * слой одного кадра. Анимация из восьми кадров по три слоя, мазок в первом кадре: сериализация
 * с кэшем JSON нетронутых сеток против прямого `JSON.stringify` того же объекта файла.
 */
for (const size of BENCH_SIZES) {
  const base = createAnimation(benchDocument(size));
  const frame = base.frames[0];
  const anim = {
    ...base,
    frames: Array.from({ length: 8 }, (_, i) =>
      createFrame(
        frame.layers.map((l, k) => ({ ...l, cells: benchGrid(size, i * 3 + k + 1) })),
        [],
        100,
        `frame-${i}`,
      ),
    ),
  };
  const stroke = benchStroke(size, 64);
  const edited = () => {
    const [first, ...rest] = anim.frames;
    const layers = first.layers.slice();
    layers[0] = { ...layers[0], cells: applyEdits(layers[0].cells, stroke) };
    return { ...anim, frames: [{ ...first, layers }, ...rest] };
  };
  serialize(anim);

  describe(`автосохранение ${size.label}, 8 кадров, мазок в одном`, () => {
    // Без кэша 512×288 — секунда на вызов: 64 замера не укладываются в минуту по умолчанию.
    it('serialize после правки', { timeout: 240_000 }, async ({ bench }) => {
      await bench.compare(
        bench('с кэшем сеток', () => {
          flat(serialize(edited()));
        }),
        bench('без кэша', () => {
          flat(JSON.stringify(toFileObject(edited())));
        }),
      );
    });
  });
}
