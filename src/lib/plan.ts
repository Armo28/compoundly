export type AccountType = 'RESP' | 'TFSA' | 'RRSP' | 'Margin' | 'Other';

export type PlanInput = {
  monthlyBudget: number;          // e.g. 1000
  childrenBirthYears: number[];   // for RESP
  year: number;                   // current year
  tfsaRoom: number;               // remaining this year
  rrspRoom: number;               // remaining this year
};

export type PlanOutput = {
  allocation: Record<AccountType, number>;
  reasoning: string[];
};

/**
 * Very simple Canada-oriented heuristic:
 * 1) RESP first to capture 20% CESG up to $500/child/year (i.e., $2,500/child/year)
 * 2) TFSA next (no tax drag), respecting remaining TFSA room this year
 * 3) RRSP next (respect room)
 * 4) Margin last
 */
export function computePlan(input: PlanInput): PlanOutput {
  const notes: string[] = [];
  const out: Record<AccountType, number> = { RESP: 0, TFSA: 0, RRSP: 0, Margin: 0, Other: 0 };
  let budget = Math.max(0, input.monthlyBudget);

  // 1) RESP grant capture
  const kids = input.childrenBirthYears.length;
  if (kids > 0 && budget > 0) {
    const annualPerChild = 2500;              // contributes to max $500 grant
    const monthlyPerChild = annualPerChild / 12;
    const respNeed = monthlyPerChild * kids;  // spread monthly
    const respAlloc = Math.min(budget, respNeed);
    if (respAlloc > 0) {
      out.RESP += respAlloc;
      budget -= respAlloc;
      notes.push(`Allocate $${respAlloc.toFixed(0)} to RESP to capture 20% CESG (up to $500/child/yr).`);
    }
  }

  // 2) TFSA up to room
  if (budget > 0 && input.tfsaRoom > 0) {
    const monthlyRoom = Math.max(0, input.tfsaRoom) / 12;
    const tfsaAlloc = Math.min(budget, monthlyRoom);
    if (tfsaAlloc > 0) {
      out.TFSA += tfsaAlloc;
      budget -= tfsaAlloc;
      notes.push(`Allocate $${tfsaAlloc.toFixed(0)} to TFSA (within remaining room).`);
    }
  }

  // 3) RRSP up to room
  if (budget > 0 && input.rrspRoom > 0) {
    const monthlyRoom = Math.max(0, input.rrspRoom) / 12;
    const rrspAlloc = Math.min(budget, monthlyRoom);
    if (rrspAlloc > 0) {
      out.RRSP += rrspAlloc;
      budget -= rrspAlloc;
      notes.push(`Allocate $${rrspAlloc.toFixed(0)} to RRSP (within remaining room).`);
    }
  }

  // 4) Margin
  if (budget > 0) {
    out.Margin += budget;
    notes.push(`Allocate remaining $${budget.toFixed(0)} to non-registered (Margin).`);
    budget = 0;
  }

  return { allocation: out, reasoning: notes };
}
