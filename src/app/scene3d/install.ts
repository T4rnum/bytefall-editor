import { setScene3DRenderer } from '../../core/scene3d/render';
import { Scene3DRenderer } from '../../render/scene3d/Scene3DRenderer';

let renderer: Scene3DRenderer | null = null;
let failed = false;

/**
 * Подставляет ядру рендер 3D-сцен до первой отрисовки: тогда экран, экспорт, текст и миниатюры
 * получают одни и те же ячейки. Контекст WebGL создаётся лениво — при первом 3D-слое; если
 * WebGL нет, 3D-слои остаются пустыми, а не роняют редактор.
 */
export function installScene3DRenderer(): void {
  setScene3DRenderer((request) => {
    if (!renderer && !failed) {
      try {
        renderer = new Scene3DRenderer();
      } catch (error) {
        failed = true;
        console.error('3D-слои не рисуются: WebGL недоступен', error);
      }
    }
    return renderer ? renderer.render(request) : new Map();
  });
}
