/**
 * EVM Utilities for KMS-managed ECDSA Keys
 *
 * Derives EVM addresses from the same secp256k1 public key used for Hedera.
 * The EVM address is keccak256(uncompressed_pubkey_without_prefix) → last 20 bytes.
 * This is the same address on Ethereum, Arbitrum, and any EVM chain.
 */

import { ethers } from 'ethers'

/**
 * Derive EVM address from an uncompressed secp256k1 public key.
 *
 * @param publicKeyHex - 65-byte uncompressed public key as hex (0x04 || x || y),
 *                       stored in custodial_accounts.public_key_hex
 * @returns Checksummed EVM address (0x-prefixed, 42 chars)
 */
export function deriveEvmAddress(publicKeyHex: string): string {
  const pubKeyBytes = Buffer.from(publicKeyHex, 'hex')

  if (pubKeyBytes.length !== 65 || pubKeyBytes[0] !== 0x04) {
    throw new Error(
      `Expected 65-byte uncompressed public key (0x04 prefix), got ${pubKeyBytes.length} bytes`
    )
  }

  // Strip the 0x04 prefix, hash the 64-byte (x || y), take last 20 bytes
  const addressHash = ethers.utils.keccak256(pubKeyBytes.slice(1))
  return ethers.utils.getAddress('0x' + addressHash.slice(-40))
}
