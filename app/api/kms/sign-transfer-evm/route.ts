/**
 * Sign EVM Transfer (Arbitrum) via KMS
 *
 * Sends ETH or ERC-20 tokens on Arbitrum using the same KMS key.
 *
 * POST /api/kms/sign-transfer-evm
 * Body: { to: string, amount: string, token: 'eth' | 'usdc' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { validateSigningRequest, recordSigningOperation, AuthError } from '@/lib/kms/rate-limiter'
import { createArbitrumKMSSigner } from '@/lib/kms/evm-signer'
import { deriveEvmAddress } from '@/lib/kms/evm-utils'
import { ARBITRUM_CONFIG } from '@/lib/bridge/bridgeConstants'

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]

export async function POST(request: NextRequest) {
  let ctx

  try {
    ctx = await validateSigningRequest(request)

    const body = await request.json()
    const { to, amount, token } = body as { to: string; amount: string; token: 'eth' | 'usdc' }

    if (!to || !amount || !token) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: to, amount, token' },
        { status: 400 }
      )
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
      return NextResponse.json(
        { success: false, error: 'Invalid recipient address' },
        { status: 400 }
      )
    }

    const amountFloat = parseFloat(amount)
    if (isNaN(amountFloat) || amountFloat <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid amount' },
        { status: 400 }
      )
    }

    const evmAddress = deriveEvmAddress(ctx.publicKeyHex)
    const signer = await createArbitrumKMSSigner(ctx.kmsKeyId)

    const signerAddress = await signer.getAddress()
    if (signerAddress.toLowerCase() !== evmAddress.toLowerCase()) {
      throw new Error(`Address mismatch: derived ${evmAddress} vs signer ${signerAddress}`)
    }

    const provider = signer.provider!
    let receipt: ethers.providers.TransactionReceipt

    if (token === 'eth') {
      // Native ETH transfer
      const amountWei = ethers.utils.parseEther(amount)

      const ethBalance = await provider.getBalance(evmAddress)
      if (ethBalance.lt(amountWei)) {
        return NextResponse.json(
          { success: false, error: `Insufficient ETH. Have: ${ethers.utils.formatEther(ethBalance)}, need: ${amount}` },
          { status: 400 }
        )
      }

      const tx = await signer.sendTransaction({
        to,
        value: amountWei,
        gasLimit: 21_000,
      })
      receipt = await tx.wait()
    } else {
      // USDC ERC-20 transfer
      const amountRaw = Math.floor(amountFloat * 1_000_000) // 6 decimals

      const usdcContract = new ethers.Contract(ARBITRUM_CONFIG.USDC_ADDRESS, ERC20_ABI, provider)
      const balance = await usdcContract.balanceOf(evmAddress)
      if (balance.lt(amountRaw)) {
        return NextResponse.json(
          { success: false, error: `Insufficient USDC. Have: ${ethers.utils.formatUnits(balance, 6)}, need: ${amount}` },
          { status: 400 }
        )
      }

      // Check ETH for gas
      const ethBalance = await provider.getBalance(evmAddress)
      if (ethBalance.isZero()) {
        return NextResponse.json(
          { success: false, error: 'No ETH on Arbitrum for gas fees' },
          { status: 400 }
        )
      }

      const usdcWithSigner = usdcContract.connect(signer)
      const tx = await usdcWithSigner.transfer(to, amountRaw, { gasLimit: 100_000 })
      receipt = await tx.wait()
    }

    await recordSigningOperation(ctx, 'transfer_evm', {
      to,
      amount,
      token,
      evmAddress,
    }, { transactionId: receipt.transactionHash })

    return NextResponse.json({
      success: true,
      txHash: receipt.transactionHash,
      explorerUrl: `https://arbiscan.io/tx/${receipt.transactionHash}`,
    })
  } catch (error: any) {
    console.error('[sign-transfer-evm] Error:', error)

    if (ctx) {
      await recordSigningOperation(ctx, 'transfer_evm', {}, { error: error.message }).catch(() => {})
    }

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { success: false, error: error.message || 'EVM transfer failed' },
      { status: 500 }
    )
  }
}
