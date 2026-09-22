import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react';
import { frameDocument } from '../../core/animation';
import {
  type CellBuffer,
  type Ghost,
  canRebuildTiles,
  composite,
  effectsSignature,
} from '../../core/compositor';
import { inBounds } from '../../core/geometry';
import { findObject, objectBounds } from '../../core/object';
import { tileLayout, tilesFromKeys } from '../../core/tiles';
import type { GlyphAtlas } from '../../render/font/GlyphAtlas';
import { SceneView } from '../../render/SceneView';
import { isEditableTarget } from '../hooks/useHotkeys';
import { type DocumentState, useDocumentStore } from '../store/documentStore';
import { type EditorState, useEditorStore } from '../store/editorStore';
import { cancelCameraTween, setActiveView, zoomWheelAction } from '../store/viewActions';
import { type PointerInfo, getTool, pickAt } from '../tools';
import { buildToolEnv } from '../tools/env';

type Drag =
  | { readonly kind: 'tool'; readonly pointerId: number }
  | { readonly kind: 'pan'; readonly pointerId: number; lastX: number; lastY: number };

const WHEEL_ZOOM_SPEED = 0.0015;

/** Хост WebGL-сцены. Подписан на сторы напрямую, чтобы не гонять React-рендер на каждое движение мыши. */
export function Viewport({ atlas }: { atlas: GlyphAtlas }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SceneView | null>(null);
  const bufferRef = useRef<CellBuffer | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const tool = useEditorStore((s) => s.tool);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const view = new SceneView(container, atlas);
    viewRef.current = view;
    setActiveView(view);

    /** Черновик (перетаскивание объекта) имеет приоритет над закоммиченным документом. */
    const currentDoc = () => useEditorStore.getState().draft ?? useDocumentStore.getState().doc;

    /** Соседние кадры полупрозрачно под текущим. Во время проигрывания не показываются. */
    const ghostFrames = (): Ghost[] => {
      const editor = useEditorStore.getState();
      if (!editor.onionSkin || editor.isPlaying) return [];
      const { animation, frameIndex } = useDocumentStore.getState();
      const ghosts: Ghost[] = [];
      if (frameIndex > 0) {
        ghosts.push({ doc: frameDocument(animation, frameIndex - 1), opacity: 0.35 });
      }
      if (frameIndex < animation.frames.length - 1) {
        ghosts.push({ doc: frameDocument(animation, frameIndex + 1), opacity: 0.2 });
      }
      return ghosts;
    };

    const recomposite = (dirty?: Iterable<number>): void => {
      const { preview, effectTime } = useEditorStore.getState();
      const doc = currentDoc();
      const ghosts = ghostFrames();
      const previous = bufferRef.current;
      /**
       * Композитор и заливка на GPU обязаны сойтись в том, что считается изменившимся: если
       * пересобрать больше, а залить меньше, на экране останется старое. Поэтому решение
       * принимается один раз и отдаётся обоим.
       */
      const tiles = dirty && previous && canRebuildTiles(doc, ghosts) ? [...dirty] : undefined;
      bufferRef.current = composite(doc, preview, previous ?? undefined, ghosts, effectTime, tiles);
      // Запоминаем при каждой пересборке, а не только на тиках: так проверка ниже не зависит
      // от того, в каком порядке пришли события.
      lastEffects = effectsSignature(doc, effectTime, ghosts);
      view.setBuffer(bufferRef.current, tiles);
    };

    /**
     * Тайлы, задетые сменой превью: и старым штрихом, и новым. Старый нужен обязательно, иначе
     * след предыдущего положения курсора остался бы на экране.
     *
     * null означает «пересобрать всё»: так возвращается всё, кроме чистой смены превью.
     */
    const dirtyFromPreview = (state: EditorState, prev: EditorState | null): number[] | null => {
      if (!prev) return null;
      const onlyPreviewChanged =
        state.draft === prev.draft &&
        state.onionSkin === prev.onionSkin &&
        state.isPlaying === prev.isPlaying &&
        state.effectTime === prev.effectTime;
      if (!onlyPreviewChanged) return null;
      const { doc } = useDocumentStore.getState();
      const layout = tileLayout(doc.width, doc.height);
      const tiles = new Set<number>();
      for (const side of [prev.preview, state.preview]) {
        if (!side) continue;
        for (const tile of tilesFromKeys(layout, side.edits.keys())) tiles.add(tile);
      }
      return [...tiles];
    };

    const syncObjectOutline = (): void => {
      const { selectedObjectId } = useEditorStore.getState();
      const obj = selectedObjectId ? findObject(currentDoc(), selectedObjectId) : undefined;
      view.setObjectOutline(obj ? objectBounds(obj) : null);
    };

    let lastEpoch = -1;
    /** Подпись эффектов на последнем собранном кадре, см. проверку в syncEditor. */
    let lastEffects = '';
    const syncDocument = (state: DocumentState, prev: DocumentState | null): void => {
      if (!prev || state.doc !== prev.doc) {
        view.setDocument(state.doc.width, state.doc.height, state.doc.background);
        recomposite();
        const editor = useEditorStore.getState();
        // После undo, redo или удаления слоя выбранный объект мог исчезнуть.
        if (editor.selectedObjectId && !findObject(state.doc, editor.selectedObjectId)) {
          editor.setSelectedObject(null);
        }
        syncObjectOutline();
      }
      if (state.epoch !== lastEpoch) {
        lastEpoch = state.epoch;
        const editor = useEditorStore.getState();
        // Подгонку откладываем на кадр: на монтировании контейнер ещё может не иметь размера,
        // и тогда fitCamera упёрся бы в минимальный зум вместо настоящего.
        const { width, height } = state.doc;
        requestAnimationFrame(() => {
          if (viewRef.current !== view) return;
          useEditorStore.getState().setCamera(view.fitCamera(width, height));
        });
        editor.setSelection(null);
        editor.setTextCursor(null);
        editor.setPreview(null);
        editor.setDraft(null);
        editor.setSelectedObject(null);
      }
    };

    const syncEditor = (state: EditorState, prev: EditorState | null): void => {
      const onlyClockTicked =
        prev !== null &&
        state.effectTime !== prev.effectTime &&
        state.preview === prev.preview &&
        state.draft === prev.draft &&
        state.onionSkin === prev.onionSkin &&
        state.isPlaying === prev.isPlaying;

      if (
        !prev ||
        state.preview !== prev.preview ||
        state.draft !== prev.draft ||
        state.onionSkin !== prev.onionSkin ||
        state.isPlaying !== prev.isPlaying ||
        state.effectTime !== prev.effectTime
      ) {
        // Часы идут чаще, чем меняется картинка эффектов: тик, который ничего не меняет,
        // не стоит превращать в полную пересборку кадра.
        if (
          onlyClockTicked &&
          effectsSignature(currentDoc(), state.effectTime, ghostFrames()) === lastEffects
        ) {
          return;
        }
        recomposite(dirtyFromPreview(state, prev) ?? undefined);
      }
      if (!prev || state.draft !== prev.draft || state.selectedObjectId !== prev.selectedObjectId) {
        syncObjectOutline();
      }
      if (!prev || state.camera !== prev.camera) view.setCamera(state.camera);
      if (!prev || state.post !== prev.post) view.setPost(state.post);
      if (!prev || state.showGrid !== prev.showGrid) view.setShowGrid(state.showGrid);
      if (!prev || state.workspaceColor !== prev.workspaceColor) {
        view.setWorkspaceColor(state.workspaceColor);
      }
      if (!prev || state.selection !== prev.selection) view.setSelection(state.selection);
      if (
        !prev ||
        state.cursorCell !== prev.cursorCell ||
        state.textCursor !== prev.textCursor ||
        state.tool !== prev.tool
      ) {
        view.setCursor(
          state.tool === 'text' && state.textCursor ? state.textCursor : state.cursorCell,
        );
      }
    };

    syncDocument(useDocumentStore.getState(), null);
    syncEditor(useEditorStore.getState(), null);
    const unsubscribeDoc = useDocumentStore.subscribe(syncDocument);
    const unsubscribeEditor = useEditorStore.subscribe(syncEditor);

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
      unsubscribeDoc();
      unsubscribeEditor();
      setActiveView(null);
      view.dispose();
      viewRef.current = null;
    };
  }, [atlas]);

  const pointerInfo = (event: ReactPointerEvent): PointerInfo | null => {
    const view = viewRef.current;
    const container = containerRef.current;
    if (!view || !container) return null;
    const rect = container.getBoundingClientRect();
    const cell = view.screenToCell(event.clientX - rect.left, event.clientY - rect.top);
    return { cell, button: event.button, shift: event.shiftKey };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current) return;
    // Любое действие на холсте останавливает проигрывание.
    if (useEditorStore.getState().isPlaying) useEditorStore.getState().setPlaying(false);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Синтетические события без активного указателя: захват необязателен.
    }
    if (event.button === 1 || spaceRef.current) {
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
    if (event.altKey) {
      pickAt(buildToolEnv(), info.cell);
      return;
    }
    dragRef.current = { kind: 'tool', pointerId: event.pointerId };
    getTool(useEditorStore.getState().tool).onPointerDown?.(buildToolEnv(), info);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const info = pointerInfo(event);
    if (!info) return;
    const { doc } = useDocumentStore.getState();
    const editor = useEditorStore.getState();
    editor.setCursorCell(
      inBounds(info.cell.x, info.cell.y, doc.width, doc.height) ? info.cell : null,
    );

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === 'pan') {
      // Панорамирование ведёт камеру само: начатый кнопкой переход надо оборвать.
      cancelCameraTween();
      const { camera, setCamera } = editor;
      setCamera({
        ...camera,
        centerX: camera.centerX - (event.clientX - drag.lastX) / camera.zoom,
        centerY: camera.centerY + (event.clientY - drag.lastY) / camera.zoom,
      });
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      return;
    }
    getTool(editor.tool).onPointerMove?.(buildToolEnv(), info);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.kind !== 'tool') return;
    const current = getTool(useEditorStore.getState().tool);
    const info = pointerInfo(event);
    if (cancelled || !info) current.cancel?.(buildToolEnv());
    else current.onPointerUp?.(buildToolEnv(), info);
  };

  return (
    <div
      ref={containerRef}
      className="viewport"
      style={{ cursor: getTool(tool).cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finishDrag(e, false)}
      onPointerCancel={(e) => finishDrag(e, true)}
      onPointerLeave={() => useEditorStore.getState().setCursorCell(null)}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
