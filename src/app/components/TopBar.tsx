import {
  FilePlus,
  FileText,
  Film,
  FolderOpen,
  Grid3x3,
  Image,
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
import { fitViewAction, zoomByAction } from '../store/viewActions';
import { NewDocumentDialog } from './NewDocumentDialog';

const PNG_SCALES = [8, 16, 32, 64] as const;

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
  const [pngScale, setPngScale] = useState<number>(16);

  return (
    <header className="topbar">
      <div className="brand">Bytefall</div>
      <input
        className="doc-name"
        key={doc.name}
        defaultValue={doc.name}
        aria-label="Document name"
        onBlur={(e) => {
          renameDocumentAction(e.target.value);
          e.target.value = useDocumentStore.getState().doc.name;
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {dirty && <span className="dirty-dot" title="Unsaved changes" />}

      <div className="topbar-group">
        <button
          type="button"
          className="icon-btn"
          title="New (canvas size…)"
          onClick={() => setNewOpen(true)}
        >
          <FilePlus size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Open (Ctrl+O)"
          onClick={() => void openDocumentAction()}
        >
          <FolderOpen size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Save (Ctrl+S)"
          onClick={() => void saveDocumentAction(false)}
        >
          <Save size={16} />
        </button>
        <button
          type="button"
          className="text-btn"
          title="Save As (Ctrl+Shift+S)"
          onClick={() => void saveDocumentAction(true)}
        >
          Save as
        </button>
      </div>

      <div className="topbar-group">
        <select
          className="select"
          value={pngScale}
          aria-label="Export scale, pixels per cell"
          onChange={(e) => setPngScale(Number(e.target.value))}
        >
          {PNG_SCALES.map((s) => (
            <option key={s} value={s}>
              {s} px/cell
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-btn"
          title="Export current frame as PNG"
          onClick={() => void exportPngAction(pngScale)}
        >
          <Image size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Export animated GIF"
          onClick={() => void exportGifAction(pngScale)}
        >
          <Film size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Export sprite sheet PNG"
          onClick={() => void exportSpriteSheetAction(pngScale)}
        >
          <LayoutGrid size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Export current frame as text"
          onClick={() => void exportTextAction()}
        >
          <FileText size={16} />
        </button>
      </div>

      <div className="topbar-group">
        <button
          type="button"
          className="icon-btn"
          title="Undo (Ctrl+Z)"
          disabled={!canUndo(history)}
          onClick={undo}
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo(history)}
          onClick={redo}
        >
          <Redo2 size={16} />
        </button>
      </div>

      <div className="topbar-group topbar-group--right">
        <button
          type="button"
          className="icon-btn"
          title="Zoom out (-)"
          onClick={() => zoomByAction(0.8)}
        >
          <ZoomOut size={16} />
        </button>
        <span className="zoom-label">{Math.round(zoom)} px</span>
        <button
          type="button"
          className="icon-btn"
          title="Zoom in (+)"
          onClick={() => zoomByAction(1.25)}
        >
          <ZoomIn size={16} />
        </button>
        <button type="button" className="icon-btn" title="Fit (0)" onClick={fitViewAction}>
          <Maximize size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn${showGrid ? ' is-active' : ''}`}
          title="Toggle grid (`)"
          aria-pressed={showGrid}
          onClick={() => setShowGrid(!showGrid)}
        >
          <Grid3x3 size={16} />
        </button>
      </div>

      <NewDocumentDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </header>
  );
}
