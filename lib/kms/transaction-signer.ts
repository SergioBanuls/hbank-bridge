/**
 * Server-Side Transaction Signer via AWS KMS
 *
 * Builds and signs Hedera transactions server-side using KMS keys.
 * Transactions are ALWAYS constructed server-side to prevent malicious
 * transaction injection from the client.
 *
 * IMPORTANT: Uses a network-only client (no operator) so the custodial
 * account is the payer, not the operator. The operator's key is never
 * used to sign custodial transactions.
 *
 * Used by bridge, transfer, approve, and associate API routes.
 */

import {
  Client,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  TokenAssociateTransaction,
  AccountAllowanceApproveTransaction,
  TransferTransaction,
  AccountUpdateTransaction,
  TransactionId,
  AccountId,
  TokenId,
  PublicKey,
  Hbar,
} from '@hashgraph/sdk'

import { signTransaction } from './kms-client'
import type { SignAssociateRequest, SignApproveRequest, SignTransferRequest, SignBridgeRequest } from '@/types/kms'

const NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'mainnet'
const DEFAULT_NODE = AccountId.fromString('0.0.3')

/**
 * Create a Hedera client with network info only (no operator).
 * Prevents auto-signing with the operator key on execute().
 */
function getNetworkClient(): Client {
  return NETWORK === 'testnet'
    ? Client.forTestnet()
    : Client.forMainnet()
}

/**
 * Sign a transaction with KMS and execute it on Hedera.
 *
 * @param transaction - Frozen Hedera transaction (payer = custodial account)
 * @param kmsKeyId - KMS key ID for signing
 * @param publicKeyHex - Hex-encoded raw public key
 * @param client - Hedera client (network only, no operator)
 * @returns Transaction ID string
 */
async function signAndExecuteWithKMS(
  transaction: any,
  kmsKeyId: string,
  publicKeyHex: string,
  client: Client
): Promise<string> {
  // Get transaction body bytes for signing
  const bodyBytes = (transaction as any)._signedTransactions.list[0].bodyBytes
  if (!bodyBytes) {
    throw new Error('Failed to extract transaction body bytes')
  }

  // Sign via KMS
  const { signature } = await signTransaction(kmsKeyId, bodyBytes)

  // Compress public key (65 bytes uncompressed -> 33 bytes compressed) for Hedera SDK
  const uncompressed = Buffer.from(publicKeyHex, 'hex')
  const x = uncompressed.slice(1, 33)
  const y = uncompressed.slice(33, 65)
  const prefix = y[31] % 2 === 0 ? 0x02 : 0x03
  const compressed = Buffer.alloc(33)
  compressed[0] = prefix
  x.copy(compressed, 1)
  const hederaPubKey = PublicKey.fromBytesECDSA(compressed)

  // Add KMS signature and execute (no operator auto-sign)
  transaction.addSignature(hederaPubKey, signature)
  const response = await transaction.execute(client)
  const receipt = await response.getReceipt(client)

  if (receipt.status.toString() !== 'SUCCESS') {
    throw new Error(`Transaction failed with status: ${receipt.status.toString()}`)
  }

  return response.transactionId.toString()
}

/**
 * Build, sign, and execute a token association via KMS.
 */
export async function signAndExecuteAssociation(
  params: SignAssociateRequest,
  accountId: string,
  kmsKeyId: string,
  publicKeyHex: string
): Promise<string> {
  const client = getNetworkClient()

  try {
    const payer = AccountId.fromString(accountId)

    const transaction = new TokenAssociateTransaction()
      .setTransactionId(TransactionId.generate(payer))
      .setAccountId(payer)
      .setTokenIds([TokenId.fromString(params.tokenId)])
      .setNodeAccountIds([DEFAULT_NODE])
      .freezeWith(client)

    return await signAndExecuteWithKMS(transaction, kmsKeyId, publicKeyHex, client)
  } finally {
    client.close()
  }
}

/**
 * Build, sign, and execute a token allowance approval via KMS.
 */
export async function signAndExecuteApproval(
  params: SignApproveRequest,
  accountId: string,
  kmsKeyId: string,
  publicKeyHex: string
): Promise<string> {
  const client = getNetworkClient()

  try {
    const payer = AccountId.fromString(accountId)

    const transaction = new AccountAllowanceApproveTransaction()
      .setTransactionId(TransactionId.generate(payer))
      .approveTokenAllowance(
        TokenId.fromString(params.tokenId),
        payer,
        AccountId.fromString(params.spenderAccountId),
        Number(params.amount)
      )
      .setNodeAccountIds([DEFAULT_NODE])
      .freezeWith(client)

    return await signAndExecuteWithKMS(transaction, kmsKeyId, publicKeyHex, client)
  } finally {
    client.close()
  }
}

/**
 * Build, sign, and execute a transfer (HBAR or HTS token) via KMS.
 */
export async function signAndExecuteTransfer(
  params: SignTransferRequest,
  accountId: string,
  kmsKeyId: string,
  publicKeyHex: string
): Promise<string> {
  const client = getNetworkClient()

  try {
    const sender = AccountId.fromString(accountId)
    const recipient = AccountId.fromString(params.recipientAccountId)
    const transfer = new TransferTransaction()
      .setTransactionId(TransactionId.generate(sender))

    if (params.tokenId) {
      // HTS token transfer
      const tokenId = TokenId.fromString(params.tokenId)
      const amount = Number(params.amount)
      const decimals = params.decimals ?? 0
      transfer
        .addTokenTransferWithDecimals(tokenId, sender, -amount, decimals)
        .addTokenTransferWithDecimals(tokenId, recipient, amount, decimals)
    } else {
      // HBAR transfer (amount in tinybars)
      const hbarAmount = Hbar.fromTinybars(Number(params.amount))
      transfer
        .addHbarTransfer(sender, hbarAmount.negated())
        .addHbarTransfer(recipient, hbarAmount)
    }

    const frozenTx = transfer
      .setNodeAccountIds([DEFAULT_NODE])
      .freezeWith(client)

    return await signAndExecuteWithKMS(frozenTx, kmsKeyId, publicKeyHex, client)
  } finally {
    client.close()
  }
}

/**
 * Build, sign, and execute an AccountUpdateTransaction to rotate the account key.
 * Signs with the OLD key (current key that controls the account).
 */
export async function signAndExecuteAccountUpdate(
  kmsKeyId: string,
  accountId: string,
  publicKeyHex: string,
  newPublicKeyHex: string,
): Promise<string> {
  const client = getNetworkClient()

  try {
    const payer = AccountId.fromString(accountId)

    // Build the compressed public key for the new key (65-byte uncompressed → 33-byte compressed)
    const newPubKeyBytes = Buffer.from(newPublicKeyHex, 'hex')
    const newCompressedKey = PublicKey.fromBytesECDSA(
      newPubKeyBytes.length === 65
        ? Buffer.concat([
            Buffer.from([newPubKeyBytes[64] % 2 === 0 ? 0x02 : 0x03]),
            newPubKeyBytes.subarray(1, 33),
          ])
        : newPubKeyBytes,
    )

    const tx = new AccountUpdateTransaction()
      .setAccountId(payer)
      .setKey(newCompressedKey)
      .setTransactionId(TransactionId.generate(payer))
      .setNodeAccountIds([DEFAULT_NODE])
      .freezeWith(client)

    // Sign with OLD key (current key that controls the account)
    return await signAndExecuteWithKMS(tx, kmsKeyId, publicKeyHex, client)
  } finally {
    client.close()
  }
}

/**
 * Build, sign, and execute a bridge approval (HTS allowance for bridge contract) via KMS.
 */
export async function signAndExecuteBridgeApproval(
  amount: string,
  accountId: string,
  kmsKeyId: string,
  publicKeyHex: string
): Promise<string> {
  const client = getNetworkClient()

  try {
    const payer = AccountId.fromString(accountId)
    const bridgeContractId = process.env.NEXT_PUBLIC_BRIDGE_HEDERA_CONTRACT_ID || '0.0.10295928'
    const usdcTokenId = '0.0.456858'

    // Parse amount and approve 10x for future transactions
    const amountFloat = parseFloat(amount)
    const amountRaw = Math.floor(amountFloat * 1_000_000)
    const approvalAmount = amountRaw * 10

    const transaction = new AccountAllowanceApproveTransaction()
      .setTransactionId(TransactionId.generate(payer))
      .approveTokenAllowance(
        TokenId.fromString(usdcTokenId),
        payer,
        AccountId.fromString(bridgeContractId),
        approvalAmount
      )
      .setNodeAccountIds([DEFAULT_NODE])
      .freezeWith(client)

    return await signAndExecuteWithKMS(transaction, kmsKeyId, publicKeyHex, client)
  } finally {
    client.close()
  }
}

/**
 * Build, sign, and execute a bridge transaction via KMS.
 * Calls bridgeTokens or bridgeTokensWithGasDrop on the Bridge V3 contract.
 */
export async function signAndExecuteBridge(
  params: SignBridgeRequest,
  accountId: string,
  kmsKeyId: string,
  publicKeyHex: string
): Promise<string> {
  const client = getNetworkClient()

  try {
    const payer = AccountId.fromString(accountId)
    const bridgeContractId = process.env.NEXT_PUBLIC_BRIDGE_HEDERA_CONTRACT_ID || '0.0.10295928'
    const ARBITRUM_EID = 30110

    const amountFloat = parseFloat(params.amount)
    const amountRaw = Math.floor(amountFloat * 1_000_000)

    const functionParams = new ContractFunctionParameters()
      .addString('USDC')
      .addUint256(amountRaw)
      .addAddress(params.receiverAddress)
      .addUint32(ARBITRUM_EID)

    if (params.requestGasDrop) {
      functionParams.addBool(true)
    }

    // Add 20% buffer to LZ fee
    const feeWithBuffer = Math.ceil(params.lzFeeHbar * 1.2 * 100) / 100

    const transaction = new ContractExecuteTransaction()
      .setTransactionId(TransactionId.generate(payer))
      .setContractId(bridgeContractId)
      .setGas(500_000)
      .setFunction(
        params.requestGasDrop ? 'bridgeTokensWithGasDrop' : 'bridgeTokens',
        functionParams
      )
      .setNodeAccountIds([DEFAULT_NODE])

    transaction.setPayableAmount(new Hbar(feeWithBuffer))

    const frozenTx = transaction.freezeWith(client)

    return await signAndExecuteWithKMS(frozenTx, kmsKeyId, publicKeyHex, client)
  } finally {
    client.close()
  }
}
