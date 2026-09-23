import { ScanSearch } from 'lucide-react';
import { useDeferredValue, useMemo } from 'react';
import { summarizeAttrs, summarizeLayerAttrs } from '../../core/cellAttrs';
import { findLayer } from '../../core/document';
import {
  CELL_ATTRS_PANEL_ID,
  CELL_ATTR_KEY_INPUT_ID,
  removeCellAttrAction,
  selectCellsWithAttrAction,
  setCellAttrAction,
} from '../store/cellAttrActions';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { Button, Panel, PropertyEditor, type PropertyRow, plural, valueTypeName } from '../ui';

const cells = { one: 'ячейка', few: 'ячейки', many: 'ячеек' };

/**
 * Свойства выделенных ячеек активного слоя: метки для игры вроде «стена» или «вода». Строка
 * свойства описывает ячейки, у которых оно есть, и правка значения меняет только их; нижняя
 * строка добавляет свойство всем выделенным.
 */
export function CellAttrsPanel() {
  const selection = useEditorStore((s) => s.selection);
  const layer = useDocumentStore((s) => findLayer(s.doc, s.activeLayerId));
  // Сводка по большому выделению — работа: пока рамку тянут по огромному холсту, панель
  // догоняет по отложенному значению, а не тормозит саму рамку.
  const deferred = useDeferredValue(selection);
  const summary = useMemo(
    () => (deferred && layer ? summarizeAttrs(layer.cells, deferred) : null),
    [deferred, layer],
  );

  // Без выделения видно, какие метки на слое вообще есть: иначе найти их было бы нечем. Рисуют
  // обычно как раз без выделения, поэтому сводка считается по отложенному слою и мазок её не ждёт.
  const hasSelection = selection !== null;
  const deferredLayer = useDeferredValue(layer);
  const onLayer = useMemo(
    () => (!hasSelection && deferredLayer ? summarizeLayerAttrs(deferredLayer.cells) : null),
    [hasSelection, deferredLayer],
  );

  const rows: PropertyRow[] = (summary?.attrs ?? []).map((attr) => ({
    key: attr.key,
    value: attr.value === null ? null : String(attr.value),
    hint: `${attr.value === null ? 'разные значения' : valueTypeName(attr.value)} · ${plural(attr.count, cells)}`,
  }));

  return (
    <Panel
      id={CELL_ATTRS_PANEL_ID}
      title="Свойства ячеек"
      badge={summary && summary.cells > 0 ? plural(summary.cells, cells) : undefined}
    >
      {!selection ? (
        <>
          <p className="panel-hint">
            Выдели ячейки, чтобы задать их свойства — например, «стена = true» для игры. Alt+Enter
            ведёт сразу к полю нового свойства.
          </p>
          {onLayer && onLayer.attrs.length > 0 && (
            <div className="props">
              {onLayer.attrs.map((attr) => (
                <div className="prop-row" key={attr.key}>
                  <span className="prop-key">{attr.key}</span>
                  <span className="dim prop-count">{plural(attr.count, cells)}</span>
                  <Button
                    icon
                    size="sm"
                    label="Выделить все ячейки слоя с этим свойством"
                    onClick={() => selectCellsWithAttrAction(attr.key)}
                  >
                    <ScanSearch size={12} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : !summary || summary.cells === 0 ? (
        <p className="panel-hint">
          В выделении нет ячеек с символом или фоном: свойства живут только на них.
        </p>
      ) : (
        <PropertyEditor
          rows={rows}
          onChange={(key, text) => setCellAttrAction(key, text, true)}
          onRemove={removeCellAttrAction}
          onAdd={(key, text) => setCellAttrAction(key, text)}
          rowAction={{
            label: 'Выделить все ячейки слоя с этим свойством',
            icon: <ScanSearch size={12} />,
            onClick: selectCellsWithAttrAction,
          }}
          addKeyId={CELL_ATTR_KEY_INPUT_ID}
        />
      )}
    </Panel>
  );
}
