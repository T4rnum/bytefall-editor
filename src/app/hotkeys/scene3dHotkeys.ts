import { addLayer3DAction } from '../store/scene3dActions';
import type { Hotkey } from './types';

/** 3D-слои: сцена Three.js, нарисованная символами (DESIGN.md, раздел 6, режим A). */
export const SCENE_3D_HOTKEYS: readonly Hotkey[] = [
  { group: '3D', label: 'Новый 3D-слой', keys: 'Ctrl+Shift+3', run: addLayer3DAction },
];
