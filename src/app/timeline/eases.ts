import {
  EASE_BACK,
  EASE_IN,
  EASE_IN_OUT,
  EASE_OUT,
  type Easing,
  sameEasing,
} from '../../core/easing';
import {
  type Interpolation,
  type KeyRef,
  type Track,
  keyIndexAt,
  trackKey,
} from '../../core/tracks';

/** Характер перехода от ключа к следующему, каким его выбирает пользователь. */
export interface Ease {
  readonly value: string;
  readonly label: string;
  readonly interpolation: Interpolation;
  /** Кривая для `bezier`. */
  readonly easing?: Easing;
}

/**
 * Готовые характеры — начало, а не предел: свою кривую ставят ручками в редакторе кривых (G).
 * Такой ключ показывается как «Своя кривая».
 */
/** Значение выбора у ключа с кривой, которой нет среди готовых. */
export const CUSTOM_EASE = 'custom';

export const EASES: readonly Ease[] = [
  { value: 'step', label: 'Скачком', interpolation: 'step' },
  { value: 'linear', label: 'Равномерно', interpolation: 'linear' },
  { value: 'smooth', label: 'Плавно', interpolation: 'bezier', easing: EASE_IN_OUT },
  { value: 'in', label: 'Разгон', interpolation: 'bezier', easing: EASE_IN },
  { value: 'out', label: 'Торможение', interpolation: 'bezier', easing: EASE_OUT },
  { value: 'back', label: 'С перелётом', interpolation: 'bezier', easing: EASE_BACK },
];

/**
 * Характер выделенных ключей: один на всех, `CUSTOM_EASE` — у всех своя кривая, пустая
 * строка — характеры разные.
 */
export function selectedEase(tracks: readonly Track[], refs: readonly KeyRef[]): string {
  const values = new Set<string>();
  for (const ref of refs) {
    const track = tracks.find((t) => trackKey(t) === ref.track);
    const key = track?.keys[keyIndexAt(track.keys, ref.time)];
    if (!key) continue;
    const ease = EASES.find(
      (e) =>
        e.interpolation === key.interpolation && (!e.easing || sameEasing(e.easing, key.easing)),
    );
    values.add(ease?.value ?? CUSTOM_EASE);
  }
  return values.size === 1 ? [...values][0] : '';
}
