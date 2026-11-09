# HIVELOT — The Autonomous Demand Clearing Network
**QIE Hackathon 3.0 — 2026 Mainnet Edition**
**Tagline:** Demand together. Compete supply. Clear on-chain.

---

## 🌟 Executive Summary

**HIVELOT** is an autonomous multi-sided commerce protocol on QIE Mainnet (Chain ID 1990) that pools fragmented buyer purchasing commitments into verified volume procurement pools. Suppliers compete through sealed-bid commit-reveal auctions with performance bonds. An on-chain `ClearingHouse` deterministically determines the lowest qualifying offer to fix a uniform clearing price, automatically refunds excess deposits to buyers, and safeguards supplier escrow until verified physical fulfillment.

---

## 🚀 Key Technological Innovations

1. **Demand Formation & Aggregation:** Buyers commit exact unit quantities and deposit token escrow ($D_i = q_i \times M$) into `DemandVault`. Unfunded expressions of interest are never counted.
2. **Sealed-Bid Supplier Competition:** Cryptographically sealed commitment hashes protect supplier margins until the reveal phase. Performance collateral is escrowed in `SupplierBondVault`.
3. **Deterministic Clearing Engine:** Mathematical selection of the lowest valid quote meeting the pool's entire demand ($C_s \ge Q$). Non-manipulable timestamp tie-breaking eliminates administrator discretion.
4. **Immediate Price-Adjustment Refunds:** Excess deposits ($R_i = q_i \times (M - P)$) are immediately credited to withdrawable buyer vaults upon clearing.
5. **Real-World Fulfillment Verification:** Winning suppliers commit IPFS shipment manifests; escrow release is governed by buyer acceptance, a 7-day challenge window, or EIP-712 multi-sig arbitration.
6. **The Demand Constellation:** Signature interactive force-directed canvas visualizing live economic flows between buyers, pools, and suppliers.
7. **HIVE Intelligence:** AI procurement assistant providing natural language guidance and deterministic demand compatibility matching.

---

## 🏛️ Smart Contract Architecture

The core contracts are written in Solidity (v0.8.20) and compiled with `via-ir`:

- `ProcurementFactory.sol`: Deploys and manages pool lifecycle (FORMING $\rightarrow$ BIDDING $\rightarrow$ REVEALING $\rightarrow$ CLEARED $\rightarrow$ FULFILLING $\rightarrow$ COMPLETED).
- `DemandVault.sol`: Safely escrows buyer funds, tracks individual balances, guarantees exact token conservation, and processes price-adjustment refunds.
- `SupplierAuction.sol`: Manages domain-separated sealed bids (`block.chainid`, `address(this)`, `poolId`, `supplier`, `nonce`, `salt`) and reveal verification.
- `ClearingHouse.sol`: Deterministically calculates the winning supplier, uniform clearing price $P$, buyer refunds, and platform fees.
- `FulfillmentRegistry.sol`: Tracks dispatch commitments (IPFS CIDs), buyer confirmations, 7-day auto-acceptance timeouts, and supplier default penalties.
- `DisputeResolver.sol`: Arbitrates contested fulfillments with signed binding verdicts (Buyer Refund, Supplier Payout, or Agreed Split).
- `SupplierBondVault.sol`: Holds supplier performance collateral; forfeits bond on breach or returns collateral on delivery.
- `ProtocolTreasury.sol`: Accumulates transparent platform fees (0.75%), strictly separated from customer deposits.
- `MerchantRegistry.sol`: Stores merchant credentials, verification tiers, and fulfillment track records.

---

## 🧪 Comprehensive Verification & Test Results

### 1. Foundry Test Suite (100% Passing)
```bash
cd packages/contracts
forge test -vv
```
**Results:**
- `testCompleteCollectiveProcurementScenario`: **PASS** (Gas: 3,267,147)
- `testInvariant_TokenConservationAndSolvency`: **PASS** (Gas: 1,801,307)
- `testInvariant_NoDoubleRefundWithdrawal`: **PASS** (Gas: 1,830,655)
- `testInvariant_NoDoubleOrderRelease`: **PASS** (Gas: 1,967,882)
- `testInvariant_InvalidSupplierCannotWin`: **PASS** (Gas: 1,396,373)
- `testInvariant_CryptographicCommitmentMismatchReverts`: **PASS** (Gas: 1,148,924)
- `testInvariant_NoDoubleClearing`: **PASS** (Gas: 1,801,508)
- `testInvariant_BondVaultAndDemandVaultPartition`: **PASS** (Gas: 1,142,059)
- `testInvariant_FailedAuctionRecoversBuyerFunds`: **PASS** (Gas: 696,395)

### 2. Independent Clearing Verification Script
Judges and third parties can mathematically audit any procurement outcome directly:
```bash
node scripts/verify/verify-clearing.js
```

### 3. End-to-End Operational Lifecycle Demo
Simulates full commercial execution:
```bash
node scripts/operations/run-demo.js
```

---

## ⚡ Quickstart & Running the Application

### 1. Launch API & Interactive Web Application
```bash
cd apps/api
npm install
node src/server.js
```
Open **[http://localhost:4000](http://localhost:4000)** in your browser to access:
- **Live Demand Exchange**
- **The Demand Constellation**
- **Buyer Command Center**
- **Supplier Trading Terminal**
- **Public Clearing Explorer & Auditor**
- **HIVE Intelligence AI Assistant**
- **Traction & Metrics Ledger**

---

## 📄 Documentation Package

- [Architecture Specification](docs/architecture/ARCHITECTURE.md)
- [Protocol Whitepaper](docs/protocol/WHITEPAPER.md)
- [Security Threat Analysis & Invariants](docs/security/SECURITY.md)
- [Commercialization & Unit Economics](docs/business/BUSINESS_MODEL.md)
- [90-Day Traction Ledger](docs/traction/TRACTION_REPORT.md)
- [Hackathon Submission Package](docs/hackathon/SUBMISSION.md)
