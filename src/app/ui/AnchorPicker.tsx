import type { ResizeAnchor } from '../../core/document';

/** Порядок строк и столбцов совпадает с тем, что видит глаз: слева направо, сверху вниз. */
const ANCHORS: readonly (readonly ResizeAnchor[])[] = [
  ['top-left', 'top', 'top-right'],
  ['left', 'center', 'right'],
  ['bottom-left', 'bottom', 'bottom-right'],
];

const LABELS: Readonly<Record<ResizeAnchor, string>> = {
  'top-left': 'Сверху слева',
  top: 'Сверху',
  'top-right': 'Сверху справа',
  left: 'Слева',
  center: 'По центру',
  right: 'Справа',
  'bottom-left': 'Снизу слева',
  bottom: 'Снизу',
  'bottom-right': 'Снизу справа',
};

export interface AnchorPickerProps {
  readonly value: ResizeAnchor;
  readonly onChange: (value: ResizeAnchor) => void;
  readonly ariaLabel: string;
}

/**
 * Сетка три на три: где окажется прежнее содержимое на новом холсте. Выбранная клетка залита —
 * стрелок вокруг неё, как в фотошопе, не рисуем: рядом стоит предпросмотр, и он нагляднее.
 */
export function AnchorPicker({ value, onChange, ariaLabel }: AnchorPickerProps) {
  return (
    <div className="anchor-picker" role="radiogroup" aria-label={ariaLabel}>
      {ANCHORS.flat().map((anchor) => (
        <button
          key={anchor}
          type="button"
          role="radio"
          aria-checked={anchor === value}
          aria-label={LABELS[anchor]}
          title={LABELS[anchor]}
          className={`anchor-cell${anchor === value ? ' is-active' : ''}`}
          onClick={() => onChange(anchor)}
        />
      ))}
    </div>
  );
}
