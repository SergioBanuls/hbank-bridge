/**
 * Hedera Account Creation with KMS Public Key
 *
 * Creates Hedera accounts where the key is an ECDSA secp256k1 public key
 * stored in AWS KMS. The operator account pays for account creation.
 */

import {
  Client,
  AccountCreateTransaction,
  AccountId,
  PrivateKey,
  PublicKey,
  Hbar,
} from '@hashgraph/sdk'

const NETWORK = process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'mainnet'
const OPERATOR_ID = process.env.HEDERA_ACCOUNT_ID!
const OPERATOR_KEY = process.env.PRIVATE_KEY!

// Separate operator for custodial account creation (expendable balance)
const CREATOR_OPERATOR_ID = process.env.CUSTODIAL_CREATOR_ACCOUNT_ID || OPERATOR_ID
const CREATOR_OPERATOR_KEY = process.env.CUSTODIAL_CREATOR_PRIVATE_KEY || OPERATOR_KEY

/**
 * Create a Hedera client with the main operator credentials.
 */
function createHederaClient(): Client {
  const client = NETWORK === 'testnet'
    ? Client.forTestnet()
    : Client.forMainnet()

  client.setOperator(
    AccountId.fromString(OPERATOR_ID),
    PrivateKey.fromStringECDSA(OPERATOR_KEY)
  )

  return client
}

/**
 * Create a Hedera client with the account-creation operator.
 * Uses a dedicated account with limited balance to mitigate abuse.
 */
function createCreatorClient(): Client {
  const client = NETWORK === 'testnet'
    ? Client.forTestnet()
    : Client.forMainnet()

  client.setOperator(
    AccountId.fromString(CREATOR_OPERATOR_ID),
    PrivateKey.fromStringECDSA(CREATOR_OPERATOR_KEY)
  )

  return client
}

/**
 * Create a new Hedera account with a KMS-managed public key.
 *
 * The operator account pays for creation and the initial balance.
 * The new account's key is the ECDSA secp256k1 public key from KMS,
 * meaning only KMS can sign transactions for this account.
 *
 * @param publicKeyHex - Hex-encoded raw ECDSA public key (65 bytes, uncompressed)
 * @returns The new Hedera account ID
 */
export async function createHederaAccountWithKMSKey(
  publicKeyHex: string
): Promise<{ accountId: string; transactionId: string }> {
  const client = createCreatorClient()

  try {
    // Convert hex to bytes (65 bytes uncompressed) and compress for Hedera SDK
    const uncompressed = Buffer.from(publicKeyHex, 'hex')
    const x = uncompressed.slice(1, 33)
    const y = uncompressed.slice(33, 65)
    const prefix = y[31] % 2 === 0 ? 0x02 : 0x03
    const compressed = Buffer.alloc(33)
    compressed[0] = prefix
    x.copy(compressed, 1)
    const hederaPubKey = PublicKey.fromBytesECDSA(compressed)

    console.log(`Creating Hedera account with KMS public key: ${hederaPubKey.toString().substring(0, 30)}...`)

    // Create account with zero balance — user must fund it via the deposit modal
    // The creator operator only pays the account creation fee
    const createTx = await new AccountCreateTransaction()
      .setKey(hederaPubKey)
      .setInitialBalance(new Hbar(0))
      .setMaxAutomaticTokenAssociations(10)
      .execute(client)

    const receipt = await createTx.getReceipt(client)
    const newAccountId = receipt.accountId!.toString()
    const transactionId = createTx.transactionId!.toString()

    console.log(`Hedera account created: ${newAccountId} (tx: ${transactionId})`)
    return { accountId: newAccountId, transactionId }
  } finally {
    client.close()
  }
}

/**
 * Get a Hedera client for transaction execution.
 * Does NOT set an operator - used for submitting pre-signed transactions.
 */
export function getHederaClient(): Client {
  return createHederaClient()
}
