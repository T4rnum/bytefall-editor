import { activeCurveEditor, curveEditorFocused } from '../store/curveActions';
import { toggleCurvesAction } from '../store/workspaceActions';
import type { Hotkey } from './types';

/**
 * Редактор кривых. Кроме переключателя, сочетания действуют, пока фокус в редакторе, и тогда
 * они важнее обычных: Home вписывает кривые, а не ведёт время в начало. Раскладка — как в Blender.
 */
export const CURVE_HOTKEYS: readonly Hotkey[] = [
  { group: 'Вид', label: 'Кривые или таймлайн', keys: 'G', run: toggleCurvesAction },
  {
    group: 'Кривые',
    label: 'Вписать кривые в окно',
    keys: 'Home',
    when: curveEditorFocused,
    run: () => activeCurveEditor()?.fit(),
  },
  {
    group: 'Кривые',
    label: 'Выделить все ключи на кривых',
    keys: 'Ctrl+A',
    when: curveEditorFocused,
    run: () => activeCurveEditor()?.selectAll(),
  },
];
