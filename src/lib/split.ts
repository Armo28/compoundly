export type SplitInput = {
  monthlyContribution: number;
  tfsaRoom: number;
  rrspRoom: number;
  respRoom: number;
  priorities?: ('TFSA'|'RRSP'|'RESP'|'MARGIN')[];
};

export function computeSplit(input: SplitInput) {
  const order = input.priorities ?? ['TFSA','RRSP','RESP','MARGIN'];
  let remaining = input.monthlyContribution;
  const buckets: Record<string, number> = { TFSA:0, RRSP:0, RESP:0, MARGIN:0 };

  for (const bucket of order) {
    if (remaining <= 0) break;
    const room = bucket==='TFSA' ? input.tfsaRoom
               : bucket==='RRSP' ? input.rrspRoom
               : bucket==='RESP' ? input.respRoom
               : Number.POSITIVE_INFINITY;
    if (!isFinite(room)) {
      buckets.MARGIN += remaining;
      remaining = 0;
    } else {
      const alloc = Math.min(remaining, room);
      buckets[bucket] += alloc;
      remaining -= alloc;
    }
  }
  const total = input.monthlyContribution || 1;
  return {
    amounts: buckets,
    percentages: {
      TFSA: +(100*buckets.TFSA/total).toFixed(2),
      RRSP: +(100*buckets.RRSP/total).toFixed(2),
      RESP: +(100*buckets.RESP/total).toFixed(2),
      MARGIN: +(100*buckets.MARGIN/total).toFixed(2),
    }
  };
}
