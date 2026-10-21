/** Scene-space transform: lighting/shadows stay in their original coordinates. */
export function stageProgress(value: number, start: number, end: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function multiplyMatrices(a: ArrayLike<number>, b: ArrayLike<number>) {
  const result = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 4; k++) result[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  }
  return result;
}

export function projectPoint(matrix: ArrayLike<number>, point: number[]) {
  const p = [...point, 1];
  const clip = [0, 0, 0, 0].map((_, r) => p.reduce((sum, x, c) => sum + matrix[c * 4 + r] * x, 0));
  return { x: (clip[0] / clip[3] + 1) / 2, y: (1 - clip[1] / clip[3]) / 2 };
}
