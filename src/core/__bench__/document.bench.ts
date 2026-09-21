import { describe, it } from 'vitest';
import { createAnimation } from '../animation';
import { applyEdits } from '../grid';
import { deserialize, serialize } from '../serialization';
import { BENCH_SIZES, benchDocument, benchStroke } from './fixtures';

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

for (const size of BENCH_SIZES) {
  const anim = createAnimation(benchDocument(size));
  const text = serialize(anim);

  describe(`файл ${size.label}, ${Math.round(text.length / 1024)} КБ`, () => {
    it('serialize и deserialize', async ({ bench }) => {
      await bench.compare(
        bench('serialize', () => {
          serialize(anim);
        }),
        bench('deserialize', () => {
          deserialize(text);
        }),
      );
    });
  });
}
