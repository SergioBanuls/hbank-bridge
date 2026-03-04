/**
 * Utility functions for validating and sanitizing amount inputs
 *
 * Prevents overflow/underflow attacks and ensures safe BigInt conversions.
 * All amounts are validated before being used in transactions or API calls.
 */

export const MAX_SAFE_AMOUNT = '1000000000000000'; // 1 quadrillion (reasonable max)

export interface AmountValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string; // Raw amount in smallest units (with decimals applied)
}

/**
 * Validate amount input and convert to raw BigInt string
 *
 * @param amount - Amount as string (e.g., "100.5")
 * @param decimals - Token decimals
 * @param balance - Optional user balance to check against
 * @returns Validation result with sanitized amount if valid
 */
export function validateAmount(
  amount: string,
  decimals: number,
  balance?: string
): AmountValidationResult {
  // Validate format - only digits and optional decimal point
  if (!/^\d*\.?\d*$/.test(amount)) {
    return { valid: false, error: 'Invalid number format' };
  }

  // Empty or zero
  if (!amount || amount === '0' || amount === '0.' || parseFloat(amount) === 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }

  // Validate positive
  if (parseFloat(amount) < 0) {
    return { valid: false, error: 'Amount must be positive' };
  }

  // Validate decimals are reasonable (prevent malicious values)
  if (decimals < 0 || decimals > 18) {
    return { valid: false, error: 'Invalid token decimals' };
  }

  // Validate number of decimal places in input
  const parts = amount.split('.');
  if (parts[1] && parts[1].length > decimals) {
    return {
      valid: false,
      error: `Maximum ${decimals} decimal places allowed`,
    };
  }

  // Convert to raw amount (BigInt) safely
  try {
    const [whole = '0', fraction = ''] = amount.split('.');
    const paddedFraction = fraction.padEnd(decimals, '0');
    const rawAmount = BigInt(whole + paddedFraction);

    // Validate not negative (shouldn't happen but double-check)
    if (rawAmount < BigInt(0)) {
      return { valid: false, error: 'Amount cannot be negative' };
    }

    // Validate within safe range
    const maxAmount = BigInt(MAX_SAFE_AMOUNT) * BigInt(10 ** decimals);
    if (rawAmount > maxAmount) {
      return { valid: false, error: 'Amount exceeds maximum allowed' };
    }

    // Validate against user balance if provided
    if (balance !== undefined) {
      const balanceBigInt = BigInt(balance);
      if (rawAmount > balanceBigInt) {
        return { valid: false, error: 'Insufficient balance' };
      }
    }

    return {
      valid: true,
      sanitized: rawAmount.toString(),
    };
  } catch (err) {
    return { valid: false, error: 'Failed to parse amount' };
  }
}

/**
 * Format raw amount (BigInt string) to human-readable decimal
 *
 * @param amount - Raw amount as string
 * @param decimals - Token decimals
 * @returns Formatted amount as string
 */
export function formatAmount(amount: string, decimals: number): string {
  try {
    const amountBigInt = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const whole = amountBigInt / divisor;
    const fraction = amountBigInt % divisor;

    if (fraction === BigInt(0)) {
      return whole.toString();
    }

    const fractionStr = fraction
      .toString()
      .padStart(decimals, '0')
      .replace(/0+$/, '');

    return `${whole}.${fractionStr}`;
  } catch (err) {
    console.error('Error formatting amount:', err);
    return '0';
  }
}

/**
 * Validate that an input string only contains valid numeric characters
 *
 * @param value - Input string to validate
 * @returns true if valid format
 */
export function isValidNumericInput(value: string): boolean {
  return /^\d*\.?\d*$/.test(value);
}

/**
 * Limit decimal places in input string
 *
 * @param value - Input string
 * @param maxDecimals - Maximum decimal places allowed
 * @returns Truncated string if necessary
 */
export function limitDecimals(value: string, maxDecimals: number): string {
  if (!value.includes('.')) {
    return value;
  }

  const [whole, fraction] = value.split('.');
  if (fraction.length <= maxDecimals) {
    return value;
  }

  return `${whole}.${fraction.substring(0, maxDecimals)}`;
}
