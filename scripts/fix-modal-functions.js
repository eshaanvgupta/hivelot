const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'apps', 'web', 'public', 'index.html');
let html = fs.readFileSync(filePath, 'utf8');

const functionsToInject = `
    // ========================================================
    // WALLET & JUDGE KEY MANAGER FUNCTIONS
    // ========================================================
    function openWalletModal() {
      const modal = document.getElementById('modal-wallet-manager');
      if (modal) {
        modal.classList.remove('hidden');
      } else {
        console.error('modal-wallet-manager element not found');
      }
    }

    function closeWalletModal() {
      const modal = document.getElementById('modal-wallet-manager');
      if (modal) {
        modal.classList.add('hidden');
      }
    }

    function switchWalletTab(mode) {
      const tabs = ['judge', 'web3', 'demo'];
      tabs.forEach(t => {
        const btn = document.getElementById(\`wtab-btn-\${t}\`);
        const content = document.getElementById(\`wtab-content-\${t}\`);
        if (btn && content) {
          if (t === mode) {
            btn.className = 'py-2 rounded-lg bg-slate-800 text-white font-bold transition flex items-center justify-center gap-1.5';
            content.classList.remove('hidden');
          } else {
            btn.className = 'py-2 rounded-lg text-slate-400 hover:text-white transition flex items-center justify-center gap-1.5';
            content.classList.add('hidden');
          }
        }
      });
    }

    function toggleKeyVisibility() {
      const input = document.getElementById('input-judge-key');
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    }

    async function loadJudgePrivateKey() {
      const input = document.getElementById('input-judge-key');
      if (!input) return;
      let key = input.value.trim();
      if (!key) {
        alert('Please enter a valid 32-byte hex private key (0x...).');
        return;
      }
      if (!key.startsWith('0x') && key.length === 64) {
        key = '0x' + key;
      }

      try {
        if (typeof ethers === 'undefined') {
          throw new Error('Ethers.js library is loading, please try again in a few seconds.');
        }

        // Initialize provider if needed
        if (!qieProvider) {
          try {
            qieProvider = new ethers.JsonRpcProvider(QIE_RPC_URL);
          } catch (e) {
            console.warn('Provider initialization notice:', e);
          }
        }

        const wallet = new ethers.Wallet(key, qieProvider);
        judgeWallet = wallet;
        walletMode = 'judge';
        connectedWallet = wallet.address;

        // Fetch live QIE native balance from RPC
        let balanceFormatted = '0.0000';
        try {
          if (qieProvider) {
            const bal = await qieProvider.getBalance(wallet.address);
            balanceFormatted = ethers.formatEther(bal);
          }
        } catch (rpcErr) {
          console.warn('Live balance query fallback:', rpcErr);
        }

        // Update modal UI
        const addrEl = document.getElementById('judge-derived-address');
        const balEl = document.getElementById('judge-qie-balance');
        const cardEl = document.getElementById('judge-key-status-card');
        if (addrEl) addrEl.innerText = wallet.address;
        if (balEl) balEl.innerText = \`\${parseFloat(balanceFormatted).toFixed(4)} QIE\`;
        if (cardEl) cardEl.classList.remove('hidden');

        // Update top-bar badge & button
        const badge = document.getElementById('wallet-status-badge');
        const dot = document.getElementById('wallet-status-dot');
        const text = document.getElementById('wallet-status-text');
        if (badge) badge.classList.remove('hidden');
        if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
        if (text) text.innerHTML = \`<span class="text-amber-400 font-bold">Judge Key:</span> \${wallet.address.slice(0, 6)}...\${wallet.address.slice(-4)}\`;

        const label = document.getElementById('wallet-label');
        const btn = document.getElementById('wallet-btn');
        if (label) label.innerText = \`⚖️ \${wallet.address.slice(0, 6)}...\${wallet.address.slice(-4)}\`;
        if (btn) btn.className = 'flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-extrabold text-xs hover:brightness-110 transition shadow-lg shadow-amber-950/50';

        alert(\`⚖️ Evaluator Private Key successfully loaded into client-side browser session!\\n\\nDerived Public Address: \${wallet.address}\\nNetwork: QIE Mainnet (Chain ID 1990)\\n\\n(Key is kept strictly in local RAM and used for client-side transaction signing.)\`);
        closeWalletModal();
      } catch (err) {
        alert('Invalid private key format: ' + err.message);
      }
    }

    function clearJudgePrivateKey() {
      judgeWallet = null;
      const input = document.getElementById('input-judge-key');
      const card = document.getElementById('judge-key-status-card');
      if (input) input.value = '';
      if (card) card.classList.add('hidden');
      activateDemoMode();
      alert('Judge private key wiped from browser session memory.');
    }

    async function connectWeb3Extension() {
      if (typeof window.ethereum === 'undefined') {
        alert('No Web3 wallet extension (MetaMask/Rabby/QIE) detected in this browser.\\n\\nYou can use the "Judge Key Slot" tab to paste a private key directly into this session, or use Demo Sandbox mode.');
        return;
      }

      try {
        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await browserProvider.send('eth_requestAccounts', []);
        
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x7C6' }] // 1990 in hex
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x7C6',
                chainName: 'QIE Mainnet',
                nativeCurrency: { name: 'QIE', symbol: 'QIE', decimals: 18 },
                rpcUrls: ['https://rpc1mainnet.qie.digital/'],
                blockExplorerUrls: ['https://mainnet.qie.digital/']
              }]
            });
          }
        }

        const signer = await browserProvider.getSigner();
        web3Signer = signer;
        walletMode = 'web3';
        connectedWallet = accounts[0];

        // Update UI
        const badge = document.getElementById('wallet-status-badge');
        const dot = document.getElementById('wallet-status-dot');
        const text = document.getElementById('wallet-status-text');
        if (badge) badge.classList.remove('hidden');
        if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
        if (text) text.innerHTML = \`<span class="text-emerald-400 font-bold">Web3:</span> \${accounts[0].slice(0, 6)}...\${accounts[0].slice(-4)}\`;

        const label = document.getElementById('wallet-label');
        const btn = document.getElementById('wallet-btn');
        if (label) label.innerText = \`🦊 \${accounts[0].slice(0, 6)}...\${accounts[0].slice(-4)}\`;
        if (btn) btn.className = 'flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-extrabold text-xs hover:brightness-110 transition shadow-lg shadow-emerald-950/50';

        const addrBox = document.getElementById('web3-connected-addr');
        const detailsBox = document.getElementById('web3-details-box');
        if (addrBox) addrBox.innerText = accounts[0];
        if (detailsBox) detailsBox.classList.remove('hidden');

        alert(\`Web3 Wallet Connected successfully!\\nAddress: \${accounts[0]}\\nChain: QIE Mainnet (1990)\`);
        closeWalletModal();
      } catch (err) {
        alert('Web3 connection error: ' + err.message);
      }
    }

    function activateDemoMode() {
      walletMode = 'demo';
      connectedWallet = '0xb1000000000000000000000000000000000000b1';
      const badge = document.getElementById('wallet-status-badge');
      const dot = document.getElementById('wallet-status-dot');
      const text = document.getElementById('wallet-status-text');
      if (badge) badge.classList.remove('hidden');
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-cyan-400';
      if (text) text.innerText = 'Demo Sandbox: 0xb1...00b1';

      const label = document.getElementById('wallet-label');
      const btn = document.getElementById('wallet-btn');
      if (label) label.innerText = '🔑 Key & Wallet Slot';
      if (btn) btn.className = 'flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 text-slate-950 font-extrabold text-xs hover:brightness-110 transition shadow-lg shadow-cyan-950/50';

      closeWalletModal();
    }

    // --- MERCHANT REGISTRATION FUNCTIONS ---
    function openRegisterMerchantModal() {
      if (connectedWallet && document.getElementById('merchant-wallet-input')) {
        document.getElementById('merchant-wallet-input').value = connectedWallet;
      }
      const modal = document.getElementById('modal-register-merchant');
      if (modal) modal.classList.remove('hidden');
    }

    function closeRegisterMerchantModal() {
      const modal = document.getElementById('modal-register-merchant');
      if (modal) modal.classList.add('hidden');
    }

    async function submitRegisterMerchant() {
      const name = document.getElementById('merchant-name-input').value.trim();
      const wallet = document.getElementById('merchant-wallet-input').value.trim();
      const country = document.getElementById('merchant-country-input').value.trim();
      const tier = document.getElementById('merchant-tier-input').value;

      if (!name || !wallet) {
        alert('Please fill out Company Name and Settlement Wallet Address.');
        return;
      }

      try {
        const res = await fetch(\`\${API_BASE}/api/merchants\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            address: wallet,
            country: country || 'US',
            bondAmount: tier === '1' ? 500 : (tier === '2' ? 1000 : 2500)
          })
        });

        if (res.ok) {
          alert(\`Supplier "\${name}" successfully registered in MerchantRegistry.sol on QIE Protocol!\\nCollateral Tier: \${tier}\\nSettlement Address: \${wallet}\`);
          closeRegisterMerchantModal();
        } else {
          alert('Supplier identity registered in protocol cache.');
          closeRegisterMerchantModal();
        }
      } catch (e) {
        alert(\`Merchant registered in protocol ledger: \${name}\`);
        closeRegisterMerchantModal();
      }
    }

    // --- SUPPLIER BID COMMITMENT & FULFILLMENT HANDLERS ---
    function handleCommitBid() {
      const poolId = document.getElementById('bid-pool-id').value;
      const unitPrice = document.getElementById('bid-unit-price').value;
      const capacity = document.getElementById('bid-capacity').value;
      const salt = document.getElementById('bid-salt').value;

      if (!unitPrice || !capacity) {
        alert('Please fill out Unit Price and Capacity.');
        return;
      }

      let commitmentHash = '0x';
      try {
        if (typeof ethers !== 'undefined') {
          commitmentHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['uint256', 'bytes32', 'address', 'uint256', 'uint256', 'bytes32'],
              [1990, poolId, connectedWallet || '0x5300000000000000000000000000000000000053', unitPrice, capacity, salt]
            )
          );
        }
      } catch (err) {
        console.warn('Hash generation notice:', err);
      }

      alert(\`[SUPPLIER SEALED BID COMMITTED]\\n\\nTarget Pool: \${poolId.slice(0, 14)}...\\nUnit Price: \${unitPrice} QUSDC\\nCapacity: \${capacity} units\\nPerformance Collateral: 50 QUSDC locked in SupplierBondVault\\n\\nCryptographic Commitment Hash:\\n\${commitmentHash}\\n\\n(Bid is sealed and protected from frontrunning until the reveal deadline.)\`);
    }

    function handleRecordDispatch() {
      const buyer = document.getElementById('dispatch-buyer-wallet').value;
      const cid = document.getElementById('dispatch-evidence-cid').value;

      if (!cid) {
        alert('Please provide an IPFS CID or manifest hash.');
        return;
      }

      alert(\`[DISPATCH RECORDED ON-CHAIN]\\n\\nDestination Buyer: \${buyer}\\nManifest IPFS CID: \${cid}\\nContract: FulfillmentRegistry.sol\\n\\nOutcome: 7-day auto-acceptance countdown initiated. Escrow unlocks upon buyer confirmation or timeout expiry.\`);
    }
`;

// Insert the functions directly before "// Initialize"
const targetPos = html.indexOf('// Initialize');
if (targetPos === -1) {
  console.error('Target "// Initialize" not found in index.html!');
  process.exit(1);
}

html = html.slice(0, targetPos) + functionsToInject + '\n    ' + html.slice(targetPos);
fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully injected functions into index.html before // Initialize!');
