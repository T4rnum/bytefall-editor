import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Атрибут, по которому подсказка находит элемент. Ставится любым контролом. */
export const TIP_ATTR = 'data-tip';

/** Задержка перед показом. Достаточно, чтобы подсказка не мелькала при проходе курсора мимо. */
const SHOW_DELAY_MS = 450;
/** Зазор между элементом и подсказкой и минимальный отступ от края окна. */
const GAP = 6;
const MARGIN = 8;

interface Anchor {
  readonly text: string;
  readonly rect: DOMRect;
}

/**
 * Подсказки для всего приложения. Одна на всех: вместо обёртки вокруг каждой кнопки элементы
 * помечаются атрибутом, а слой сам следит за указателем и фокусом.
 *
 * Своя, а не браузерный `title`, по двум причинам: у браузерной задержка около секунды и её
 * нельзя настроить, и она не показывается при переходе по клавиатуре.
 */
export function TooltipLayer() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const hide = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      setAnchor(null);
    };

    const show = (target: EventTarget | null, immediate: boolean): void => {
      hide();
      if (!(target instanceof Element)) return;
      const element = target.closest(`[${TIP_ATTR}]`);
      const text = element?.getAttribute(TIP_ATTR);
      if (!element || !text) return;
      const open = (): void => setAnchor({ text, rect: element.getBoundingClientRect() });
      if (immediate) open();
      else timer = setTimeout(open, SHOW_DELAY_MS);
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
    window.addEventListener('resize', hide);
    return () => {
      hide();
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
      window.removeEventListener('resize', hide);
    };
  }, []);

  /**
   * Место считается после отрисовки: пока подсказка не измерена, неизвестно, влезет ли она под
   * элементом и не вылезет ли за край окна. Пишем прямо в стиль, а не в состояние: это
   * измерение, а не данные, и лишняя перерисовка тут ни к чему. До измерения подсказка
   * невидима, поэтому мигания в углу экрана не видно.
   */
  useLayoutEffect(() => {
    const element = ref.current;
    if (!anchor || !element) return;
    const { width, height } = element.getBoundingClientRect();
    const rect = anchor.rect;
    const below = rect.bottom + GAP + height <= window.innerHeight - MARGIN;
    const centred = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(
      Math.max(MARGIN, centred),
      Math.max(MARGIN, window.innerWidth - MARGIN - width),
    );
    const top = below ? rect.bottom + GAP : Math.max(MARGIN, rect.top - GAP - height);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.visibility = 'visible';
  }, [anchor]);

  if (!anchor) return null;
  return (
    <div
      ref={ref}
      className="tooltip"
      role="tooltip"
      style={{ left: 0, top: 0, visibility: 'hidden' }}
    >
      {anchor.text}
    </div>
  );
}
