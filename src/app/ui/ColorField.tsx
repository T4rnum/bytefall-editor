import { Ban, Pipette } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { type FrameThrottle, createFrameThrottle } from './frameThrottle';
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
  /**
   * Новое значение по ходу выбора — не чаще раза в кадр, сколько бы событий ни прислала палитра:
   * системный выбор цвета шлёт их с частотой опроса мыши, и обработка каждого вешала редактор.
   */
  readonly onChange: (value: string | null) => void;
  /**
   * Выбор закончен: палитру отпустили или закрыли, нажали «без цвета», взяли цвет пипеткой.
   * Если правка идёт в историю, писать её надо здесь, иначе одно движение по палитре оставит
   * десятки записей.
   */
  readonly onCommit?: (value: string | null) => void;
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
  onCommit,
  allowNone = false,
  eyedropper = false,
  label,
  size = 'md',
  className,
}: ColorFieldProps) {
  const Dropper = eyedropper ? eyeDropper() : null;
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Цвет, который показывает поле, пока выбор идёт. Наружу он уходит раз в кадр, а поле обязано
   * следовать за курсором сразу: иначе React между кадрами возвращал бы ему старое значение
   * и спорил с палитрой.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const latest = useRef({ onChange, onCommit });
  useLayoutEffect(() => {
    latest.current = { onChange, onCommit };
  });
  const throttle = useRef<FrameThrottle<string> | null>(null);

  // Родное событие change — это конец выбора: React его отдельно не показывает.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const frames = createFrameThrottle<string>((next) => latest.current.onChange(next));
    throttle.current = frames;
    const finish = (): void => {
      frames.flush();
      setDraft(null);
      latest.current.onCommit?.(input.value);
    };
    input.addEventListener('change', finish);
    return () => {
      input.removeEventListener('change', finish);
      frames.cancel();
      throttle.current = null;
    };
  }, []);

  /** Разовая правка — «без цвета» или пипетка: она же сразу и конец выбора. */
  const choose = (next: string | null): void => {
    throttle.current?.cancel();
    setDraft(null);
    onChange(next);
    onCommit?.(next);
  };

  const shown = draft ?? value;

  const pick = async (): Promise<void> => {
    if (!Dropper) return;
    try {
      const result = await new Dropper().open();
      choose(result.sRGBHex);
    } catch {
      // Пользователь нажал Escape: это не ошибка, просто отмена.
    }
  };

  return (
    <div className={`colorfield${className ? ` ${className}` : ''}`}>
      <label
        className={`swatch swatch--${size}${shown === null ? ' swatch--none' : ''}`}
        style={shown === null ? undefined : { background: shown }}
        {...{ [TIP_ATTR]: label }}
      >
        <input
          ref={inputRef}
          type="color"
          aria-label={label}
          value={toInputColor(shown ?? '#000000')}
          onChange={(e) => {
            setDraft(e.target.value);
            throttle.current?.push(e.target.value);
          }}
        />
      </label>
      {allowNone && (
        <Button
          icon
          size="sm"
          label="Без цвета"
          active={value === null}
          onClick={() => choose(null)}
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
