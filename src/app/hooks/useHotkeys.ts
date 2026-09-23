import { useEffect } from 'react';
import { findHotkey } from '../hotkeys/registry';
import { useEditorStore } from '../store/editorStore';
import { closeImageImport } from '../store/importActions';
import { useUiStore } from '../store/uiStore';
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
 * Пока открыто модальное окно, клавиши принадлежат ему: Enter подтверждает, Escape закрывает. Иначе
 * Ctrl+Z в диалоге откатил бы документ у него за спиной, а в импорте картинки — прямо под
 * предпросмотром.
 */
function insideModal(target: EventTarget | null): boolean {
  if (target instanceof Element && target.closest('dialog[open]')) return true;
  return document.querySelector('dialog:modal') !== null;
}

/**
 * Глобальные горячие клавиши. Первыми идут сочетания с условием, пока оно верно: они про то,
 * с чем пользователь работал последним. Потом активный инструмент: он может съесть стрелки и
 * Escape, пока ведёт своё взаимодействие. Всё остальное разбирается по реестру из
 * hotkeys/registry.ts, который же рисует справку.
 */
export function useHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target) || insideModal(event.target)) return;
      // Пока открыт импорт картинки, документ заперт: работают только клавиши вида, Escape
      // закрывает импорт. Иначе Ctrl+Z откатил бы документ прямо под предпросмотром.
      if (useUiStore.getState().imageImport) {
        const view = findHotkey(event);
        if (event.key === 'Escape') closeImageImport();
        else if (view?.group === 'Вид') view.run();
        else return;
        event.preventDefault();
        return;
      }
      const contextual = findHotkey(event, true);
      if (contextual) {
        event.preventDefault();
        contextual.run();
        return;
      }
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
