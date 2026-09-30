import type { RecoverySlot } from '../../core/recovery';

/** Где лежат записи автосохранения. Отдельный интерфейс, чтобы автосохранение тестировалось без браузера. */
export interface SlotStore {
  /** Сырые записи: их проверяет ядро, потому что хранилище недоверенное. */
  list(): Promise<unknown[]>;
  put(slot: RecoverySlot): Promise<void>;
  remove(session: string): Promise<void>;
}

/**
 * Запасная запись на уход со страницы. IndexedDB асинхронна, и запись, начатая при закрытии
 * вкладки, часто не успевает лечь: пропадают правки последних секунд. Эта пишет синхронно.
 */
export interface ExitStore {
  list(): unknown[];
  put(slot: RecoverySlot): void;
  remove(session: string): void;
}

const EXIT_PREFIX = 'bytefall-exit:';

/** Какая часть Storage нужна запасной записи: хватает и заглушки в тестах. */
export type ExitArea = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

/**
 * localStorage пишет синхронно, поэтому копия успевает до выгрузки. Места там около пяти
 * мегабайт: большой документ не влезет, и тогда остаётся только основная запись в IndexedDB.
 * Хранилище может быть вовсе недоступно — тогда запасной записи просто нет.
 */
export function localExitStore(area?: ExitArea): ExitStore {
  const storage = (): ExitArea | null => {
    try {
      return area ?? globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  };
  return {
    list() {
      const s = storage();
      const found: unknown[] = [];
      try {
        for (let i = 0; s && i < s.length; i++) {
          const key = s.key(i);
          if (!key?.startsWith(EXIT_PREFIX)) continue;
          try {
            found.push(JSON.parse(s.getItem(key) ?? 'null'));
          } catch {
            // Битая копия пропускается: её проверило бы ядро, но разобрать её нельзя вовсе.
          }
        }
      } catch {
        // Хранилище отказало посреди чтения: предлагаем то, что успели прочитать.
      }
      return found;
    },
    put(slot) {
      try {
        storage()?.setItem(EXIT_PREFIX + slot.session, JSON.stringify(slot));
      } catch {
        // Не влезло или хранилище закрыто: остаётся основная запись.
      }
    },
    remove(session) {
      try {
        storage()?.removeItem(EXIT_PREFIX + session);
      } catch {
        // Стереть нечем — копия будет перекрыта следующей записью или предложена один раз.
      }
    },
  };
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
