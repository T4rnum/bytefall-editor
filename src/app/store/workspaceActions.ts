import {
  type DropTarget,
  type PanelId,
  findPanel,
  hidePanel,
  movePanel,
  showPanel,
} from '../workspace/layout';
import { closeWindowFor, openWindowFor } from '../workspace/panelWindows';
import { currentPlace, homePlace, toggleWithTimeline } from '../workspace/placement';
import { PRESETS, WORKSPACES, type WorkspaceId } from '../workspace/presets';
import { notify } from './notifyStore';
import { currentLayout, useWorkspaceStore } from './workspaceStore';

const store = () => useWorkspaceStore.getState();

const homeOf = (id: PanelId): DropTarget =>
  homePlace(PRESETS[store().workspace], currentLayout(), id);

/**
 * Показывает панель: скрытую — на её место, во вкладке — делает активной, свёрнутую —
 * разворачивает. Горячая клавиша может вести к полю в панели, которой сейчас не видно.
 */
export function revealPanelAction(id: PanelId): void {
  if (store().windows.includes(id)) return;
  store().editLayout((l) => showPanel(l, id, homeOf(id)));
}

export function hidePanelAction(id: PanelId): void {
  store().editLayout((l) => hidePanel(l, id));
}

/** Меню «Панели»: видимую — скрыть, скрытую — показать. */
export function togglePanelAction(id: PanelId): void {
  if (store().windows.includes(id)) return;
  if (findPanel(currentLayout(), id)) hidePanelAction(id);
  else revealPanelAction(id);
}

export function movePanelAction(id: PanelId, target: DropTarget): void {
  store().editLayout((l) => movePanel(l, id, target));
}

/**
 * Панель в отдельное окно: её место в зоне освобождается и ждёт её обратно. Звать из
 * обработчика щелчка: окно, открытое позже, браузер заблокирует.
 */
export function openPanelWindowAction(id: PanelId, title: string): void {
  if (!openWindowFor(id, title)) {
    notify('Браузер не открыл окно: разрешите всплывающие окна для редактора', 'error');
    return;
  }
  store().openWindow(id, currentPlace(currentLayout(), id) ?? homeOf(id));
  store().editLayout((l) => hidePanel(l, id));
}

/** Окно панели закрыли: панель возвращается туда, где стояла. */
export function closePanelWindowAction(id: PanelId): void {
  closeWindowFor(id);
  if (!store().windows.includes(id)) return;
  const back = store().closeWindow(id);
  store().editLayout((l) => showPanel(l, id, back ?? homeOf(id)));
}

/** N: узлы или таймлайн. */
export function toggleNodesAction(): void {
  if (store().windows.includes('nodes')) return;
  store().editLayout((l) => toggleWithTimeline(l, PRESETS[store().workspace], 'nodes'));
}

/** Кривые или таймлайн (G), как N для узлов. */
export function toggleCurvesAction(): void {
  if (store().windows.includes('curves')) return;
  store().editLayout((l) => toggleWithTimeline(l, PRESETS[store().workspace], 'curves'));
}

export function setWorkspaceAction(id: WorkspaceId): void {
  if (store().workspace === id) return;
  store().setWorkspace(id);
  notify(`Рабочее место: ${WORKSPACES.find((w) => w.id === id)?.label ?? id}`, 'info');
}

export function resetLayoutAction(): void {
  store().resetLayout();
  const label = WORKSPACES.find((w) => w.id === store().workspace)?.label ?? '';
  notify(`Раскладка «${label}» — как по умолчанию`, 'info');
}
