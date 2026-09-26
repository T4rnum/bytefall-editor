import { nodeSpec } from '../../core/graph/nodes';
import { INPUT_NODE, OUTPUT_NODE } from '../../core/graph/types';
import { findObject } from '../../core/object';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { removeNodesAction, setNodesMutedAction } from './graphActions';
import { useUiStore } from './uiStore';

/** Что умеет открытый редактор узлов по команде извне: из реестра клавиш. */
export interface NodeEditorHandle {
  /** Вписать граф в окно. */
  fit(): void;
  /** Открыть меню «Добавить» под указателем. */
  openAddMenu(): void;
}

let active: NodeEditorHandle | null = null;

/** Редактор узлов регистрирует себя, пока открыт, как вьюпорт — свою сцену. */
export function setActiveNodeEditor(handle: NodeEditorHandle | null): void {
  active = handle;
}

export const activeNodeEditor = (): NodeEditorHandle | null => active;

/** Клавиши редактора узлов действуют, пока фокус в нём: X там удаляет узел, а не меняет цвета. */
export const nodeEditorFocused = (): boolean =>
  active !== null && document.activeElement?.closest('.node-editor') != null;

export function toggleBottomViewAction(): void {
  const ui = useUiStore.getState();
  ui.setBottomView(ui.bottomView === 'nodes' ? 'timeline' : 'nodes');
}

/** Выбранный объект и те выделенные узлы, что есть в его графе. */
function selectedInGraph(): { objectId: string; ids: string[] } | null {
  const { selectedObjectId, selectedNodes } = useEditorStore.getState();
  const obj = selectedObjectId
    ? findObject(useDocumentStore.getState().doc, selectedObjectId)
    : null;
  if (!obj?.graph) return null;
  const present = new Set(obj.graph.nodes.map((n) => n.id));
  return { objectId: obj.id, ids: selectedNodes.filter((id) => present.has(id)) };
}

/** Удаляет выделенные узлы; «Объект» и «Вывод» остаются. */
export function removeSelectedNodesAction(): void {
  const selected = selectedInGraph();
  const ids = selected?.ids.filter((id) => id !== INPUT_NODE && id !== OUTPUT_NODE) ?? [];
  if (!selected || ids.length === 0) return;
  removeNodesAction(selected.objectId, ids);
  useEditorStore.getState().setSelectedNodes([]);
}

/**
 * Глушит выделенные узлы или включает их обратно: если среди них есть включённый — глушит все.
 * Поля не глушатся: у них нет потока, который можно пропустить.
 */
export function toggleMuteSelectedNodesAction(): void {
  const selected = selectedInGraph();
  if (!selected) return;
  const graph = findObject(useDocumentStore.getState().doc, selected.objectId)?.graph;
  const nodes = (graph?.nodes ?? []).filter((n) => {
    const category = nodeSpec(n.kind)?.category;
    return (
      selected.ids.includes(n.id) &&
      category !== undefined &&
      category !== 'field' &&
      category !== 'input' &&
      category !== 'output'
    );
  });
  if (nodes.length === 0) return;
  const mute = nodes.some((n) => !n.muted);
  setNodesMutedAction(
    selected.objectId,
    nodes.map((n) => n.id),
    mute,
  );
}

/** Выделяет все узлы графа выбранного объекта. */
export function selectAllNodesAction(): void {
  const { selectedObjectId } = useEditorStore.getState();
  const obj = selectedObjectId
    ? findObject(useDocumentStore.getState().doc, selectedObjectId)
    : null;
  useEditorStore.getState().setSelectedNodes(obj?.graph?.nodes.map((n) => n.id) ?? []);
}
