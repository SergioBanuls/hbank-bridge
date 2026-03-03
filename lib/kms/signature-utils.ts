/**
 * Signature Utilities for AWS KMS + Hedera Integration
 *
 * Handles conversion between DER-encoded signatures/keys from KMS
 * and the raw formats expected by the Hedera SDK.
 */

/**
 * Extract raw ECDSA public key (65 bytes, uncompressed) from SPKI DER encoding.
 *
 * KMS returns public keys in SPKI (SubjectPublicKeyInfo) format:
 *   SEQUENCE {
 *     SEQUENCE { OID ecPublicKey, OID secp256k1 }
 *     BIT STRING { 04 || x (32 bytes) || y (32 bytes) }
 *   }
 */
export function spkiToRawPublicKey(spkiDer: Uint8Array): Uint8Array {
  let offset = 0

  // Outer SEQUENCE
  if (spkiDer[offset] !== 0x30) throw new Error('Expected SEQUENCE at start of SPKI')
  offset++
  if (spkiDer[offset] & 0x80) {
    const lenBytes = spkiDer[offset] & 0x7f
    offset += 1 + lenBytes
  } else {
    offset++
  }

  // Inner SEQUENCE (algorithm identifier)
  if (spkiDer[offset] !== 0x30) throw new Error('Expected SEQUENCE for algorithm identifier')
  offset++
  const algoLen = spkiDer[offset]
  offset += 1 + algoLen

  // BIT STRING
  if (spkiDer[offset] !== 0x03) throw new Error('Expected BIT STRING for public key')
  offset++
  if (spkiDer[offset] & 0x80) {
    const lenBytes = spkiDer[offset] & 0x7f
    offset += 1 + lenBytes
  } else {
    offset++
  }

  // Skip unused bits byte (0x00)
  offset++

  const rawKey = spkiDer.slice(offset, offset + 65)
  if (rawKey[0] !== 0x04) throw new Error('Expected uncompressed public key (0x04 prefix)')
  if (rawKey.length !== 65) throw new Error(`Expected 65 bytes, got ${rawKey.length}`)

  return rawKey
}

// secp256k1 curve order N (for low-S normalization)
const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
const SECP256K1_HALF_N = SECP256K1_N / BigInt(2)

function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return BigInt('0x' + hex)
}

function bigIntToBytes32(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, '0')
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Convert DER-encoded ECDSA signature to raw (r || s) format (64 bytes)
 * with low-S normalization (required by Hedera).
 *
 * KMS returns signatures in DER encoding:
 *   SEQUENCE { INTEGER r, INTEGER s }
 *
 * Hedera SDK expects raw format: r (32 bytes) || s (32 bytes)
 * with s <= N/2 (low-S canonical form).
 */
export function derToRawSignature(derSig: Uint8Array): Uint8Array {
  let offset = 0

  if (derSig[offset] !== 0x30) throw new Error('Expected SEQUENCE in DER signature')
  offset++
  if (derSig[offset] & 0x80) {
    offset += 1 + (derSig[offset] & 0x7f)
  } else {
    offset++
  }

  // Read r
  if (derSig[offset] !== 0x02) throw new Error('Expected INTEGER for r')
  offset++
  const rLen = derSig[offset]
  offset++
  let rBytes = derSig.slice(offset, offset + rLen)
  offset += rLen

  // Read s
  if (derSig[offset] !== 0x02) throw new Error('Expected INTEGER for s')
  offset++
  const sLen = derSig[offset]
  offset++
  let sBytes = derSig.slice(offset, offset + sLen)

  // Strip leading zeros (DER integers may have a 0x00 prefix for sign)
  if (rBytes.length > 32) rBytes = rBytes.slice(rBytes.length - 32)
  if (sBytes.length > 32) sBytes = sBytes.slice(sBytes.length - 32)

  // Low-S normalization: if s > N/2, replace with N - s
  let s = bytesToBigInt(sBytes)
  if (s > SECP256K1_HALF_N) {
    s = SECP256K1_N - s
  }

  // Right-align r and pack into 64-byte output
  const raw = new Uint8Array(64)
  const rPadded = new Uint8Array(32)
  rPadded.set(rBytes, 32 - rBytes.length)
  raw.set(rPadded, 0)
  raw.set(bigIntToBytes32(s), 32)

  return raw
}
