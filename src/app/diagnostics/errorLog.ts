/**
 * Журнал ошибок редактора — без содержимого документа. Сообщение ошибки может нести имя слоя,
 * файла или текст, который пользователь ввёл: всё в кавычках вычищается, стек — только пути
 * модулей редактора. Журнал живёт у пользователя и уходит куда-то, только если он сам скопирует
 * отчёт.
 */
export type ErrorSource = 'error' | 'promise' | 'render';

export interface ErrorEntry {
  readonly at: number;
  readonly source: ErrorSource;
  readonly name: string;
  readonly message: string;
  readonly stack: string;
}

export const MAX_ERRORS = 50;
const MAX_MESSAGE = 300;
const MAX_STACK_LINES = 12;

/** Всё в кавычках — «ёлочках», двойных, одинарных, обратных — может быть текстом пользователя. */
export function redact(text: string): string {
  return text
    .replace(/«[^»]*»/g, '«…»')
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, "'…'")
    .replace(/`[^`]*`/g, '`…`')
    .slice(0, MAX_MESSAGE);
}

/** Строка стека — кадр вызова: `at …` в Chrome, `функция@адрес` в Firefox и Safari. */
const isFrame = (line: string): boolean => /^\s*at\s/.test(line) || line.includes('@');

/**
 * Стек без адреса сервера и меток сборщика: остаются модули и строки. Первую строку Chrome
 * пишет сообщением ошибки — в ней текст пользователя, — поэтому остаются только кадры вызовов.
 */
export function cleanStack(stack: string): string {
  return stack
    .split('\n')
    .filter(isFrame)
    .slice(0, MAX_STACK_LINES)
    .map((line) => redact(line.replace(/https?:\/\/[^/\s)]+/g, '').replace(/\?[^:\s)]*/g, '')))
    .join('\n');
}

/** Запись журнала из чего угодно, что бросили: ошибки, строки, объекты. */
export function entryOf(thrown: unknown, source: ErrorSource, at: number): ErrorEntry {
  if (thrown instanceof Error) {
    return {
      at,
      source,
      name: thrown.name,
      message: redact(thrown.message),
      stack: cleanStack(thrown.stack ?? ''),
    };
  }
  const message = typeof thrown === 'string' ? thrown : Object.prototype.toString.call(thrown);
  return { at, source, name: 'NonError', message: redact(message), stack: '' };
}

/** Журнал с новой записью: старые уходят за пределом. */
export const withError = (log: readonly ErrorEntry[], entry: ErrorEntry): ErrorEntry[] =>
  [...log, entry].slice(-MAX_ERRORS);

/** Журнал из хранилища: только целые записи. */
export function restoreLog(raw: unknown): ErrorEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is ErrorEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as ErrorEntry).at === 'number' &&
        typeof (e as ErrorEntry).message === 'string' &&
        typeof (e as ErrorEntry).stack === 'string' &&
        typeof (e as ErrorEntry).name === 'string' &&
        ['error', 'promise', 'render'].includes((e as ErrorEntry).source),
    )
    .slice(-MAX_ERRORS);
}

export interface ReportContext {
  readonly version: string;
  readonly platform: string;
  readonly userAgent: string;
}

/** Отчёт текстом: версия, среда и записи журнала — ни строчки документа. */
export function formatReport(log: readonly ErrorEntry[], context: ReportContext): string {
  const head = [
    `Bytefall ${context.version} · ${context.platform}`,
    context.userAgent,
    `Ошибок в журнале: ${log.length}`,
  ];
  const entries = log.map((e) =>
    [`[${new Date(e.at).toISOString()}] ${e.source} ${e.name}: ${e.message}`, e.stack]
      .filter(Boolean)
      .join('\n'),
  );
  return [...head, '', ...entries].join('\n');
}
