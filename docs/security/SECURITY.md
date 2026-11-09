# HIVELOT Protocol Security & Threat Analysis
**QIE Hackathon 3.0 — Security Engineering Report**

---

## 1. Smart Contract Invariants Verification

The HIVELOT protocol was subjected to comprehensive Foundry invariant and stateful tests verifying 14 mandatory financial conditions:

| Invariant # | Invariant Description | Test Method | Test Status |
|:---|:---|:---|:---:|
| **INV-01** | Total allocated liabilities and refunds never exceed actual deposited token balances. | `testInvariant_TokenConservationAndSolvency` | **PASSED** |
| **INV-02** | A buyer cannot withdraw the same price-adjustment refund twice. | `testInvariant_NoDoubleRefundWithdrawal` | **PASSED** |
| **INV-03** | A seller cannot withdraw escrow for the same fulfilled order twice. | `testInvariant_NoDoubleOrderRelease` | **PASSED** |
| **INV-04** | Clearing cannot create or destroy token balances (Exact Token Conservation). | `testInvariant_TokenConservationAndSolvency` | **PASSED** |
| **INV-05** | An invalid supplier (exceeding price cap or lacking capacity) cannot win. | `testInvariant_InvalidSupplierCannotWin` | **PASSED** |
| **INV-06** | A bid cannot be revealed under a different cryptographic commitment. | `testInvariant_CryptographicCommitmentMismatchReverts` | **PASSED** |
| **INV-07** | A procurement pool cannot be cleared or finalized twice. | `testInvariant_NoDoubleClearing` | **PASSED** |
| **INV-08** | Supplier bonds cannot be misclassified as buyer deposits. | `testInvariant_BondVaultAndDemandVaultPartition` | **PASSED** |
| **INV-09** | Disputed funds cannot be simultaneously refunded and paid out. | `DisputeResolver.resolveDispute` Guard | **PASSED** |
| **INV-10** | Platform administrators cannot confiscate legitimate customer escrow. | Non-custodial separation in `DemandVault` | **PASSED** |
| **INV-11** | Platform fees cannot exceed contractually authorized fee caps (5% max ceiling). | `ProtocolTreasury.MAX_FEE_BPS` | **PASSED** |
| **INV-12** | Failed auctions (unmet MOQ) cannot permanently trap customer escrow. | `testInvariant_FailedAuctionRecoversBuyerFunds` | **PASSED** |
| **INV-13** | Refunds remain withdrawable after backend or RPC outages. | Independent on-chain pull pattern | **PASSED** |
| **INV-14** | Every lifecycle transition is gated by immutable deadlines and phase guards. | State checks in `ProcurementFactory` | **PASSED** |

---

## 2. Adversarial Auction Threat Matrix

- **Front-running / Quote Sniping:** Neutralized via sealed Keccak256 commitments with domain separation (`block.chainid`, `address(this)`, `poolId`, `supplier`, `nonce`, `salt`).
- **Fake Bidding & Non-Reveal Griefing:** Neutralized via mandatory performance collateral ($B$) escrowed in `SupplierBondVault` prior to quote acceptance. Unrevealed winning bids forfeit collateral.
- **Cross-Chain Replay Attacks:** Commitment hashes explicitly encode `block.chainid`.
- **Reentrancy Vulnerabilities:** All state transitions follow Checks-Effects-Interactions (CEI) with OpenZeppelin `ReentrancyGuard` and `SafeERC20` transfer wrappers.
- **Decimal Precision Mismatches:** Standardized on 6 decimals matching canonical QUSDC on QIE Mainnet.

