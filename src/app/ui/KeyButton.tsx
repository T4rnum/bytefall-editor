import { Button } from './Button';

/** Что с анимацией свойства: не анимировано, анимировано, ключ ровно в этот момент. */
export type KeyButtonState = 'none' | 'animated' | 'key';

export interface KeyButtonProps {
  readonly state: KeyButtonState;
  /** Что анимируется, для подсказки: «положение», «непрозрачность». */
  readonly subject: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

const TIPS: Readonly<Record<KeyButtonState, (subject: string) => string>> = {
  none: (s) => `Ключ: ${s} начнёт меняться во времени`,
  animated: (s) => `Ключ: запомнить ${s} в этот момент`,
  key: (s) => `Убрать ключ: ${s} в этот момент`,
};

/**
 * Ромб ключа рядом с полем свойства. Пустой — свойство не анимировано, обведённый акцентом —
 * анимировано, но ключа сейчас нет, залитый — ключ стоит ровно в этот момент.
 */
export function KeyButton({ state, subject, disabled, onClick }: KeyButtonProps) {
  return (
    <Button
      icon
      size="sm"
      className={`key-btn key-btn--${state}`}
      label={TIPS[state](subject)}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="key-glyph" aria-hidden="true" />
    </Button>
  );
}
