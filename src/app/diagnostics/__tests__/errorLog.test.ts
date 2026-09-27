import { describe, expect, it } from 'vitest';
import {
  MAX_ERRORS,
  cleanStack,
  entryOf,
  formatReport,
  redact,
  restoreLog,
  withError,
} from '../errorLog';

describe('журнал ошибок без содержимого документа', () => {
  it('текст в кавычках вычищается: там бывают имена слоёв, файлов и ввод пользователя', () => {
    expect(redact('Слой «Мой секрет» не найден')).toBe('Слой «…» не найден');
    expect(redact(`Unknown effect kind: "fire2" in 'Layer X'`)).toBe(
      `Unknown effect kind: "…" in '…'`,
    );
    expect(redact('x'.repeat(1000))).toHaveLength(300);
  });

  it('стек без адреса сервера и меток сборщика, не длиннее двенадцати строк', () => {
    const stack = [
      'TypeError: boom',
      '    at run (http://localhost:5173/src/app/store/x.ts?t=123:10:5)',
      ...Array.from(
        { length: 20 },
        (_, i) => `    at f${i} (https://tauri.localhost/assets/app-abc.js:1:${i})`,
      ),
    ].join('\n');
    const clean = cleanStack(stack);
    // Первая строка — сообщение ошибки, в стек она не идёт: там бывает текст пользователя.
    expect(clean).not.toContain('TypeError');
    expect(clean.split('\n')).toHaveLength(12);
    expect(clean).toContain('at run (/src/app/store/x.ts:10:5)');
    expect(clean).not.toContain('localhost');
  });

  it('запись из ошибки и из чего угодно; журнал держит последние записи', () => {
    const error = entryOf(new RangeError('в «файле.json» нет кадров'), 'promise', 5);
    expect(error).toMatchObject({ at: 5, source: 'promise', name: 'RangeError' });
    expect(error.message).toBe('в «…» нет кадров');
    // Ни сообщение, ни стек не несут текста в кавычках.
    expect(error.stack).not.toContain('файле');
    expect(entryOf({ secret: 1 }, 'error', 1).message).toBe('[object Object]');
    let log = [error];
    for (let i = 0; i < MAX_ERRORS + 5; i++) log = withError(log, entryOf('x', 'error', i));
    expect(log).toHaveLength(MAX_ERRORS);
    expect(restoreLog([error, { at: 'x' }, null])).toEqual([error]);
    expect(restoreLog('nope')).toEqual([]);
  });

  it('отчёт: версия, среда и записи', () => {
    const report = formatReport([entryOf(new Error('boom'), 'render', 0)], {
      version: '0.1.0',
      platform: 'desktop',
      userAgent: 'UA',
    });
    expect(report).toMatch(/^Bytefall 0\.1\.0 · desktop\nUA\nОшибок в журнале: 1/);
    expect(report).toContain('render Error: boom');
  });
});
