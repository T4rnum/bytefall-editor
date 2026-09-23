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
}

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
  },
  {
    label: 'Смещение',
    title: `Дробный сдвиг в пределах ±${MAX_SHIFT} ячеек для плавного движения. Положение остаётся целым`,
    axes: XY('dx', 'dy'),
    min: -MAX_SHIFT,
    max: MAX_SHIFT,
    step: 0.05,
    history: 'Shift object',
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

  const change = (row: Row, key: Key, value: number): void => {
    if (value === t[key]) return;
    const mergeKey = `transform:${object.id}:${key}:${gesture.current}`;
    if (key === 'px' || key === 'py') {
      // Опора переезжает, а объект стоит на месте: иначе повёрнутый объект прыгнул бы.
      const pivot = { x: t.px, y: t.py, [key === 'px' ? 'x' : 'y']: value };
      setObjectPivotAction(object.id, pivot, mergeKey);
    } else {
      transformObjectAction(object.id, { [key]: value }, row.history, mergeKey);
    }
  };

  return (
    <>
      {ROWS.map((row) => (
        <Field key={row.label} label={row.label} title={row.title}>
          {row.axes.map(({ key, label }) => (
            <NumberField
              key={key}
              label={label}
              value={t[key]}
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
      ))}
      <Button
        size="sm"
        disabled={isPlainTransform(t)}
        label="Снять поворот, масштаб и смещение. Положение и опора остаются"
        onClick={() => resetObjectLookAction(object.id)}
      >
        Сбросить трансформ
      </Button>
    </>
  );
}
