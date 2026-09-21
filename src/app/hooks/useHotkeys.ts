import { useEffect } from 'react';
import {
  copySelectionAction,
  cutSelectionAction,
  deleteSelectionAction,
  pasteAction,
  selectAllAction,
} from '../store/clipboardActions';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { openDocumentAction, saveDocumentAction } from '../store/fileActions';
import { stepFrameAction, togglePlaybackAction } from '../store/frameActions';
import {
  duplicateSelectedObjectAction,
  groupSelectionAction,
  ungroupSelectedObjectAction,
} from '../store/objectActions';
import { fitViewAction, zoomByAction } from '../store/viewActions';
import { getTool, toolByHotkey } from '../tools';
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

function handleCtrl(event: KeyboardEvent, key: string): boolean {
  const docStore = useDocumentStore.getState();
  switch (key) {
    case 'z':
      if (event.shiftKey) docStore.redo();
      else docStore.undo();
      return true;
    case 'y':
      docStore.redo();
      return true;
    case 'c':
      copySelectionAction();
      return true;
    case 'x':
      cutSelectionAction();
      return true;
    case 'v':
      pasteAction();
      return true;
    case 'a':
      selectAllAction();
      return true;
    case 'g':
      if (event.shiftKey) ungroupSelectedObjectAction();
      else groupSelectionAction();
      return true;
    case 'd':
      duplicateSelectedObjectAction();
      return true;
    case 's':
      void saveDocumentAction(event.shiftKey);
      return true;
    case 'o':
      void openDocumentAction();
      return true;
    default:
      return false;
  }
}

function handlePlain(event: KeyboardEvent): boolean {
  const editor = useEditorStore.getState();
  switch (event.key) {
    case 'Delete':
    case 'Backspace':
      deleteSelectionAction();
      return true;
    case 'Escape':
      getTool(editor.tool).cancel?.(buildToolEnv());
      editor.setSelection(null);
      editor.setTextCursor(null);
      editor.setSelectedObject(null);
      editor.setPlaying(false);
      return true;
    case 'Enter':
      togglePlaybackAction();
      return true;
    case ',':
      stepFrameAction(-1);
      return true;
    case '.':
      stepFrameAction(1);
      return true;
    case 'x':
      editor.swapColors();
      return true;
    case '`':
      editor.setShowGrid(!editor.showGrid);
      return true;
    case '+':
    case '=':
      zoomByAction(1.25);
      return true;
    case '-':
      zoomByAction(0.8);
      return true;
    case '0':
      fitViewAction();
      return true;
    default: {
      if (event.altKey) return false;
      const tool = toolByHotkey(event.key.toLowerCase());
      if (!tool) return false;
      editor.setTool(tool.id);
      return true;
    }
  }
}

/** Глобальные горячие клавиши. Активный инструмент получает клавиши первым. */
export function useHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      const editor = useEditorStore.getState();
      const tool = getTool(editor.tool);
      if (tool.onKeyDown?.(buildToolEnv(), event)) {
        event.preventDefault();
        return;
      }
      const handled =
        event.ctrlKey || event.metaKey
          ? handleCtrl(event, event.key.toLowerCase())
          : handlePlain(event);
      if (handled) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
