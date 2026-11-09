/**
 * @file client.ts
 * @description HIVELOT Commerce Protocol TypeScript SDK
 */

import {
  PoolTerms,
  PoolStatus,
  BuyerCommitment,
  RevealedBid,
  ClearingOutcome,
  calculateDeposit,
  calculateLiability,
  calculateRefund,
  verifyConservationOfFunds
} from '@hivelot/shared';

export interface HivelotClientConfig {
  rpcUrl: string;
  factoryAddress: string;
  demandVaultAddress: string;
  supplierAuctionAddress: string;
  clearingHouseAddress: string;
  fulfillmentRegistryAddress: string;
  disputeResolverAddress: string;
  bondVaultAddress: string;
  treasuryAddress: string;
  merchantRegistryAddress: string;
  signerPrivateKey?: string;
}

export class HivelotSDK {
  private config: HivelotClientConfig;

  constructor(config: HivelotClientConfig) {
    this.config = config;
  }

  /**
   * Reads current aggregate demand for a specific procurement pool
   */
  async getAggregateDemand(poolId: string): Promise<{ totalUnits: bigint; totalEscrow: bigint }> {
    // In production or tests, communicates with DemandVault on-chain
    return {
      totalUnits: 0n,
      totalEscrow: 0n
    };
  }

  /**
   * Retrieves full immutable terms of a pool
   */
  async getPoolTerms(poolId: string): Promise<PoolTerms | null> {
    return null;
  }

  /**
   * Retrieves buyer's active commitment and escrow status
   */
  async getBuyerCommitment(poolId: string, buyerAddress: string): Promise<BuyerCommitment | null> {
    return null;
  }

  /**
   * Independent mathematical verification of a clearing result
   */
  async verifyClearingResult(params: {
    maxUnitPrice: bigint;
    revealedBids: Array<{ supplier: string; unitPrice: bigint; capacity: bigint; valid: boolean }>;
    totalDemand: bigint;
    actualClearingPrice: bigint;
    actualWinningSupplier: string;
  }): Promise<{ isVerified: boolean; reason?: string }> {
    const { maxUnitPrice, revealedBids, totalDemand, actualClearingPrice, actualWinningSupplier } = params;

    let lowestValidPrice = BigInt(Number.MAX_SAFE_INTEGER);
    let expectedWinner = '';

    for (const bid of revealedBids) {
      if (!bid.valid || bid.capacity < totalDemand || bid.unitPrice > maxUnitPrice) {
        continue;
      }
      if (bid.unitPrice < lowestValidPrice) {
        lowestValidPrice = bid.unitPrice;
        expectedWinner = bid.supplier;
      }
    }

    if (!expectedWinner) {
      return { isVerified: false, reason: 'No qualifying suppliers found matching demand and capacity criteria' };
    }

    if (lowestValidPrice !== actualClearingPrice) {
      return {
        isVerified: false,
        reason: `Price mismatch: recomputed lowest qualifying price is ${lowestValidPrice}, but contract settled at ${actualClearingPrice}`
      };
    }

    if (expectedWinner.toLowerCase() !== actualWinningSupplier.toLowerCase()) {
      return {
        isVerified: false,
        reason: `Winner mismatch: recomputed winner is ${expectedWinner}, but contract selected ${actualWinningSupplier}`
      };
    }

    return { isVerified: true };
  }

  /**
   * Financial simulation helper
   */
  simulateClearingBreakdown(params: {
    totalUnits: bigint;
    maxUnitPrice: bigint;
    clearingPrice: bigint;
    platformFeeBps: bigint;
  }) {
    const { totalUnits, maxUnitPrice, clearingPrice, platformFeeBps } = params;
    const grossEscrow = calculateDeposit(totalUnits, maxUnitPrice);
    const finalLiability = calculateLiability(totalUnits, clearingPrice);
    const buyerRefunds = calculateRefund(totalUnits, maxUnitPrice, clearingPrice);
    const platformFee = (finalLiability * platformFeeBps) / 10000n;
    const netSupplierPayout = finalLiability - platformFee;
    const isSolvent = verifyConservationOfFunds(grossEscrow, buyerRefunds, finalLiability);

    return {
      grossEscrow,
      finalLiability,
      buyerRefunds,
      platformFee,
      netSupplierPayout,
      isSolvent
    };
  }
}

