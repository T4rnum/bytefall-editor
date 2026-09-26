import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { NodeGraph } from '../../../core/graph/types';
import { isEditableTarget } from '../../hooks/useHotkeys';
import type { Point } from '../../nodes/nodeLayout';
import { type NodeView, panBy, toGraph, zoomAt } from '../../nodes/nodeView';
import { useEditorStore } from '../../store/editorStore';
import type { SocketSide } from './NodeBox';
import { type NodeDrag, boxOf, commitDrag, headSelection, linkDragFrom } from './nodeDrag';

export type { NodeDrag } from './nodeDrag';

/** Колесо меняет масштаб во столько раз за единицу прокрутки, как во вьюпорте. */
const WHEEL_ZOOM = 0.0015;

type SetView = (update: (view: NodeView) => NodeView) => void;

interface Session {
  readonly start: Point;
  readonly view: NodeView;
  readonly pan: boolean;
  readonly additive: boolean;
}

/** Зажатый пробел превращает левую кнопку в панорамирование, как во вьюпорте. */
function useSpaceHeld(): RefObject<boolean> {
  const held = useRef(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== ' ' || isEditableTarget(event.target)) return;
      held.current = event.type === 'keydown';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);
  return held;
}

/**
 * Колесо приближает к указателю. Слушатель вешается напрямую: React вешает wheel пассивным, и
 * отменить прокрутку страницы из него нельзя. Над меню колесо листает меню.
 */
function useWheelZoom(rootRef: RefObject<HTMLDivElement | null>, setView: SetView): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent): void => {
      if ((event.target as Element).closest('.node-menu')) return;
      event.preventDefault();
      const rect = root.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setView((v) => zoomAt(v, x, y, Math.exp(-event.deltaY * WHEEL_ZOOM)));
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [rootRef, setView]);
}

export interface NodeGesturesArgs {
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly view: NodeView;
  readonly setView: SetView;
  readonly objectId: string | null;
  readonly graph: NodeGraph;
}

/**
 * Жесты редактора узлов, как в Blender: шапку тянут — узлы едут, из гнезда тянут связь, по
 * пустому месту — рамка выделения, средней кнопкой или с пробелом — панорама, колесом — масштаб.
 * Документ правится один раз, на отпускании (`commitDrag`).
 */
export function useNodeGestures({ rootRef, view, setView, objectId, graph }: NodeGesturesArgs) {
  const [drag, setDrag] = useState<NodeDrag>(null);
  const session = useRef<Session | null>(null);
  /** Где указатель в последний раз, в пикселях от угла: там открывается меню «Добавить». */
  const pointer = useRef<Point>({ x: 48, y: 48 });
  const space = useSpaceHeld();
  useWheelZoom(rootRef, setView);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const rect = rootRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };
  /** Начало жеста: указатель захвачен, и отпускание придёт сюда, даже если оно за окном. */
  const begin = (e: ReactPointerEvent, next: NodeDrag, pan = false): void => {
    rootRef.current?.setPointerCapture(e.pointerId);
    session.current = { start: local(e), view, pan, additive: e.shiftKey };
    setDrag(next);
  };
  const graphAt = (e: ReactPointerEvent): Point => toGraph(view, local(e).x, local(e).y);

  const onBackgroundDown = (e: ReactPointerEvent): void => {
    if ((e.target as Element).closest('.node, .node-menu')) return;
    if (e.button === 1 || (e.button === 0 && space.current)) {
      e.preventDefault();
      begin(e, null, true);
    } else if (e.button === 0) {
      begin(e, { kind: 'box', box: boxOf(graphAt(e), graphAt(e)) });
    }
  };

  const onHeadDown = (e: ReactPointerEvent, id: string): void => {
    if (e.button !== 0 || space.current) return;
    e.stopPropagation();
    const editor = useEditorStore.getState();
    const ids = headSelection(editor.selectedNodes, id, e.shiftKey);
    editor.setSelectedNodes(ids);
    if (ids.includes(id)) begin(e, { kind: 'move', ids, dx: 0, dy: 0 });
  };

  const onSocketDown = (e: ReactPointerEvent, node: string, side: SocketSide, name: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    begin(e, linkDragFrom(graph, node, side, name, graphAt(e)));
  };

  const onPointerMove = (e: ReactPointerEvent): void => {
    const p = local(e);
    pointer.current = p;
    const s = session.current;
    if (!s) return;
    if (s.pan) return setView(() => panBy(s.view, p.x - s.start.x, p.y - s.start.y));
    const at = toGraph(s.view, p.x, p.y);
    const start = toGraph(s.view, s.start.x, s.start.y);
    setDrag((d) => {
      if (d?.kind === 'move') return { ...d, dx: at.x - start.x, dy: at.y - start.y };
      if (d?.kind === 'link') return { ...d, at };
      return d && { kind: 'box', box: boxOf(start, at) };
    });
  };

  const onPointerUp = (e: ReactPointerEvent): void => {
    const s = session.current;
    session.current = null;
    if (s && !s.pan && drag && objectId) {
      commitDrag(objectId, graph, drag, { x: e.clientX, y: e.clientY, additive: s.additive });
    }
    setDrag(null);
  };

  const onPointerCancel = (): void => {
    session.current = null;
    setDrag(null);
  };

  return {
    drag,
    pointer,
    onBackgroundDown,
    onHeadDown,
    onSocketDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
