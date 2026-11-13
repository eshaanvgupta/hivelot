# HIVELOT application

A hosted procurement application with wallet signature authentication, persistent
buyer interest, supplier profiles, private indicative offers, public discussion,
and an on-chain settlement interface.

The interface uses warm ivory, burnt orange, olive, Instrument Serif, DM Sans, and
IBM Plex Mono. It includes responsive navigation, a custom animated demand flow,
loading and error states, native modal focus handling, and reduced-motion support.

## Development

Node 22.13 or later is required. Install with `npm ci --workspaces=false`. This
application has its own lockfile and is intentionally independent of the legacy
root workspaces. Set up the local execution profile using the Sites helper when
opening a fresh checkout, then run `npm run dev`.

The hosting manifest declares D1 binding `DB`. Migrations live in `drizzle/` and
are applied by Sites during publication. For local previews, build once, then
apply each migration to the local database using Wrangler as documented in the
Sites skill. Do not run migrations inside request handlers.

## Verification

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/test-api.mjs
node scripts/qa-browser.mjs
```

The API mutation tests refuse to run against non-loopback hosts. Browser QA uses
the local Chrome installation by default; set `CHROME_PATH` on another platform.
Screenshots and runtime records under `outputs/` are ignored and never published.

For isolated settlement/evidence integration testing, start
`node scripts/local-chain.mjs`, run `node scripts/test-settlement.mjs --prepare`,
restart the development server to pick up the generated local `.dev.vars`, apply
the evidence migration locally, then run `node scripts/test-settlement.mjs`.
This requires the compiled mock-token artifact in the monorepo. The loopback-only
RPC override cannot change the RPC for hosted traffic. Remove the generated
`.dev.vars` after local testing. Ganache is a dev-only test dependency; it is not
part of the deployed Worker.

## Settlement activation

Mainnet settlement is inactive until the operator sets these public runtime
addresses in Sites and deploys a new version:

```text
HIVELOT_PROTOCOL_ADDRESS=<verified HivelotProtocol v2 address>
SETTLEMENT_TOKEN_ADDRESS=<issuer-verified six-decimal ERC-20 address>
```

The deployment dialog prepares a real QIE transaction, estimates gas, and requires
the wallet holder's explicit confirmation. No private key is accepted by the app.
The settlement desk checks the contract version, immutable token, token decimals,
and wallet network before financial actions. All writes use real transaction
receipts. Private fulfillment references are restricted to the buyer, winner,
and designated arbitrator, and their hashes are checked against confirmed logs.

Bid salts remain in the browser session and downloaded reveal files; they are not
sent to the backend. Download is required before committing a bid. Keep the file
private until reveal. The contract permits bond recovery after failed/non-revealed
bids, but does not impose collateral slashing.

## Current limits

The contract has automated tests and source review, not an independent security
audit. The fixed token must be independently verified, including any token
upgradeability or rebase behavior. Physical delivery and arbitration require
human judgment. The stateful invariant model covers one pool/buyer/supplier;
additional multi-party, multi-pool and timeout scenarios have deterministic tests.
Procurement listings and funded on-chain pools are separate records. The initial
release does not include shipping-carrier integration, identity verification,
email notifications, an AI provider, or claimed customer traction.
