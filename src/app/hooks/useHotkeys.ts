import { useEffect } from 'react';
import { findHotkey } from '../hotkeys/registry';
import { useEditorStore } from '../store/editorStore';
import { getTool } from '../tools';
import { buildToolEnv } from '../tools/env';

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Глобальные горячие клавиши. Активный инструмент получает клавиши первым: он может съесть
 * стрелки и Escape, пока ведёт своё взаимодействие. Всё остальное разбирается по реестру
 * из hotkeys/registry.ts, который же рисует справку.
 */
export function useHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      const tool = getTool(useEditorStore.getState().tool);
      if (tool.onKeyDown?.(buildToolEnv(), event)) {
        event.preventDefault();
        return;
      }
      const hotkey = findHotkey(event);
      if (!hotkey) return;
      event.preventDefault();
      hotkey.run();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
