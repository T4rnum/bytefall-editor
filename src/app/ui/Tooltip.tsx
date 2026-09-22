import { useEffect, useState } from 'react';

/** Атрибут, по которому подсказка находит элемент. Ставится любым контролом. */
export const TIP_ATTR = 'data-tip';

/** Задержка перед показом. Достаточно, чтобы подсказка не мелькала при проходе курсора мимо. */
const SHOW_DELAY_MS = 450;
const GAP = 6;

interface Placement {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly below: boolean;
}

function placeFor(element: Element, text: string): Placement {
  const rect = element.getBoundingClientRect();
  // Под элементом, если снизу есть место; иначе над ним.
  const below = rect.bottom + 40 < window.innerHeight;
  return {
    text,
    x: Math.min(Math.max(8, rect.left + rect.width / 2), window.innerWidth - 8),
    y: below ? rect.bottom + GAP : rect.top - GAP,
    below,
  };
}

/**
 * Подсказки для всего приложения. Одна на всех: вместо обёртки вокруг каждой кнопки элементы
 * помечаются атрибутом, а слой сам следит за указателем и фокусом.
 *
 * Своя, а не браузерный `title`, по двум причинам: у браузерной задержка около секунды и её
 * нельзя настроить, и она не показывается при переходе по клавиатуре.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Placement | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const hide = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      setTip(null);
    };

    const show = (target: EventTarget | null, immediate: boolean): void => {
      hide();
      if (!(target instanceof Element)) return;
      const element = target.closest(`[${TIP_ATTR}]`);
      const text = element?.getAttribute(TIP_ATTR);
      if (!element || !text) return;
      const place = (): void => setTip(placeFor(element, text));
      if (immediate) place();
      else timer = setTimeout(place, SHOW_DELAY_MS);
    };

    const onOver = (e: PointerEvent): void => show(e.target, false);
    // По клавиатуре подсказка нужна сразу: пользователь уже выбрал элемент осознанно.
    const onFocus = (e: FocusEvent): void => show(e.target, true);

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      hide();
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      className={`tooltip${tip.below ? '' : ' tooltip--above'}`}
      role="tooltip"
      style={{ left: `${tip.x}px`, top: `${tip.y}px` }}
    >
      {tip.text}
    </div>
  );
}
