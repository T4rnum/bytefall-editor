import {
  Download,
  FilePlus,
  FolderOpen,
  Grid3x3,
  ImagePlus,
  Keyboard,
  Maximize,
  Redo2,
  Save,
  Scaling,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useState } from 'react';
import { canRedo, canUndo } from '../../core/history';
import { renameDocumentAction } from '../store/documentActions';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { openDocumentAction, saveDocumentAction } from '../store/fileActions';
import { importImageAction } from '../store/importActions';
import { useUiStore } from '../store/uiStore';
import { fitViewAction, zoomByAction } from '../store/viewActions';
import { Button, TextField } from '../ui';
import { ExportDialog } from './ExportDialog';
import { NewDocumentDialog } from './NewDocumentDialog';
import { ResizeCanvasDialog } from './ResizeCanvasDialog';

export function TopBar() {
  const doc = useDocumentStore((s) => s.doc);
  const dirty = useDocumentStore((s) => s.dirty);
  const history = useDocumentStore((s) => s.history);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const zoom = useEditorStore((s) => s.camera.zoom);
  const showGrid = useEditorStore((s) => s.showGrid);
  const setShowGrid = useEditorStore((s) => s.setShowGrid);
  const showChecker = useEditorStore((s) => s.showChecker);
  const setShowChecker = useEditorStore((s) => s.setShowChecker);
  const [newOpen, setNewOpen] = useState(false);
  const setHotkeysOpen = useUiStore((s) => s.setHotkeysOpen);
  const resizeOpen = useUiStore((s) => s.resizeOpen);
  const setResizeOpen = useUiStore((s) => s.setResizeOpen);
  const exportOpen = useUiStore((s) => s.exportOpen);
  const setExportOpen = useUiStore((s) => s.setExportOpen);

  return (
    <header className="topbar">
      <div className="brand">Bytefall</div>
      <TextField
        value={doc.name}
        className="doc-name"
        ariaLabel="Имя документа"
        onCommit={renameDocumentAction}
      />
      {dirty && <span className="dirty-dot" title="Есть несохранённые изменения" />}

      <div className="topbar-group">
        <Button icon label="Новый документ" onClick={() => setNewOpen(true)}>
          <FilePlus size={16} />
        </Button>
        <Button
          icon
          label="Открыть документ, .xp REXPaint или файл прототипа"
          hotkey="Ctrl+O"
          onClick={() => void openDocumentAction()}
        >
          <FolderOpen size={16} />
        </Button>
        <Button
          icon
          label="Картинку в символы: импорт PNG, JPEG, GIF, WebP. Можно и перетащить в окно"
          hotkey="Ctrl+I"
          onClick={() => void importImageAction()}
        >
          <ImagePlus size={16} />
        </Button>
        <Button
          icon
          label="Сохранить"
          hotkey="Ctrl+S"
          onClick={() => void saveDocumentAction(false)}
        >
          <Save size={16} />
        </Button>
        <Button
          label="Сохранить как"
          hotkey="Ctrl+Shift+S"
          onClick={() => void saveDocumentAction(true)}
        >
          Сохранить как
        </Button>
        <Button icon label="Размер холста" hotkey="Ctrl+Alt+C" onClick={() => setResizeOpen(true)}>
          <Scaling size={16} />
        </Button>
      </div>

      <div className="topbar-group">
        <Button
          label="Экспорт: PNG, GIF, лист спрайтов, кадры, текст"
          hotkey="Ctrl+E"
          onClick={() => setExportOpen(true)}
        >
          <Download size={16} />
          Экспорт
        </Button>
      </div>

      <div className="topbar-group">
        <Button icon label="Отменить" hotkey="Ctrl+Z" disabled={!canUndo(history)} onClick={undo}>
          <Undo2 size={16} />
        </Button>
        <Button
          icon
          label="Повторить"
          hotkey="Ctrl+Shift+Z"
          disabled={!canRedo(history)}
          onClick={redo}
        >
          <Redo2 size={16} />
        </Button>
      </div>

      <div className="topbar-group topbar-group--right">
        <Button icon label="Отдалить" hotkey="-" onClick={() => zoomByAction(0.8)}>
          <ZoomOut size={16} />
        </Button>
        <span className="zoom-label">{Math.round(zoom)} px</span>
        <Button icon label="Приблизить" hotkey="+" onClick={() => zoomByAction(1.25)}>
          <ZoomIn size={16} />
        </Button>
        <Button icon label="Вписать в окно" hotkey="0" onClick={fitViewAction}>
          <Maximize size={16} />
        </Button>
        <Button
          icon
          label="Сетка"
          hotkey="`"
          active={showGrid}
          onClick={() => setShowGrid(!showGrid)}
        >
          <Grid3x3 size={16} />
        </Button>
        <Button
          icon
          label="Шахматка под прозрачным холстом"
          hotkey="~"
          active={showChecker}
          onClick={() => setShowChecker(!showChecker)}
        >
          <span className="checker-icon" aria-hidden="true" />
        </Button>
        <Button icon label="Горячие клавиши" hotkey="?" onClick={() => setHotkeysOpen(true)}>
          <Keyboard size={16} />
        </Button>
      </div>

      <NewDocumentDialog open={newOpen} onClose={() => setNewOpen(false)} />
      {resizeOpen && <ResizeCanvasDialog onClose={() => setResizeOpen(false)} />}
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </header>
  );
}
