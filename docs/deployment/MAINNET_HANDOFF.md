# Mainnet deployment handoff

Open https://hivelot-network.guppy-ai.chatgpt.site/#deploy.

1. Install QIE Wallet from https://www.qiewallet.me/ or MetaMask from
   https://metamask.io/download/ and create a wallet. Keep recovery material private.
2. In the HIVELOT deployment screen, connect it. HIVELOT adds/switches to QIE
   Mainnet and selects QUSDC automatically. The connected wallet also receives fees.
3. The screen shows the actual public wallet address, balance, estimated fee,
   buffered allowance, and any shortfall. Fund that address with native QIE on
   QIE Mainnet. The read-only preflight found approximately 0.0032 QIE estimated
   cost and 0.0073 QIE buffered allowance; these are snapshots, not fixed prices.
   Testnet faucet tokens, Ethereum ETH, and QUSDC cannot pay mainnet native gas.
4. Refresh the balance/quote, click the deployment button, and approve the
   transaction inside the wallet. No private key or recovery phrase is entered
   into HIVELOT or chat.
5. Send the public deployment transaction hash from the confirmation screen.
   The operator can run `node scripts/check-deployment.mjs <hash>` in the app
   checkout. It verifies chain, successful creation, exact release bytecode and
   constructor arguments, immutable token, fee recipient, version and decimals.
6. After verification, set public runtime addresses `HIVELOT_PROTOCOL_ADDRESS`
   and `SETTLEMENT_TOKEN_ADDRESS` in Sites, redeploy the saved version, and
   verify the live settlement desk and explorer source. Keep user-facing status
   and the submission package consistent with the actual deployment.

Current authorization covers deployment work. No mainnet transaction has been
broadcast because no owner wallet or funded signer exists. Autonomy does not
create a wallet signature or supply gas funds. Independent review and real
network execution remain distinct from automated/local-EVM test evidence.
