# Release status — 13 November 2026

## Implemented and verified

- Custom ivory/orange/olive interface with new typography, responsive layout,
  animated demand flow, hover/transition/loading feedback and reduced motion.
- Hosted API and migration-managed D1 database; no seeded production records.
- Domain-bound wallet challenges, single-use signatures, hashed session tokens,
  HttpOnly cookies, origin checks and owner authorization.
- Procurement listings, atomic capacity-limited interest, supplier profiles,
  private indicative offers, CSV exports, public questions and user workspaces.
- Live database counts, category/status/search filters and real pool network.
- Tested v2 escrow with wallet transaction UI and pre-deployment gas estimation.
- Secret bid backup before commitment, backup preservation, arbitrary pool-ID
  lookup, order controls and authenticated receipt-verified evidence references.
- Browser checks at 1440, 768, 390 and 320px; modal focus/Escape and reduced motion.
- API integration tests and local-EVM settlement/evidence lifecycle tests.
- Original v1 deployment is blocked on QIE mainnet; no default deployment key.

## External actions still required

There are no mainnet contract addresses or QIE transaction hashes to report.
The owner must verify a six-decimal settlement asset and fee-recipient address,
connect a funded wallet, inspect the estimate, and approve mainnet deployment.
The operator then sets `HIVELOT_PROTOCOL_ADDRESS` and `SETTLEMENT_TOKEN_ADDRESS`
in the host and deploys the configuration. The app will refuse financial actions
until the configured token, version, decimals and wallet chain match.

Independent security audit, business/merchant verification, carrier integration,
production email notifications, external AI integration and commercial traction
are not completed or claimed. Procurement listings and funded pools are separate
records in this release. The application must not be called a finished commercial
mainnet marketplace before these remaining requirements are addressed.

## Publication

The hosted application is at https://hivelot-network.guppy-ai.chatgpt.site.
GitHub Pages redirects to it because a static host cannot execute the API.
Deployment IDs/commit evidence are recorded in the task handoff after publication.
