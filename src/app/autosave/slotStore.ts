import type { RecoverySlot } from '../../core/recovery';

/** Где лежат записи автосохранения. Отдельный интерфейс, чтобы автосохранение тестировалось без браузера. */
export interface SlotStore {
  /** Сырые записи: их проверяет ядро, потому что хранилище недоверенное. */
  list(): Promise<unknown[]>;
  put(slot: RecoverySlot): Promise<void>;
  remove(session: string): Promise<void>;
}

const DB_NAME = 'bytefall-editor';
const DB_VERSION = 1;
const STORE = 'recovery';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('запрос к IndexedDB не удался'));
  });
}

/** Транзакция считается завершённой, когда запись легла на место, а не когда запрос принят. */
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('запись в IndexedDB не удалась'));
    tx.onabort = () => reject(tx.error ?? new Error('запись в IndexedDB прервана'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'session' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('не удалось открыть IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB занята другой вкладкой'));
  });
}

/**
 * IndexedDB, а не localStorage: у того лимит около пяти мегабайт, а плотный документ 512×288
 * в формате файла весит восемь с лишним.
 */
export function indexedDbStore(): SlotStore {
  let db: Promise<IDBDatabase> | null = null;
  // Неудачное открытие не запоминается: хранилище могло быть занято, и следующая попытка пройдёт.
  const database = (): Promise<IDBDatabase> => {
    db ??= openDatabase().catch((error: unknown) => {
      db = null;
      throw error;
    });
    return db;
  };

  return {
    async list() {
      const tx = (await database()).transaction(STORE, 'readonly');
      return request(tx.objectStore(STORE).getAll());
    },
    async put(slot) {
      // Строгая запись доходит до диска, а не только до памяти браузера: переживёт и его падение.
      const tx = (await database()).transaction(STORE, 'readwrite', { durability: 'strict' });
      tx.objectStore(STORE).put(slot);
      await done(tx);
    },
    async remove(session) {
      const tx = (await database()).transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(session);
      await done(tx);
    },
  };
}
