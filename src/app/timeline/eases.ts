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

/** Кривая — это несколько готовых характеров, а не четыре числа, которые надо понимать. */
export const EASES: readonly Ease[] = [
  { value: 'step', label: 'Скачком', interpolation: 'step' },
  { value: 'linear', label: 'Равномерно', interpolation: 'linear' },
  { value: 'smooth', label: 'Плавно', interpolation: 'bezier', easing: EASE_IN_OUT },
  { value: 'in', label: 'Разгон', interpolation: 'bezier', easing: EASE_IN },
  { value: 'out', label: 'Торможение', interpolation: 'bezier', easing: EASE_OUT },
  { value: 'back', label: 'С перелётом', interpolation: 'bezier', easing: EASE_BACK },
];

/**
 * Характер выделенных ключей: один на всех или пустая строка, если они разные или среди них
 * своя кривая, которой нет в списке.
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
    values.add(ease?.value ?? '');
  }
  return values.size === 1 ? [...values][0] : '';
}
