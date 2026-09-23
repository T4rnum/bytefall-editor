import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sceneDuration } from '../../../core/timeline';
import { keyTimes } from '../../../core/tracks';
import type { GlyphAtlas } from '../../../render/font/GlyphAtlas';
import { useDocumentStore } from '../../store/documentStore';
import { useUiStore } from '../../store/uiStore';
import { clampScale, fitScale, timelineSpan } from '../../timeline/timelineMath';
import { TimelineBody } from './TimelineBody';
import { TimelineToolbar } from './TimelineToolbar';

/** Колесо с Ctrl меняет масштаб во столько раз за щелчок. */
const WHEEL_ZOOM = 0.0015;

/** Видимое время: сцена, последний ключ и указатель с запасом. */
function useSpan(): number {
  return useDocumentStore((s) => {
    const last = keyTimes(s.animation.tracks).pop() ?? 0;
    return timelineSpan(sceneDuration(s.animation), last, s.time);
  });
}

/**
 * Таймлайн: время сцены в секундах, кадры спрайт-трека на нём и ключи свойств. Масштаб
 * вписывается при открытии документа и по кнопке, Ctrl с колесом меняет его вокруг указателя.
 */
export function TimelinePanel({ atlas }: { readonly atlas: GlyphAtlas }) {
  const height = useUiStore((s) => s.timelineHeight);
  const epoch = useDocumentStore((s) => s.epoch);
  const span = useSpan();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  const fit = useCallback(() => {
    const scroller = scrollerRef.current;
    const labels = scroller?.querySelector('.tl-corner');
    if (!scroller || !labels) return;
    // Ширина под шкалой: вся прокрутка минус колонка подписей и полоса прокрутки.
    const width = scroller.clientWidth - labels.getBoundingClientRect().width - 16;
    const { animation, time } = useDocumentStore.getState();
    const last = keyTimes(animation.tracks).pop() ?? 0;
    setScale(fitScale(width, timelineSpan(sceneDuration(animation), last, time)));
  }, []);

  // Новый документ — новое время: вписываем его целиком, до первой отрисовки.
  useLayoutEffect(fit, [epoch, fit]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const ruler = scroller.querySelector('.tl-ruler');
      if (!ruler) return;
      const x = event.clientX - ruler.getBoundingClientRect().left;
      setScale((old) => {
        const next = clampScale(old * Math.exp(-event.deltaY * WHEEL_ZOOM));
        // Момент под указателем остаётся под указателем.
        scroller.scrollLeft += (x / old) * next - x;
        return next;
      });
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <section className="timeline" style={{ height }} aria-label="Таймлайн">
      <TimelineToolbar onFit={fit} />
      <TimelineBody atlas={atlas} scale={scale} span={span} scrollerRef={scrollerRef} />
    </section>
  );
}
