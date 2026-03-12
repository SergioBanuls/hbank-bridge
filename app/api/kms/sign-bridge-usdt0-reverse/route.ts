/**
 * Sign USDT0 Bridge Reverse (Arbitrum -> Hedera) via KMS
 *
 * Uses KMSSigner to sign EVM transactions on Arbitrum calling OFT.send().
 * Auto-associates USDT0 token on Hedera if needed.
 *
 * POST /api/kms/sign-bridge-usdt0-reverse
 * Body: { amount: string, requestGasDrop?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { validateSigningRequest, recordSigningOperation, AuthError } from '@/lib/kms/rate-limiter'
import { createArbitrumKMSSigner } from '@/lib/kms/evm-signer'
import { signAndExecuteAssociation } from '@/lib/kms/transaction-signer'
import { deriveEvmAddress } from '@/lib/kms/evm-utils'
import { supabaseAdmin } from '@/lib/supabase'
import { accountIdToEvmAddress } from '@/lib/bridge/bridgeConstants'
import {
  OFT_ABI,
  USDT0_ARBITRUM,
  USDT0_HEDERA,
  USDT0_LZ_CONFIG,
  USDT0_GAS_CONFIG,
  buildSendParam,
} from '@/lib/bridge/usdt0Constants'
import type { SignBridgeUsdt0ReverseRequest } from '@/types/kms'

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]

export async function POST(request: NextRequest) {
  let ctx

  try {
    // 1. Auth + rate limit
    ctx = await validateSigningRequest(request)

    // 2. Parse request
    const body: SignBridgeUsdt0ReverseRequest = await request.json()

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

    const amountRaw = Math.floor(amountFloat * 1_000_000)

    // 3. Derive EVM address
    const evmAddress = deriveEvmAddress(ctx.publicKeyHex)

    // Persist evm_address if not yet stored
    const db = supabaseAdmin()
    await db
      .from('custodial_accounts')
      .update({ evm_address: evmAddress })
      .eq('user_id', ctx.userId)
      .is('evm_address', null)

    // 4. Create KMS-backed Signer on Arbitrum
    const signer = await createArbitrumKMSSigner(ctx.kmsKeyId)
    const signerAddress = await signer.getAddress()
    if (signerAddress.toLowerCase() !== evmAddress.toLowerCase()) {
      throw new Error(`Address mismatch: derived ${evmAddress} vs signer ${signerAddress}`)
    }

    const provider = signer.provider!

    // 5. Check USDT0 balance on Arbitrum
    const usdt0Contract = new ethers.Contract(USDT0_ARBITRUM.TOKEN_ADDRESS, ERC20_ABI, provider)
    const balance = await usdt0Contract.balanceOf(evmAddress)
    if (balance.lt(amountRaw)) {
      return NextResponse.json(
        { success: false, error: `Insufficient USDT0 on Arbitrum. Have: ${ethers.utils.formatUnits(balance, 6)}, need: ${body.amount}` },
        { status: 400 }
      )
    }

    // 6. Check ETH for gas
    const ethBalance = await provider.getBalance(evmAddress)
    if (ethBalance.isZero()) {
      return NextResponse.json(
        { success: false, error: 'No ETH on Arbitrum for gas fees. Send ETH to your EVM address first.' },
        { status: 400 }
      )
    }

    // 7. Auto-associate USDT0 on Hedera if needed
    try {
      const mirrorUrl = process.env.NEXT_PUBLIC_MIRROR_NODE_URL || 'https://mainnet-public.mirrornode.hedera.com'
      const tokensRes = await fetch(`${mirrorUrl}/api/v1/accounts/${ctx.accountId}/tokens?token.id=${USDT0_HEDERA.TOKEN_ID}`)
      const tokensData = await tokensRes.json()
      if (!tokensData.tokens || tokensData.tokens.length === 0) {
        await signAndExecuteAssociation(
          { tokenId: USDT0_HEDERA.TOKEN_ID },
          ctx.accountId,
          ctx.kmsKeyId,
          ctx.publicKeyHex
        )
      }
    } catch (assocError: any) {
      if (!assocError.message?.includes('TOKEN_ALREADY_ASSOCIATED')) {
        console.warn('[USDT0 Reverse] Association check/attempt failed:', assocError.message)
      }
    }

    // 8. Get OFT quote on Arbitrum
    const receiverEvmAddress = accountIdToEvmAddress(ctx.accountId)
    const sendParam = buildSendParam(
      USDT0_LZ_CONFIG.HEDERA_EID,
      receiverEvmAddress,
      amountRaw,
      body.requestGasDrop || false
    )

    const oftContract = new ethers.Contract(USDT0_ARBITRUM.OFT_ADDRESS, OFT_ABI, provider)
    const messagingFee = await oftContract.quoteSend(
      [
        sendParam.dstEid,
        sendParam.to,
        sendParam.amountLD,
        sendParam.minAmountLD,
        sendParam.extraOptions,
        sendParam.composeMsg,
        sendParam.oftCmd,
      ],
      false
    )
    const nativeFee = messagingFee.nativeFee || messagingFee[0]
    const feeWithBuffer = nativeFee.mul(120).div(100) // 20% buffer

    // 9. Check USDT0 allowance -> approve OFT if needed
    const allowance = await usdt0Contract.allowance(evmAddress, USDT0_ARBITRUM.OFT_ADDRESS)
    if (allowance.lt(amountRaw)) {
      const approveAmount = ethers.BigNumber.from(amountRaw).mul(10)
      const usdt0WithSigner = usdt0Contract.connect(signer)
      const approveTx = await usdt0WithSigner.approve(USDT0_ARBITRUM.OFT_ADDRESS, approveAmount, {
        gasLimit: USDT0_GAS_CONFIG.ARBITRUM_APPROVE_GAS,
      })
      await approveTx.wait()
    }

    // 10. Execute OFT.send()
    const oftWithSigner = oftContract.connect(signer)
    const bridgeTx = await oftWithSigner.send(
      [
        sendParam.dstEid,
        sendParam.to,
        sendParam.amountLD,
        sendParam.minAmountLD,
        sendParam.extraOptions,
        sendParam.composeMsg,
        sendParam.oftCmd,
      ],
      [nativeFee, 0], // MessagingFee: use exact quote (buffer is in msg.value)
      evmAddress,      // refundAddress
      {
        value: feeWithBuffer,
        gasLimit: USDT0_GAS_CONFIG.ARBITRUM_OFT_SEND_GAS,
      }
    )
    const receipt = await bridgeTx.wait()

    // 11. Record audit
    await recordSigningOperation(ctx, 'bridge_usdt0_reverse', {
      amount: body.amount,
      evmAddress,
      receiverHederaAccount: ctx.accountId,
      receiverEvmAddress,
      requestGasDrop: body.requestGasDrop || false,
      nativeFeeWei: nativeFee.toString(),
    }, { transactionId: receipt.transactionHash })

    return NextResponse.json({
      success: true,
      txHash: receipt.transactionHash,
      explorerUrl: `https://arbiscan.io/tx/${receipt.transactionHash}`,
    })
  } catch (error: any) {
    console.error('[sign-bridge-usdt0-reverse] Error:', error)

    if (ctx) {
      await recordSigningOperation(ctx, 'bridge_usdt0_reverse', {}, { error: error.message }).catch(() => {})
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { success: false, error: error.message || 'USDT0 bridge reverse failed' },
      { status: 500 }
    )
  }
}
