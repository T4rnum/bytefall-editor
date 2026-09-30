import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { emptyGraph } from '../../../core/graph/build';
import { socketType } from '../../../core/graph/edit';
import type { NodeGraph } from '../../../core/graph/types';
import { type SceneObject, findObject } from '../../../core/object';
import { useElementSize } from '../../hooks/useElementSize';
import { focusWithin, isEditableTarget } from '../../hooks/useHotkeys';
import {
  HEADER_HEIGHT,
  NODE_PAD,
  NODE_WIDTH,
  type Point,
  ROW_HEIGHT,
  nodesBounds,
  socketAt,
} from '../../nodes/nodeLayout';
import type { NodePick } from '../../nodes/nodeMenu';
import { type NodeView, fitView, toGraph, toScreen } from '../../nodes/nodeView';
import { useDocumentStore } from '../../store/documentStore';
import { useEditorStore } from '../../store/editorStore';
import { addNodeAction, addPresetAction } from '../../store/graphActions';
import { setActiveNodeEditor } from '../../store/nodeEditorActions';
import { AddNodeMenu } from './AddNodeMenu';
import { NodeBox } from './NodeBox';
import { NodeLinks, type PendingLink } from './NodeLinks';
import { type NodeDrag, useNodeGestures } from './useNodeGestures';

/** Шаг точек сетки поля, в его единицах. */
const GRID = 20;
const ZERO: Point = { x: 0, y: 0 };
const EMPTY = emptyGraph();

/** Размеры узла — в CSS из тех же чисел, по которым считаются гнёзда связей. */
const SIZES = {
  '--node-w': `${NODE_WIDTH}px`,
  '--node-head-h': `${HEADER_HEIGHT}px`,
  '--node-row-h': `${ROW_HEIGHT}px`,
  '--node-pad': `${NODE_PAD}px`,
} as CSSProperties;

/** Граф выбранного объекта прямо сейчас: для команд, которые приходят не из отрисовки. */
function currentGraph(): NodeGraph {
  const id = useEditorStore.getState().selectedObjectId;
  const obj = id ? findObject(useDocumentStore.getState().doc, id) : undefined;
  return obj?.graph ?? EMPTY;
}

/** Связь, которую тянут: от закреплённого гнезда к указателю. */
function pendingOf(graph: NodeGraph, drag: NodeDrag): PendingLink | null {
  if (drag?.kind !== 'link') return null;
  const end = drag.from ?? drag.to;
  const node = end && graph.nodes.find((n) => n.id === end.node);
  if (!node) return null;
  if (drag.from) {
    const at = socketAt(node, 'out', drag.from.out);
    const type = socketType(graph, node.id, drag.from.out, 'out') ?? 'number';
    return at && { from: at, to: drag.at, type };
  }
  const at = drag.to && socketAt(node, 'in', drag.to.in);
  const type = (drag.to && socketType(graph, node.id, drag.to.in, 'in')) ?? 'number';
  return at ? { from: drag.at, to: at, type } : null;
}

/** Точечная сетка поля: шаг и сдвиг следуют за взглядом. */
function gridStyle(view: NodeView): CSSProperties {
  const origin = toScreen(view, ZERO);
  const step = GRID * view.zoom;
  return {
    backgroundSize: `${step}px ${step}px`,
    backgroundPosition: `${origin.x % step}px ${origin.y % step}px`,
  };
}

interface CanvasProps {
  readonly object: SceneObject;
  readonly view: NodeView;
  readonly drag: NodeDrag;
  readonly gestures: ReturnType<typeof useNodeGestures>;
}

/** Поле в единицах графа: провода под узлами, узлы с предпросмотром переноса. */
function NodeCanvas({ object, view, drag, gestures }: CanvasProps) {
  const selectedNodes = useEditorStore((s) => s.selectedNodes);
  const graph = object.graph ?? EMPTY;
  const offsetOf = (id: string): Point =>
    drag?.kind === 'move' && drag.ids.includes(id) ? { x: drag.dx, y: drag.dy } : ZERO;
  return (
    <div
      className="node-canvas"
      style={{ transform: `scale(${view.zoom}) translate(${-view.x}px, ${-view.y}px)` }}
    >
      <NodeLinks
        graph={graph}
        offsetOf={offsetOf}
        hidden={drag?.kind === 'link' ? drag.detached : undefined}
        pending={pendingOf(graph, drag)}
      />
      {graph.nodes.map((node) => (
        <NodeBox
          key={node.id}
          object={object}
          graph={graph}
          node={node}
          selected={selectedNodes.includes(node.id)}
          dx={offsetOf(node.id).x}
          dy={offsetOf(node.id).y}
          onHeadDown={gestures.onHeadDown}
          onSocketDown={gestures.onSocketDown}
        />
      ))}
    </div>
  );
}

/** Рамка выделения поверх поля, в пикселях редактора. */
function SelectBox({ view, drag }: { view: NodeView; drag: NodeDrag }) {
  if (drag?.kind !== 'box') return null;
  const corner = toScreen(view, drag.box);
  const style = {
    left: corner.x,
    top: corner.y,
    width: drag.box.width * view.zoom,
    height: drag.box.height * view.zoom,
  };
  return <div className="node-select-box" style={style} />;
}

/** Меню «Добавить»: где открыто, выбор пункта и возврат фокуса в редактор. */
function useAddMenu(
  object: SceneObject | undefined,
  view: NodeView,
  rootRef: RefObject<HTMLDivElement | null>,
) {
  const [menu, setMenu] = useState<Point | null>(null);
  // Поле поиска уходит вместе с меню: фокус возвращается в редактор, и его клавиши работают.
  const close = (): void => {
    setMenu(null);
    rootRef.current?.focus({ preventScroll: true });
  };
  const pick = (item: NodePick): void => {
    if (!object) return;
    if ('preset' in item) addPresetAction([object.id], item.preset);
    else if (menu) {
      const at = toGraph(view, menu.x, menu.y);
      const id = addNodeAction(object.id, item.node, Math.round(at.x), Math.round(at.y));
      if (id) useEditorStore.getState().setSelectedNodes([id]);
    }
    close();
  };
  return { menu, open: setMenu, close, pick };
}

/**
 * Редактор узлов выбранного объекта: поле с узлами и проводами, как в Blender. Поле
 * масштабируется целиком — узлы вместе с полями ввода, а связи рисуются под узлами. Корень
 * один и тот же и без объекта: по нему меряется поле, и граф вписывается, как только у поля
 * появился размер — панель в другой зоне или в отдельном окне получает его не сразу.
 */
export function NodeEditor() {
  const objectId = useEditorStore((s) => s.selectedObjectId);
  const object = useDocumentStore((s) => (objectId ? findObject(s.doc, objectId) : undefined));
  const rootRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(rootRef);
  const [view, setView] = useState<NodeView>({ x: 0, y: 0, zoom: 1 });
  const graph = object?.graph ?? EMPTY;
  const gestures = useNodeGestures({ rootRef, view, setView, objectId: object?.id ?? null, graph });
  const { drag, pointer } = gestures;
  const add = useAddMenu(object, view, rootRef);
  const ready = size.width > 0 && size.height > 0;

  const fit = useCallback(() => {
    const root = rootRef.current;
    if (root) setView(fitView(nodesBounds(currentGraph()), root.clientWidth, root.clientHeight));
  }, []);

  // Другой объект — другой граф: вписываем его целиком до первой отрисовки.
  useLayoutEffect(() => {
    if (ready) fit();
  }, [objectId, ready, fit]);

  const openMenu = add.open;
  useEffect(() => {
    setActiveNodeEditor({
      fit,
      openAddMenu: () => openMenu({ ...pointer.current }),
      hasFocus: () => focusWithin(rootRef.current),
    });
    return () => setActiveNodeEditor(null);
  }, [fit, pointer, openMenu]);

  const live = object !== undefined;
  return (
    <div
      ref={rootRef}
      className={live ? 'node-editor' : 'node-editor node-editor--empty'}
      tabIndex={live ? 0 : undefined}
      aria-label="Редактор узлов"
      style={live ? { ...SIZES, ...gridStyle(view) } : undefined}
      onPointerDownCapture={(e) => {
        if (live && !isEditableTarget(e.target)) rootRef.current?.focus({ preventScroll: true });
      }}
      onPointerDown={live ? gestures.onBackgroundDown : undefined}
      onPointerMove={live ? gestures.onPointerMove : undefined}
      onPointerUp={live ? gestures.onPointerUp : undefined}
      onPointerCancel={live ? gestures.onPointerCancel : undefined}
    >
      {object ? (
        <>
          <NodeCanvas object={object} view={view} drag={drag} gestures={gestures} />
          <SelectBox view={view} drag={drag} />
          {add.menu && <AddNodeMenu at={add.menu} onPick={add.pick} onClose={add.close} />}
        </>
      ) : (
        <p className="panel-hint">Выбери объект: у каждого объекта свой граф узлов.</p>
      )}
    </div>
  );
}
