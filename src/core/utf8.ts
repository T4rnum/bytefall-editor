/** Текст в байты UTF-8: имена в архиве, заголовок `.bytefall`. Без браузерного TextEncoder. */
export function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return new Uint8Array(out);
}

/** Байты UTF-8 обратно в текст. Битый или оборванный байт даёт знак замены, а не ошибку. */
export function fromUtf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    const extra = b < 0x80 ? 0 : b >= 0xf0 ? 3 : b >= 0xe0 ? 2 : b >= 0xc0 ? 1 : -1;
    if (extra < 0 || i + extra >= bytes.length) {
      out += '�';
      i += 1;
      continue;
    }
    let c = extra === 0 ? b : b & (0x7f >> (extra + 1));
    for (let k = 1; k <= extra; k++) c = (c << 6) | (bytes[i + k] & 63);
    out += String.fromCodePoint(c);
    i += extra + 1;
  }
  return out;
}
