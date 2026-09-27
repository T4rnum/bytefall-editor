import { JobCancelled } from '../jobs/job';
import { type EncodeReply, type EncodeTask, runEncode } from './encodeTask';

interface Pending {
  readonly resolve: (bytes: Uint8Array) => void;
  readonly reject: (error: Error) => void;
}

let worker: Worker | null = null;
let serial = 0;
const pending = new Map<number, Pending>();

/** Воркер умер или его остановили: все, кто ждал, получают ошибку, следующий создаст новый. */
function drop(error: Error): void {
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) p.reject(error);
  pending.clear();
}

function encoder(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('./encoder.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<EncodeReply>) => {
      const reply = event.data;
      const waiting = pending.get(reply.id);
      pending.delete(reply.id);
      if (!waiting) return;
      if ('bytes' in reply) waiting.resolve(reply.bytes);
      else waiting.reject(new Error(reply.error));
    };
    worker.onerror = (event) => drop(new Error(event.message || 'воркер кодирования упал'));
  }
  return worker;
}

/**
 * Кодирует кадры в воркере, чтобы редактор не замирал; без воркеров — на месте. Буферы кадров
 * передаются воркеру и после вызова недоступны. Отмена останавливает воркер сразу, не дожидаясь
 * конца кодирования.
 */
export function encodeOffThread(task: EncodeTask, signal: AbortSignal): Promise<Uint8Array> {
  const target = encoder();
  if (!target) return runEncode(task);
  if (signal.aborted) return Promise.reject(new JobCancelled());
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const onAbort = (): void => drop(new JobCancelled());
    signal.addEventListener('abort', onAbort, { once: true });
    const settle = (): void => signal.removeEventListener('abort', onAbort);
    pending.set(id, {
      resolve: (bytes) => {
        settle();
        resolve(bytes);
      },
      reject: (error) => {
        settle();
        reject(error);
      },
    });
    target.postMessage(
      { id, task },
      task.frames.map((f) => f.data.buffer),
    );
  });
}
