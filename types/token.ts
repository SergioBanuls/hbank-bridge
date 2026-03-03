export interface Token {
  name: string;
  symbol: string;
  decimals: number;
  address: string; // Empty string for HBAR, otherwise "0.0.XXXXX"
  solidityAddress: string;
  icon: string;
  providers: string[];
  price?: number;
  priceUsd?: number;
  balance?: string; // Token balance when fetched with account context
}

export interface TokenListResponse {
  tokens: Token[];
}
