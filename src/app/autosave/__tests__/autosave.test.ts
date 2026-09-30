import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnimation } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { editsFromPoints } from '../../../core/grid';
import type { RecoverySlot } from '../../../core/recovery';
import { deserialize } from '../../../core/serialization';
import { useDocumentStore } from '../../store/documentStore';
import { type Autosave, MAX_WAIT_MS, QUIET_MS, startAutosave } from '../autosave';
import { type ExitArea, type ExitStore, type SlotStore, localExitStore } from '../slotStore';

/** Хранилище в памяти: автосохранению нужно только «положить, достать, стереть». */
function memoryStore() {
  const slots = new Map<string, RecoverySlot>();
  const puts: RecoverySlot[] = [];
  let failNext = false;
  const store: SlotStore = {
    list: () => Promise.resolve([...slots.values()]),
    put: (slot) => {
      if (failNext) {
        failNext = false;
        return Promise.reject(new Error('quota'));
      }
      puts.push(slot);
      slots.set(slot.session, slot);
      return Promise.resolve();
    },
    remove: (session) => {
      slots.delete(session);
      return Promise.resolve();
    },
  };
  return { store, slots, puts, failOnce: () => (failNext = true) };
}

let x = 0;
/** Одна правка ячейки: делает документ грязным, как настоящий мазок. */
const draw = (): void => {
  const { doc, commitCells } = useDocumentStore.getState();
  commitCells(doc.layers[0].id, editsFromPoints([{ x: x++ % 8, y: 0 }], makeCell('#')), 'draw');
};

describe('автосохранение', () => {
  let memory: ReturnType<typeof memoryStore>;
  let autosave: Autosave;
  let errors: unknown[];

  beforeEach(() => {
    vi.useFakeTimers();
    useDocumentStore
      .getState()
      .replaceAnimation(createAnimation(createDocument({ width: 8, height: 4 })));
    memory = memoryStore();
    errors = [];
    autosave = startAutosave({
      store: memory.store,
      session: 'me',
      onError: (error) => errors.push(error),
    });
  });

  afterEach(() => {
    autosave.stop();
    vi.useRealTimers();
  });

  it('пишет после паузы в правках, а не на каждую правку', async () => {
    draw();
    await vi.advanceTimersByTimeAsync(QUIET_MS / 2);
    draw();
    await vi.advanceTimersByTimeAsync(QUIET_MS / 2);
    expect(memory.puts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    expect(memory.puts).toHaveLength(1);
    // В запись лёг последний вариант, а не тот, с которого пауза началась.
    expect(deserialize(memory.puts[0].data).frames[0].layers[0].cells.size).toBe(2);
  });

  it('при правках без пауз всё равно пишет не реже раза в MAX_WAIT_MS', async () => {
    for (let t = 0; t < MAX_WAIT_MS; t += QUIET_MS / 2) {
      draw();
      await vi.advanceTimersByTimeAsync(QUIET_MS / 2);
    }
    expect(memory.puts.length).toBeGreaterThanOrEqual(1);
  });

  it('стирает запись, как только документ чист', async () => {
    draw();
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    expect(memory.slots.has('me')).toBe(true);

    const { markSaved, animation } = useDocumentStore.getState();
    markSaved({ name: 'a.bp.json', target: null }, animation);
    await vi.advanceTimersByTimeAsync(0);
    expect(memory.slots.has('me')).toBe(false);
  });

  it('flush пишет сразу и не повторяет запись той же версии', async () => {
    draw();
    await autosave.flush();
    expect(memory.puts).toHaveLength(1);
    await autosave.flush();
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);
    expect(memory.puts).toHaveLength(1);
  });

  it('чистый документ не пишется вовсе', async () => {
    await autosave.flush();
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);
    expect(memory.puts).toHaveLength(0);
  });

  it('ошибка записи сообщается и не останавливает следующие записи', async () => {
    memory.failOnce();
    draw();
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    expect(errors).toHaveLength(1);
    expect(memory.puts).toHaveLength(0);

    draw();
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    expect(memory.puts).toHaveLength(1);
  });

  it('после остановки больше ничего не пишет', async () => {
    autosave.stop();
    draw();
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);
    expect(memory.puts).toHaveLength(0);
  });
});

/** Запасное хранилище в памяти: синхронное, как localStorage. */
function memoryArea(): ExitArea & { readonly data: Map<string, string>; full: boolean } {
  const data = new Map<string, string>();
  return {
    data,
    full: false,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      if (this.full) throw new Error('QuotaExceededError');
      data.set(key, value);
    },
    removeItem: (key) => void data.delete(key),
  };
}

describe('копия на уход со страницы', () => {
  let memory: ReturnType<typeof memoryStore>;
  let area: ReturnType<typeof memoryArea>;
  let exit: ExitStore;
  let autosave: Autosave;

  beforeEach(() => {
    vi.useFakeTimers();
    useDocumentStore
      .getState()
      .replaceAnimation(createAnimation(createDocument({ width: 8, height: 4 })));
    memory = memoryStore();
    area = memoryArea();
    exit = localExitStore(area);
    autosave = startAutosave({ store: memory.store, exit, session: 'me' });
  });

  afterEach(() => {
    autosave.stop();
    vi.useRealTimers();
  });

  it('ложится сразу, ещё до того, как дописалась основная запись', () => {
    draw();
    autosave.flushOnExit();
    const copies = exit.list() as RecoverySlot[];
    expect(copies.map((c) => c.session)).toEqual(['me']);
    expect(deserialize(copies[0].data).frames[0].layers[0].cells.size).toBe(1);
  });

  it('стирается, когда основная запись догнала её', async () => {
    draw();
    autosave.flushOnExit();
    await vi.advanceTimersByTimeAsync(0);
    expect(memory.slots.has('me')).toBe(true);
    expect(exit.list()).toEqual([]);
  });

  it('остаётся, если основная запись не удалась', async () => {
    memory.failOnce();
    draw();
    autosave.flushOnExit();
    await vi.advanceTimersByTimeAsync(0);
    expect(memory.slots.has('me')).toBe(false);
    expect(exit.list()).toHaveLength(1);
  });

  it('стирается вместе с записью, когда документ чист', async () => {
    memory.failOnce();
    draw();
    autosave.flushOnExit();
    await vi.advanceTimersByTimeAsync(0);
    const { markSaved, animation } = useDocumentStore.getState();
    markSaved({ name: 'a.bp.json', target: null }, animation);
    await vi.advanceTimersByTimeAsync(0);
    expect(exit.list()).toEqual([]);
  });

  it('чистый документ копии не оставляет', () => {
    autosave.flushOnExit();
    expect(exit.list()).toEqual([]);
  });

  it('переполненное хранилище не мешает основной записи', async () => {
    area.full = true;
    draw();
    autosave.flushOnExit();
    await vi.advanceTimersByTimeAsync(0);
    expect(exit.list()).toEqual([]);
    expect(memory.slots.has('me')).toBe(true);
  });

  it('битые и чужие ключи хранилища пропускаются', () => {
    area.data.set('bytefall-exit:broken', '{not json');
    area.data.set('theme', '"dark"');
    draw();
    autosave.flushOnExit();
    expect((exit.list() as RecoverySlot[]).map((c) => c.session)).toEqual(['me']);
  });
});
