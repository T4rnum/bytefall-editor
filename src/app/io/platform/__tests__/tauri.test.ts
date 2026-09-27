import { afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * Настольная платформа без окна: вызовы плагинов Tauri подменяются `mockIPC`, и тест видит,
 * какие команды с какими аргументами уходят в диалог и в файловый плагин.
 */
type Call = { cmd: string; args: unknown; headers?: Record<string, string> };
const calls: Call[] = [];
let answers: Record<string, unknown> = {};

beforeAll(async () => {
  // В node нет окна: плагины ищут внутренности Tauri на window.
  Object.assign(globalThis, { window: globalThis });
  const { mockIPC } = await import('@tauri-apps/api/mocks');
  mockIPC((cmd, args) => {
    const payload = args as { headers?: Record<string, string> } | undefined;
    calls.push({ cmd, args, headers: payload?.headers });
    return answers[cmd];
  });
});

afterEach(() => {
  calls.length = 0;
  answers = {};
});

const kind = { description: 'Документ', extensions: ['.json', '.xp'], mimeTypes: [] };

describe('файлы в настольном приложении', () => {
  it('открытие: путь из диалога, имя — из пути, место на диске запомнено', async () => {
    const { tauriPlatform } = await import('../tauri');
    answers = {
      'plugin:dialog|open': 'E:\\art\\hero.bp.json',
      'plugin:fs|stat': { size: 42, mtime: 1000, isFile: true, isDirectory: false },
    };
    const picked = await tauriPlatform.pickFile(kind);
    expect(picked).toMatchObject({
      name: 'hero.bp.json',
      size: 42,
      target: { kind: 'path', path: 'E:\\art\\hero.bp.json' },
    });
    const open = calls.find((c) => c.cmd === 'plugin:dialog|open')!.args as {
      options: { filters: { extensions: string[] }[] };
    };
    expect(open.options.filters[0].extensions).toEqual(['json', 'xp']);
  });

  it('отмена диалога — null; сохранение в известный путь — без диалога', async () => {
    const { tauriPlatform } = await import('../tauri');
    answers = { 'plugin:dialog|open': null };
    expect(await tauriPlatform.pickFile(kind)).toBeNull();
    calls.length = 0;
    const saved = await tauriPlatform.saveFile(new Blob(['{}']), kind, 'x.json', {
      kind: 'path',
      path: '/home/me/x.bp.json',
    });
    expect(saved).toEqual({
      name: 'x.bp.json',
      target: { kind: 'path', path: '/home/me/x.bp.json' },
    });
    expect(calls.map((c) => c.cmd)).toEqual(['plugin:fs|write_file']);
  });

  it('«Сохранить как» — диалог с именем по умолчанию, отказ — null и ничего не пишется', async () => {
    const { tauriPlatform } = await import('../tauri');
    answers = { 'plugin:dialog|save': 'C:\\out\\scene.bp.json' };
    const saved = await tauriPlatform.saveFile(
      Promise.resolve(new Blob(['{}'])),
      kind,
      'scene.bp.json',
      null,
    );
    expect(saved?.name).toBe('scene.bp.json');
    const save = calls.find((c) => c.cmd === 'plugin:dialog|save')!.args as {
      options: { defaultPath: string };
    };
    expect(save.options.defaultPath).toBe('scene.bp.json');
    calls.length = 0;
    answers = { 'plugin:dialog|save': null };
    expect(await tauriPlatform.saveFile(new Blob(['{}']), kind, 'a.json', null)).toBeNull();
    expect(calls.map((c) => c.cmd)).toEqual(['plugin:dialog|save']);
  });
});
