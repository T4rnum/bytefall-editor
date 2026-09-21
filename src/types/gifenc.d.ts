/** Минимальная декларация gifenc 1.x: пакет поставляется без типов. */
declare module 'gifenc' {
  export type Palette = number[][];
  export type PixelFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  export interface QuantizeOptions {
    readonly format?: PixelFormat;
    readonly oneBitAlpha?: boolean | number;
    readonly clearAlpha?: boolean;
    readonly clearAlphaThreshold?: number;
    readonly clearAlphaColor?: number;
  }

  export interface FrameOptions {
    readonly palette?: Palette;
    readonly delay?: number;
    readonly repeat?: number;
    readonly transparent?: boolean;
    readonly transparentIndex?: number;
    readonly dispose?: number;
    readonly first?: boolean;
  }

  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): Encoder;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): Palette;
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: PixelFormat,
  ): Uint8Array;
}
