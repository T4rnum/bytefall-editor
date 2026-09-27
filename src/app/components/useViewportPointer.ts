import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef } from 'react';
import { inBounds } from '../../core/geometry';
import type { SceneView } from '../../render/SceneView';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { useUiStore } from '../store/uiStore';
import { isEditableTarget } from '../hooks/useHotkeys';
import { cancelCameraTween, getActiveView, zoomWheelAction } from '../store/viewActions';
import { type PointerInfo, getTool, pickAt } from '../tools';
import { toolPointer } from '../tools/editSession';
import { buildToolEnv } from '../tools/env';

/** Что сейчас тянут на холсте: жест инструмента или панорамирование вида. */
export type Drag =
  | { readonly kind: 'tool'; readonly pointerId: number }
  | { readonly kind: 'pan'; readonly pointerId: number; lastX: number; lastY: number };

export interface ViewportRefs {
  readonly viewRef: RefObject<SceneView | null>;
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly dragRef: RefObject<Drag | null>;
}

const WHEEL_ZOOM_SPEED = 0.0015;

/**
 * Колесо приближает к указателю, зажатый пробел превращает любую кнопку в панорамирование.
 * Слушатели вешаются напрямую: React вешает wheel пассивным, и отменить прокрутку страницы
 * из него нельзя.
 */
function useWheelAndSpace(
  containerRef: RefObject<HTMLDivElement | null>,
  spaceRef: RefObject<boolean>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      zoomWheelAction(
        event.clientX - rect.left,
        event.clientY - rect.top,
        Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED),
      );
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== ' ' || isEditableTarget(event.target)) return;
      const editor = useEditorStore.getState();
      // Пока печатается текст, пробел принадлежит текстовому инструменту.
      const typing = editor.tool === 'text' && editor.textCursor !== null;
      spaceRef.current = event.type === 'keydown' && !typing;
      container.classList.toggle('is-panning', spaceRef.current);
      if (event.type === 'keydown' && !typing) event.preventDefault();
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [containerRef, spaceRef]);
}

/**
 * Указатель на холсте: панорамирование, быстрая пипетка по Alt и жесты инструментов. Рисующему
 * инструменту в правке изнутри точка уходит ячейкой сетки объекта (`toolPointer`).
 */
export function useViewportPointer({ viewRef, containerRef, dragRef }: ViewportRefs) {
  const spaceRef = useRef(false);
  useWheelAndSpace(containerRef, spaceRef);

  const pointerInfo = (event: ReactPointerEvent): PointerInfo | null => {
    const view = viewRef.current;
    const container = containerRef.current;
    if (!view || !container) return null;
    const rect = container.getBoundingClientRect();
    const world = view.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    // Мир смотрит осью Y вверх, документ — вниз.
    const point = { x: world.x, y: -world.y };
    const cell = { x: Math.floor(point.x), y: Math.floor(point.y) };
    return {
      cell,
      point,
      button: event.button,
      shift: event.shiftKey,
      alt: event.altKey,
      ctrl: event.ctrlKey || event.metaKey,
    };
  };

  const down = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current) return;
    // Любое действие на холсте останавливает проигрывание и снимает выделение ключей: Delete
    // снова относится к холсту.
    const editorState = useEditorStore.getState();
    if (editorState.isPlaying) editorState.setPlaying(false);
    if (editorState.selectedKeys.length > 0) editorState.setSelectedKeys([]);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Синтетические события без активного указателя: захват необязателен.
    }
    // Пока открыт импорт картинки, холст только смотрят: любая кнопка двигает вид.
    if (event.button === 1 || spaceRef.current || useUiStore.getState().imageImport) {
      dragRef.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      return;
    }
    if (event.button !== 0 && event.button !== 2) return;
    const info = pointerInfo(event);
    if (!info) return;
    const tool = getTool(useEditorStore.getState().tool);
    if (event.altKey && !tool.ownsAlt) {
      pickAt(buildToolEnv(), info.cell, event.button);
      return;
    }
    dragRef.current = { kind: 'tool', pointerId: event.pointerId };
    const env = buildToolEnv();
    tool.onPointerDown?.(env, toolPointer(tool, env, info));
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const info = pointerInfo(event);
    if (!info) return;
    const { doc } = useDocumentStore.getState();
    const editor = useEditorStore.getState();
    editor.setCursorCell(
      inBounds(info.cell.x, info.cell.y, doc.width, doc.height) ? info.cell : null,
    );
    if (editor.editingObjectId) editor.setCursorPoint(info.point);

    const drag = dragRef.current;
    if (!drag) {
      // Без нажатой кнопки инструмент подсказывает курсором, что под указателем можно схватить.
      const current = getTool(editor.tool);
      const env = buildToolEnv();
      const hover = current.hoverCursor?.(env, toolPointer(current, env, info)) ?? null;
      event.currentTarget.style.cursor = hover ?? current.cursor;
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    if (drag.kind === 'pan') {
      // Панорамирование ведёт камеру само: начатый кнопкой переход надо оборвать.
      cancelCameraTween();
      const { camera, setCamera } = editor;
      const aspect = getActiveView()?.cellAspect ?? 1;
      setCamera({
        ...camera,
        centerX: camera.centerX - (event.clientX - drag.lastX) / (camera.zoom * aspect),
        centerY: camera.centerY + (event.clientY - drag.lastY) / camera.zoom,
      });
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      return;
    }
    const tool = getTool(editor.tool);
    const env = buildToolEnv();
    tool.onPointerMove?.(env, toolPointer(tool, env, info));
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.kind !== 'tool') return;
    const current = getTool(useEditorStore.getState().tool);
    const info = pointerInfo(event);
    const env = buildToolEnv();
    if (cancelled || !info) current.cancel?.(env);
    else current.onPointerUp?.(env, toolPointer(current, env, info));
  };

  const leave = (): void => {
    const editor = useEditorStore.getState();
    editor.setCursorCell(null);
    if (editor.cursorPoint) editor.setCursorPoint(null);
  };

  return { down, move, finish, leave };
}
