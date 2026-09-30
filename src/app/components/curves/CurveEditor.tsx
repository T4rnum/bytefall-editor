import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sceneDuration } from '../../../core/timeline';
import type { KeyRef } from '../../../core/tracks';
import {
  type ChannelScale,
  type CurveChannel,
  NO_SCALE,
  channelScale,
  curveBounds,
  toAxis,
} from '../../curves/curveChannels';
import {
  type HandlePoint,
  type KeyPoint,
  type MapOf,
  type ScreenMap,
  channelPath,
  handlePoints,
  keyPoints,
} from '../../curves/curveGeometry';
import {
  type CurveView,
  type Size,
  fitCurves,
  formatValue,
  niceStep,
  ticksIn,
  toScreen,
} from '../../curves/curveView';
import { useElementSize } from '../../hooks/useElementSize';
import { focusWithin, isEditableTarget } from '../../hooks/useHotkeys';
import { setActiveCurveEditor } from '../../store/curveActions';
import { useDocumentStore } from '../../store/documentStore';
import { useEditorStore } from '../../store/editorStore';
import { formatSeconds } from '../../timeline/timelineMath';
import { RULER, allKeyRefs, useCurveGestures } from './useCurveGestures';

const refId = (r: KeyRef): string => `${r.track}@${r.time}`;

interface GridProps {
  readonly view: CurveView;
  readonly plot: Size;
  readonly map: ScreenMap;
}

/** Деления времени с подписями в полосе сверху, деления значений с подписями слева. */
function CurveGrid({ view, plot, map }: GridProps) {
  const tStep = niceStep(view.t1 - view.t0, plot.width, 72);
  const vStep = niceStep(view.v1 - view.v0, plot.height, 28);
  const times = ticksIn(view.t0, view.t1, tStep);
  const values = ticksIn(view.v0, view.v1, vStep);
  const bottom = RULER + plot.height;
  return (
    <g className="curve-grid">
      {times.map((t) => {
        const x = map(t, 0).x;
        return (
          <g key={`t${t}`}>
            <line x1={x} x2={x} y1={RULER} y2={bottom} className="curve-grid-line" />
            <text x={x + 3} y={RULER - 6} className="curve-grid-label">
              {formatSeconds(t)}
            </text>
          </g>
        );
      })}
      {values.map((v) => {
        const y = map(0, v).y;
        return (
          <g key={`v${v}`}>
            <line
              x1={0}
              x2={plot.width}
              y1={y}
              y2={y}
              className={v === 0 ? 'curve-zero-line' : 'curve-grid-line'}
            />
            <text x={4} y={y - 3} className="curve-grid-label">
              {formatValue(v, vStep)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Указатель времени и затемнение за концом сцены. */
function CurveTime({ plot, map }: { readonly plot: Size; readonly map: ScreenMap }) {
  const time = useDocumentStore((s) => s.time);
  const end = useDocumentStore((s) => sceneDuration(s.animation));
  const x = map(time, 0).x;
  const endX = Math.max(0, map(end, 0).x);
  return (
    <g>
      {endX < plot.width && (
        <rect
          x={endX}
          y={RULER}
          width={plot.width - endX}
          height={plot.height}
          className="curve-outside"
        />
      )}
      <line x1={x} x2={x} y1={0} y2={RULER + plot.height} className="curve-playhead" />
    </g>
  );
}

interface CurvesProps {
  readonly channels: readonly CurveChannel[];
  readonly keys: readonly KeyPoint[];
  readonly handles: readonly HandlePoint[];
  readonly selected: ReadonlySet<string>;
  readonly mapOf: MapOf;
  readonly view: CurveView;
}

/** Кривые каналов, ручки выделенных ключей и точки ключей поверх. */
function CurveLayer({ channels, keys, handles, selected, mapOf, view }: CurvesProps) {
  return (
    <g>
      {channels.map((c) => (
        <path
          key={c.id}
          d={channelPath(c, mapOf(c), view.t0, view.t1)}
          className="curve-path"
          style={{ stroke: c.color }}
        />
      ))}
      {handles.map((h) => (
        <g key={`${h.channel.id}:${h.time}:${h.side}`} style={{ color: h.channel.color }}>
          <line x1={h.anchor.x} y1={h.anchor.y} x2={h.x} y2={h.y} className="curve-handle-line" />
          <circle cx={h.x} cy={h.y} r={3.5} className="curve-handle" />
        </g>
      ))}
      {keys.map((k) => (
        <rect
          key={`${k.channel.id}@${k.ref.time}`}
          x={k.x - 4}
          y={k.y - 4}
          width={8}
          height={8}
          transform={`rotate(45 ${k.x} ${k.y})`}
          className={`curve-key${selected.has(refId(k.ref)) ? ' is-selected' : ''}`}
          style={{ color: k.channel.color }}
        />
      ))}
    </g>
  );
}

type Scales = ReadonlyMap<string, ChannelScale>;

/** Нормировка каналов: с ней у каждой кривой свой размах −1…1, без неё — пусто. */
const scalesOf = (channels: readonly CurveChannel[], normalized: boolean): Scales =>
  new Map(normalized ? channels.map((c) => [c.id, channelScale(c)]) : []);

interface EditorProps {
  readonly channels: readonly CurveChannel[];
  /** Меняется, когда показ сменился целиком — другие объекты, все треки: кривые вписываются. */
  readonly fitKey: string;
  readonly normalized: boolean;
}

/**
 * Редактор кривых: значения каналов во времени, как Graph Editor в Blender. Ручки у
 * выделенных ключей — опоры кривой перехода (`docs/DESIGN.md`, раздел 4.2).
 */
export function CurveEditor({ channels, fitKey, normalized }: EditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(rootRef);
  const plot = useMemo(
    () => ({ width: Math.max(1, size.width), height: Math.max(1, size.height - RULER) }),
    [size],
  );
  const [view, setView] = useState<CurveView>({ t0: 0, t1: 2000, v0: -1, v1: 1 });
  const selectedKeys = useEditorStore((s) => s.selectedKeys);
  const selected = useMemo(() => new Set(selectedKeys.map(refId)), [selectedKeys]);
  const fresh = useMemo(() => scalesOf(channels, normalized), [channels, normalized]);
  // Пока идёт жест, нормировка замирает: иначе кривая уезжала бы из-под мыши, пока её тянут.
  const [frozen, setFrozen] = useState<Scales | null>(null);
  const scales = frozen ?? fresh;
  const scaleOf = (c: CurveChannel): ChannelScale => scales.get(c.id) ?? NO_SCALE;
  const map: ScreenMap = (t, v) => {
    const p = toScreen(view, plot, t, v);
    return { x: p.x, y: p.y + RULER };
  };
  const mapOf: MapOf = (c) => (t, v) => map(t, toAxis(scaleOf(c), v));
  const keys = keyPoints(channels, mapOf);
  const handles = handlePoints(channels, selectedKeys, mapOf);
  const frame = { view, plot, channels, keys, handles, scaleOf };
  const gestures = useCurveGestures(rootRef, frame, setView);

  const ready = size.width > 0 && size.height > RULER;
  const fitNow = (): void => setView(fitCurves(curveBounds(channels, scaleOf), plot));
  const selectAll = (): void => useEditorStore.getState().setSelectedKeys(allKeyRefs(channels));
  const fitRef = useRef(fitNow);
  const selectRef = useRef(selectAll);
  useLayoutEffect(() => {
    fitRef.current = fitNow;
    selectRef.current = selectAll;
  });
  useLayoutEffect(() => {
    if (ready) fitRef.current();
  }, [fitKey, normalized, ready]);

  useEffect(() => {
    setActiveCurveEditor({
      fit: () => fitRef.current(),
      selectAll: () => selectRef.current(),
      hasFocus: () => focusWithin(rootRef.current),
    });
    return () => setActiveCurveEditor(null);
  }, []);

  const box = gestures.box;
  return (
    <div
      ref={rootRef}
      className="curve-editor"
      tabIndex={0}
      aria-label="Редактор кривых"
      onPointerDownCapture={(e) => {
        if (!isEditableTarget(e.target)) rootRef.current?.focus({ preventScroll: true });
      }}
      onPointerDown={(e) => {
        setFrozen(scales);
        gestures.onPointerDown(e);
      }}
      onPointerMove={gestures.onPointerMove}
      onPointerUp={() => {
        setFrozen(null);
        gestures.onPointerUp();
      }}
      onPointerCancel={() => {
        setFrozen(null);
        gestures.onPointerCancel();
      }}
    >
      {ready && (
        <svg width={size.width} height={size.height} className="curve-svg">
          <rect x={0} y={0} width={size.width} height={RULER} className="curve-ruler" />
          <CurveGrid view={view} plot={plot} map={map} />
          <CurveTime plot={plot} map={map} />
          <CurveLayer
            channels={channels}
            keys={keys}
            handles={handles}
            selected={selected}
            mapOf={mapOf}
            view={view}
          />
          {box && <rect x={box.x} y={box.y} width={box.w} height={box.h} className="curve-box" />}
        </svg>
      )}
    </div>
  );
}
