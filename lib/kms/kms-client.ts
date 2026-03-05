/**
 * AWS KMS Client for Hedera Transaction Signing
 *
 * Manages ECDSA secp256k1 keys in AWS KMS for custodial Hedera accounts.
 * Keys never leave the HSM - all signing happens inside KMS.
 */

import {
  KMSClient,
  CreateKeyCommand,
  GetPublicKeyCommand,
  SignCommand,
  DescribeKeyCommand,
  DisableKeyCommand,
} from '@aws-sdk/client-kms'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { spkiToRawPublicKey, derToRawSignature } from './signature-utils'
import type { KMSKeyInfo, KMSSignResult } from '@/types/kms'

const AWS_REGION = process.env.AWS_KMS_REGION || 'us-east-1'

let kmsClient: KMSClient | null = null

function getKMSClient(): KMSClient {
  if (!kmsClient) {
    kmsClient = new KMSClient({ region: AWS_REGION })
  }
  return kmsClient
}

/**
 * Create a new ECDSA secp256k1 signing key in KMS.
 *
 * @param userId - Supabase user ID (used for tagging/description)
 * @returns Key ID, ARN, and hex-encoded raw public key
 */
export async function createSigningKey(userId: string): Promise<KMSKeyInfo> {
  const kms = getKMSClient()

  const createResult = await kms.send(
    new CreateKeyCommand({
      KeySpec: 'ECC_SECG_P256K1',
      KeyUsage: 'SIGN_VERIFY',
      Description: `HBank Bridge custodial key for user ${userId}`,
      Tags: [
        { TagKey: 'service', TagValue: 'hbank-bridge' },
        { TagKey: 'user_id', TagValue: userId },
      ],
    })
  )

  const keyId = createResult.KeyMetadata!.KeyId!
  const keyArn = createResult.KeyMetadata!.Arn!

  // Get public key
  const publicKeyHex = await getPublicKeyHex(keyId)

  return { keyId, keyArn, publicKeyHex }
}

/**
 * Get the raw public key (hex-encoded, 65 bytes uncompressed) from a KMS key.
 */
export async function getPublicKeyHex(keyId: string): Promise<string> {
  const kms = getKMSClient()

  const result = await kms.send(
    new GetPublicKeyCommand({ KeyId: keyId })
  )

  const spkiBytes = new Uint8Array(result.PublicKey!)
  const rawKey = spkiToRawPublicKey(spkiBytes)

  return Buffer.from(rawKey).toString('hex')
}

/**
 * Sign transaction body bytes using KMS.
 *
 * Hedera ECDSA secp256k1 signing flow:
 * 1. Hash transactionBodyBytes with keccak256 (as the Hedera SDK does internally)
 * 2. Send the 32-byte digest to KMS with ECDSA_SHA_256 + DIGEST message type
 *    (KMS doesn't verify the hash algorithm, it just signs the 32-byte digest)
 * 3. Convert DER signature to raw (r, s) format with low-S normalization (64 bytes)
 *
 * @param keyId - KMS key ID
 * @param transactionBodyBytes - Raw transaction body bytes to sign
 * @returns Raw 64-byte signature (r || s)
 */
export async function signTransaction(
  keyId: string,
  transactionBodyBytes: Uint8Array
): Promise<KMSSignResult> {
  const kms = getKMSClient()

  // Hash with keccak256 (matches Hedera SDK's ECDSA signing)
  const keccakHash = keccak_256(new Uint8Array(transactionBodyBytes))

  const signResult = await kms.send(
    new SignCommand({
      KeyId: keyId,
      Message: keccakHash,
      MessageType: 'DIGEST',
      SigningAlgorithm: 'ECDSA_SHA_256',
    })
  )

  const derSignature = new Uint8Array(signResult.Signature!)
  const rawSignature = derToRawSignature(derSignature)

  return { signature: rawSignature }
}

/**
 * Disable a KMS key (used after key rotation).
 * The key is not deleted — preserved for audit trail.
 */
export async function disableKMSKey(keyId: string): Promise<void> {
  const kms = getKMSClient()
  await kms.send(new DisableKeyCommand({ KeyId: keyId }))
}

/**
 * Verify a KMS key exists and is enabled.
 */
export async function verifyKeyStatus(keyId: string): Promise<boolean> {
  const kms = getKMSClient()

  try {
    const result = await kms.send(
      new DescribeKeyCommand({ KeyId: keyId })
    )
    return result.KeyMetadata?.Enabled === true
  } catch {
    return false
  }
}
