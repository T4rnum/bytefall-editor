import { Ban, Pipette } from 'lucide-react';
import { Button } from './Button';
import { TIP_ATTR } from './Tooltip';

/**
 * Системная пипетка. Есть только в Chromium, поэтому кнопка появляется, лишь когда она доступна:
 * рисовать неработающий контрол хуже, чем не рисовать его вовсе.
 */
interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>;
}
type EyeDropperCtor = new () => EyeDropperApi;

const eyeDropper = (): EyeDropperCtor | null => {
  const ctor = (globalThis as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  return typeof ctor === 'function' ? ctor : null;
};

/** input[type=color] понимает только #rrggbb, альфу и короткую запись он не принимает. */
function toInputColor(hex: string): string {
  if (/^#[0-9a-f]{3,4}$/i.test(hex)) {
    const digits = [...hex.slice(1, 4)].map((c) => c + c).join('');
    return `#${digits}`;
  }
  return hex.slice(0, 7);
}

export interface ColorFieldProps {
  /** null означает «нет цвета»: прозрачный фон ячейки или прозрачный холст. */
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
  /** Разрешать состояние «нет цвета» и показывать кнопку сброса. */
  readonly allowNone?: boolean;
  /** Показывать кнопку системной пипетки, если браузер её поддерживает. */
  readonly eyedropper?: boolean;
  readonly label: string;
  /** Крупный образец для основных цветов, мелкий для второстепенных настроек. */
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}

/**
 * Образец цвета: щелчок открывает системный выбор. Отдельный контрол, потому что этот набор
 * из образца, сброса в прозрачность и пипетки повторяется у цвета символа, цвета фона и холста.
 */
export function ColorField({
  value,
  onChange,
  allowNone = false,
  eyedropper = false,
  label,
  size = 'md',
  className,
}: ColorFieldProps) {
  const Dropper = eyedropper ? eyeDropper() : null;

  const pick = async (): Promise<void> => {
    if (!Dropper) return;
    try {
      const result = await new Dropper().open();
      onChange(result.sRGBHex);
    } catch {
      // Пользователь нажал Escape: это не ошибка, просто отмена.
    }
  };

  return (
    <div className={`colorfield${className ? ` ${className}` : ''}`}>
      <label
        className={`swatch swatch--${size}${value === null ? ' swatch--none' : ''}`}
        style={value === null ? undefined : { background: value }}
        {...{ [TIP_ATTR]: label }}
      >
        <input
          type="color"
          aria-label={label}
          value={toInputColor(value ?? '#000000')}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {allowNone && (
        <Button
          icon
          size="sm"
          label="Без цвета"
          active={value === null}
          onClick={() => onChange(null)}
        >
          <Ban size={14} />
        </Button>
      )}
      {Dropper && (
        <Button icon size="sm" label="Взять цвет с экрана" onClick={() => void pick()}>
          <Pipette size={14} />
        </Button>
      )}
    </div>
  );
}
