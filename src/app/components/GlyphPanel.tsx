import { useState } from 'react';
import { CHARSET_GROUPS } from '../../render/font/pressStart2P';
import { useEditorStore } from '../store/editorStore';

export function GlyphPanel() {
  const glyph = useEditorStore((s) => s.glyph);
  const setGlyph = useEditorStore((s) => s.setGlyph);
  const [group, setGroup] = useState(0);
  const chars = [...CHARSET_GROUPS[group].chars];

  return (
    <section className="panel panel--grow">
      <header className="panel-header">
        <span>Glyph</span>
        <input
          className="glyph-input"
          value={glyph}
          aria-label="Current glyph"
          onChange={(e) => {
            const typed = [...e.target.value];
            if (typed.length > 0) setGlyph(typed[typed.length - 1]);
          }}
        />
        <span className="glyph-preview" aria-hidden="true">
          {glyph}
        </span>
      </header>
      <div className="tabs" role="tablist">
        {CHARSET_GROUPS.map((g, i) => (
          <button
            key={g.title}
            type="button"
            role="tab"
            aria-selected={i === group}
            className={`tab${i === group ? ' is-active' : ''}`}
            onClick={() => setGroup(i)}
          >
            {g.title}
          </button>
        ))}
      </div>
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
    </section>
  );
}
