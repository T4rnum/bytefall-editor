import { findObject } from '../../core/object';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { useNotifyStore } from '../store/notifyStore';
import { useUiStore } from '../store/uiStore';
import { getTool } from '../tools';
import { TIP_ATTR } from '../ui';

const clock = (at: number): string =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function StatusBar() {
  const doc = useDocumentStore((s) => s.doc);
  const activeLayerId = useDocumentStore((s) => s.activeLayerId);
  const cursor = useEditorStore((s) => s.cursorCell);
  const selection = useEditorStore((s) => s.selection);
  const tool = useEditorStore((s) => s.tool);
  const textCursor = useEditorStore((s) => s.textCursor);
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId);
  const dirty = useDocumentStore((s) => s.dirty);
  const autosavedAt = useUiStore((s) => s.autosavedAt);
  const autosaveFailed = useUiStore((s) => s.autosaveFailed);
  const message = useNotifyStore((s) => s.message);
  const kind = useNotifyStore((s) => s.kind);
  const layer = doc.layers.find((l) => l.id === activeLayerId);
  const blocked = layer && (!layer.visible || layer.locked);
  const selectedObject = selectedObjectId ? findObject(doc, selectedObjectId) : undefined;

  return (
    <footer className="statusbar">
      <span className="status-item">
        {doc.width}×{doc.height}
      </span>
      <span className="status-item">{cursor ? `${cursor.x}, ${cursor.y}` : '—'}</span>
      {selection && (
        <span
          className="status-item"
          {...{
            [TIP_ATTR]: 'Инструменты меняют только выделенные ячейки. Escape снимает выделение',
          }}
        >
          sel {selection.bounds.w}×{selection.bounds.h} · {selection.size}
        </span>
      )}
      {selectedObject && <span className="status-item">obj {selectedObject.name}</span>}
      <span className="status-item">
        {getTool(tool).label}
        {tool === 'text' && textCursor && ' · typing'}
      </span>
      {blocked && (
        <span className="status-item status-item--warn">
          layer is {layer.locked ? 'locked' : 'hidden'}
        </span>
      )}
      <span className="status-spacer" />
      {message && <span className={`status-item status-item--${kind}`}>{message}</span>}
      {autosaveFailed ? (
        <span
          className="status-item status-item--warn"
          {...{ [TIP_ATTR]: 'The browser refused to store a backup. Save to a file to be safe' }}
        >
          autosave off
        </span>
      ) : (
        dirty &&
        autosavedAt !== null && (
          <span
            className="status-item"
            {...{ [TIP_ATTR]: 'A backup copy survives a crash or a closed tab until you save' }}
          >
            autosaved {clock(autosavedAt)}
          </span>
        )
      )}
    </footer>
  );
}
