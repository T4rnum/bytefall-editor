import { create } from 'zustand';
import { JobCancelled, type JobContext, createJobContext } from '../jobs/job';
import { errorMessage, notify } from './notifyStore';

/** Идущая долгая работа: что делается, сколько сделано, как отменить. */
export interface RunningJob {
  readonly label: string;
  readonly done: number;
  readonly total: number;
  readonly cancel: () => void;
}

interface JobState {
  readonly job: RunningJob | null;
  set: (job: RunningJob | null) => void;
}

export const useJobStore = create<JobState>((set) => ({
  job: null,
  set: (job) => set({ job }),
}));

/**
 * Запускает долгую работу с прогрессом и отменой в строке состояния. Одна за раз: вторая,
 * пока идёт первая, не начинается. Отмена — не ошибка, о ней просто сообщается; ошибка работы
 * тоже становится уведомлением. null — работа не дошла до конца.
 */
export async function runJob<T>(
  label: string,
  work: (job: JobContext) => Promise<T>,
): Promise<T | null> {
  const store = useJobStore.getState();
  if (store.job) {
    notify(`Сначала дождитесь конца: ${store.job.label.toLowerCase()}`, 'error');
    return null;
  }
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  store.set({ label, done: 0, total: 0, cancel });
  const progress = (done: number, total: number): void => {
    const job = useJobStore.getState().job;
    if (job && (job.done !== done || job.total !== total)) store.set({ ...job, done, total });
  };
  try {
    return await work(createJobContext(controller.signal, progress));
  } catch (error) {
    if (error instanceof JobCancelled || controller.signal.aborted) notify(`${label}: отменено`);
    else notify(`${label}: не получилось — ${errorMessage(error)}`, 'error');
    return null;
  } finally {
    store.set(null);
  }
}

/** Escape и кнопка «Отмена» в строке состояния. */
export function cancelJobAction(): void {
  useJobStore.getState().job?.cancel();
}
