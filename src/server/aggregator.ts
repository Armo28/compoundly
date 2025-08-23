export type Account = { id: string; name: string; type: 'TFSA'|'RRSP'|'RESP'|'MARGIN'|'OTHER'; currency: string };
export type Position = { accountId: string; symbol: string; quantity: number; avgCost?: number; price?: number; value?: number };
export type Transaction = { accountId: string; tx_date: string; type: 'CONTRIBUTION'|'WITHDRAWAL'|'BUY'|'SELL'|'DIVIDEND'|'INTEREST'|'FEE'; symbol?: string; amount?: number; quantity?: number; price?: number };

export interface Aggregator {
  listAccounts(userId: string): Promise<Account[]>;
  listPositions(userId: string): Promise<Position[]>;
  listTransactions(userId: string, sinceISO?: string): Promise<Transaction[]>;
}

// Demo provider (replace later with a real aggregator implementation)
export const DemoAggregator: Aggregator = {
  async listAccounts(userId: string) {
    return [
      { id: 'acct_tfsa', name: 'Questrade TFSA', type: 'TFSA', currency: 'CAD' },
      { id: 'acct_rrsp', name: 'Questrade RRSP', type: 'RRSP', currency: 'CAD' },
      { id: 'acct_resp', name: 'Questrade RESP', type: 'RESP', currency: 'CAD' },
      { id: 'acct_margin', name: 'Questrade Margin', type: 'MARGIN', currency: 'CAD' },
    ];
  },
  async listPositions(userId: string) {
    return [
      { accountId: 'acct_tfsa', symbol: 'XQQ', quantity: 20, avgCost: 100, price: 110, value: 2200 },
      { accountId: 'acct_rrsp', symbol: 'XIC', quantity: 50, avgCost: 30, price: 31, value: 1550 },
      { accountId: 'acct_margin', symbol: 'XEQT', quantity: 10, avgCost: 30, price: 32, value: 320 },
    ];
  },
  async listTransactions(userId: string, sinceISO?: string) {
    return [
      { accountId: 'acct_tfsa', tx_date: '2025-01-15', type: 'CONTRIBUTION', amount: 500 },
      { accountId: 'acct_rrsp', tx_date: '2025-02-01', type: 'CONTRIBUTION', amount: 300 },
    ];
  },
};
