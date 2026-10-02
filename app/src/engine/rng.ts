// Deterministic PRNG: cyrb128 string hash -> sfc32 generator.

export type Rng = {
  next: () => number; // [0, 1)
  int: (n: number) => number; // [0, n)
  pick: <T>(xs: readonly T[]) => T;
  weighted: (weights: readonly number[]) => number;
  poisson: (lambda: number) => number;
  fork: (label: string) => Rng;
};

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function makeRng(seed: string): Rng {
  let [a, b, c, d] = cyrb128(seed);
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    weighted: (w) => {
      let total = 0;
      for (const x of w) total += x;
      let r = next() * total;
      for (let i = 0; i < w.length; i++) {
        r -= w[i];
        if (r < 0) return i;
      }
      return w.length - 1;
    },
    poisson: (lambda) => {
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do {
        k++;
        p *= next();
      } while (p > L);
      return k - 1;
    },
    fork: (label) => makeRng(`${seed}/${label}`),
  };
  return rng;
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function randomSeed(): string {
  let s = "";
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  for (const x of buf) s += ALPHABET[x % ALPHABET.length];
  return s;
}
