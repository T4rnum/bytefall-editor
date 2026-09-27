import { importModelAction } from '../store/modelActions';
import { addLayer3DAction, cycleRender3DAction } from '../store/scene3dActions';
import type { Hotkey } from './types';

/** 3D-слои: сцена Three.js, нарисованная символами (DESIGN.md, раздел 6, режим A). */
export const SCENE_3D_HOTKEYS: readonly Hotkey[] = [
  { group: '3D', label: 'Новый 3D-слой', keys: 'Ctrl+Shift+3', run: addLayer3DAction },
  {
    group: '3D',
    label: 'Режим символов: растр, по сетке, облако',
    keys: 'Alt+3',
    run: cycleRender3DAction,
  },
  {
    group: '3D',
    label: 'Модель glTF в 3D-сцену',
    keys: 'Ctrl+Shift+M',
    run: () => void importModelAction(),
  },
];
