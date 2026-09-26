import { useEffect, useRef } from 'react';
import { type Ghost, effectsSignature } from '../../core/compositor';
import { evaluate } from '../../core/evaluate';
import { type ComposedFrame, composeFrame } from '../../core/frame';
import { type SceneObject, canEditObject, findObject } from '../../core/object';
import { existingSelection } from '../../core/objectSelection';
import { objectMatrix, objectQuad } from '../../core/placement';
import { tileLayout, tilesFromKeys } from '../../core/tiles';
import { spriteTiming } from '../../core/timeline';
import type { GlyphAtlas } from '../../render/font/GlyphAtlas';
import { SceneView } from '../../render/SceneView';
import { notify } from '../store/notifyStore';
import { type DocumentState, useDocumentStore } from '../store/documentStore';
import { type EditorState, useEditorStore } from '../store/editorStore';
import { setActiveView } from '../store/viewActions';
import { getTool } from '../tools';
import { canvasMarks, editMarks, marksChanged } from './editMarks';
import { type Drag, useViewportPointer } from './useViewportPointer';
import { gizmoLayout } from '../tools/gizmo';
import { rigLayout } from '../tools/rig';

/** Хост WebGL-сцены. Подписан на сторы напрямую, чтобы не гонять React-рендер на каждое движение мыши. */
export function Viewport({ atlas }: { atlas: GlyphAtlas }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SceneView | null>(null);
  const frameRef = useRef<ComposedFrame | null>(null);
  const dragRef = useRef<Drag | null>(null);
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
     * Рамки выбранных объектов, а у инструмента объектов — ещё и ручки трансформа, если выбран
     * один. У кости и контроллера рамки нет: их выделяет сам рисунок рига.
     */
    const syncObjectOutline = (): void => {
      const { selectedObjectId, selectedObjectIds, tool, camera } = useEditorStore.getState();
      const doc = currentDoc();
      const framed = selectedObjectIds
        .map((id) => findObject(doc, id))
        .filter((o): o is SceneObject => o !== undefined && o.rig === null);
      view.setObjectOutlines(framed.map((o) => objectQuad(o, objectMatrix(doc, o))));
      const found = selectedObjectId ? findObject(doc, selectedObjectId) : undefined;
      const obj = found?.rig || selectedObjectIds.length > 1 ? undefined : found;
      const world = obj ? objectMatrix(doc, obj) : null;
      const gizmo =
        obj && world && tool === 'object' && canEditObject(doc, obj)
          ? gizmoLayout(obj, world, camera.zoom)
          : null;
      view.setGizmo(gizmo && { ...gizmo, handles: gizmo.scale.map((s) => s.at) });
      view.setRig(rigLayout(doc, selectedObjectId, camera.zoom));
    };

    /** Графика правки изнутри и инструмента «Холст» — по тому, что на экране. */
    const syncEditMarks = (): void => {
      const editor = useEditorStore.getState();
      const doc = currentDoc();
      const time = useDocumentStore.getState().time;
      view.setEditMarks(editMarks(doc, editor, time), canvasMarks(doc, editor));
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
        // После undo, redo или удаления слоя выбранные объекты могли исчезнуть.
        const alive = existingSelection(state.doc, editor.selectedObjectIds);
        if (alive.length !== editor.selectedObjectIds.length) editor.setSelectedObjects(alive);
        syncObjectOutline();
        syncEditMarks();
      } else if (state.time !== prev.time && !effectsUnchanged()) {
        // Сцена та же, но момент другой: эффекты могли смениться.
        recomposite();
      }
      // Символы деформированного объекта в правке движутся со временем, а с ними и их рамки.
      if (prev && state.time !== prev.time) syncEditMarks();
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
        state.selectedObjectIds !== prev.selectedObjectIds ||
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
        state.tool !== prev.tool ||
        state.editingObjectId !== prev.editingObjectId
      ) {
        // В правке изнутри клетку под указателем рисующего инструмента показывает сетка объекта.
        const inObject = state.editingObjectId !== null && getTool(state.tool).drawsCells;
        view.setCursor(
          inObject
            ? null
            : state.tool === 'text' && state.textCursor
              ? state.textCursor
              : state.cursorCell,
        );
      }
      if (!prev || marksChanged(state, prev)) syncEditMarks();
    };

    syncDocument(useDocumentStore.getState(), null);
    syncEditor(useEditorStore.getState(), null);
    const unsubscribeDoc = useDocumentStore.subscribe(syncDocument);
    const unsubscribeEditor = useEditorStore.subscribe(syncEditor);

    return () => {
      unsubscribeDoc();
      unsubscribeEditor();
      setActiveView(null);
      view.dispose();
      viewRef.current = null;
    };
  }, [atlas]);

  const pointer = useViewportPointer({ viewRef, containerRef, dragRef });

  return (
    <div
      ref={containerRef}
      className="viewport"
      style={{ cursor: getTool(tool).cursor }}
      onPointerDown={pointer.down}
      onPointerMove={pointer.move}
      onPointerUp={(e) => pointer.finish(e, false)}
      onPointerCancel={(e) => pointer.finish(e, true)}
      onPointerLeave={pointer.leave}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
