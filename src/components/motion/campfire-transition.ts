import { motionTokens } from "./tokens";

/** Scene-space transform: lighting/shadows stay in their original coordinates. */
export function stageProgress(value: number, start: number, end: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/** A seekable envelope: no accumulated simulation state, exact rest at both ends. */
export function hangingMotion(progress: number) {
  const motion = motionTokens.heroPrototype.transition;
  const oscillate = (track: typeof motion.rebound | typeof motion.swing) => {
    const t = Math.max(0, Math.min(1, (progress - track.start) / (track.end - track.start)));
    const envelope = stageProgress(t, 0, motion.settleAttack)
      * (1 - stageProgress(t, motion.settleFade, 1)) * Math.exp(-track.decay * t);
    return track.amplitude * Math.sin(t * Math.PI * 2 * track.cycles) * envelope;
  };
  const rebound = oscillate(motion.rebound);
  return { rebound, swing: oscillate(motion.swing), slack: Math.max(0, rebound) * motion.ropeSlack };
}

/** Rotate the projected scene about the fixed ceiling point, preserving pixel aspect. */
export function suspensionMatrix(angle: number, aspect: number) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return new Float32Array([
    c, s * aspect, 0, 0,
    -s / aspect, c, 0, 0,
    0, 0, 1, 0,
    s / aspect, 1 - c, 0, 1,
  ]);
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
