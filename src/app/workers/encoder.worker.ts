import { type EncodeReply, type EncodeRequest, runEncode } from './encodeTask';

/** Воркер кодирования экспорта: GIF, листы спрайтов, кадры PNG в архиве. */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<EncodeRequest>) => void) | null;
  postMessage(message: EncodeReply, transfer?: Transferable[]): void;
};

scope.onmessage = (event) => {
  const { id, task } = event.data;
  runEncode(task).then(
    (bytes) => scope.postMessage({ id, bytes }, [bytes.buffer]),
    (error: unknown) =>
      scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }),
  );
};
