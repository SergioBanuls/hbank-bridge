/**
 * EVM Signer using AWS KMS
 *
 * Creates an ethers.js v5 Signer backed by the same KMS key used for Hedera signing.
 * The KMSSigner handles DER decoding, low-S normalization, and recovery ID (v) calculation.
 */

import { KMSSigner } from '@hashflow/aws-kms-ethers-signer'
import { getArbitrumProvider } from '@/lib/bridge/arbitrumRpc'

const AWS_REGION = process.env.AWS_KMS_REGION || 'us-east-1'

/**
 * Create an ethers Signer backed by a KMS key, connected to Arbitrum.
 *
 * @param kmsKeyId - AWS KMS key ID (from custodial_accounts.kms_key_id)
 * @returns KMSSigner instance connected to Arbitrum provider
 */
export async function createArbitrumKMSSigner(kmsKeyId: string): Promise<KMSSigner> {
  const provider = await getArbitrumProvider()
  return new KMSSigner(AWS_REGION, kmsKeyId, provider)
}
