/**
 * TypeScript types for AWS KMS + Hedera Custodial Signing
 */

// Connection modes
export type ConnectionMode = 'custodial' | null

// Custodial account stored in Supabase
export interface CustodialAccount {
  id: string
  user_id: string
  hedera_account_id: string
  kms_key_id: string
  kms_key_arn: string
  public_key_hex: string
  status: 'active' | 'disabled' | 'pending'
  created_at: string
  updated_at: string
}

// KMS signing audit log entry
export interface KMSSigningAudit {
  id: string
  user_id: string
  transaction_type: KMSTransactionType
  transaction_id: string | null
  transaction_params: Record<string, unknown>
  kms_key_id: string
  ip_address: string | null
  status: 'pending' | 'success' | 'failed'
  error_message: string | null
  created_at: string
}

// Rate limit record
export interface KMSRateLimit {
  user_id: string
  signing_count_1h: number
  signing_count_24h: number
  last_signing_at: string | null
  last_reset_1h: string
  last_reset_24h: string
}

// Transaction types supported via KMS
export type KMSTransactionType =
  | 'token_association'
  | 'token_approval'
  | 'account_create'
  | 'transfer'
  | 'bridge'
  | 'bridge_reverse'
  | 'bridge_usdt0'
  | 'bridge_usdt0_reverse'
  | 'transfer_evm'
  | 'key_rotation'

// API request types
export interface CreateAccountRequest {
  // No body needed - uses authenticated user
}

export interface CreateAccountResponse {
  success: boolean
  hederaAccountId: string
  publicKeyHex: string
  error?: string
}

export interface SignAssociateRequest {
  tokenId: string
}

export interface SignAssociateResponse {
  success: boolean
  transactionId: string
  error?: string
}

export interface SignApproveRequest {
  tokenId: string
  amount: string
  spenderAccountId: string
}

export interface SignApproveResponse {
  success: boolean
  transactionId: string
  error?: string
}

export interface SignTransferRequest {
  recipientAccountId: string
  amount: string
  tokenId?: string    // omit for HBAR transfer
  decimals?: number   // required when tokenId is provided
}

export interface SignTransferResponse {
  success: boolean
  transactionId: string
  error?: string
}

export interface SignBridgeReverseRequest {
  amount: string          // USDC amount (human readable, e.g., "10.5")
  requestGasDrop?: boolean
}

export interface SignBridgeRequest {
  amount: string          // USDC amount (human readable)
  receiverAddress: string // Destination address on Arbitrum (0x...)
  requestGasDrop: boolean
  lzFeeHbar: number       // LayerZero fee in HBAR (from quote)
}

export interface SignBridgeUsdt0Request {
  amount: string          // USDT0 amount (human readable, e.g., "10.5")
  receiverAddress: string // Destination address on Arbitrum (0x...)
  requestGasDrop: boolean
  lzFeeHbar: number       // LayerZero fee in HBAR (from quote)
}

export interface SignBridgeUsdt0ReverseRequest {
  amount: string          // USDT0 amount (human readable)
  requestGasDrop?: boolean
}

export interface SignBridgeResponse {
  success: boolean
  transactionId: string
  error?: string
}

export interface AccountInfoResponse {
  success: boolean
  account: {
    hederaAccountId: string
    publicKeyHex: string
    status: string
    createdAt: string
  } | null
  error?: string
}

// Key rotation response types
export interface KeyRotationWarningResponse {
  warning: true
  message: string
  balances: {
    eth: string
    usdc: string
  }
}

export interface KeyRotationSuccessResponse {
  success: true
  newEvmAddress: string
  hederaAccountId: string
  transactionId: string
}

export type KeyRotationResponse = KeyRotationWarningResponse | KeyRotationSuccessResponse

// KMS key creation result (internal)
export interface KMSKeyInfo {
  keyId: string
  keyArn: string
  publicKeyHex: string
}

// Transaction signing result (internal)
export interface KMSSignResult {
  signature: Uint8Array // raw 64-byte (r, s) signature
}
