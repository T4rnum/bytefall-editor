import { newId } from '../../core/document';

const LOCK_PREFIX = 'bytefall-session:';

/** Сессия этой вкладки. Новая при каждой загрузке страницы. */
export const SESSION_ID = newId('session');

/**
 * Вкладка держит блокировку на своё имя всё время жизни. Браузер снимает её сам, когда вкладка
 * закрывается или падает, поэтому по списку блокировок видно, какие сессии ещё живы, — без
 * пульса по таймеру и без гаданий, сколько секунд тишины считать смертью.
 *
 * Web Locks есть во всех актуальных браузерах. Без них соседняя живая вкладка выглядит умершей,
 * и её работу предложат восстановить — копией, так что ничего не теряется.
 */
export function holdSessionLock(session: string): void {
  const locks = globalThis.navigator?.locks;
  if (!locks) return;
  void locks.request(`${LOCK_PREFIX}${session}`, () => new Promise<never>(() => undefined));
}

export async function liveSessions(): Promise<Set<string>> {
  const locks = globalThis.navigator?.locks;
  if (!locks) return new Set();
  const { held = [] } = await locks.query();
  return new Set(
    held
      .map((lock) => lock.name ?? '')
      .filter((name) => name.startsWith(LOCK_PREFIX))
      .map((name) => name.slice(LOCK_PREFIX.length)),
  );
}
