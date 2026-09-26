import type { Document } from '../../core/document';
import type { CellKey } from '../../core/grid';
import { type SceneObject, canEditObject, findObject } from '../../core/object';
import { updateGlyphOverrides } from '../../core/overrides';
import type { GlyphOverride } from '../../core/transform';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { notify } from './notifyStore';

export interface SelectedGlyphs {
  readonly object: SceneObject;
  /** Ключи выделенных символов — ячейки объекта. */
  readonly keys: readonly CellKey[];
}

/**
 * Выделенные символы объекта в правке изнутри (Tab): их выделяют рамкой, лассо или палочкой там,
 * где их видно. Вне правки выделенных символов нет, и правка ложится на объект целиком.
 */
export function glyphsOf(
  doc: Document,
  editingObjectId: string | null,
  glyphSelection: readonly CellKey[],
): SelectedGlyphs | null {
  if (!editingObjectId) return null;
  const object = findObject(doc, editingObjectId);
  if (!object) return null;
  const keys = glyphSelection.filter((k) => object.cells.has(k));
  return keys.length > 0 ? { object, keys } : null;
}

export function selectedGlyphs(): SelectedGlyphs | null {
  const { editingObjectId, glyphSelection } = useEditorStore.getState();
  return glyphsOf(useDocumentStore.getState().doc, editingObjectId, glyphSelection);
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
