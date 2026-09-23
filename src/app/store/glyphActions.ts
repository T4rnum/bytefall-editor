import type { Document } from '../../core/document';
import type { CellKey } from '../../core/grid';
import { type SceneObject, canEditObject, findObject } from '../../core/object';
import { glyphsInSelection, updateGlyphOverrides } from '../../core/overrides';
import { objectMatrix } from '../../core/placement';
import type { Selection } from '../../core/selection';
import type { GlyphOverride } from '../../core/transform';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { notify } from './notifyStore';

export interface SelectedGlyphs {
  readonly object: SceneObject;
  /** Локальные ключи символов объекта, видимых в выделенных ячейках. */
  readonly keys: readonly CellKey[];
}

/**
 * Символы выбранного объекта под текущим выделением. Выделение и объект живут отдельно: символы
 * выделяют той же рамкой, лассо или палочкой, что и ячейки, а объект выбирают инструментом
 * объектов. Вместе они и дают «эти символы этого объекта».
 */
export function glyphsOf(
  doc: Document,
  selectedObjectId: string | null,
  selection: Selection | null,
): SelectedGlyphs | null {
  if (!selection || !selectedObjectId) return null;
  const object = findObject(doc, selectedObjectId);
  if (!object) return null;
  const keys = glyphsInSelection(object, objectMatrix(doc, object), selection);
  return keys.length > 0 ? { object, keys } : null;
}

export function selectedGlyphs(): SelectedGlyphs | null {
  const { selectedObjectId, selection } = useEditorStore.getState();
  return glyphsOf(useDocumentStore.getState().doc, selectedObjectId, selection);
}

/**
 * Правит выбранные символы. `update` получает текущую правку символа и возвращает новую, поэтому
 * поворот клавишей доворачивает каждый символ от его собственного угла. `mergeKey` склеивает
 * записи одного жеста в поле инспектора.
 */
export function editGlyphsAction(
  glyphs: SelectedGlyphs,
  update: (current: Required<GlyphOverride>) => GlyphOverride,
  label: string,
  mergeKey?: string,
): void {
  const { doc, commitStructural } = useDocumentStore.getState();
  if (!canEditObject(doc, glyphs.object)) {
    notify('Объект или его слой заперт', 'error');
    return;
  }
  commitStructural(
    label,
    updateGlyphOverrides(doc, glyphs.object.id, glyphs.keys, update),
    mergeKey,
  );
}
