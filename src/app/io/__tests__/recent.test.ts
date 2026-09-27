import { describe, expect, it } from 'vitest';
import { MAX_RECENT, type RecentFile, restoreRecent, withRecent, withoutRecent } from '../recent';

const file = (path: string, at = 0): RecentFile => ({
  path,
  name: path.split(/[\\/]/).pop()!,
  openedAt: at,
});

describe('недавние файлы', () => {
  it('открытый встаёт первым, повтор того же пути под другим написанием уходит', () => {
    const list = withRecent(
      [file('C:\\art\\a.bp.json'), file('C:\\art\\b.bp.json')],
      file('c:/ART/B.bp.json', 5),
    );
    expect(list.map((f) => f.path)).toEqual(['c:/ART/B.bp.json', 'C:\\art\\a.bp.json']);
    expect(withoutRecent(list, 'C:\\ART\\a.bp.json').map((f) => f.path)).toEqual([
      'c:/ART/B.bp.json',
    ]);
  });

  it('не длиннее предела; из хранилища — только целые записи', () => {
    let list: RecentFile[] = [];
    for (let i = 0; i < MAX_RECENT + 5; i++) list = withRecent(list, file(`/f${i}.json`, i));
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].path).toBe(`/f${MAX_RECENT + 4}.json`);
    expect(
      restoreRecent([file('/a.json'), { path: 1 }, 'x', file('/A.json'), file('/b.json')]),
    ).toEqual([file('/a.json'), file('/b.json')]);
    expect(restoreRecent(null)).toEqual([]);
  });
});
