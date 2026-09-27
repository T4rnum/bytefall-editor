import { useEffect, useState } from 'react';
import { GlyphAtlas } from '../render/font/GlyphAtlas';
import { PRESS_START_2P, loadFont } from '../render/font/pressStart2P';
import { HotkeysDialog } from './components/HotkeysDialog';
import { ImportImageDialog } from './components/ImportImageDialog';
import { RecoveryDialog } from './components/RecoveryDialog';
import { StatusBar } from './components/StatusBar';
import { ToolBar } from './components/ToolBar';
import { TopBar } from './components/TopBar';
import { Viewport } from './components/Viewport';
import { DockZone, DropIndicator, useZoneShown } from './components/workspace/Dock';
import { PanelWindow } from './components/workspace/PanelWindow';
import { ThemeDialog } from './components/workspace/ThemeDialog';
import { useAutosave } from './hooks/useAutosave';
import { useEffectClock } from './hooks/useEffectClock';
import { useFileDrop } from './hooks/useFileDrop';
import { useHotkeys } from './hooks/useHotkeys';
import { usePlayback } from './hooks/usePlayback';
import { useUnsavedChangesGuard } from './hooks/useUnsavedChangesGuard';
import { useUiStore } from './store/uiStore';
import { useWorkspaceStore } from './store/workspaceStore';
import { Resizer } from './ui/Resizer';
import { TooltipLayer } from './ui/Tooltip';
import { applyTheme } from './workspace/applyTheme';
import { type ZoneId, resizeZone } from './workspace/layout';
import { closeAllWindows } from './workspace/panelWindows';

/** Пикселей на ячейку атласа: кратно 8, чтобы пиксели шрифта ложились ровно. 32 даёт 4 текселя на пиксель шрифта. */
const ATLAS_CELL_SIZE = 32;

/** Полоса изменения размера зоны: у пустой зоны её нет. */
function ZoneResizer({ zone }: { readonly zone: ZoneId }) {
  const shown = useZoneShown(zone);
  const size = useWorkspaceStore((s) => s.layouts[s.workspace].zones[zone].size);
  const edit = useWorkspaceStore((s) => s.editLayout);
  if (!shown) return null;
  const label = {
    left: 'Ширина левой колонки',
    right: 'Ширина правой колонки',
    bottom: 'Высота нижней полосы',
  };
  return (
    <Resizer
      value={size}
      onChange={(v) => edit((l) => resizeZone(l, zone, v))}
      direction={zone === 'bottom' ? 'horizontal' : 'vertical'}
      // Правая колонка и нижняя полоса растут при движении влево и вверх.
      sign={zone === 'left' ? 1 : -1}
      ariaLabel={label[zone]}
    />
  );
}

export function App() {
  const [atlas, setAtlas] = useState<GlyphAtlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const windows = useWorkspaceStore((s) => s.windows);
  const theme = useWorkspaceStore((s) => s.theme);
  const hotkeysOpen = useUiStore((s) => s.hotkeysOpen);
  const setHotkeysOpen = useUiStore((s) => s.setHotkeysOpen);
  useHotkeys();
  const dropping = useFileDrop();
  useUnsavedChangesGuard();
  useAutosave();
  usePlayback();
  useEffectClock();
  useEffect(() => applyTheme(document, theme), [theme]);
  // Окна панелей без главного бесполезны: закрываются вместе с ним.
  useEffect(() => {
    window.addEventListener('pagehide', closeAllWindows);
    return () => window.removeEventListener('pagehide', closeAllWindows);
  }, []);

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
        <DockZone zone="left" atlas={atlas} />
        <ZoneResizer zone="left" />
        <Viewport atlas={atlas} />
        <ZoneResizer zone="right" />
        <DockZone zone="right" atlas={atlas} />
      </div>
      <ZoneResizer zone="bottom" />
      <DockZone zone="bottom" atlas={atlas} />
      <StatusBar />
      <HotkeysDialog open={hotkeysOpen} onClose={() => setHotkeysOpen(false)} />
      <RecoveryDialog />
      <ImportImageDialog atlas={atlas} />
      <ThemeDialog />
      {windows.map((id) => (
        <PanelWindow key={id} id={id} atlas={atlas} />
      ))}
      <DropIndicator />
      {dropping && (
        <div className="drop-overlay" aria-hidden="true">
          <p>Отпустите файл: картинка станет символами, документ откроется</p>
        </div>
      )}
      <TooltipLayer />
    </div>
  );
}
