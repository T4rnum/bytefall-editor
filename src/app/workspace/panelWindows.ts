import type { PanelId } from './layout';

/**
 * Окна браузера для панелей. Окно открывается прямо в обработчике щелчка — только тогда
 * браузер не считает его навязанным и не блокирует, — а панель потом рисуется в него порталом.
 */
const opened = new Map<PanelId, Window>();

/** Стили главного окна в окно панели: и `<style>` сборщика, и `<link>` собранной версии. */
function copyStyles(from: Document, to: Document): void {
  for (const node of from.head.querySelectorAll('style, link[rel="stylesheet"]')) {
    to.head.appendChild(node.cloneNode(true));
  }
}

/** Открывает окно под панель и готовит в нём корень; null — браузер окно не дал. */
export function openWindowFor(id: PanelId, title: string): Window | null {
  const known = opened.get(id);
  if (known && !known.closed) return known;
  const win = window.open('', `bytefall-panel-${id}`, 'width=380,height=640');
  if (!win) return null;
  const doc = win.document;
  doc.title = `${title} — Bytefall`;
  doc.head.replaceChildren();
  doc.body.replaceChildren();
  copyStyles(document, doc);
  doc.body.className = 'panel-window';
  const root = doc.createElement('div');
  root.className = 'panel-window-root';
  doc.body.appendChild(root);
  opened.set(id, win);
  return win;
}

/** Корень окна панели, куда рисуется портал; null — окна нет. */
export function windowRootOf(id: PanelId): { win: Window; root: HTMLElement } | null {
  const win = opened.get(id);
  const root =
    win && !win.closed ? win.document.querySelector<HTMLElement>('.panel-window-root') : null;
  return win && root ? { win, root } : null;
}

export function closeWindowFor(id: PanelId): void {
  const win = opened.get(id);
  opened.delete(id);
  if (win && !win.closed) win.close();
}

/** Главное окно закрывается или перезагружается: окна панелей без него бесполезны. */
export function closeAllWindows(): void {
  for (const id of [...opened.keys()]) closeWindowFor(id);
}
