export interface RobustLoss {
  rhoSquared(residualSquared: number): number;
  weight(residualSquared: number): number;
}

export class HuberLoss implements RobustLoss {
  constructor(private readonly delta = 1) {
    if (!Number.isFinite(delta) || delta <= 0) throw new Error("Huber delta must be positive.");
  }

  rhoSquared(residualSquared: number): number {
    if (!Number.isFinite(residualSquared) || residualSquared < 0) return Infinity;
    const deltaSquared = this.delta * this.delta;
    return residualSquared <= deltaSquared
      ? residualSquared
      : 2 * this.delta * Math.sqrt(residualSquared) - deltaSquared;
  }

  weight(residualSquared: number): number {
    if (!Number.isFinite(residualSquared) || residualSquared < 0) return 0;
    if (residualSquared === 0 || residualSquared <= this.delta * this.delta) return 1;
    return this.delta / Math.sqrt(residualSquared);
  }
}
