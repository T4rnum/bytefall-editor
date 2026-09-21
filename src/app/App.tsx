import { useEffect, useState } from 'react';
import { GlyphAtlas } from '../render/font/GlyphAtlas';
import { PRESS_START_2P, loadFont } from '../render/font/pressStart2P';
import { ColorPanel } from './components/ColorPanel';
import { EffectsPanel } from './components/EffectsPanel';
import { GlyphPanel } from './components/GlyphPanel';
import { LayersPanel } from './components/LayersPanel';
import { LookPanel } from './components/LookPanel';
import { ObjectsPanel } from './components/ObjectsPanel';
import { StatusBar } from './components/StatusBar';
import { TimelinePanel } from './components/TimelinePanel';
import { ToolBar } from './components/ToolBar';
import { TopBar } from './components/TopBar';
import { Viewport } from './components/Viewport';
import { useEffectClock } from './hooks/useEffectClock';
import { useHotkeys } from './hooks/useHotkeys';
import { usePlayback } from './hooks/usePlayback';
import { useUnsavedChangesGuard } from './hooks/useUnsavedChangesGuard';

/** Пикселей на ячейку атласа: кратно 8, чтобы пиксели шрифта ложились ровно. 32 даёт 4 текселя на пиксель шрифта. */
const ATLAS_CELL_SIZE = 32;

export function App() {
  const [atlas, setAtlas] = useState<GlyphAtlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  useHotkeys();
  useUnsavedChangesGuard();
  usePlayback();
  useEffectClock();

  useEffect(() => {
    let cancelled = false;
    loadFont()
      .then(() => {
        if (cancelled) return;
        setAtlas(new GlyphAtlas({ fontFamily: PRESS_START_2P.family, cellSize: ATLAS_CELL_SIZE }));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="boot boot--error">Font failed to load: {error}</div>;
  if (!atlas) return <div className="boot">Loading font…</div>;

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <ToolBar />
        <Viewport atlas={atlas} />
        <aside className="sidebar">
          <LayersPanel />
          <ObjectsPanel />
          <EffectsPanel />
          <LookPanel />
          <ColorPanel />
          <GlyphPanel />
        </aside>
      </div>
      <TimelinePanel />
      <StatusBar />
    </div>
  );
}
