// Gaussian process math: exact posterior for the band and mean, and
// random Fourier features + Matheron's rule for cheap, smooth sample paths.
import { cholesky, choleskySolve, solveLower } from '../../shared/linalg.js';
import { gaussian } from '../../shared/rng.js';

export function rbfKernel(lengthscale, variance = 1) {
  const inv = 1 / (2 * lengthscale * lengthscale);
  return (a, b) => variance * Math.exp(-(a - b) * (a - b) * inv);
}

// Conditions on observations X, y with per-point noise variances.
export function conditionOn(X, y, noise, kernel) {
  const M = X.length;
  if (M === 0) return { X, y, L: [], alpha: new Float64Array(0), kernel };
  const K = X.map((xi, i) => X.map((xj, j) => kernel(xi, xj) + (i === j ? noise[i] : 0)));
  const L = cholesky(K);
  return { X, y, L, alpha: choleskySolve(L, y), kernel };
}

// k(xs[i], X[j]) as a flat row-major N×M array.
export function crossCovariance(cond, xs) {
  const M = cond.X.length;
  const out = new Float64Array(xs.length * M);
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < M; j++) out[i * M + j] = cond.kernel(xs[i], cond.X[j]);
  }
  return out;
}

// Posterior mean and standard deviation at xs.
export function predict(cond, xs, Kx = crossCovariance(cond, xs)) {
  const N = xs.length;
  const M = cond.X.length;
  const mean = new Float64Array(N);
  const std = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const prior = cond.kernel(xs[i], xs[i]);
    if (M === 0) {
      std[i] = Math.sqrt(prior);
      continue;
    }
    const kx = Kx.subarray(i * M, (i + 1) * M);
    let m = 0;
    for (let j = 0; j < M; j++) m += kx[j] * cond.alpha[j];
    const v = solveLower(cond.L, kx);
    let vv = 0;
    for (let j = 0; j < M; j++) vv += v[j] * v[j];
    mean[i] = m;
    std[i] = Math.sqrt(Math.max(prior - vv, 0));
  }
  return { mean, std };
}

// Random Fourier features approximating an RBF kernel:
// f(x) = Σ_d w_d · scale · cos(ω_d x + φ_d), with w_d ~ N(0, 1).
export function randomFourierFeatures(random, count, lengthscale, variance = 1) {
  const omega = new Float64Array(count);
  const phase = new Float64Array(count);
  for (let d = 0; d < count; d++) {
    omega[d] = gaussian(random) / lengthscale;
    phase[d] = 2 * Math.PI * random();
  }
  return { count, omega, phase, scale: Math.sqrt((2 * variance) / count) };
}

// Feature values as a flat D×N array: Phi[d * N + i].
export function featureMatrix(rff, xs) {
  const N = xs.length;
  const Phi = new Float64Array(rff.count * N);
  for (let d = 0; d < rff.count; d++) {
    for (let i = 0; i < N; i++) {
      Phi[d * N + i] = rff.scale * Math.cos(rff.omega[d] * xs[i] + rff.phase[d]);
    }
  }
  return Phi;
}

// out[i] = Σ_d weights[offset + d] · Phi[d * N + i]
export function evalFeatures(Phi, N, weights, offset, out) {
  const D = Phi.length / N;
  out.fill(0);
  for (let d = 0; d < D; d++) {
    const w = weights[offset + d];
    const row = d * N;
    for (let i = 0; i < N; i++) out[i] += w * Phi[row + i];
  }
  return out;
}

// Matheron's rule: turns a prior sample path into a posterior one.
// f_post(x) = f_prior(x) + k(x, X) (K + Σ)⁻¹ (y − f_prior(X))
export function pathwiseUpdate(cond, Kx, priorAtGrid, priorAtX, out) {
  const M = cond.X.length;
  const N = priorAtGrid.length;
  if (M === 0) {
    out.set(priorAtGrid);
    return out;
  }
  const residual = new Float64Array(M);
  for (let j = 0; j < M; j++) residual[j] = cond.y[j] - priorAtX[j];
  const beta = choleskySolve(cond.L, residual);
  for (let i = 0; i < N; i++) {
    let s = priorAtGrid[i];
    for (let j = 0; j < M; j++) s += Kx[i * M + j] * beta[j];
    out[i] = s;
  }
  return out;
}
