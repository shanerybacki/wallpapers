import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  conditionOn,
  crossCovariance,
  evalFeatures,
  featureMatrix,
  pathwiseUpdate,
  predict,
  randomFourierFeatures,
  rbfKernel,
} from '../wallpapers/gaussian-process/gp.js';
import { createRng } from '../shared/rng.js';

const kernel = rbfKernel(1);
const X = [1, 3, 6];
const y = [0.5, -1, 2];

test('near-noiseless posterior interpolates observations with ~zero variance', () => {
  const cond = conditionOn(X, y, [1e-8, 1e-8, 1e-8], kernel);
  const { mean, std } = predict(cond, X);
  for (let i = 0; i < X.length; i++) {
    assert.ok(Math.abs(mean[i] - y[i]) < 1e-5);
    assert.ok(std[i] < 1e-3);
  }
});

test('far from data the posterior returns to the prior', () => {
  const cond = conditionOn(X, y, [1e-4, 1e-4, 1e-4], kernel);
  const { mean, std } = predict(cond, [50]);
  assert.ok(Math.abs(mean[0]) < 1e-6);
  assert.ok(Math.abs(std[0] - 1) < 1e-6);
});

test('huge noise (a fully faded observation) recovers the prior', () => {
  const cond = conditionOn([2], [3], [1e9], kernel);
  const { mean, std } = predict(cond, [2]);
  assert.ok(Math.abs(mean[0]) < 1e-6);
  assert.ok(Math.abs(std[0] - 1) < 1e-6);
});

test('no observations gives the prior', () => {
  const cond = conditionOn([], [], [], kernel);
  const { mean, std } = predict(cond, [0, 1]);
  assert.deepEqual([...mean], [0, 0]);
  assert.deepEqual([...std], [1, 1]);
});

test('Matheron update makes a prior sample pass through the observations', () => {
  const rff = randomFourierFeatures(createRng('rff'), 64, 1);
  const xs = Float64Array.from({ length: 50 }, (_, i) => i * 0.2);
  const weights = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i * 1.7));
  const prior = evalFeatures(featureMatrix(rff, xs), xs.length, weights, 0, new Float64Array(xs.length));
  const priorX = evalFeatures(featureMatrix(rff, X), X.length, weights, 0, new Float64Array(X.length));

  const cond = conditionOn(X, y, [1e-8, 1e-8, 1e-8], kernel);
  const atObs = pathwiseUpdate(cond, crossCovariance(cond, X), priorX, priorX, new Float64Array(X.length));
  for (let i = 0; i < X.length; i++) assert.ok(Math.abs(atObs[i] - y[i]) < 1e-4);

  const path = pathwiseUpdate(cond, crossCovariance(cond, xs), prior, priorX, new Float64Array(xs.length));
  assert.ok(path.every(Number.isFinite));
});

test('random Fourier features approximate the RBF kernel', () => {
  const rff = randomFourierFeatures(createRng('approx'), 4000, 1);
  const Phi = featureMatrix(rff, [0, 0.5, 2]);
  const k = (i, j) => {
    let s = 0;
    for (let d = 0; d < rff.count; d++) s += Phi[d * 3 + i] * Phi[d * 3 + j];
    return s;
  };
  assert.ok(Math.abs(k(0, 0) - 1) < 0.05);
  assert.ok(Math.abs(k(0, 1) - kernel(0, 0.5)) < 0.05);
  assert.ok(Math.abs(k(0, 2) - kernel(0, 2)) < 0.05);
});
