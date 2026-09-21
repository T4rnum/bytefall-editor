import { describe, expect, it } from 'vitest';
import { safeFileName } from '../filename';

describe('safeFileName', () => {
  it('keeps letters and digits of any script, replaces the rest', () => {
    expect(safeFileName('My Art: v2/final')).toBe('My_Art_v2_final');
    expect(safeFileName('Замок №3')).toBe('Замок_3');
    expect(safeFileName('../../etc/passwd')).toBe('etc_passwd');
  });

  it('falls back for empty names and escapes Windows reserved names', () => {
    expect(safeFileName('   ')).toBe('untitled');
    expect(safeFileName('con')).toBe('_con');
    expect(safeFileName('LPT1')).toBe('_LPT1');
    expect(safeFileName('console')).toBe('console');
  });

  it('caps the length', () => {
    expect(safeFileName('a'.repeat(200))).toHaveLength(64);
  });
});
