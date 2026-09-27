import { useRef } from 'react';
import type { Node3D } from '../../../core/scene3d/types';
import { KIND_3D_LABELS, NODE_3D_LABELS } from '../../scene3d/labels';
import { setBody3DAction } from '../../store/scene3dActions';
import { Checkbox, ColorField, Field, TextField } from '../../ui';
import { Target3DRow } from './Target3DRow';

/** Шаг поля по свойству: единицы сцены, градусы, доли размера. */
const STEP = { position: 0.1, rotation: 5, scale: 0.1 } as const;
const INITIAL = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } as const;

/**
 * Выбранное тело сцены: имя, видимость и цвет — во всех кадрах, трансформ — ключами. Положение
 * в единицах сцены, поворот в градусах вокруг X, Y, Z по порядку.
 */
export function Body3DFields({ layerId, body }: { layerId: string; body: Node3D }) {
  const gesture = useRef(0);
  return (
    <>
      <Field label="Имя">
        <TextField
          value={body.name}
          size="sm"
          ariaLabel="Имя тела"
          onCommit={(name) =>
            name.trim() && setBody3DAction(layerId, body.id, { name: name.trim() })
          }
        />
      </Field>
      <Field label={KIND_3D_LABELS[body.kind]}>
        <Checkbox
          checked={body.visible}
          onChange={(visible) => setBody3DAction(layerId, body.id, { visible })}
        >
          Видно
        </Checkbox>
        <ColorField
          label="Цвет тела"
          value={body.color}
          size="sm"
          onChange={(color) =>
            color &&
            setBody3DAction(layerId, body.id, { color }, `body-color:${body.id}:${gesture.current}`)
          }
          onCommit={(color) => {
            if (color)
              setBody3DAction(
                layerId,
                body.id,
                { color },
                `body-color:${body.id}:${gesture.current}`,
              );
            gesture.current += 1;
          }}
        />
      </Field>
      {(['position', 'rotation', 'scale'] as const).map((property) => (
        <Target3DRow
          key={property}
          target={{ node: 'body3d', id: body.id, property }}
          label={NODE_3D_LABELS[property]}
          value={body[property]}
          step={STEP[property]}
          suffix={property === 'rotation' ? '°' : undefined}
          initial={INITIAL[property]}
        />
      ))}
    </>
  );
}
