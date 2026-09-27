import { cellAspect } from '../../core/font/font';
import type { Point } from '../../core/geometry';
import { dollyCamera, orbitCamera, panCamera } from '../../core/scene3d/camera';
import { pickBody3D } from '../../core/scene3d/pick';
import type { Camera3D } from '../../core/scene3d/types';
import type { PointerInfo, Tool, ToolEnv } from './types';

/** Градусов орбиты на ширину холста: протащить через весь холст — пол-оборота. */
const DEGREES_PER_CANVAS = 180;
/** Сдвиг меньше этого, в ячейках, — щелчок: выбрать тело, а не крутить камеру. */
const CLICK_REACH = 0.5;

type Mode = 'orbit' | 'pan' | 'dolly';

interface Gesture {
  readonly layerId: string;
  readonly camera: Camera3D;
  readonly from: Point;
  readonly mode: Mode;
  readonly key: string;
  /** Указатель ушёл дальше щелчка: жест крутит камеру. */
  moved: boolean;
}

let gestures = 0;

/** Камера после жеста: всё от исходной камеры, так что жест можно вести туда и обратно. */
function cameraAt(env: ToolEnv, g: Gesture, point: Point): Camera3D {
  const dx = point.x - g.from.x;
  const dy = point.y - g.from.y;
  const { width, height } = env.doc;
  switch (g.mode) {
    case 'pan':
      // Доли высоты кадра: по X ячейка короче высоты в `aspect` раз, и мир едет за указателем.
      return panCamera(g.camera, (dx * cellAspect(env.doc.font)) / height, dy / height);
    case 'dolly':
      return dollyCamera(g.camera, Math.exp((dy * 2) / height));
    case 'orbit':
      return orbitCamera(
        g.camera,
        (-dx * DEGREES_PER_CANVAS) / width,
        (dy * DEGREES_PER_CANVAS) / width,
      );
  }
}

const movedFar = (g: Gesture, point: Point): boolean =>
  g.moved || Math.hypot(point.x - g.from.x, point.y - g.from.y) >= CLICK_REACH;

/**
 * Орбита: камера 3D-слоя мышью. Тянуть — вращение вокруг цели, с Shift — сдвиг вместе с целью,
 * с Alt — приближение. Жест — одна запись истории; у анимированной камеры — ключ в текущий момент.
 * Щелчок без сдвига выбирает тело под указателем, по пустому месту — снимает выбор.
 */
export function createOrbitTool(): Tool {
  let gesture: Gesture | null = null;
  return {
    id: 'orbit',
    label: 'Орбита',
    hotkey: 'u',
    cursor: 'grab',
    ownsAlt: true,
    onPointerDown(env, info: PointerInfo) {
      if (info.button !== 0 || !env.scene3d) return;
      const mode: Mode = info.shift ? 'pan' : info.alt ? 'dolly' : 'orbit';
      gestures += 1;
      gesture = {
        layerId: env.scene3d.layerId,
        camera: env.scene3d.scene.camera,
        from: info.point,
        mode,
        key: `orbit:${gestures}`,
        moved: false,
      };
    },
    onPointerMove(env, info) {
      if (!gesture || !movedFar(gesture, info.point)) return;
      gesture.moved = true;
      env.setCamera3D(gesture.layerId, cameraAt(env, gesture, info.point), gesture.key);
    },
    onPointerUp(env, info) {
      const g = gesture;
      gesture = null;
      if (!g) return;
      if (movedFar(g, info.point)) {
        env.setCamera3D(g.layerId, cameraAt(env, g, info.point), g.key);
        return;
      }
      const { doc, scene3d } = env;
      if (!scene3d) return;
      const { x, y } = info.point;
      const { scene } = scene3d;
      const aspect = cellAspect(doc.font);
      env.selectBody3D(pickBody3D(scene, doc.width, doc.height, doc.meshes, x, y, aspect));
    },
    hoverCursor(env) {
      return env.scene3d ? null : 'not-allowed';
    },
    cancel() {
      gesture = null;
    },
  };
}
