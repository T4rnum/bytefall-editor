import { describe, expect, it } from 'vitest';
import { MAX_PALETTE_COLORS, formatPalette, parsePalette } from '../paletteFile';

describe('палитра из файла', () => {
  it('GIMP: цвета десятичными тройками, имена и заголовки пропускаются', () => {
    const gpl = [
      'GIMP Palette',
      'Name: PICO-8',
      'Columns: 4',
      '#',
      '  0   0   0\tBlack',
      ' 29  43  83\tDark blue',
      '255 241 232',
    ].join('\n');
    expect(parsePalette(gpl)).toEqual(['#000000', '#1d2b53', '#fff1e8']);
  });

  it('JASC: версия и число цветов не становятся цветами', () => {
    expect(parsePalette('JASC-PAL\r\n0100\r\n2\r\n0 0 0\r\n29 43 83\r\n')).toEqual([
      '#000000',
      '#1d2b53',
    ]);
  });

  it('Paint.NET: aarrggbb без решётки, комментарии через точку с запятой', () => {
    const txt = '; paint.net Palette File\n; Colors: 2\nFF000000\nFF1D2B53\n';
    expect(parsePalette(txt)).toEqual(['#000000', '#1d2b53']);
  });

  it('Lospec .hex и вставленный текст: с решёткой и без, через пробел, запятую и строку', () => {
    expect(parsePalette('000000\n1d2b53\n')).toEqual(['#000000', '#1d2b53']);
    expect(parsePalette('#FF0000, #0f0; 0000ff #11223380')).toEqual([
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#112233',
    ]);
  });

  it('числа, слова и обрывки не становятся цветами, повторы убираются', () => {
    expect(parsePalette('255 0 0 red blue 12345 #12 #ff00#00 #ff0000 #FF0000')).toEqual([
      '#ff0000',
    ]);
    expect(parsePalette('')).toEqual([]);
  });

  it('больше предела цветов не бывает, строкой палитра сохраняется через пробел', () => {
    const many = Array.from({ length: 300 }, (_, i) => i.toString(16).padStart(6, '0')).join(' ');
    expect(parsePalette(many)).toHaveLength(MAX_PALETTE_COLORS);
    expect(formatPalette(['#000000', '#ffffff'])).toBe('#000000 #ffffff');
    expect(parsePalette(formatPalette(['#000000', '#ffffff']))).toEqual(['#000000', '#ffffff']);
  });
});
