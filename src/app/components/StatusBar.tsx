import { findObject } from '../../core/object';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { cancelJobAction, useJobStore } from '../store/jobStore';
import { useNotifyStore } from '../store/notifyStore';
import { useUiStore } from '../store/uiStore';
import { getTool } from '../tools';
import { Button, TIP_ATTR, plural } from '../ui';
import { OBJECTS } from './groupTargets';

const GLYPHS = { one: 'символ', few: 'символа', many: 'символов' } as const;

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
  const count = useEditorStore((s) => s.selectedObjectIds.length);
  const editing = useEditorStore((s) => s.editingObjectId !== null);
  const glyphCount = useEditorStore((s) => s.glyphSelection.length);
  const dirty = useDocumentStore((s) => s.dirty);
  const autosavedAt = useUiStore((s) => s.autosavedAt);
  const autosaveFailed = useUiStore((s) => s.autosaveFailed);
  const job = useJobStore((s) => s.job);
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
          выделено {selection.bounds.w}×{selection.bounds.h} · {selection.size}
        </span>
      )}
      {selectedObject && !editing && (
        <span className="status-item">
          {count > 1 ? `выбрано ${plural(count, OBJECTS)}` : `объект ${selectedObject.name}`}
        </span>
      )}
      {selectedObject && editing && (
        <span
          className="status-item status-item--accent"
          {...{
            [TIP_ATTR]:
              'Инструменты рисуют в сетке объекта, выделение ловит его символы. Tab или Escape — выйти',
          }}
        >
          правка «{selectedObject.name}»{glyphCount > 0 && ` · ${plural(glyphCount, GLYPHS)}`}
        </span>
      )}
      <span className="status-item">
        {getTool(tool).label}
        {tool === 'text' && textCursor && ' · ввод'}
      </span>
      {blocked && (
        <span className="status-item status-item--warn">
          слой {layer.locked ? 'заперт' : 'скрыт'}
        </span>
      )}
      <span className="status-spacer" />
      {job && (
        <span className="status-item status-job">
          {job.label}
          <progress
            className="status-progress"
            max={Math.max(1, job.total)}
            value={job.done}
            aria-label={`${job.label}: сделано ${job.done} из ${job.total}`}
          />
          <Button size="sm" label="Отменить" hotkey="Escape" onClick={cancelJobAction}>
            Отмена
          </Button>
        </span>
      )}
      {message && <span className={`status-item status-item--${kind}`}>{message}</span>}
      {autosaveFailed ? (
        <span
          className="status-item status-item--warn"
          {...{ [TIP_ATTR]: 'Браузер не дал сохранить резервную копию. Сохраните работу в файл' }}
        >
          автосохранение выключено
        </span>
      ) : (
        dirty &&
        autosavedAt !== null && (
          <span
            className="status-item"
            {...{
              [TIP_ATTR]:
                'Копия переживёт сбой и закрытие вкладки, пока работа не сохранена в файл',
            }}
          >
            автосохранено {clock(autosavedAt)}
          </span>
        )
      )}
    </footer>
  );
}
