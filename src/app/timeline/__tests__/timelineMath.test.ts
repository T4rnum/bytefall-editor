import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  MIN_SCALE,
  fitScale,
  formatSeconds,
  rulerStep,
  rulerTicks,
  snapTime,
  timelineSpan,
} from '../timelineMath';

describe('линейка таймлайна', () => {
  it('крупное деление не уже 64 пикселей и круглое', () => {
    expect(rulerStep(1)).toBe(100);
    expect(rulerStep(0.2)).toBe(500);
    expect(rulerStep(0.05)).toBe(2000);
    expect(rulerStep(MIN_SCALE / 10)).toBe(60000);
  });

  it('деления до конца видимого отрезка: крупные и по четыре мелких', () => {
    const ticks = rulerTicks(0.2, 1200);
    expect(ticks.major).toEqual([0, 500, 1000]);
    expect(ticks.minor.slice(0, 4)).toEqual([100, 200, 300, 400]);
    expect(ticks.minor).toHaveLength(10);
  });

  it('секунды подписываются без лишних нулей и с запятой', () => {
    expect(formatSeconds(0)).toBe('0');
    expect(formatSeconds(500)).toBe('0,5');
    expect(formatSeconds(1250)).toBe('1,25');
    expect(formatSeconds(2000)).toBe('2');
    expect(formatSeconds(333.333)).toBe('0,333');
  });
});

describe('видимое время и масштаб', () => {
  it('таймлайн показывает сцену, ключи и указатель с запасом, но не меньше секунды', () => {
    expect(timelineSpan(400, 0, 0)).toBe(1000);
    expect(timelineSpan(2000, 3000, 0)).toBe(3450);
    expect(timelineSpan(2000, 0, 4000)).toBe(4600);
  });

  it('вписанный масштаб держится в пределах', () => {
    expect(fitScale(1000, 2000)).toBe(0.5);
    expect(fitScale(10, 60000)).toBe(MIN_SCALE);
    expect(fitScale(5000, 100)).toBe(MAX_SCALE);
  });
});

describe('привязка', () => {
  const targets = { points: [100, 480], step: 50, tolerance: 12 };

  it('ближайшая точка в пределах допуска побеждает такт', () => {
    expect(snapTime(95, targets)).toBe(100);
    expect(snapTime(470, targets)).toBe(480);
  });

  it('без точек рядом момент встаёт на такт, если он рядом, иначе остаётся', () => {
    expect(snapTime(207, targets)).toBe(200);
    expect(snapTime(225, targets)).toBe(225);
    expect(snapTime(225.12345, { ...targets, tolerance: 0 })).toBe(225.123);
  });
});
