import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react';
import { type Ghost, effectsSignature } from '../../core/compositor';
import { evaluate } from '../../core/evaluate';
import { type ComposedFrame, composeFrame } from '../../core/frame';
import { inBounds } from '../../core/geometry';
import { canEditObject, findObject } from '../../core/object';
import { objectMatrix, objectQuad } from '../../core/placement';
import { tileLayout, tilesFromKeys } from '../../core/tiles';
import { spriteTiming } from '../../core/timeline';
import type { GlyphAtlas } from '../../render/font/GlyphAtlas';
import { SceneView } from '../../render/SceneView';
import { isEditableTarget } from '../hooks/useHotkeys';
import { notify } from '../store/notifyStore';
import { type DocumentState, useDocumentStore } from '../store/documentStore';
import { type EditorState, useEditorStore } from '../store/editorStore';
import { useUiStore } from '../store/uiStore';
import { cancelCameraTween, setActiveView, zoomWheelAction } from '../store/viewActions';
import { type PointerInfo, getTool, pickAt } from '../tools';
import { buildToolEnv } from '../tools/env';
import { gizmoLayout } from '../tools/gizmo';
import { rigLayout } from '../tools/rig';

type Drag =
  | { readonly kind: 'tool'; readonly pointerId: number }
  | { readonly kind: 'pan'; readonly pointerId: number; lastX: number; lastY: number };

const WHEEL_ZOOM_SPEED = 0.0015;

/** Хост WebGL-сцены. Подписан на сторы напрямую, чтобы не гонять React-рендер на каждое движение мыши. */
export function Viewport({ atlas }: { atlas: GlyphAtlas }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SceneView | null>(null);
  const frameRef = useRef<ComposedFrame | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const tool = useEditorStore((s) => s.tool);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const view = new SceneView(container, atlas);
    viewRef.current = view;
    setActiveView(view);
    // Потеря контекста GPU выглядит как внезапно почерневший холст: без объяснения это пугает.
    view.setContextListener((lost) => {
      if (lost) notify('Контекст GPU потерян, восстанавливаем картинку', 'error');
      else notify('Картинка восстановлена');
    });

    /** Черновик (перетаскивание объекта) имеет приоритет над закоммиченным документом. */
    const currentDoc = () => useEditorStore.getState().draft ?? useDocumentStore.getState().doc;

    /**
     * Соседние кадры спрайт-трека полупрозрачно под текущим: сцена в момент их начала на том же
     * круге, так что и объекты стоят там, где будут. Во время проигрывания не показываются.
     */
    const ghostFrames = (): Ghost[] => {
      const editor = useEditorStore.getState();
      if (!editor.onionSkin || editor.isPlaying) return [];
      const { animation, frameIndex, time } = useDocumentStore.getState();
      const { starts, length } = spriteTiming(animation.frames);
      const loop = Math.floor(time / length) * length;
      const ghosts: Ghost[] = [];
      if (frameIndex > 0) {
        ghosts.push({ doc: evaluate(animation, loop + starts[frameIndex - 1]), opacity: 0.35 });
      }
      if (frameIndex < animation.frames.length - 1) {
        ghosts.push({ doc: evaluate(animation, loop + starts[frameIndex + 1]), opacity: 0.2 });
      }
      return ghosts;
    };

    /**
     * Момент для эффектов. При проигрывании и на паузе без живых эффектов — время сцены, как в
     * экспорте. Живые эффекты на паузе идут по своим часам: огонь горит, пока рисуешь.
     */
    const effectsTime = (): number => {
      const { isPlaying, effectsLive, effectTime } = useEditorStore.getState();
      return !isPlaying && effectsLive ? effectTime : useDocumentStore.getState().time;
    };

    /**
     * Композитор и заливка на GPU обязаны сойтись в том, что считается изменившимся: если
     * пересобрать больше, а залить меньше, на экране останется старое. Поэтому решает только
     * `composeFrame`, а кадр несёт его решение в `dirty` до самой заливки.
     */
    const recomposite = (dirty?: Iterable<number>): void => {
      const { preview } = useEditorStore.getState();
      const doc = currentDoc();
      const ghosts = ghostFrames();
      const time = effectsTime();
      frameRef.current = composeFrame(doc, preview, frameRef.current, ghosts, time, dirty);
      // Запоминаем при каждой пересборке, а не только на тиках: так проверка ниже не зависит
      // от того, в каком порядке пришли события.
      lastEffects = effectsSignature(doc, time, ghosts);
      view.setFrame(frameRef.current);
    };

    /** Время шло, а картинка эффектов та же: пересобирать кадр незачем. */
    const effectsUnchanged = (): boolean =>
      effectsSignature(currentDoc(), effectsTime(), ghostFrames()) === lastEffects;

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

    /**
     * Рамка выбранного объекта, а у инструмента объектов — ещё и ручки трансформа. У кости и
     * контроллера рамки нет: их выделяет сам рисунок рига.
     */
    const syncObjectOutline = (): void => {
      const { selectedObjectId, tool, camera } = useEditorStore.getState();
      const doc = currentDoc();
      const found = selectedObjectId ? findObject(doc, selectedObjectId) : undefined;
      const obj = found?.rig ? undefined : found;
      const world = obj ? objectMatrix(doc, obj) : null;
      view.setObjectOutline(obj && world ? objectQuad(obj, world) : null);
      const gizmo =
        obj && world && tool === 'object' && canEditObject(doc, obj)
          ? gizmoLayout(obj, world, camera.zoom)
          : null;
      view.setGizmo(gizmo && { ...gizmo, handles: gizmo.scale.map((s) => s.at) });
      view.setRig(rigLayout(doc, selectedObjectId, camera.zoom));
    };

    /**
     * Холст, фон и сетка — по тому, что на экране. Черновик может быть другого размера: импорт
     * картинки с подгонкой холста показывает результат ещё до вставки.
     */
    const syncCanvas = (): void => {
      const doc = currentDoc();
      view.setDocument(doc.width, doc.height, doc.background);
    };

    let lastEpoch = -1;
    /** Подпись эффектов на последнем собранном кадре, см. проверку в syncEditor. */
    let lastEffects = '';
    const syncDocument = (state: DocumentState, prev: DocumentState | null): void => {
      if (!prev || state.doc !== prev.doc) {
        syncCanvas();
        // Коммит ячеек знает, что он тронул, и кадр пересобирается только в этих тайлах.
        // Всё остальное — смена кадра, структурная правка, отмена — требует полной пересборки.
        const layout = tileLayout(state.doc.width, state.doc.height);
        const committed = prev && state.dirtyKeys ? tilesFromKeys(layout, state.dirtyKeys) : null;
        recomposite(committed ?? undefined);
        const editor = useEditorStore.getState();
        // После undo, redo или удаления слоя выбранный объект мог исчезнуть.
        if (editor.selectedObjectId && !findObject(state.doc, editor.selectedObjectId)) {
          editor.setSelectedObject(null);
        }
        syncObjectOutline();
      } else if (state.time !== prev.time && !effectsUnchanged()) {
        // Сцена та же, но момент другой: эффекты могли смениться.
        recomposite();
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
        editor.setSelectedKeys([]);
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
        if (onlyClockTicked && effectsUnchanged()) return;
        recomposite(dirtyFromPreview(state, prev) ?? undefined);
      }
      if (prev && state.draft !== prev.draft) syncCanvas();
      if (
        !prev ||
        state.draft !== prev.draft ||
        state.selectedObjectId !== prev.selectedObjectId ||
        state.tool !== prev.tool ||
        state.camera.zoom !== prev.camera.zoom
      ) {
        syncObjectOutline();
      }
      if (!prev || state.camera !== prev.camera) view.setCamera(state.camera);
      if (!prev || state.post !== prev.post) view.setPost(state.post);
      if (!prev || state.showGrid !== prev.showGrid) view.setShowGrid(state.showGrid);
      if (!prev || state.showChecker !== prev.showChecker) view.setShowChecker(state.showChecker);
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
    const world = view.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    // Мир смотрит осью Y вверх, документ — вниз.
    const point = { x: world.x, y: -world.y };
    const cell = { x: Math.floor(point.x), y: Math.floor(point.y) };
    return { cell, point, button: event.button, shift: event.shiftKey, alt: event.altKey };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
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
    tool.onPointerDown?.(buildToolEnv(), info);
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
    if (!drag) {
      // Без нажатой кнопки инструмент подсказывает курсором, что под указателем можно схватить.
      const current = getTool(editor.tool);
      const hover = current.hoverCursor?.(buildToolEnv(), info) ?? null;
      event.currentTarget.style.cursor = hover ?? current.cursor;
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
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
