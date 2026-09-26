/**
 * Base64 без браузерных API: ядро работает и в воркере, и в node. Модели 3D-сцен уходят в файл
 * JSON двоичными массивами, а base64 из всех текстовых записей самая короткая.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));

export function toBase64(bytes: Uint8Array): string {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out.push(
      ALPHABET[(n >> 18) & 63],
      ALPHABET[(n >> 12) & 63],
      i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '=',
      i + 2 < bytes.length ? ALPHABET[n & 63] : '=',
    );
  }
  return out.join('');
}

/** Байты из base64; чужой символ или неверная длина — ошибка. */
export function fromBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new Error('Base64 length must be a multiple of 4');
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - pad);
  let at = 0;
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const c = text[i + k];
      const v = c === '=' && i + k >= text.length - pad ? 0 : INDEX.get(c);
      if (v === undefined) throw new Error(`Bad base64 character at ${i + k}`);
      n = (n << 6) | v;
    }
    if (at < out.length) out[at++] = (n >> 16) & 255;
    if (at < out.length) out[at++] = (n >> 8) & 255;
    if (at < out.length) out[at++] = n & 255;
  }
  return out;
}
