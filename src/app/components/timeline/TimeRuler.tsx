import type { PointerEvent as ReactPointerEvent } from 'react';
import { roundTime } from '../../../core/time';
import { useDocumentStore } from '../../store/documentStore';
import { scrubAction } from '../../store/timeActions';
import {
  formatSeconds,
  pxToTime,
  rulerTicks,
  snapTime,
  timeToPx,
} from '../../timeline/timelineMath';
import { snapTargets } from './snapTargets';

interface Props {
  readonly scale: number;
  readonly span: number;
}

/**
 * Линейка времени. Протяжка по ней ведёт указатель: он липнет к началам кадров, ключам и тактам
 * частоты сцены, с Alt — идёт свободно.
 */
export function TimeRuler({ scale, span }: Props) {
  const { major, minor } = rulerTicks(scale, span);

  const scrubTo = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const raw = Math.max(0, pxToTime(event.clientX - rect.left, scale));
    const { animation } = useDocumentStore.getState();
    const time = event.altKey
      ? roundTime(raw)
      : snapTime(raw, snapTargets(animation, animation.tracks, scale, span));
    scrubAction(time);
  };

  return (
    <div
      className="tl-ruler"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Синтетические события без активного указателя: захват необязателен.
        }
        scrubTo(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubTo(event);
      }}
    >
      {minor.map((t) => (
        <span key={`m${t}`} className="tl-tick" style={{ left: timeToPx(t, scale) }} />
      ))}
      {major.map((t) => (
        <span key={`M${t}`} className="tl-tick tl-tick--major" style={{ left: timeToPx(t, scale) }}>
          <span className="tl-tick-label">{formatSeconds(t)}</span>
        </span>
      ))}
    </div>
  );
}
