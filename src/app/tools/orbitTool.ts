import type { Point } from '../../core/geometry';
import { dollyCamera, orbitCamera, panCamera } from '../../core/scene3d/camera';
import type { Camera3D } from '../../core/scene3d/types';
import type { PointerInfo, Tool, ToolEnv } from './types';

/** Градусов орбиты на ширину холста: протащить через весь холст — пол-оборота. */
const DEGREES_PER_CANVAS = 180;

type Mode = 'orbit' | 'pan' | 'dolly';

interface Gesture {
  readonly layerId: string;
  readonly camera: Camera3D;
  readonly from: Point;
  readonly mode: Mode;
  readonly key: string;
}

let gestures = 0;

/** Камера после жеста: всё от исходной камеры, так что жест можно вести туда и обратно. */
function cameraAt(env: ToolEnv, g: Gesture, point: Point): Camera3D {
  const dx = point.x - g.from.x;
  const dy = point.y - g.from.y;
  const { width, height } = env.doc;
  switch (g.mode) {
    case 'pan':
      return panCamera(g.camera, dx / height, dy / height);
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

/**
 * Орбита: камера 3D-слоя мышью. Тянуть — вращение вокруг цели, с Shift — сдвиг вместе с целью,
 * с Alt — приближение. Жест — одна запись истории; у анимированной камеры — ключ в текущий момент.
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
      };
    },
    onPointerMove(env, info) {
      if (gesture)
        env.setCamera3D(gesture.layerId, cameraAt(env, gesture, info.point), gesture.key);
    },
    onPointerUp(env, info) {
      if (gesture)
        env.setCamera3D(gesture.layerId, cameraAt(env, gesture, info.point), gesture.key);
      gesture = null;
    },
    hoverCursor(env) {
      return env.scene3d ? null : 'not-allowed';
    },
    cancel() {
      gesture = null;
    },
  };
}
