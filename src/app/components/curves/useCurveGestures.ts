import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { Point } from '../../../core/geometry';
import { roundTime } from '../../../core/time';
import { keysInBox } from '../../curves/curveGeometry';
import { type CurveView, panView, zoomView } from '../../curves/curveView';
import { useEditorStore } from '../../store/editorStore';
import { scrubAction } from '../../store/timeActions';
import { snapTime } from '../../timeline/timelineMath';
import {
  type Box,
  type CurveFrame,
  DRAG_PX,
  type Gesture,
  RULER,
  moveHandle,
  moveKeys,
  sameRef,
  startGesture,
  unmap,
} from './curveDrag';

export { RULER, allKeyRefs, type CurveFrame } from './curveDrag';

/** Колесо меняет масштаб во столько раз за единицу прокрутки, как во вьюпорте. */
const WHEEL_ZOOM = 0.0015;

function localPoint(root: HTMLElement, e: ReactPointerEvent | WheelEvent): Point {
  const rect = root.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/**
 * Колесо приближает к указателю: обе оси, с Ctrl — только значения, с Shift — только время.
 * Слушатель вешается напрямую: React вешает wheel пассивным, и прокрутку не отменить.
 */
function useWheelZoom(
  rootRef: RefObject<HTMLDivElement | null>,
  frame: RefObject<CurveFrame>,
  setView: (update: (view: CurveView) => CurveView) => void,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const f = Math.exp(-event.deltaY * WHEEL_ZOOM);
      const p = localPoint(root, event);
      const at = { x: p.x, y: p.y - RULER };
      const fx = event.ctrlKey ? 1 : f;
      const fy = event.shiftKey ? 1 : f;
      setView((v) => zoomView(v, frame.current.plot, at, fx, fy));
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [rootRef, frame, setView]);
}

/**
 * Жесты редактора кривых, как в Graph Editor Blender: ключ тянут — едут выделенные, ручку
 * тянут — меняется кривая перехода, по пустому месту — рамка выделения, по полосе сверху —
 * указатель времени, средней кнопкой — панорама, колесом — масштаб.
 */
export function useCurveGestures(
  rootRef: RefObject<HTMLDivElement | null>,
  frame: CurveFrame,
  setView: (update: (view: CurveView) => CurveView) => void,
) {
  const gesture = useRef<Gesture | null>(null);
  const current = useRef(frame);
  // Обработчики указателя читают последний кадр: он обновляется сразу после отрисовки.
  useLayoutEffect(() => {
    current.current = frame;
  });
  const [box, setBox] = useState<Box | null>(null);
  useWheelZoom(rootRef, current, setView);

  const scrub = (g: Extract<Gesture, { kind: 'scrub' }>, at: Point, alt: boolean): void => {
    const t = Math.max(0, unmap(current.current, at).x);
    scrubAction(alt ? roundTime(t) : snapTime(t, g.targets));
  };

  const moveBox = (g: Extract<Gesture, { kind: 'box' }>, at: Point): void => {
    if (!g.moved && Math.hypot(at.x - g.start.x, at.y - g.start.y) < DRAG_PX) return;
    g.moved = true;
    const r = {
      x: Math.min(g.start.x, at.x),
      y: Math.min(g.start.y, at.y),
      w: Math.abs(at.x - g.start.x),
      h: Math.abs(at.y - g.start.y),
    };
    const found = keysInBox(current.current.keys, r);
    const extra = found.filter((f) => !g.additive.some((a) => sameRef(a, f)));
    useEditorStore.getState().setSelectedKeys([...g.additive, ...extra]);
    setBox(r);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const g = gesture.current;
    if (!g) return;
    const at = localPoint(event.currentTarget, event);
    if (g.kind === 'pan') {
      setView((v) => panView(v, current.current.plot, at.x - g.lastX, at.y - g.lastY));
      g.lastX = at.x;
      g.lastY = at.y;
    } else if (g.kind === 'scrub') scrub(g, at, event.altKey);
    else if (g.kind === 'keys') moveKeys(current.current, g, { ...at, ...modifiers(event) });
    else if (g.kind === 'handle') moveHandle(current.current, g, at);
    else moveBox(g, at);
  };

  const end = (): void => {
    const g = gesture.current;
    gesture.current = null;
    setBox(null);
    if (g?.kind === 'box' && !g.moved && g.additive.length === 0) {
      useEditorStore.getState().setSelectedKeys([]);
    }
  };

  return {
    box,
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>): void => {
      const at = localPoint(event.currentTarget, event);
      if (event.button === 1) gesture.current = { kind: 'pan', lastX: at.x, lastY: at.y };
      else if (event.button === 0)
        gesture.current = startGesture(current.current, at, event.shiftKey);
      else return;
      capture(event);
      if (gesture.current?.kind === 'scrub') scrub(gesture.current, at, event.altKey);
      event.preventDefault();
    },
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
  };
}

function capture(event: ReactPointerEvent<HTMLDivElement>): void {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Синтетические события без активного указателя: захват необязателен.
  }
}

const modifiers = (e: ReactPointerEvent): { shiftKey: boolean; altKey: boolean } => ({
  shiftKey: e.shiftKey,
  altKey: e.altKey,
});
