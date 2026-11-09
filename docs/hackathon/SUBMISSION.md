# QIE Hackathon 3.0 — Official Submission Package
**2026 Mainnet Edition**

---

## Project Overview

- **Project Title:** HIVELOT — The Autonomous Demand Clearing Network
- **Tagline:** Demand together. Compete supply. Clear on-chain.
- **Primary Hackathon Category:** **Commerce & Real World**
- **Secondary Relevance:** DeFi & Financial Infrastructure, Developer Tooling, AI + Autonomous Agents
- **Target Blockchain:** QIE Mainnet (Chain ID 1990)
- **Settlement Token:** Verified QUSDC (`0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5`, 6 Decimals)
- **Official Portal:** `http://localhost:4000/` (Integrated UI and Real-Time WebSocket Clearing Engine)
- **Independent Verification Script:** `node scripts/verify/verify-clearing.js`
- **End-to-End Operational Demo:** `node scripts/operations/run-demo.js`

---

## Hackathon Judging Criteria Alignment

### 1. Innovation and Creativity (25%)
- Inverts traditional seller-centric retail by starting with aggregate, verified, funded buyer demand.
- Cryptographically sealed commit-reveal reverse auctions prevent quote sniping while preserving supplier privacy.
- Deterministic clearing engine establishes a uniform clearing price, with automatic refunds for excess deposits.

### 2. Technical Implementation and Quality (25%)
- Modular Solidity smart contract suite compiled with Solc 0.8.20 and `via-ir`.
- 100% pass rate on 9 comprehensive Foundry invariant and lifecycle tests (`forge test -vv`).
- Real-time event indexer streaming WebSocket state updates to the browser.
- Interactive **Demand Constellation** graph mapping multi-sided economic flows.

### 3. Real-World Applicability and Potential Impact (25%)
- Addresses real commercial pain points: small business purchasing power fragmentation and supplier customer acquisition costs.
- Integrates physical delivery evidence commits (IPFS manifests) with 7-day challenge windows and arbitration dispute resolution.
- Defensible 0.75% take rate and merchant SaaS subscription business model.

### 4. Presentation and Demonstration Quality (25%)
- High-density futuristic trading terminal user interface.
- Complete documentation suite: Architecture Specification, Whitepaper, Security Threat Analysis, Traction Metrics, and Commercial Plan.
- Read-only independent verification script allowing judges to audit market clearing outcomes independently of application databases.
