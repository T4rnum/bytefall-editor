/**
 * Куда встанет элемент списка, брошенный на строку `over`: перед ней (`before`) или после. Индексы
 * в порядке строк на экране; ответ — позиция после «вынуть и вставить», как у `splice`.
 * Строки ниже вынутой сдвигаются вверх на одну, отсюда поправка при `from < over`.
 */
export function reorderIndex(from: number, over: number, before: boolean): number {
  if (from === over) return from;
  if (before) return from < over ? over - 1 : over;
  return from < over ? over : over + 1;
}

/** Бросили в верхнюю половину строки — значит, перед ней. */
export function dropsBefore(clientY: number, rect: { top: number; height: number }): boolean {
  return clientY < rect.top + rect.height / 2;
}
