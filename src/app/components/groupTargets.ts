import { useEditorStore } from '../store/editorStore';

export const OBJECTS = { one: 'объект', few: 'объекта', many: 'объектов' } as const;

/**
 * Кому достанется новая связь или деформер из инспектора: всем выбранным, если объект инспектора
 * среди них и выбрано несколько, иначе ему одному.
 */
export function useGroupTargets(objectId: string): readonly string[] {
  const ids = useEditorStore((s) => s.selectedObjectIds);
  return ids.length > 1 && ids.includes(objectId) ? ids : [objectId];
}
