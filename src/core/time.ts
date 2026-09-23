/**
 * Время сцены: миллисекунды от начала, дробные. Секунды показывает интерфейс, а в ядре — те же
 * миллисекунды, что у длительностей кадров и периодов эффектов, без пересчёта на границе.
 */

/** Минута: для анимации из символов с запасом, а экспорт остаётся в разумных размерах. */
export const MAX_SCENE_DURATION = 60_000;
export const MIN_SCENE_DURATION = 20;

export const DEFAULT_FPS = 20;
export const MIN_FPS = 1;
export const MAX_FPS = 60;
/** Частоты, которые предлагает интерфейс. 20 и 50 кадров GIF передаёт без округления задержек. */
export const FPS_PRESETS: readonly number[] = [10, 12, 15, 20, 24, 25, 30, 50, 60];

/**
 * Момент с точностью до микросекунды: без двоичных хвостов в файле, и ключ, привязанный к
 * кадру экспорта, попадает в него ровно, а не на миллиардную долю позже.
 */
export const roundTime = (time: number): number => Math.round(time * 1000) / 1000;

export function clampTime(time: number): number {
  if (!Number.isFinite(time)) return 0;
  return roundTime(Math.min(MAX_SCENE_DURATION, Math.max(0, time)));
}

export function clampFps(fps: number): number {
  if (!Number.isFinite(fps)) return DEFAULT_FPS;
  return Math.round(Math.min(MAX_FPS, Math.max(MIN_FPS, fps)));
}
