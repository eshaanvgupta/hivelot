/**
 * @file math.ts
 * @description Exact integer accounting and financial mechanism equations for HIVELOT
 */

/**
 * Calculates initial buyer deposit required: Di = qi * M
 */
export function calculateDeposit(quantity: bigint, maxUnitPrice: bigint): bigint {
  return quantity * maxUnitPrice;
}

/**
 * Calculates final purchase liability: Li = qi * P
 */
export function calculateLiability(quantity: bigint, clearingPrice: bigint): bigint {
  return quantity * clearingPrice;
}

/**
 * Calculates price-adjustment refund: Ri = qi * (M - P)
 */
export function calculateRefund(quantity: bigint, maxUnitPrice: bigint, clearingPrice: bigint): bigint {
  if (clearingPrice > maxUnitPrice) {
    throw new Error('Clearing price cannot exceed maximum agreed price');
  }
  return quantity * (maxUnitPrice - clearingPrice);
}

/**
 * Calculates platform fee: F = (Q * P * feeBps) / 10000
 */
export function calculatePlatformFee(grossAmount: bigint, feeBps: bigint): bigint {
  return (grossAmount * feeBps) / 10000n;
}

/**
 * Verifies exact conservation of funds:
 * Total Deposits === Total Allocated Refunds + Total Fulfillment Escrow
 */
export function verifyConservationOfFunds(
  totalDeposits: bigint,
  totalRefunds: bigint,
  totalLiabilities: bigint
): boolean {
  return totalDeposits === totalRefunds + totalLiabilities;
}

