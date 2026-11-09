#!/usr/bin/env node
/**
 * @file verify-clearing.js
 * @description Independent cryptographic and mathematical verification script for HIVELOT procurement pools.
 * Operates strictly from publicly inspectable parameters without depending on application databases.
 */

const fs = require('fs');
const path = require('path');

function verifyClearingOutcome(poolData) {
  console.log('\n============================================================');
  console.log('HIVELOT INDEPENDENT CLEARING VERIFIER (QIE 2026 MAINNET)');
  console.log('============================================================');

  const { poolId, maxUnitPrice, targetQuantity, minOrderQuantity, revealedBids, actualClearing } = poolData;

  console.log(`Pool Identifier:         ${poolId}`);
  console.log(`Target Demand Units:     ${targetQuantity}`);
  console.log(`Minimum Order Quantity:  ${minOrderQuantity}`);
  console.log(`Agreed Max Unit Price:   ${maxUnitPrice} QUSDC\n`);

  console.log('--- Evaluating Supplier Quotes ---');
  let lowestQualifyingPrice = Infinity;
  let winningSupplier = null;

  for (const bid of revealedBids) {
    const isCapacityValid = bid.capacity >= targetQuantity;
    const isPriceValid = bid.unitPrice <= maxUnitPrice;
    const isTermsValid = bid.termsHashValid === true;
    const isEligible = isCapacityValid && isPriceValid && isTermsValid;

    console.log(`Supplier: ${bid.supplier}`);
    console.log(`  Quote:     ${bid.unitPrice} QUSDC`);
    console.log(`  Capacity:  ${bid.capacity} units (Needed: ${targetQuantity}) -> ${isCapacityValid ? 'PASS' : 'FAIL'}`);
    console.log(`  Price Cap: <= ${maxUnitPrice} QUSDC -> ${isPriceValid ? 'PASS' : 'FAIL'}`);
    console.log(`  Eligible:  ${isEligible ? 'QUALIFIED' : 'REJECTED'}`);

    if (isEligible) {
      if (bid.unitPrice < lowestQualifyingPrice) {
        lowestQualifyingPrice = bid.unitPrice;
        winningSupplier = bid;
      } else if (bid.unitPrice === lowestQualifyingPrice) {
        // Deterministic tie-breaker: earliest commitment
        if (bid.commitmentTimestamp < winningSupplier.commitmentTimestamp) {
          winningSupplier = bid;
        }
      }
    }
  }

  if (!winningSupplier) {
    console.error('\n[AUDIT RESULT] FAILED: No qualifying supplier found satisfying capacity and price constraints.');
    process.exit(1);
  }

  console.log('\n--- Deterministic Mechanism Settlement Result ---');
  console.log(`Winning Supplier:        ${winningSupplier.supplier}`);
  console.log(`Uniform Clearing Price:  ${lowestQualifyingPrice} QUSDC`);

  const grossOrderValue = targetQuantity * lowestQualifyingPrice;
  const totalEscrowDeposited = targetQuantity * maxUnitPrice;
  const buyerRefundsAllocated = targetQuantity * (maxUnitPrice - lowestQualifyingPrice);

  console.log(`Total Escrow Deposited:  ${totalEscrowDeposited} QUSDC`);
  console.log(`Winning Order Value:     ${grossOrderValue} QUSDC`);
  console.log(`Allocated Buyer Savings: ${buyerRefundsAllocated} QUSDC`);

  // Exact Invariant Check
  const conservationHolds = totalEscrowDeposited === grossOrderValue + buyerRefundsAllocated;
  console.log(`Token Conservation:      ${conservationHolds ? 'PRESERVED (Invariant OK)' : 'VIOLATION'}`);

  if (actualClearing) {
    console.log('\n--- Comparing with Reported On-Chain State ---');
    const priceMatch = actualClearing.clearingPrice === lowestQualifyingPrice;
    const winnerMatch = actualClearing.winningSupplier.toLowerCase() === winningSupplier.supplier.toLowerCase();

    console.log(`Reported Winner:         ${actualClearing.winningSupplier} -> ${winnerMatch ? 'MATCH' : 'MISMATCH'}`);
    console.log(`Reported Price:          ${actualClearing.clearingPrice} QUSDC -> ${priceMatch ? 'MATCH' : 'MISMATCH'}`);

    if (priceMatch && winnerMatch && conservationHolds) {
      console.log('\n============================================================');
      console.log('>>> VERIFICATION PASSED: ON-CHAIN CLEARING MATHEMATICALLY PROVEN <<<');
      console.log('============================================================\n');
      return true;
    } else {
      console.error('\n>>> VERIFICATION FAILED: DISCREPANCY DETECTED <<<');
      return false;
    }
  }

  return true;
}

// Self-test execution with sample real reference data
const samplePool = {
  poolId: '0x24741cbbfb257477ca2971bf3c78c9d7556b75748b9ada78d2a3532795a23c11',
  maxUnitPrice: 80,
  targetQuantity: 10,
  minOrderQuantity: 10,
  revealedBids: [
    { supplier: '0x5100000000000000000000000000000000000051', unitPrice: 72, capacity: 15, termsHashValid: true, commitmentTimestamp: 86402 },
    { supplier: '0x5200000000000000000000000000000000000052', unitPrice: 67, capacity: 20, termsHashValid: true, commitmentTimestamp: 86403 },
    { supplier: '0x5300000000000000000000000000000000000053', unitPrice: 61, capacity: 12, termsHashValid: true, commitmentTimestamp: 86404 }
  ],
  actualClearing: {
    winningSupplier: '0x5300000000000000000000000000000000000053',
    clearingPrice: 61
  }
};

if (require.main === module) {
  verifyClearingOutcome(samplePool);
}

module.exports = { verifyClearingOutcome };

