/**
 * Sign Bridge Reverse (Arbitrum → Hedera) via KMS
 *
 * Custodial endpoint that signs EVM transactions on Arbitrum using the same
 * KMS key used for Hedera. The user's ECDSA key produces the same identity
 * on both chains (HIP-583).
 *
 * Flow:
 * 1. Auth + rate limit (existing infrastructure)
 * 2. Derive EVM address from stored public key
 * 3. Get LayerZero quote from Arbitrum bridge contract
 * 4. Check USDC allowance → approve if needed (signed via KMS)
 * 5. Execute bridgeTokens() on Arbitrum (signed via KMS)
 * 6. Return Arbitrum txHash
 *
 * POST /api/kms/sign-bridge-reverse
 * Body: { amount: string, requestGasDrop?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { validateSigningRequest, recordSigningOperation } from '@/lib/kms/rate-limiter'
import { AuthError } from '@/lib/kms/rate-limiter'
import { createArbitrumKMSSigner } from '@/lib/kms/evm-signer'
import { deriveEvmAddress } from '@/lib/kms/evm-utils'
import { supabaseAdmin } from '@/lib/supabase'
import {
  ARBITRUM_CONFIG,
  BRIDGE_V3_CONFIG,
  LAYER_ZERO_CONFIG,
  accountIdToEvmAddress,
} from '@/lib/bridge/bridgeConstants'
import type { SignBridgeReverseRequest } from '@/types/kms'

const BRIDGE_V3_ABI = [
  'function quote(string calldata symbol, uint256 amount, address receiver, uint32 targetChainId) view returns (uint256 nativeFee)',
  'function bridgeTokens(string symbol, uint256 amount, address receiver, uint32 targetChainId) payable',
]

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]

const HEDERA_EID = LAYER_ZERO_CONFIG.HEDERA_MAINNET_EID // 30316

export async function POST(request: NextRequest) {
  let ctx

  try {
    // 1. Auth + rate limit (same as all KMS endpoints)
    ctx = await validateSigningRequest(request)

    // 2. Parse request
    const body: SignBridgeReverseRequest = await request.json()

    if (!body.amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: amount' },
        { status: 400 }
      )
    }

    const amountFloat = parseFloat(body.amount)
    if (isNaN(amountFloat) || amountFloat <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid amount' },
        { status: 400 }
      )
    }

    const amountRaw = Math.floor(amountFloat * 1_000_000) // USDC 6 decimals

    // 3. Derive EVM address from stored public key
    const evmAddress = deriveEvmAddress(ctx.publicKeyHex)

    // Persist evm_address if not yet stored
    const db = supabaseAdmin()
    await db
      .from('custodial_accounts')
      .update({ evm_address: evmAddress })
      .eq('user_id', ctx.userId)
      .is('evm_address', null)

    // 4. Create KMS-backed Signer connected to Arbitrum
    const signer = await createArbitrumKMSSigner(ctx.kmsKeyId)

    // Verify derived address matches signer address
    const signerAddress = await signer.getAddress()
    if (signerAddress.toLowerCase() !== evmAddress.toLowerCase()) {
      throw new Error(
        `Address mismatch: derived ${evmAddress} vs signer ${signerAddress}`
      )
    }

    const provider = signer.provider!
    const bridgeAddress = BRIDGE_V3_CONFIG.ARBITRUM.ADDRESS

    // 5. Check USDC balance
    const usdcContract = new ethers.Contract(ARBITRUM_CONFIG.USDC_ADDRESS, ERC20_ABI, provider)
    const balance = await usdcContract.balanceOf(evmAddress)
    if (balance.lt(amountRaw)) {
      return NextResponse.json(
        { success: false, error: `Insufficient USDC on Arbitrum. Have: ${ethers.utils.formatUnits(balance, 6)}, need: ${body.amount}` },
        { status: 400 }
      )
    }

    // 6. Check ETH balance for gas
    const ethBalance = await provider.getBalance(evmAddress)
    if (ethBalance.isZero()) {
      return NextResponse.json(
        { success: false, error: 'No ETH on Arbitrum for gas fees. Send ETH to your EVM address first.' },
        { status: 400 }
      )
    }

    // 7. Get LayerZero quote
    const bridgeContract = new ethers.Contract(bridgeAddress, BRIDGE_V3_ABI, provider)
    const receiverEvmAddress = accountIdToEvmAddress(ctx.accountId)
    const nativeFee = await bridgeContract.quote('USDC', amountRaw, receiverEvmAddress, HEDERA_EID)
    const feeWithBuffer = nativeFee.mul(120).div(100) // 20% buffer

    // 8. Check USDC allowance → approve if needed
    const allowance = await usdcContract.allowance(evmAddress, bridgeAddress)
    if (allowance.lt(amountRaw)) {
      const approveAmount = ethers.BigNumber.from(amountRaw).mul(10) // 10x for future txs
      const usdcWithSigner = usdcContract.connect(signer)
      const approveTx = await usdcWithSigner.approve(bridgeAddress, approveAmount, {
        gasLimit: 100_000,
      })
      await approveTx.wait()
    }

    // 9. Execute bridge
    const bridgeWithSigner = bridgeContract.connect(signer)
    const bridgeTx = await bridgeWithSigner.bridgeTokens(
      'USDC',
      amountRaw,
      receiverEvmAddress,
      HEDERA_EID,
      {
        value: feeWithBuffer,
        gasLimit: 200_000,
      }
    )
    const receipt = await bridgeTx.wait()

    // 10. Record audit
    await recordSigningOperation(ctx, 'bridge_reverse', {
      amount: body.amount,
      evmAddress,
      receiverHederaAccount: ctx.accountId,
      receiverEvmAddress,
      requestGasDrop: body.requestGasDrop || false,
      nativeFeeWei: nativeFee.toString(),
    }, { transactionId: receipt.transactionHash }).catch(err => console.warn('Failed to record bridge_reverse audit:', err))

    return NextResponse.json({
      success: true,
      txHash: receipt.transactionHash,
      explorerUrl: `https://arbiscan.io/tx/${receipt.transactionHash}`,
    })
  } catch (error: any) {
    console.error('[sign-bridge-reverse] Error:', error)

    if (ctx) {
      await recordSigningOperation(ctx, 'bridge_reverse', {}, { error: error.message }).catch(() => {})
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Bridge reverse failed' },
      { status: 500 }
    )
  }
}
