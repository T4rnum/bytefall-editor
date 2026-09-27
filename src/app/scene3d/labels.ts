import type { ReliefDepth } from '../../core/scene3d/relief';
import type { Node3DProperty, Scene3DProperty } from '../../core/scene3d/scene';
import type { Node3DKind } from '../../core/scene3d/types';

/** Подписи 3D-сцены: одни для панели сцены и таймлайна. */
export const NODE_3D_LABELS: Readonly<Record<Node3DProperty, string>> = {
  position: 'Положение',
  rotation: 'Поворот',
  scale: 'Размер',
};

export const SCENE_3D_LABELS: Readonly<Record<Scene3DProperty, string>> = {
  cameraPosition: 'Камера',
  cameraTarget: 'Цель камеры',
  fov: 'Угол обзора',
  size: 'Высота кадра',
  sunAzimuth: 'Солнце, азимут',
  sunElevation: 'Солнце, высота',
  sun: 'Сила солнца',
  ambient: 'Рассеянный свет',
};

export const KIND_3D_LABELS: Readonly<Record<Node3DKind, string>> = {
  box: 'Куб',
  sphere: 'Шар',
  cylinder: 'Цилиндр',
  cone: 'Конус',
  torus: 'Тор',
  plane: 'Плоскость',
  mesh: 'Модель',
};

export const RELIEF_LABELS: Readonly<Record<ReliefDepth, string>> = {
  brightness: 'По яркости',
  inflate: 'Подушкой по силуэту',
};
