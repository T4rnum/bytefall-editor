import { useState } from 'react';
import { CHARSET_GROUPS } from '../../render/font/pressStart2P';
import { activeBrush, useEditorStore } from '../store/editorStore';
import { Panel, type TabItem, Tabs, TextField } from '../ui';
import { SLOT_LABELS } from './BrushPanel';

const TABS: TabItem<string>[] = CHARSET_GROUPS.map((g) => ({ id: g.title, label: g.title }));

export function GlyphPanel() {
  const glyph = useEditorStore((s) => activeBrush(s).glyph);
  const setGlyph = useEditorStore((s) => s.setGlyph);
  const slot = useEditorStore((s) => s.activeBrush);
  const [group, setGroup] = useState(CHARSET_GROUPS[0].title);
  const chars = [...(CHARSET_GROUPS.find((g) => g.title === group) ?? CHARSET_GROUPS[0]).chars];

  return (
    <Panel
      id="glyph"
      title="Символ"
      badge={SLOT_LABELS[slot]}
      grow
      actions={
        <>
          <TextField
            value={glyph}
            ariaLabel="Текущий символ"
            size="sm"
            pixel
            className="glyph-input"
            onCommit={(text) => {
              const typed = [...text];
              if (typed.length > 0) setGlyph(typed[typed.length - 1]);
            }}
          />
          <span className="glyph-preview" aria-hidden="true">
            {glyph}
          </span>
        </>
      }
    >
      <Tabs value={group} onChange={setGroup} items={TABS} ariaLabel="Наборы символов" />
      <div className="glyph-grid">
        {chars.map((ch) => (
          <button
            key={ch}
            type="button"
            className={`glyph-cell${ch === glyph ? ' is-active' : ''}`}
            title={`U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`}
            onClick={() => setGlyph(ch)}
          >
            {ch}
          </button>
        ))}
      </div>
    </Panel>
  );
}
