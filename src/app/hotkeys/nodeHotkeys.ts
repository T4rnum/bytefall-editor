import {
  activeNodeEditor,
  nodeEditorFocused,
  removeSelectedNodesAction,
  selectAllNodesAction,
  toggleBottomViewAction,
  toggleMuteSelectedNodesAction,
} from '../store/nodeEditorActions';
import type { Hotkey } from './types';

/**
 * Редактор узлов. Кроме переключателя, сочетания действуют, пока фокус в редакторе, и тогда они
 * важнее обычных: X удаляет узел, а не меняет цвета кисти, Home вписывает граф, а не ведёт время
 * в начало. Раскладка — как в Blender.
 */
export const NODE_HOTKEYS: readonly Hotkey[] = [
  { group: 'Вид', label: 'Узлы или таймлайн внизу', keys: 'N', run: toggleBottomViewAction },
  {
    group: 'Узлы',
    label: 'Добавить узел под указателем',
    keys: 'Shift+A',
    when: nodeEditorFocused,
    run: () => activeNodeEditor()?.openAddMenu(),
  },
  {
    group: 'Узлы',
    label: 'Удалить выделенные узлы: поток через них не рвётся',
    keys: 'X',
    when: nodeEditorFocused,
    run: removeSelectedNodesAction,
  },
  {
    group: 'Узлы',
    label: 'Удалить выделенные узлы',
    keys: 'Delete',
    hidden: true,
    when: nodeEditorFocused,
    run: removeSelectedNodesAction,
  },
  {
    group: 'Узлы',
    label: 'Заглушить узлы или включить обратно',
    keys: 'M',
    when: nodeEditorFocused,
    run: toggleMuteSelectedNodesAction,
  },
  {
    group: 'Узлы',
    label: 'Выделить все узлы',
    keys: 'Ctrl+A',
    when: nodeEditorFocused,
    run: selectAllNodesAction,
  },
  {
    group: 'Узлы',
    label: 'Вписать граф в окно',
    keys: 'Home',
    when: nodeEditorFocused,
    run: () => activeNodeEditor()?.fit(),
  },
];
