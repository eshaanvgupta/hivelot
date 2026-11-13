# V2 security and readiness

V1 has critical auction, escrow, deadline, admin-privilege and dispute faults.
Do not deploy `src/core` for real funds. The new application targets only the
single-contract implementation `src/v2/HivelotProtocol.sol`.

V2 uses immutable token/fee-recipient configuration, immutable per-pool terms,
fixed phase windows, deterministic first-commit tie-breaking, bounded active
buyers/bidders, strict incoming and outgoing token balance checks, guarded token
transfers, terminal order states, pull credits, a capped supplier fee, and no
administrator escrow withdrawal. Cancellation removes the participant slot.

Disputes freeze ordinary acceptance. The named arbitrator can divide the remaining
liability; signed verdicts include chain, contract, pool, buyer, nonce, evidence
hash and expiry. Dispute and verdict hashes are recorded. Inactivity returns
disputed funds to buyers after fourteen days. No-dispatch refunds use stored
deadlines. Neither ordinary refunds nor withdrawals require the application API.

Policy: dispatch starts a seven-day challenge period; the buyer can accept sooner.
An unchallenged dispatch becomes payable after the period. Bonds are refundable
after eligible closure, including supplier default; no slashing is implemented.
Arbitrator judgment and physical delivery remain off-chain trust dependencies.

Validation: 19 scenario/fuzz tests and one stateful invariant, including
cancel/rejoin, participant-slot exhaustion, phase enforcement, wrong commitments,
same-block ties, no-reveal refunds, double actions, defaults, dispute freezes,
splits, multi-pool accounting, transfer-tax rejection, EIP-712 chain/nonce replay,
and worst-case participant gas. The invariant's 128,000 calls model one market
with one buyer and one supplier. Long timeout and multi-market behavior have
separate scenario tests; broad stateful multi-party exploration remains future work.

The full local integration test deploys a mock token and v2 contract, then checks
approval, funding, bonded commit/reveal, clearing, refunds, dispatch, receipt-bound
private evidence, acceptance, fees, bond release, withdrawals and zero balance.
This is local-EVM evidence, not QIE mainnet execution or external audit evidence.

Before real customer funds: verify the actual settlement-token issuer/address,
token semantics and upgrade policy; commission independent contract review; test
against the actual network; record deployed bytecode, transaction receipts and
source verification. Application hosting alone does not satisfy these checks.
