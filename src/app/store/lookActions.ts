import { updateObject } from '../../core/object';
import { useDocumentStore } from './documentStore';

/**
 * Непрозрачность и оттенок объекта. Анимированное свойство получает ключ в текущий момент —
 * это решает `commitStructural`. `mergeKey` склеивает записи одного перетаскивания.
 */
export function setObjectLookAction(
  id: string,
  patch: { readonly opacity?: number; readonly tint?: string | null },
  label: string,
  mergeKey?: string,
): void {
  const { doc, commitStructural } = useDocumentStore.getState();
  commitStructural(label, updateObject(doc, id, patch), mergeKey);
}
