export type WaddOption = { id: string; weight: number };
export type WaddFactor = { id: string; weight: number };
export type WaddScores = Record<string, Record<string, number>>;

export function computeWaddScores(
  options: WaddOption[],
  factors: WaddFactor[],
  scores: WaddScores
): Record<string, number> {
  const result: Record<string, number> = {};
  options.forEach(option => {
    let total = 0;
    factors.forEach(factor => {
      const factorWeight = Math.max(0, factor.weight);
      const rawScore = scores[factor.id]?.[option.id] ?? 0;
      const clamped = Math.max(-1, Math.min(1, rawScore));
      const utility = (clamped + 1) * 50; // Likert 1-5 -> utility 0-100 ((likert-1)*25)
      total += factorWeight * utility;
    });
    result[option.id] = Number(total.toFixed(2));
  });
  return result;
}

export function buildRankLookup(scores: Record<string, number>) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const lookup = new Map<string, { rank: number; total: number }>();
  const total = entries.length;
  entries.forEach(([id], idx) => {
    lookup.set(id, { rank: idx + 1, total });
  });
  return lookup;
}
