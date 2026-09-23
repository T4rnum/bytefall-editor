import { useEffect, useState } from 'react';
import { GlyphAtlas } from '../render/font/GlyphAtlas';
import { PRESS_START_2P, loadFont } from '../render/font/pressStart2P';
import { BrushPanel } from './components/BrushPanel';
import { CellAttrsPanel } from './components/CellAttrsPanel';
import { ColorPanel } from './components/ColorPanel';
import { EffectsPanel } from './components/EffectsPanel';
import { GlyphPanel } from './components/GlyphPanel';
import { HotkeysDialog } from './components/HotkeysDialog';
import { ImportImageDialog } from './components/ImportImageDialog';
import { LayersPanel } from './components/LayersPanel';
import { LookPanel } from './components/LookPanel';
import { ObjectsPanel } from './components/ObjectsPanel';
import { RecoveryDialog } from './components/RecoveryDialog';
import { StatusBar } from './components/StatusBar';
import { TimelinePanel } from './components/TimelinePanel';
import { ToolBar } from './components/ToolBar';
import { TopBar } from './components/TopBar';
import { Viewport } from './components/Viewport';
import { useAutosave } from './hooks/useAutosave';
import { useEffectClock } from './hooks/useEffectClock';
import { useFileDrop } from './hooks/useFileDrop';
import { useHotkeys } from './hooks/useHotkeys';
import { usePlayback } from './hooks/usePlayback';
import { useUnsavedChangesGuard } from './hooks/useUnsavedChangesGuard';
import { useUiStore } from './store/uiStore';
import { Resizer } from './ui/Resizer';
import { TooltipLayer } from './ui/Tooltip';

/** Пикселей на ячейку атласа: кратно 8, чтобы пиксели шрифта ложились ровно. 32 даёт 4 текселя на пиксель шрифта. */
const ATLAS_CELL_SIZE = 32;

export function App() {
  const [atlas, setAtlas] = useState<GlyphAtlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const hotkeysOpen = useUiStore((s) => s.hotkeysOpen);
  const setHotkeysOpen = useUiStore((s) => s.setHotkeysOpen);
  useHotkeys();
  const dropping = useFileDrop();
  useUnsavedChangesGuard();
  useAutosave();
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
    <div className="app" style={{ '--sidebar-w': `${sidebarWidth}px` } as React.CSSProperties}>
      <TopBar />
      <div className="app-body">
        <ToolBar />
        <Viewport atlas={atlas} />
        {/* Сайдбар растёт при движении влево, поэтому знак смещения отрицательный. */}
        <Resizer
          value={sidebarWidth}
          onChange={setSidebarWidth}
          sign={-1}
          ariaLabel="Ширина боковой панели"
        />
        <aside className="sidebar">
          <LayersPanel />
          <ObjectsPanel />
          <CellAttrsPanel />
          <EffectsPanel />
          <LookPanel />
          <BrushPanel />
          <ColorPanel />
          <GlyphPanel />
        </aside>
      </div>
      <TimelinePanel atlas={atlas} />
      <StatusBar />
      <HotkeysDialog open={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
      <RecoveryDialog />
      <ImportImageDialog atlas={atlas} />
      {dropping && (
        <div className="drop-overlay" aria-hidden="true">
          <p>Отпустите файл: картинка станет символами, документ откроется</p>
        </div>
      )}
      <TooltipLayer />
    </div>
  );
}
