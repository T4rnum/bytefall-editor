import { movePanelAction } from '../../store/workspaceActions';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  type Box,
  type GroupBox,
  type ZoneBox,
  dropHighlight,
  dropTargetAt,
} from '../../workspace/dropTarget';
import { type DropTarget, type PanelId, type ZoneId } from '../../workspace/layout';

/** Сдвиг, после которого нажатие на вкладку — уже перетаскивание, а не щелчок. */
const DRAG_START = 5;

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** Группы и зоны дока на экране: раскладка берётся из DOM на каждое движение. */
function measure(doc: Document): { groups: GroupBox[]; zones: ZoneBox[] } {
  const groups = [...doc.querySelectorAll<HTMLElement>('[data-dock-group]')].map((el) => ({
    zone: el.dataset.zone as ZoneId,
    index: Number(el.dataset.index),
    rect: boxOf(el),
    header: el.querySelector('.dock-header')?.getBoundingClientRect().height ?? 0,
  }));
  const zones = [...doc.querySelectorAll<HTMLElement>('[data-dock-zone]')].map((el) => ({
    zone: el.dataset.dockZone as ZoneId,
    rect: boxOf(el),
    groups: Number(el.dataset.groups),
  }));
  return { groups, zones };
}

/**
 * Нажатие на вкладку панели: щелчок без сдвига — `onClick`, сдвиг — перетаскивание. Пока тянут,
 * пустые зоны показывают полосу для броска, место вставки подсвечено; Escape отменяет.
 */
export function pressPanelTab(event: React.PointerEvent, id: PanelId, onClick: () => void): void {
  if (event.button !== 0) return;
  const view = event.currentTarget.ownerDocument.defaultView;
  if (!view) return;
  const store = useWorkspaceStore.getState();
  const start = { x: event.clientX, y: event.clientY };
  let dragging = false;
  let target: DropTarget | null = null;

  const move = (e: PointerEvent): void => {
    if (!dragging) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_START) return;
      dragging = true;
      store.setDragging(id);
    }
    const { groups, zones } = measure(view.document);
    target = dropTargetAt(e.clientX, e.clientY, groups, zones);
    store.setDropBox(target && dropHighlight(target, groups, zones));
  };
  const finish = (): void => {
    view.removeEventListener('pointermove', move);
    view.removeEventListener('pointerup', up);
    view.removeEventListener('keydown', key, true);
    store.setDragging(null);
  };
  const up = (): void => {
    finish();
    if (!dragging) onClick();
    else if (target) movePanelAction(id, target);
  };
  const key = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    target = null;
    finish();
  };
  view.addEventListener('pointermove', move);
  view.addEventListener('pointerup', up);
  view.addEventListener('keydown', key, true);
}
