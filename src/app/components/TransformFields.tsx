import { useRef } from 'react';
import { MAX_DIMENSION } from '../../core/document';
import type { SceneObject } from '../../core/object';
import type { ObjectProperty } from '../../core/tracks';
import {
  MAX_PIVOT,
  MAX_ROTATION,
  MAX_SCALE,
  MAX_SHIFT,
  MIN_SCALE,
  type Transform2D,
  centerPivot,
  isPlainTransform,
} from '../../core/transform';
import {
  resetObjectLookAction,
  setObjectPivotAction,
  transformObjectAction,
} from '../store/transformActions';
import { toggleKeyAction } from '../store/keyActions';
import { useKeyState } from '../hooks/useKeyState';
import { Button, Field, KeyButton, NumberField } from '../ui';

type Key = keyof Transform2D;

interface Axis {
  readonly key: Key;
  readonly label?: string;
}

interface Row {
  readonly label: string;
  readonly title: string;
  readonly axes: readonly Axis[];
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly suffix?: string;
  /** Метка записи истории. */
  readonly history: string;
  /** Анимируемое свойство за строкой и как его назвать в подсказке ромба. */
  readonly keyed?: { readonly property: ObjectProperty; readonly subject: string };
  /** Значения по умолчанию для кнопки сброса; у положения их нет. */
  readonly initial?: (object: SceneObject) => Partial<Transform2D>;
  /**
   * Чья строка: объекта с символами или узла рига. У символов положение — целая ячейка плюс
   * сдвиг. У кости это сустав, дробный и одним числом, а опору, стоящую в суставе, двигать нельзя.
   */
  readonly only?: 'glyphs' | 'rig';
  /** Положение одним дробным числом: ячейка и сдвиг вместе. */
  readonly fractional?: boolean;
}

/** Сдвиг, который вместе с ячейкой даёт дробное положение. */
const SHIFT_OF: Partial<Record<Key, Key>> = { x: 'dx', y: 'dy' };

const XY = (x: Key, y: Key): readonly Axis[] => [
  { key: x, label: 'X' },
  { key: y, label: 'Y' },
];

const ROWS: readonly Row[] = [
  {
    label: 'Положение',
    title: 'Домашняя ячейка объекта. Всегда целая: символ живёт в своей ячейке',
    axes: XY('x', 'y'),
    min: -MAX_DIMENSION,
    max: MAX_DIMENSION,
    step: 1,
    history: 'Move object',
    keyed: { property: 'position', subject: 'положение' },
    only: 'glyphs',
  },
  {
    label: 'Положение',
    title: 'Сустав кости или точка контроллера в координатах родителя',
    axes: XY('x', 'y'),
    min: -MAX_DIMENSION,
    max: MAX_DIMENSION,
    step: 0.25,
    history: 'Move object',
    keyed: { property: 'position', subject: 'положение' },
    only: 'rig',
    fractional: true,
  },
  {
    label: 'Поворот',
    title: 'Градусы по часовой стрелке вокруг опоры. [ и ] — на 15°, с Shift — на 90°',
    axes: [{ key: 'rot' }],
    min: -MAX_ROTATION,
    max: MAX_ROTATION,
    step: 1,
    suffix: '°',
    history: 'Rotate object',
    keyed: { property: 'rotation', subject: 'поворот' },
    initial: () => ({ rot: 0 }),
  },
  {
    label: 'Масштаб',
    title: 'Во сколько раз объект больше, вдоль его собственных осей',
    axes: XY('sx', 'sy'),
    min: MIN_SCALE,
    max: MAX_SCALE,
    step: 0.05,
    history: 'Scale object',
    keyed: { property: 'scale', subject: 'масштаб' },
    initial: () => ({ sx: 1, sy: 1 }),
  },
  {
    label: 'Смещение',
    title: `Дробный сдвиг в пределах ±${MAX_SHIFT} ячеек для плавного движения. Положение остаётся целым`,
    axes: XY('dx', 'dy'),
    min: -MAX_SHIFT,
    max: MAX_SHIFT,
    step: 0.05,
    history: 'Shift object',
    initial: () => ({ dx: 0, dy: 0 }),
    only: 'glyphs',
  },
  {
    label: 'Опора',
    title:
      'Точка, вокруг которой идут поворот и масштаб, в ячейках объекта. Alt+щелчок ставит её мышью',
    axes: XY('px', 'py'),
    min: -MAX_PIVOT,
    max: MAX_PIVOT,
    step: 0.5,
    history: 'Move pivot',
    only: 'glyphs',
    initial: (object) => {
      const center = centerPivot(object.cells);
      return { px: center.x, py: center.y };
    },
  },
];

/** Ромб ключа у строки трансформа; у строк без анимации — пустое место того же размера. */
function RowKey({ object, row }: { readonly object: SceneObject; readonly row: Row }) {
  const target = row.keyed
    ? { node: 'object' as const, id: object.id, property: row.keyed.property }
    : null;
  const state = useKeyState(target);
  if (!target || !row.keyed) return <span className="key-spacer" aria-hidden="true" />;
  return (
    <KeyButton state={state} subject={row.keyed.subject} onClick={() => toggleKeyAction(target)} />
  );
}

/**
 * Трансформ выбранного объекта. Поле пишет в документ на каждое движение, чтобы холст менялся
 * живьём, а записи одного жеста склеиваются общим ключом: жест отменяется целиком. У
 * анимированного свойства правка становится ключом в текущий момент, см. `applyEdit`.
 */
export function TransformFields({ object }: { readonly object: SceneObject }) {
  const gesture = useRef(0);
  const t = object.transform;

  const shift = (row: Row, key: Key): Key | undefined =>
    row.fractional ? SHIFT_OF[key] : undefined;
  const valueOf = (row: Row, key: Key): number => {
    const part = shift(row, key);
    return part ? t[key] + t[part] : t[key];
  };

  const change = (row: Row, key: Key, value: number): void => {
    if (value === valueOf(row, key)) return;
    const mergeKey = `transform:${object.id}:${key}:${gesture.current}`;
    const part = shift(row, key);
    if (part) {
      // Целая часть — в ячейку, остаток — в сдвиг: так положение и хранится.
      const whole = Math.round(value);
      transformObjectAction(
        object.id,
        { [key]: whole, [part]: value - whole },
        row.history,
        mergeKey,
      );
    } else if (key === 'px' || key === 'py') {
      // Опора переезжает, а объект стоит на месте: иначе повёрнутый объект прыгнул бы.
      const pivot = { x: t.px, y: t.py, [key === 'px' ? 'x' : 'y']: value };
      setObjectPivotAction(object.id, pivot, mergeKey);
    } else {
      transformObjectAction(object.id, { [key]: value }, row.history, mergeKey);
    }
  };

  /** Сброс строки целиком, одной записью истории; опора переезжает, не сдвигая объект. */
  const resetOf = (row: Row): (() => void) | undefined => {
    const initial = row.initial?.(object);
    if (!initial || row.axes.every(({ key }) => initial[key] === t[key])) return undefined;
    return () => {
      if (initial.px !== undefined && initial.py !== undefined) {
        setObjectPivotAction(object.id, { x: initial.px, y: initial.py });
      } else {
        transformObjectAction(object.id, initial, row.history);
      }
    };
  };

  return (
    <>
      {ROWS.filter((row) => !row.only || row.only === (object.rig ? 'rig' : 'glyphs')).map(
        (row) => (
          <Field key={row.label} label={row.label} title={row.title} onReset={resetOf(row)}>
            {row.axes.map(({ key, label }) => (
              <NumberField
                key={key}
                label={label}
                value={valueOf(row, key)}
                min={row.min}
                max={row.max}
                step={row.step}
                suffix={row.suffix}
                onChange={(value) => change(row, key, value)}
                onCommit={(value) => {
                  change(row, key, value);
                  // Отпускание завершает серию: следующий жест станет отдельной отменой.
                  gesture.current += 1;
                }}
                width={row.axes.length === 1 ? 'var(--field-w)' : 'var(--field-w-sm)'}
              />
            ))}
            <RowKey object={object} row={row} />
          </Field>
        ),
      )}
      {/* У кости сдвиг — часть положения сустава: сброс сдвига утащил бы кость с места. */}
      {!object.rig && (
        <Button
          size="sm"
          disabled={isPlainTransform(t)}
          label="Снять поворот, масштаб и смещение. Положение и опора остаются"
          onClick={() => resetObjectLookAction(object.id)}
        >
          Сбросить трансформ
        </Button>
      )}
    </>
  );
}
