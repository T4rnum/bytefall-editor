import { useRef } from 'react';
import { DEFAULT_CAMERA, DEFAULT_LIGHT, type Scene3D } from '../../../core/scene3d/types';
import { SCENE_3D_LABELS } from '../../scene3d/labels';
import { setCamera3DAction, setLight3DAction } from '../../store/scene3dActions';
import { ColorField, Field, Select, type SelectOption } from '../../ui';
import { Target3DRow } from './Target3DRow';

const PROJECTIONS: readonly SelectOption<Scene3D['camera']['projection']>[] = [
  { value: 'perspective', label: 'Перспектива' },
  { value: 'orthographic', label: 'Ортография' },
];

/** Камера сцены: куда смотрит и как, с ключами. Инструмент «Орбита» крутит её мышью. */
export function Camera3DFields({ layerId, scene }: { layerId: string; scene: Scene3D }) {
  const { camera } = scene;
  const target = (property: 'cameraPosition' | 'cameraTarget' | 'fov' | 'size') =>
    ({ node: 'scene3d', id: layerId, property }) as const;
  return (
    <>
      <Field label="Проекция">
        <Select
          value={camera.projection}
          options={PROJECTIONS}
          size="sm"
          ariaLabel="Проекция камеры"
          onChange={(projection) => setCamera3DAction(layerId, { projection })}
        />
        <span className="key-spacer" aria-hidden="true" />
      </Field>
      <Target3DRow
        target={target('cameraPosition')}
        label={SCENE_3D_LABELS.cameraPosition}
        value={camera.position}
        step={0.1}
        initial={DEFAULT_CAMERA.position}
      />
      <Target3DRow
        target={target('cameraTarget')}
        label={SCENE_3D_LABELS.cameraTarget}
        value={camera.target}
        step={0.1}
        initial={DEFAULT_CAMERA.target}
      />
      {camera.projection === 'perspective' ? (
        <Target3DRow
          target={target('fov')}
          label={SCENE_3D_LABELS.fov}
          value={[camera.fov]}
          step={1}
          suffix="°"
          initial={[DEFAULT_CAMERA.fov]}
        />
      ) : (
        <Target3DRow
          target={target('size')}
          label={SCENE_3D_LABELS.size}
          value={[camera.size]}
          step={0.1}
          title="Высота кадра в единицах сцены"
          initial={[DEFAULT_CAMERA.size]}
        />
      )}
    </>
  );
}

/** Свет: рассеянный и солнце. Цвета — во всех кадрах, силы и направление солнца — ключами. */
export function Light3DFields({ layerId, scene }: { layerId: string; scene: Scene3D }) {
  const gesture = useRef(0);
  const { light } = scene;
  const target = (property: 'ambient' | 'sun' | 'sunAzimuth' | 'sunElevation') =>
    ({ node: 'scene3d', id: layerId, property }) as const;
  const color = (key: 'ambientColor' | 'sunColor', label: string) => (
    <ColorField
      label={label}
      value={light[key]}
      size="sm"
      onChange={(c) => c && setLight3DAction(layerId, { [key]: c }, `${key}:${gesture.current}`)}
      onCommit={(c) => {
        if (c) setLight3DAction(layerId, { [key]: c }, `${key}:${gesture.current}`);
        gesture.current += 1;
      }}
    />
  );
  const row = (property: 'ambient' | 'sun' | 'sunAzimuth' | 'sunElevation', step: number) => (
    <Target3DRow
      key={property}
      target={target(property)}
      label={SCENE_3D_LABELS[property]}
      value={[light[property]]}
      step={step}
      suffix={property === 'sunAzimuth' || property === 'sunElevation' ? '°' : undefined}
      initial={[DEFAULT_LIGHT[property]]}
    />
  );
  return (
    <>
      <Field label="Цвет света">
        {color('ambientColor', 'Цвет рассеянного света')}
        {color('sunColor', 'Цвет солнца')}
      </Field>
      {row('ambient', 0.05)}
      {row('sun', 0.05)}
      {row('sunAzimuth', 5)}
      {row('sunElevation', 5)}
    </>
  );
}
