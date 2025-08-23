export type Scenario = 'conservative'|'base'|'aggressive';

const SCENARIO_RATES: Record<Scenario, number> = {
  conservative: 0.04,
  base: 0.07,
  aggressive: 0.10,
};

export function project(
  startValue: number,
  monthlyContribution: number,
  years: number,
  scenario: Scenario
) {
  const r = SCENARIO_RATES[scenario];
  const results: {month: number; value: number}[] = [];
  let value = startValue;
  const months = Math.max(1, Math.round(years * 12));
  for (let m = 1; m <= months; m++) {
    value = value * (1 + r/12) + monthlyContribution;
    results.push({ month: m, value: Number(value.toFixed(2)) });
  }
  return results;
}
