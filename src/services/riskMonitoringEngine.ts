// Binary risk invalidation hook — FINMA-safe systematic research layer.
//
// COMPLIANCE RULE (Swiss FinSA Art. 3): the application never compiles direct
// market directives (Buy/Sell/Entry/Target). Risk is evaluated as a hard
// mathematical state, and the interface renders algorithmic classifications,
// never explicit buying or selling advice. No conversational paragraph
// explanations are permitted within these validation loops.

export type RiskStatus = 'ACTIVE' | 'INVALIDATED';
export type AlgorithmicState = 'EXPANSION' | 'CONTRACTION' | 'NEUTRAL';

// Hard binary mathematical evaluation. Price below the numeric invalidation
// level flips the asset to INVALIDATED — no emotion, no paragraphs. Unset or
// non-positive inputs are treated as "no level configured" and stay ACTIVE.
export function evaluateRiskState(currentPrice: number, invalidationLevel: number): RiskStatus {
  if (currentPrice <= 0 || invalidationLevel <= 0) return 'ACTIVE';

  if (currentPrice < invalidationLevel) {
    return 'INVALIDATED';
  }

  return 'ACTIVE';
}

// Algorithmic state classifier: position of price between the primary
// liquidity support and the measured-move resistance. Purely positional —
// carries no directive semantics.
export function classifyAlgorithmicState(
  currentPrice: number,
  primaryLiquiditySupport?: number,
  measuredMoveResistance?: number,
): AlgorithmicState {
  if (currentPrice <= 0) return 'NEUTRAL';
  if (measuredMoveResistance && measuredMoveResistance > 0 && currentPrice > measuredMoveResistance) {
    return 'EXPANSION';
  }
  if (primaryLiquiditySupport && primaryLiquiditySupport > 0 && currentPrice < primaryLiquiditySupport) {
    return 'CONTRACTION';
  }
  return 'NEUTRAL';
}
