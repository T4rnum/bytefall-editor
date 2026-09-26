import { Maximize2, Plus } from 'lucide-react';
import { findObject } from '../../../core/object';
import { useDocumentStore } from '../../store/documentStore';
import { useEditorStore } from '../../store/editorStore';
import { activeNodeEditor } from '../../store/nodeEditorActions';
import { type BottomView, useUiStore } from '../../store/uiStore';
import { Button, type TabItem, Tabs } from '../../ui';
import { NodeEditor } from './NodeEditor';

const VIEWS: readonly TabItem<BottomView>[] = [
  { id: 'timeline', label: 'Таймлайн', title: 'Время сцены, кадры и ключи (N)' },
  { id: 'nodes', label: 'Узлы', title: 'Граф узлов выбранного объекта (N)' },
];

/** Что показывает нижняя область. Стоит первым в панели инструментов и таймлайна, и узлов. */
export function BottomViewTabs() {
  const view = useUiStore((s) => s.bottomView);
  const setView = useUiStore((s) => s.setBottomView);
  return <Tabs value={view} onChange={setView} items={VIEWS} ariaLabel="Нижняя панель" />;
}

/**
 * Узлы внизу, на месте таймлайна: как редактор узлов в Blender делит область с другими видами.
 * Высота общая с таймлайном.
 */
export function NodePanel() {
  const height = useUiStore((s) => s.timelineHeight);
  const name = useEditorStore((s) => s.selectedObjectId);
  const object = useDocumentStore((s) => (name ? findObject(s.doc, name) : undefined));
  return (
    <section className="timeline node-panel" style={{ height }} aria-label="Узлы">
      <div className="timeline-toolbar">
        <BottomViewTabs />
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
