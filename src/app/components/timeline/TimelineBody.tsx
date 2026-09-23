import { type CSSProperties, Fragment, type RefObject, useMemo } from 'react';
import type { GlyphAtlas } from '../../../render/font/GlyphAtlas';
import { frameDocument } from '../../../core/animation';
import { sceneDuration } from '../../../core/timeline';
import { useKeyState } from '../../hooks/useKeyState';
import { useDocumentStore } from '../../store/documentStore';
import { useEditorStore } from '../../store/editorStore';
import { toggleKeyAction } from '../../store/keyActions';
import { type TimelineRow, timelineRows } from '../../timeline/timelineRows';
import { KeyButton } from '../../ui';
import { SpriteLane } from './SpriteLane';
import { TimeRuler } from './TimeRuler';
import { TrackLane } from './TrackLane';
import { useKeyGestures } from './useKeyGestures';

interface Props {
  readonly atlas: GlyphAtlas;
  readonly scale: number;
  readonly span: number;
  readonly scrollerRef: RefObject<HTMLDivElement | null>;
}

function TrackLabel({ row }: { readonly row: Extract<TimelineRow, { kind: 'track' }> }) {
  const state = useKeyState(row.target);
  return (
    <div className="tl-label">
      <span className="tl-label-text">{row.label}</span>
      <KeyButton state={state} subject={row.subject} onClick={() => toggleKeyAction(row.target)} />
    </div>
  );
}

/** Указатель времени и затенение после конца сцены поверх всех строк. */
function Overlay({ scale, span }: { readonly scale: number; readonly span: number }) {
  const time = useDocumentStore((s) => s.time);
  const end = useDocumentStore((s) => sceneDuration(s.animation));
  return (
    <div className="tl-overlay" aria-hidden="true">
      {end < span && (
        <div className="tl-after-end" style={{ left: end * scale }} title="После конца сцены" />
      )}
      <div className="tl-playhead" style={{ left: time * scale }} />
    </div>
  );
}

/**
 * Строки таймлайна на общей шкале: линейка, спрайт-трек и свойства с ключами. Подписи прилипают
 * к левому краю, линейка — к верхнему, всё остальное прокручивается вместе.
 */
export function TimelineBody({ atlas, scale, span, scrollerRef }: Props) {
  const animation = useDocumentStore((s) => s.animation);
  const frameIndex = useDocumentStore((s) => s.frameIndex);
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId);
  // Строкам нужны только имена и состав узлов, а их треки не меняют: кадр как есть, без
  // вычисления, — и таймлайн не перерисовывается на каждый такт проигрывания.
  const rows = useMemo(
    () => timelineRows(animation, frameDocument(animation, frameIndex), selectedObjectId),
    [animation, frameIndex, selectedObjectId],
  );
  const gestures = useKeyGestures(scale, span);
  const style = { '--tl-content-w': `${Math.ceil(span * scale)}px` } as CSSProperties;

  return (
    <div className="timeline-body" ref={scrollerRef}>
      <div
        className="timeline-grid"
        style={style}
        onPointerDown={gestures.onPointerDown}
        onPointerMove={gestures.onPointerMove}
        onPointerUp={gestures.onPointerUp}
        onPointerCancel={gestures.onPointerUp}
      >
        <div className="tl-corner" />
        <TimeRuler scale={scale} span={span} />
        <div className="tl-label tl-label--sprite">Кадры</div>
        <SpriteLane atlas={atlas} scale={scale} span={span} />
        {rows.map((row) =>
          row.kind === 'node' ? (
            <Fragment key={row.key}>
              <div className="tl-label tl-label--node">{row.label}</div>
              <div className="tl-lane tl-lane--node" />
            </Fragment>
          ) : (
            <Fragment key={row.key}>
              <TrackLabel row={row} />
              <TrackLane track={row.track} scale={scale} />
            </Fragment>
          ),
        )}
        <Overlay scale={scale} span={span} />
        {gestures.box && (
          <div
            className="tl-box"
            style={{
              left: gestures.box.x,
              top: gestures.box.y,
              width: gestures.box.w,
              height: gestures.box.h,
            }}
          />
        )}
      </div>
      {rows.length === 0 && (
        <p className="tl-hint">
          Выбери объект и поставь ключ ромбом или клавишей K: свойства объекта появятся здесь
        </p>
      )}
    </div>
  );
}
