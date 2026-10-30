// Small dense linear algebra. Matrices are arrays of row arrays.

// Lower-triangular L with A = L Lᵀ. A must be symmetric positive definite.
export function cholesky(A) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) throw new Error('cholesky: matrix is not positive definite');
        L[i][i] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

// Solves L x = b.
export function solveLower(L, b) {
  const n = L.length;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= L[i][k] * x[k];
    x[i] = sum / L[i][i];
  }
  return x;
}

// Solves Lᵀ x = b.
export function solveLowerTransposed(L, b) {
  const n = L.length;
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let k = i + 1; k < n; k++) sum -= L[k][i] * x[k];
    x[i] = sum / L[i][i];
  }
  return x;
}

// Solves (L Lᵀ) x = b.
export function choleskySolve(L, b) {
  return solveLowerTransposed(L, solveLower(L, b));
}
