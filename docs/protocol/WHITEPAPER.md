# HIVELOT Protocol Whitepaper
## The Autonomous Demand Clearing Network
### QIE Mainnet Edition — 2026

---

## Abstract

Traditional commerce infrastructure suffers from severe structural inefficiencies: buyers lack volume bargaining leverage, while suppliers incur exorbitant customer acquisition costs and demand forecasting risks. Existing group-purchasing attempts rely on centralized brokers, lack transparent price clearing rules, and offer zero verifiable custody protections.

**HIVELOT** introduces the first autonomous, on-chain Demand Clearing Protocol deployed on QIE Mainnet. Buyers pool verified purchasing power into immutable smart contract vaults denominated in QUSDC. Suppliers compete through a sealed-bid commit-reveal mechanism backed by performance bonds. An on-chain clearing house executes deterministic lowest-price matching to establish a uniform clearing price, with automated, immediate price-adjustment refunds for excess buyer deposits. Escrowed supplier payments are released strictly upon physical delivery evidence commitments, challenge timeouts, or cryptographic dispute arbitration.

---

## 1. Mechanism Architecture

### 1.1 Demand Formation & Aggregation
A buyer initiates a pool with an exact standardized SKU specification hash, a target quantity $Q_{target}$, a minimum order quantity $Q_{min}$, and a ceiling unit price $M$. Participating buyers deposit escrow:
$$D_i = q_i \times M$$

Demand is strictly calculated from on-chain confirmed funded commitments. Unfunded signals of interest are not counted toward pool clearing thresholds.

### 1.2 Sealed-Bid Supplier Auction
Suppliers submit sealed quotes using domain-separated Keccak256 commitment hashes:
$$\text{CommitmentHash} = \text{keccak256}(\text{abi.encode}(\text{chainId}, \text{auctionContract}, \text{poolId}, \text{supplier}, P_s, C_s, T_d, \text{termsHash}, \text{nonce}, \text{salt}))$$

To ensure quote integrity and prevent spam bidding, suppliers lock a performance bond $B$ into `SupplierBondVault`. During the reveal window, suppliers submit $(P_s, C_s, T_d, \text{nonce}, \text{salt})$. Bids that mismatch the hash, exceed the price cap ($P_s > M$), or fail capacity requirements ($C_s < Q$) are disqualified.

### 1.3 Deterministic Market Clearing
The `ClearingHouse` identifies all qualifying revealed offers:
$$S_{qual} = \{ s \mid P_s \le M \land C_s \ge Q \land \text{termsMatch}(s) \land \text{deadlineMatch}(s) \}$$

The uniform clearing price $P$ is fixed by the minimum quote:
$$P = \min_{s \in S_{qual}} P_s$$

In the event of identical quotes, deterministic tie-breaking selects the earliest valid commitment timestamp.

### 1.4 Post-Clearing Settlement & Refund Invariants
Once cleared, the financial state partitions into:
1. **Price-Adjustment Refunds:**
   $$R_i = q_i \times (M - P)$$
   Allocated immediately to buyer refund vaults and available for withdrawal.
2. **Fulfillment Escrow:**
   $$L_i = q_i \times P$$
   Retained in escrow until verified order delivery.
3. **Protocol Settlement Fee:**
   $$F = (Q \times P \times \text{feeBps}) / 10000$$

---

## 2. Real-World Trust & Fulfillment Architecture

Smart contracts cannot physically inspect postal delivery. HIVELOT bridges this boundary using an evidence-commit protocol:
- **Dispatch Commitment:** The winning supplier commits a cryptographic hash (IPFS CID) of the logistics bill of lading.
- **Delivery Acceptance:** The buyer signs an acceptance transaction, releasing $L_i$ to the supplier.
- **Challenge Period & Auto-Acceptance:** If no dispute is lodged within 7 days of documented dispatch, the supplier can invoke auto-acceptance.
- **Default Penalty:** If the supplier fails to dispatch before the fulfillment deadline, buyers receive a 100% refund of $L_i$, and the supplier's performance bond is forfeited.
- **Dispute Resolution:** Authorized arbitrators adjudicate disputes via signed verdicts with public on-chain rationale commitments.

