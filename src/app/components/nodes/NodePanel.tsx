import { Maximize2, Plus } from 'lucide-react';
import { findObject } from '../../../core/object';
import { useDocumentStore } from '../../store/documentStore';
import { useEditorStore } from '../../store/editorStore';
import { activeNodeEditor } from '../../store/nodeEditorActions';
import { Button } from '../../ui';
import { NodeEditor } from './NodeEditor';

/**
 * Редактор узлов выбранного объекта. По умолчанию — вкладкой рядом с таймлайном, как редактор
 * узлов в Blender делит область с другими видами; N переключает между ними.
 */
export function NodePanel() {
  const name = useEditorStore((s) => s.selectedObjectId);
  const object = useDocumentStore((s) => (name ? findObject(s.doc, name) : undefined));
  return (
    <section className="timeline node-panel" aria-label="Узлы">
      <div className="timeline-toolbar">
        <span className="node-panel-object">{object ? object.name : 'Объект не выбран'}</span>
        <div className="timeline-group">
          <Button
            size="sm"
            label="Добавить узел или сборку"
            hotkey="Shift+A"
            disabled={!object}
            onClick={() => activeNodeEditor()?.openAddMenu()}
          >
            <Plus size={14} /> Добавить
          </Button>
          <Button
            icon
            size="sm"
            label="Вписать граф в окно"
            hotkey="Home"
            disabled={!object}
            onClick={() => activeNodeEditor()?.fit()}
          >
            <Maximize2 size={14} />
          </Button>
        </div>
      </div>
      <NodeEditor />
    </section>
  );
}
