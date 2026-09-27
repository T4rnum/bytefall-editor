import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GlyphAtlas } from '../../../render/font/GlyphAtlas';
import { handleHotkey } from '../../hooks/useHotkeys';
import { closePanelWindowAction } from '../../store/workspaceActions';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { PanelHostContext } from '../../ui';
import { applyTheme } from '../../workspace/applyTheme';
import type { PanelId } from '../../workspace/layout';
import { windowRootOf } from '../../workspace/panelWindows';
import { PANELS } from './panels';

/**
 * Панель в отдельном окне браузера. Окно — тот же редактор: портал из этого же React, те же
 * сторы, поэтому правка в окне сразу видна в главном и наоборот. Горячие клавиши работают и
 * отсюда. Закрыли окно — панель возвращается на прежнее место.
 */
export function PanelWindow({ id, atlas }: { readonly id: PanelId; readonly atlas: GlyphAtlas }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const theme = useWorkspaceStore((s) => s.theme);
  const target = windowRootOf(id);
  const win = target?.win;

  useEffect(() => {
    if (!win) return;
    const onClose = (): void => closePanelWindowAction(id);
    win.addEventListener('pagehide', onClose);
    win.addEventListener('keydown', handleHotkey);
    return () => {
      win.removeEventListener('pagehide', onClose);
      win.removeEventListener('keydown', handleHotkey);
    };
  }, [id, win]);

  useEffect(() => {
    if (win) applyTheme(win.document, theme);
  }, [win, theme]);

  if (!target) return null;
  return createPortal(
    <div className="panel-window-frame">
      <header className="dock-header">
        <span className="dock-tab is-active">{PANELS[id].title}</span>
        <span className="dock-slot" ref={setSlot} />
      </header>
      <div className="dock-body">
        <PanelHostContext.Provider value={{ slot }}>
          {PANELS[id].render(atlas)}
        </PanelHostContext.Provider>
      </div>
    </div>,
    target.root,
  );
}
