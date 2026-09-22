import { useEffect, useRef } from 'react';

/** Картинка в пикселях: ширина, высота и RGBA без домножения на альфу, как у ImageData. */
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}

export interface PixelCanvasProps {
  /** Пока картинки нет, остаётся пустое место того же размера: таймлайн не прыгает. */
  readonly image: Pixels | undefined;
  /** Размер на экране в CSS-пикселях. Картинку считают под плотность экрана, так что она чёткая. */
  readonly width: number;
  readonly height: number;
  readonly className?: string;
}

/** Готовые пиксели на холсте. Холст, а не img с data URL: без кодирования в PNG на каждую правку. */
export function PixelCanvas({ image, width, height, className }: PixelCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !image) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas
      .getContext('2d')
      ?.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  }, [image]);

  return <canvas ref={ref} className={className} style={{ width, height }} aria-hidden="true" />;
}
