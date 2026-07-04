/**
 * Minimal complex arithmetic — just enough for the Durand–Kerner root finder
 * used by the 4×4 eigensolver (`eig.ts`). Value type `{ re, im }`.
 */

export interface Complex {
  re: number;
  im: number;
}

export const complex = (re: number, im = 0): Complex => ({ re, im });

export const cadd = (a: Complex, b: Complex): Complex => ({
  re: a.re + b.re,
  im: a.im + b.im,
});

export const csub = (a: Complex, b: Complex): Complex => ({
  re: a.re - b.re,
  im: a.im - b.im,
});

export const cmul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export const cscale = (a: Complex, s: number): Complex => ({
  re: a.re * s,
  im: a.im * s,
});

export const cneg = (a: Complex): Complex => ({ re: -a.re, im: -a.im });

export const cconj = (a: Complex): Complex => ({ re: a.re, im: -a.im });

/** Magnitude |a|. */
export const cabs = (a: Complex): number => Math.hypot(a.re, a.im);

export const cdiv = (a: Complex, b: Complex): Complex => {
  // Smith's algorithm — scales by the larger component to avoid overflow.
  if (Math.abs(b.re) >= Math.abs(b.im)) {
    const r = b.im / b.re;
    const d = b.re + b.im * r;
    return { re: (a.re + a.im * r) / d, im: (a.im - a.re * r) / d };
  }
  const r = b.re / b.im;
  const d = b.re * r + b.im;
  return { re: (a.re * r + a.im) / d, im: (a.im * r - a.re) / d };
};
