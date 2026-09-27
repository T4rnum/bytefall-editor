import { useState } from 'react';
import { activeBrush, useEditorStore } from '../store/editorStore';
import { useFontStore } from '../store/fontStore';
import { GlyphFace, Panel, type TabItem, Tabs, TextField } from '../ui';
import { SLOT_LABELS } from './BrushPanel';

/** Палитра символов шрифта документа: только то, что в шрифте есть, тем же шрифтом, что холст. */
export function GlyphPanel() {
  const glyph = useEditorStore((s) => activeBrush(s).glyph);
  const setGlyph = useEditorStore((s) => s.setGlyph);
  const slot = useEditorStore((s) => s.activeBrush);
  const groups = useFontStore((s) => s.groups);
  const look = useFontStore((s) => s.look);
  const [picked, setGroup] = useState<string | null>(null);
  const tabs: TabItem<string>[] = groups.map((g) => ({ id: g.title, label: g.title }));
  // У нового шрифта выбранной группы может не быть: тогда первая.
  const group = groups.find((g) => g.title === picked) ?? groups[0];
  const chars = group ? [...group.chars] : [];

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
            <GlyphFace glyph={glyph} look={look} height={18} />
          </span>
        </>
      }
    >
      {tabs.length > 1 && (
        <Tabs
          value={group?.title ?? ''}
          onChange={setGroup}
          items={tabs}
          ariaLabel="Наборы символов"
        />
      )}
      <div className="glyph-grid">
        {chars.map((ch) => (
          <button
            key={ch}
            type="button"
            className={`glyph-cell${ch === glyph ? ' is-active' : ''}`}
            title={`U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`}
            onClick={() => setGlyph(ch)}
          >
            <GlyphFace glyph={ch} look={look} height={16} />
          </button>
        ))}
      </div>
    </Panel>
  );
}
