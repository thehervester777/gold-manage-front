/**
 * Small, dependency-free SHA-256 so password checks work everywhere (including
 * file:// and non-secure contexts where crypto.subtle is missing).
 * Demo-grade: a production build hashes on the server with a slow KDF.
 */
const K: number[] = [];
const H0: number[] = [];
(() => {
  const isPrime = (n: number) => {
    for (let f = 2; f * f <= n; f++) if (n % f === 0) return false;
    return true;
  };
  const frac = (x: number) => ((x - Math.floor(x)) * 4294967296) | 0;
  for (let c = 2, n = 0; n < 64; c++) {
    if (isPrime(c)) {
      if (n < 8) H0[n] = frac(Math.pow(c, 1 / 2));
      K[n++] = frac(Math.pow(c, 1 / 3));
    }
  }
})();

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 9 + 63) >> 6) << 6));
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  const H = H0.slice();
  const w = new Array<number>(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

export const hashPassword = (password: string, salt: string) => `s256:${sha256Hex(`${salt}:${password}`)}`;
export const checkPassword = (password: string, salt: string, hash: string) => hashPassword(password, salt) === hash;

export function randomSalt(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 12; i++) s += Math.floor(rand() * 36).toString(36);
  return s;
}
