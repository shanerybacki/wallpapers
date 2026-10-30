import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cholesky, choleskySolve, solveLower, solveLowerTransposed } from '../shared/linalg.js';

const A = [
  [4, 12, -16],
  [12, 37, -43],
  [-16, -43, 98],
];

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('cholesky matches the known factor and reconstructs A', () => {
  const L = cholesky(A);
  const expected = [[2, 0, 0], [6, 1, 0], [-8, 5, 3]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) close(L[i][j], expected[i][j]);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += L[i][k] * L[j][k];
      close(s, A[i][j]);
    }
  }
});

test('triangular and full solves are correct', () => {
  const L = cholesky(A);
  const b = [1, 2, 3];
  const y = solveLower(L, b);
  for (let i = 0; i < 3; i++) {
    let s = 0;
    for (let k = 0; k <= i; k++) s += L[i][k] * y[k];
    close(s, b[i]);
  }
  const z = solveLowerTransposed(L, b);
  for (let i = 0; i < 3; i++) {
    let s = 0;
    for (let k = i; k < 3; k++) s += L[k][i] * z[k];
    close(s, b[i]);
  }
  const x = choleskySolve(L, b);
  for (let i = 0; i < 3; i++) close(A[i].reduce((s, a, j) => s + a * x[j], 0), b[i], 1e-8);
});

test('cholesky rejects non-positive-definite matrices', () => {
  assert.throws(() => cholesky([[1, 2], [2, 1]]));
});
