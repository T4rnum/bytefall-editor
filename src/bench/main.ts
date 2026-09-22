import { PRESS_START_2P, loadFont } from '../render/font/pressStart2P';
import { GlyphAtlas } from '../render/font/GlyphAtlas';
import { type CheckResult, runChecks } from './checks';
import { type SizeReport, createHarness, frameBudget, runAll } from './harness';
import '../app/styles/tokens.css';
import './bench.css';

const ATLAS_CELL_SIZE = 32;

const rootNode = document.getElementById('root');
const stageNode = document.getElementById('stage');
if (!rootNode || !stageNode) throw new Error('Разметка страницы замеров сломана');
const root: HTMLElement = rootNode;
const stage: HTMLElement = stageNode;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const ms = (value: number): string =>
  value === 0 ? '—' : value < 1 ? value.toFixed(3) : value.toFixed(2);

function renderReports(reports: readonly SizeReport[]): HTMLElement {
  const wrap = element('section');
  wrap.append(element('h2', undefined, 'Замеры'));
  for (const report of reports) {
    wrap.append(element('h3', undefined, report.size.label));
    const table = element('table');
    const head = element('tr');
    for (const title of ['Что', 'Среднее, мс', 'Худшие 5%, мс', 'Замеров', 'Смысл']) {
      head.append(element('th', undefined, title));
    }
    table.append(head);
    for (const m of report.measurements) {
      const row = element('tr');
      row.append(element('td', undefined, m.label));
      row.append(element('td', 'num', ms(m.mean)));
      row.append(element('td', 'num', ms(m.p95)));
      row.append(element('td', 'num', String(m.samples)));
      const meaning =
        m.label.startsWith('кадр') && m.samples > 0 ? `${m.note} · ${frameBudget(m.mean)}` : m.note;
      row.append(element('td', 'note', meaning ?? ''));
      table.append(row);
    }
    wrap.append(table);
  }
  return wrap;
}

function renderChecks(checks: readonly CheckResult[]): HTMLElement {
  const wrap = element('section');
  const failed = checks.filter((c) => !c.passed).length;
  wrap.append(
    element(
      'h2',
      undefined,
      failed === 0
        ? `Проверки картинки: все ${checks.length} пройдены`
        : `Проверки картинки: ${failed} из ${checks.length} провалены`,
    ),
  );
  const table = element('table');
  for (const check of checks) {
    const row = element('tr', check.passed ? 'ok' : 'fail');
    row.append(element('td', undefined, check.passed ? 'да' : 'НЕТ'));
    row.append(element('td', undefined, check.name));
    row.append(element('td', 'note', check.detail));
    table.append(row);
  }
  wrap.append(table);
  return wrap;
}

async function main(): Promise<void> {
  const status = element('p', 'status', 'Загружаем шрифт…');
  root.append(status);
  await loadFont();
  const atlas = new GlyphAtlas({ fontFamily: PRESS_START_2P.family, cellSize: ATLAS_CELL_SIZE });

  status.textContent = 'Проверяем картинку…';
  const harness = createHarness(stage, atlas);
  let checks: CheckResult[];
  try {
    checks = runChecks(harness.view);
  } finally {
    harness.dispose();
  }
  root.append(renderChecks(checks));

  const reports = await runAll(stage, atlas, (label) => {
    status.textContent = `Меряем ${label}…`;
  });
  root.append(renderReports(reports));
  status.textContent = `Готово. ${navigator.userAgent}`;
  // Чтобы результат можно было забрать из консоли или из автоматизации.
  (window as unknown as { benchResults?: unknown }).benchResults = { checks, reports };
}

void main().catch((error: unknown) => {
  root.append(element('p', 'status', `Ошибка: ${String(error)}`));
});
