import { type RefObject, useLayoutEffect, useState } from 'react';

export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Размер элемента в пикселях, живой: панель тянут за край, и то, что рисуется по размеру, —
 * поле кривых — перестраивается сразу. До первой раскладки размер нулевой.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
