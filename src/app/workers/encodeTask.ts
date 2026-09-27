import { type RenderedFrame, encodeGif } from '../io/animationExport';
import { frameArchive, sheetArchive } from '../io/archives';

/**
 * Кодирование готовых кадров экспорта: то, что не требует GPU и может идти в воркере, пока
 * редактор отзывается. Кадры уходят в воркер передачей буферов, без копий.
 */
export type EncodeTask =
  | { readonly kind: 'gif'; readonly frames: RenderedFrame[]; readonly transparent: boolean }
  | { readonly kind: 'sheet'; readonly frames: RenderedFrame[]; readonly name: string }
  | {
      readonly kind: 'frames';
      readonly frames: RenderedFrame[];
      readonly name: string;
      readonly fps: number;
    };

export async function runEncode(task: EncodeTask): Promise<Uint8Array> {
  switch (task.kind) {
    case 'gif':
      return encodeGif(task.frames, task.transparent);
    case 'sheet':
      return sheetArchive(task.frames, task.name);
    case 'frames':
      return frameArchive(task.frames, task.name, task.fps);
  }
}

export interface EncodeRequest {
  readonly id: number;
  readonly task: EncodeTask;
}

export type EncodeReply =
  | { readonly id: number; readonly bytes: Uint8Array }
  | { readonly id: number; readonly error: string };
