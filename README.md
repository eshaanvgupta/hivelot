# HIVELOT — collective procurement on QIE

**Demand together. Compete supply. Clear on-chain.**

- Application: https://hivelot-network.guppy-ai.chatgpt.site
- Source: https://github.com/eshaanvgupta/hivelot
- Frontend and hosted API source: `apps/product/`
- Settlement contract: `packages/contracts/src/v2/HivelotProtocol.sol`
- Release evidence and remaining work: [release status](docs/deployment/RELEASE_STATUS.md)

HIVELOT brings buyers together around a product specification. The hosted
application provides signed wallet authentication, procurement listings, saved
buyer interest, supplier profiles, private indicative offers, discussion threads,
and persistent workspaces. Buyer interest is never counted as escrowed demand.
Empty markets begin empty; the deployment contains no seeded customers or volume.

The new design uses warm ivory, burnt orange, and olive with Instrument Serif,
DM Sans, and IBM Plex Mono. Its custom demand-flow diagram, measured motion,
consistent layout grid, and responsive controls replace the previous neon theme.

## Financial settlement

The v2 contract implements funded pools, domain-separated commit/reveal supplier
bids, deterministic clearing, price refunds, delivery acceptance, challenge and
arbitration timeouts, split decisions, EIP-712 verdicts, fees, and pull withdrawals.
There is no administrator withdrawal path for customer escrow. The settlement
desk invokes real contract methods and displays actual transaction hashes.

**No QIE mainnet contract has been deployed in this release.** Activation requires
a funded wallet, a verified six-decimal settlement-token address, a fee-recipient
address, wallet approval of the deployment, and runtime configuration of the
deployed addresses. The app includes a deployment and gas-estimation dialog.
Until activation it accepts no funds. Automated tests are not a security audit.

The initial v2 bond policy returns collateral after obligations finish; it does
not slash suppliers. Dispatch evidence is not cryptographic proof of delivery.
See [security notes](docs/security/V2_REVIEW.md).

## Run and verify

The independent application has its own lockfile:

```sh
cd apps/product
npm ci --workspaces=false
npm run dev
```

For binding setup, migrations, hosted builds, and integration tests, read the
[application README](apps/product/README.md).

```sh
cd packages/contracts
forge test --match-path test/HivelotV2.t.sol -vv
```

The v2 suite contains 19 scenario/fuzz tests plus one stateful conservation test.
Foundry currently also runs the 19 inherited tests in the invariant test contract;
the 39 reported passes are not 39 independent scenarios. The invariant runs
256 sequences / 128,000 calls. Worst-case clearing with 128 active buyers and
128 bids used 6,188,866 gas in the test environment.

## Legacy code

`apps/api`, `apps/web/public`, and `packages/contracts/src/core` preserve the
original prototype for reference. They are not the hosted application or approved
for mainnet use. The v1 deployment script rejects QIE mainnet and no longer has a
default public development key. GitHub Pages redirects to the hosted application.
