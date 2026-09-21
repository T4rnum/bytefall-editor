import {
  FilePlus,
  FileText,
  Film,
  FolderOpen,
  Grid3x3,
  Image,
  Keyboard,
  LayoutGrid,
  Maximize,
  Redo2,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useState } from 'react';
import { canRedo, canUndo } from '../../core/history';
import { renameDocumentAction } from '../store/documentActions';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import {
  exportGifAction,
  exportPngAction,
  exportSpriteSheetAction,
  exportTextAction,
  openDocumentAction,
  saveDocumentAction,
} from '../store/fileActions';
import { useUiStore } from '../store/uiStore';
import { fitViewAction, zoomByAction } from '../store/viewActions';
import { Button, Select, TextField } from '../ui';
import { NewDocumentDialog } from './NewDocumentDialog';

const PNG_SCALES = [8, 16, 32, 64] as const;
const SCALE_OPTIONS = PNG_SCALES.map((s) => ({ value: String(s), label: `${s} px/cell` }));

export function TopBar() {
  const doc = useDocumentStore((s) => s.doc);
  const dirty = useDocumentStore((s) => s.dirty);
  const history = useDocumentStore((s) => s.history);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const zoom = useEditorStore((s) => s.camera.zoom);
  const showGrid = useEditorStore((s) => s.showGrid);
  const setShowGrid = useEditorStore((s) => s.setShowGrid);
  const [newOpen, setNewOpen] = useState(false);
  const setHotkeysOpen = useUiStore((s) => s.setHotkeysOpen);
  const [pngScale, setPngScale] = useState(16);

  return (
    <header className="topbar">
      <div className="brand">Bytefall</div>
      <TextField
        value={doc.name}
        className="doc-name"
        ariaLabel="Document name"
        onCommit={renameDocumentAction}
      />
      {dirty && <span className="dirty-dot" title="Unsaved changes" />}

      <div className="topbar-group">
        <Button icon label="New document" onClick={() => setNewOpen(true)}>
          <FilePlus size={16} />
        </Button>
        <Button icon label="Open" hotkey="Ctrl+O" onClick={() => void openDocumentAction()}>
          <FolderOpen size={16} />
        </Button>
        <Button icon label="Save" hotkey="Ctrl+S" onClick={() => void saveDocumentAction(false)}>
          <Save size={16} />
        </Button>
        <Button label="Save as" hotkey="Ctrl+Shift+S" onClick={() => void saveDocumentAction(true)}>
          Save as
        </Button>
      </div>

      <div className="topbar-group">
        <Select
          value={String(pngScale)}
          options={SCALE_OPTIONS}
          ariaLabel="Export scale, pixels per cell"
          onChange={(value) => setPngScale(Number(value))}
        />
        <Button
          icon
          label="Export current frame as PNG"
          onClick={() => void exportPngAction(pngScale)}
        >
          <Image size={16} />
        </Button>
        <Button icon label="Export animated GIF" onClick={() => void exportGifAction(pngScale)}>
          <Film size={16} />
        </Button>
        <Button
          icon
          label="Export sprite sheet PNG"
          onClick={() => void exportSpriteSheetAction(pngScale)}
        >
          <LayoutGrid size={16} />
        </Button>
        <Button icon label="Export current frame as text" onClick={() => void exportTextAction()}>
          <FileText size={16} />
        </Button>
      </div>

      <div className="topbar-group">
        <Button icon label="Undo" hotkey="Ctrl+Z" disabled={!canUndo(history)} onClick={undo}>
          <Undo2 size={16} />
        </Button>
        <Button icon label="Redo" hotkey="Ctrl+Shift+Z" disabled={!canRedo(history)} onClick={redo}>
          <Redo2 size={16} />
        </Button>
      </div>

      <div className="topbar-group topbar-group--right">
        <Button icon label="Zoom out" hotkey="-" onClick={() => zoomByAction(0.8)}>
          <ZoomOut size={16} />
        </Button>
        <span className="zoom-label">{Math.round(zoom)} px</span>
        <Button icon label="Zoom in" hotkey="+" onClick={() => zoomByAction(1.25)}>
          <ZoomIn size={16} />
        </Button>
        <Button icon label="Fit to window" hotkey="0" onClick={fitViewAction}>
          <Maximize size={16} />
        </Button>
        <Button
          icon
          label="Toggle grid"
          hotkey="`"
          active={showGrid}
          onClick={() => setShowGrid(!showGrid)}
        >
          <Grid3x3 size={16} />
        </Button>
        <Button icon label="Keyboard shortcuts" hotkey="?" onClick={() => setHotkeysOpen(true)}>
          <Keyboard size={16} />
        </Button>
      </div>

      <NewDocumentDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </header>
  );
}
