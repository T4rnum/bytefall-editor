import { useState } from 'react';
import { RELIEF_DEPTHS, type ReliefDepth } from '../../../core/scene3d/relief';
import { RELIEF_LABELS } from '../../scene3d/labels';
import { addReliefAction } from '../../store/modelActions';
import type { ImageImportSource } from '../../store/uiStore';
import { Button, Field, Select, type SelectOption } from '../../ui';

const DEPTH_OPTIONS: readonly SelectOption<ReliefDepth>[] = RELIEF_DEPTHS.map((depth) => ({
  value: depth,
  label: RELIEF_LABELS[depth],
}));

/**
 * Та же картинка 3D-рельефом, а не символами: в сцену активного 3D-слоя или в новый 3D-слой.
 * Высоту потом правит размер тела по Z, повернуть рельеф можно орбитой или ключами.
 */
export function ReliefSection({ source }: { readonly source: ImageImportSource }) {
  const [depth, setDepth] = useState<ReliefDepth>('brightness');
  return (
    <>
      <h3 className="dialog-section">Или 3D-рельефом</h3>
      <Field
        label="Высота"
        title="По яркости — светлое выше тёмного. Подушкой — фигура надувается от краёв силуэта"
      >
        <Select
          value={depth}
          options={DEPTH_OPTIONS}
          size="sm"
          ariaLabel="Откуда высота рельефа"
          onChange={setDepth}
        />
      </Field>
      <div className="dialog-actions">
        <Button
          label="Картинка станет моделью в 3D-сцене: её можно вращать и освещать"
          onClick={() => addReliefAction(source, depth)}
        >
          Рельефом в 3D
        </Button>
      </div>
    </>
  );
}
