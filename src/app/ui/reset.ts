/**
 * Сброс параметра для `Field`: есть, только когда значение отличается от значения по умолчанию.
 * Тогда рядом с подписью появляется кнопка, и она ставит значение по умолчанию одной правкой.
 */
export function resetTo<T>(
  value: T,
  initial: T,
  apply: (initial: T) => void,
): (() => void) | undefined {
  return Object.is(value, initial) ? undefined : () => apply(initial);
}
