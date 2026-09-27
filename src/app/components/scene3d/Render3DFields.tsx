import { useRef } from 'react';
import {
  DEFAULT_RENDER_3D,
  MAX_SPACING_3D,
  MIN_SPACING_3D,
  RENDER_3D_MODES,
  type Render3DMode,
  type Scene3D,
} from '../../../core/scene3d/types';
import { RENDER_3D_LABELS, SCENE_3D_LABELS } from '../../scene3d/labels';
import { setRender3DAction } from '../../store/scene3dActions';
import { Checkbox, Field, NumberField, Select, type SelectOption, resetTo } from '../../ui';
import { Target3DRow } from './Target3DRow';

const MODES: readonly SelectOption<Render3DMode>[] = RENDER_3D_MODES.map((mode) => ({
  value: mode,
  label: RENDER_3D_LABELS[mode],
}));

/**
 * Как сцена становится символами: растр рендера (режим A) или символы на поверхности тел со
 * светом на каждый (режим B) — по сетке экрана или облаком. Туман — во всех режимах, ключами.
 */
export function Render3DFields({ layerId, scene }: { layerId: string; scene: Scene3D }) {
  const gesture = useRef(0);
  const { render, camera } = scene;
  const setSpacing = (spacing: number): void =>
    setRender3DAction(layerId, { spacing }, `spacing:${gesture.current}`);
  return (
    <>
      <Field
        label="Режим"
        title="Растр — рендер сцены через квантайзер. По сетке и облако — символы на поверхности тел"
      >
        <Select
          value={render.mode}
          options={MODES}
          size="sm"
          ariaLabel="Как сцена становится символами"
          onChange={(mode) => setRender3DAction(layerId, { mode })}
        />
        <span className="key-spacer" aria-hidden="true" />
      </Field>
      {render.mode === 'cloud' && (
        <>
          <Field
            label="Шаг символов"
            title="Расстояние между символами облака в ячейках"
            onReset={resetTo(render.spacing, DEFAULT_RENDER_3D.spacing, (spacing) =>
              setRender3DAction(layerId, { spacing }),
            )}
          >
            <NumberField
              value={render.spacing}
              min={MIN_SPACING_3D}
              max={MAX_SPACING_3D}
              step={0.1}
              onChange={setSpacing}
              onCommit={(spacing) => {
                setSpacing(spacing);
                gesture.current += 1;
              }}
              width="var(--field-w)"
            />
            <span className="key-spacer" aria-hidden="true" />
          </Field>
          {camera.projection === 'perspective' && (
            <Field label="Размер">
              <Checkbox
                checked={render.sizeByDepth}
                title="Ближние символы крупнее и реже, дальние — мельче и гуще"
                onChange={(sizeByDepth) => setRender3DAction(layerId, { sizeByDepth })}
              >
                По глубине
              </Checkbox>
            </Field>
          )}
        </>
      )}
      <Target3DRow
        target={{ node: 'scene3d', id: layerId, property: 'fog' }}
        label={SCENE_3D_LABELS.fog}
        value={[render.fog]}
        step={0.05}
        title="Дальнее разрежается по рампе символов, а не темнеет"
        initial={[DEFAULT_RENDER_3D.fog]}
      />
    </>
  );
}
