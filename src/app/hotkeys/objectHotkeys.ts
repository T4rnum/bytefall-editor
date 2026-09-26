import { extractGlyphsAction, joinSelectionToObjectAction } from '../store/cellTransferActions';
import { addIkControlAction } from '../store/constraintActions';
import {
  addEmptyObjectAction,
  focusParentSelectAction,
  groupSelectionAction,
} from '../store/objectActions';
import {
  duplicateSelectedObjectsAction,
  setSelectedParentAction,
  stepSelectedObjectsLayerAction,
  ungroupSelectedObjectsAction,
} from '../store/objectBatchActions';
import { toggleEditModeAction } from '../store/objectEditActions';
import {
  resetSelectedRotationAction,
  resetSelectedScaleAction,
  rotateSelectedAction,
} from '../store/transformActions';
import type { Hotkey } from './types';

/** Сочетания объектов: сборка и разборка, правка изнутри, перенос, поворот, риг. */
export const OBJECT_HOTKEYS: readonly Hotkey[] = [
  { group: 'Объекты', label: 'Собрать объект', keys: 'Ctrl+G', run: groupSelectionAction },
  {
    group: 'Объекты',
    label: 'Править символы объекта изнутри',
    keys: 'Tab',
    run: toggleEditModeAction,
  },
  {
    group: 'Объекты',
    label: 'Разобрать объект',
    keys: 'Ctrl+Shift+G',
    run: ungroupSelectedObjectsAction,
  },
  { group: 'Объекты', label: 'Дублировать', keys: 'Ctrl+D', run: duplicateSelectedObjectsAction },
  {
    group: 'Объекты',
    label: 'Перенести на слой выше',
    keys: 'Alt+]',
    run: () => stepSelectedObjectsLayerAction(1),
  },
  {
    group: 'Объекты',
    label: 'Перенести на слой ниже',
    keys: 'Alt+[',
    run: () => stepSelectedObjectsLayerAction(-1),
  },
  {
    group: 'Объекты',
    label: 'Повернуть на 15° по часовой',
    keys: ']',
    run: () => rotateSelectedAction(15),
  },
  {
    group: 'Объекты',
    label: 'Повернуть на 15° против часовой',
    keys: '[',
    run: () => rotateSelectedAction(-15),
  },
  {
    group: 'Объекты',
    label: 'Повернуть на 90° по часовой',
    keys: 'Shift+]',
    run: () => rotateSelectedAction(90),
  },
  {
    group: 'Объекты',
    label: 'Повернуть на 90° против часовой',
    keys: 'Shift+[',
    run: () => rotateSelectedAction(-90),
  },
  { group: 'Объекты', label: 'Сбросить поворот', keys: 'Alt+R', run: resetSelectedRotationAction },
  { group: 'Объекты', label: 'Пустой объект', keys: 'Shift+A', run: addEmptyObjectAction },
  { group: 'Объекты', label: 'Выбрать родителя', keys: 'Ctrl+P', run: focusParentSelectAction },
  {
    group: 'Объекты',
    label: 'Отвязать от родителя',
    keys: 'Alt+P',
    run: () => setSelectedParentAction(null),
  },
  { group: 'Объекты', label: 'Сбросить масштаб', keys: 'Alt+S', run: resetSelectedScaleAction },
  {
    group: 'Объекты',
    label: 'IK к новому контроллеру у выбранной кости',
    keys: 'Shift+I',
    run: addIkControlAction,
  },
  {
    group: 'Объекты',
    label: 'Добавить выделенные ячейки в объект',
    keys: 'Ctrl+J',
    run: joinSelectionToObjectAction,
  },
  {
    group: 'Объекты',
    label: 'Вынуть выделенные символы в слой',
    keys: 'Ctrl+Shift+J',
    run: extractGlyphsAction,
  },
];
