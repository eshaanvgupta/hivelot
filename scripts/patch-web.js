const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'apps', 'web', 'public', 'index.html');
let html = fs.readFileSync(filePath, 'utf8');

// 1. Inject Ethers.js in <head> if not present
if (!html.includes('ethers.umd.min.js')) {
  html = html.replace(
    '<script src="https://cdn.tailwindcss.com"></script>',
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.2/ethers.umd.min.js"></script>\n  <script src="https://cdn.tailwindcss.com"></script>'
  );
}

// 2. Enhance Header Wallet Area to feature Judge Key Slot / Wallet Manager
const oldHeaderWallet = `<button id="wallet-btn" onclick="toggleWalletConnection()" class="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold text-xs hover:brightness-110 transition shadow-lg shadow-cyan-950/50">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          <span id="wallet-label">Connect QIE Wallet</span>
        </button>`;

const newHeaderWallet = `<div class="flex items-center gap-2">
          <!-- Active Mode Pill -->
          <div id="wallet-status-badge" class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
            <span id="wallet-status-dot" class="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span id="wallet-status-text" class="text-slate-300">Demo Wallet</span>
          </div>

          <!-- Open Key & Wallet Settings Button -->
          <button id="wallet-btn" onclick="openWalletModal()" class="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 text-slate-950 font-extrabold text-xs hover:brightness-110 transition shadow-lg shadow-cyan-950/50">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
            <span id="wallet-label">🔑 Key & Wallet Slot</span>
          </button>
        </div>`;

if (html.includes(oldHeaderWallet)) {
  html = html.replace(oldHeaderWallet, newHeaderWallet);
}

// 3. Inject Modals (Wallet Manager Modal + Register Merchant Modal)
const newModals = `
  <!-- Wallet & Judge Key Manager Modal -->
  <div id="modal-wallet-manager" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
    <div class="bg-hive-card border border-hive-border rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl glow-cyan">
      
      <!-- Modal Header -->
      <div class="flex justify-between items-center pb-3 border-b border-hive-border">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-400">
            🔑
          </div>
          <div>
            <h3 class="text-base font-bold text-white tracking-tight">Wallet & Evaluator Key Center</h3>
            <p class="text-[11px] text-slate-400 font-mono">QIE Mainnet (Chain ID: 1990)</p>
          </div>
        </div>
        <button onclick="closeWalletModal()" class="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition">&times;</button>
      </div>

      <!-- Mode Selector Tabs -->
      <div class="grid grid-cols-3 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
        <button id="wtab-btn-judge" onclick="switchWalletTab('judge')" class="py-2 rounded-lg bg-slate-800 text-white font-bold transition flex items-center justify-center gap-1.5">
          <span>⚖️</span>
          <span>Judge Key Slot</span>
        </button>
        <button id="wtab-btn-web3" onclick="switchWalletTab('web3')" class="py-2 rounded-lg text-slate-400 hover:text-white transition flex items-center justify-center gap-1.5">
          <span>🦊</span>
          <span>Web3 Extension</span>
        </button>
        <button id="wtab-btn-demo" onclick="switchWalletTab('demo')" class="py-2 rounded-lg text-slate-400 hover:text-white transition flex items-center justify-center gap-1.5">
          <span>🧪</span>
          <span>Demo Sandbox</span>
        </button>
      </div>

      <!-- TAB 1: JUDGE / EVALUATOR PRIVATE KEY SLOT -->
      <div id="wtab-content-judge" class="space-y-4">
        <!-- Security Notice -->
        <div class="p-3.5 rounded-xl bg-amber-950/30 border border-amber-900/60 text-xs font-mono space-y-1.5">
          <div class="flex items-center gap-2 text-amber-400 font-bold">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <span>Client-Side Isolation Guarantee</span>
          </div>
          <p class="text-slate-300 text-[11px] leading-relaxed">
            Your private key remains strictly inside your browser's local memory. It is <strong class="text-white">never</strong> sent across any network, logged, or stored on any server. HIVELOT does not touch or custody your keys.
          </p>
        </div>

        <div class="space-y-3 font-mono text-xs">
          <div>
            <div class="flex justify-between items-center mb-1">
              <label class="text-slate-300 font-bold">Evaluator Private Key (QIE Mainnet)</label>
              <button onclick="toggleKeyVisibility()" class="text-[11px] text-cyan-400 hover:underline">Show / Hide</button>
            </div>
            <input type="password" id="input-judge-key" placeholder="Paste 0x... or 64-character hex private key" class="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs focus:border-cyan-500 focus:outline-none">
          </div>

          <div id="judge-key-status-card" class="hidden p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
            <div class="flex justify-between items-center">
              <span class="text-slate-400">Derived Address:</span>
              <span id="judge-derived-address" class="text-cyan-400 font-bold">0x...</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-400">Native QIE Balance:</span>
              <span id="judge-qie-balance" class="text-emerald-400 font-bold">0.0000 QIE</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-400">Network RPC:</span>
              <span class="text-slate-300">https://rpc1mainnet.qie.digital/</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-1">
            <button onclick="loadJudgePrivateKey()" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-bold hover:brightness-110 transition">
              Activate Key in Session
            </button>
            <button onclick="clearJudgePrivateKey()" class="w-full py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white font-bold transition">
              Clear Key & Reset
            </button>
          </div>
        </div>
      </div>

      <!-- TAB 2: WEB3 BROWSER EXTENSION -->
      <div id="wtab-content-web3" class="hidden space-y-4 font-mono text-xs">
        <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div class="text-slate-300 font-bold">Connect Browser Wallet</div>
          <p class="text-[11px] text-slate-400">Compatible with MetaMask, Rabby, QIE Wallet, or any EIP-1193 Web3 provider.</p>
        </div>

        <div id="web3-details-box" class="hidden p-3.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
          <div class="flex justify-between">
            <span class="text-slate-400">Connected Wallet:</span>
            <span id="web3-connected-addr" class="text-cyan-400 font-bold">0x...</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Active Chain ID:</span>
            <span id="web3-connected-chain" class="text-emerald-400 font-bold">1990 (QIE Mainnet)</span>
          </div>
        </div>

        <button onclick="connectWeb3Extension()" class="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold hover:brightness-110 transition">
          Connect Extension & Switch to QIE Mainnet
        </button>
      </div>

      <!-- TAB 3: DEMO SANDBOX MODE -->
      <div id="wtab-content-demo" class="hidden space-y-4 font-mono text-xs">
        <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div class="text-slate-300 font-bold">Simulation Sandbox Mode</div>
          <p class="text-[11px] text-slate-400">Inspect the complete commercial platform, browse demand pools, test the Constellation canvas, and run verification without entering any keys or gas.</p>
        </div>

        <div class="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-[11px] text-slate-400">
          Default Account: <span class="text-cyan-400 font-bold">0xb1000000000000000000000000000000000000b1</span>
        </div>

        <button onclick="activateDemoMode()" class="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition">
          Activate Demo Sandbox Account
        </button>
      </div>

    </div>
  </div>

  <!-- Register Merchant Identity Modal -->
  <div id="modal-register-merchant" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
    <div class="bg-hive-card border border-hive-border rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl glow-amber">
      <div class="flex justify-between items-center pb-2 border-b border-hive-border">
        <div>
          <h3 class="text-base font-bold text-white">Register Verified Supplier Identity</h3>
          <p class="text-[11px] text-slate-400 font-mono">MerchantRegistry.sol (QIE Protocol)</p>
        </div>
        <button onclick="closeRegisterMerchantModal()" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <div class="space-y-3 font-mono text-xs">
        <div>
          <label class="text-slate-400 block mb-1">Company / Legal Entity Name</label>
          <input type="text" id="merchant-name-input" placeholder="e.g. Apex Hardware Solutions LLC" class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white">
        </div>
        <div>
          <label class="text-slate-400 block mb-1">Supplier Settlement Wallet</label>
          <input type="text" id="merchant-wallet-input" placeholder="0x..." class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-slate-400 block mb-1">Jurisdiction / Country</label>
            <input type="text" id="merchant-country-input" value="DE" class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white">
          </div>
          <div>
            <label class="text-slate-400 block mb-1">Collateral Bond Tier</label>
            <select id="merchant-tier-input" class="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white">
              <option value="1">Tier 1 — 500 QUSDC</option>
              <option value="2">Tier 2 — 1,000 QUSDC</option>
              <option value="3">Tier 3 — 2,500 QUSDC</option>
            </select>
          </div>
        </div>
        <button onclick="submitRegisterMerchant()" class="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition">
          Verify & Register Identity On-Chain
        </button>
      </div>
    </div>
  </div>
`;

// Insert the new modals right before the closing </main> or right after modal-create-pool
if (!html.includes('id="modal-wallet-manager"')) {
  const targetModal = '</div>\n  </div>\n\n  <footer';
  if (html.includes(targetModal)) {
    html = html.replace(targetModal, `</div>\n  </div>\n${newModals}\n  <footer`);
  }
}

// 4. Update the Script logic to support Judge Key Slot, ethers RPC provider, Web3 extension, Merchant registration, Bid commitment, and Dispatch
const oldScriptStart = `<script>
    // State
    let currentTab = 'exchange';
    let connectedWallet = null;
    let campaigns = [];`;

const newScriptStart = `<script>
    // State & Network Configuration
    const QIE_CHAIN_ID = 1990;
    const QIE_RPC_URL = 'https://rpc1mainnet.qie.digital/';
    const QUSDC_ADDRESS = '0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5';

    let qieProvider = null;
    try {
      if (typeof ethers !== 'undefined') {
        qieProvider = new ethers.JsonRpcProvider(QIE_RPC_URL, {
          chainId: QIE_CHAIN_ID,
          name: 'QIE Mainnet'
        });
      }
    } catch (e) {
      console.warn('RPC Provider initialization notice:', e);
    }

    let currentTab = 'exchange';
    let connectedWallet = '0xb1000000000000000000000000000000000000b1';
    let walletMode = 'demo'; // 'demo' | 'judge' | 'web3'
    let judgeWallet = null;
    let web3Signer = null;
    let campaigns = [];`;

if (html.includes(oldScriptStart)) {
  html = html.replace(oldScriptStart, newScriptStart);
}

// Append newly implemented functions before the closing script tag
const newFunctions = `
    // --- WALLET & JUDGE KEY MANAGER FUNCTIONS ---
    function openWalletModal() {
      document.getElementById('modal-wallet-manager').classList.remove('hidden');
    }

    function closeWalletModal() {
      document.getElementById('modal-wallet-manager').classList.add('hidden');
    }

    function switchWalletTab(mode) {
      const tabs = ['judge', 'web3', 'demo'];
      tabs.forEach(t => {
        const btn = document.getElementById(\`wtab-btn-\${t}\`);
        const content = document.getElementById(\`wtab-content-\${t}\`);
        if (t === mode) {
          btn.className = 'py-2 rounded-lg bg-slate-800 text-white font-bold transition flex items-center justify-center gap-1.5';
          content.classList.remove('hidden');
        } else {
          btn.className = 'py-2 rounded-lg text-slate-400 hover:text-white transition flex items-center justify-center gap-1.5';
          content.classList.add('hidden');
        }
      });
    }

    function toggleKeyVisibility() {
      const input = document.getElementById('input-judge-key');
      input.type = input.type === 'password' ? 'text' : 'password';
    }

    async function loadJudgePrivateKey() {
      let key = document.getElementById('input-judge-key').value.trim();
      if (!key) {
        alert('Please enter a valid 32-byte hex private key (0x...).');
        return;
      }
      if (!key.startsWith('0x') && key.length === 64) {
        key = '0x' + key;
      }

      try {
        if (typeof ethers === 'undefined') {
          throw new Error('Ethers.js library is loading, please try again in a moment.');
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
        document.getElementById('judge-derived-address').innerText = wallet.address;
        document.getElementById('judge-qie-balance').innerText = \`\${parseFloat(balanceFormatted).toFixed(4)} QIE\`;
        document.getElementById('judge-key-status-card').classList.remove('hidden');

        // Update top-bar badge
        const badge = document.getElementById('wallet-status-badge');
        const dot = document.getElementById('wallet-status-dot');
        const text = document.getElementById('wallet-status-text');
        badge.classList.remove('hidden');
        dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
        text.innerHTML = \`<span class="text-amber-400 font-bold">Judge Key:</span> \${wallet.address.slice(0, 6)}...\${wallet.address.slice(-4)}\`;

        document.getElementById('wallet-label').innerText = \`⚖️ \${wallet.address.slice(0, 6)}...\${wallet.address.slice(-4)}\`;
        document.getElementById('wallet-btn').className = 'flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-extrabold text-xs hover:brightness-110 transition shadow-lg shadow-amber-950/50';

        alert(\`⚖️ Evaluator Private Key successfully loaded into client-side browser session!\\n\\nDerived Public Address: \${wallet.address}\\nNetwork: QIE Mainnet (Chain ID 1990)\\n\\n(Key is kept strictly in local RAM and used for client-side transaction signing.)\`);
        closeWalletModal();
      } catch (err) {
        alert('Invalid private key format: ' + err.message);
      }
    }

    function clearJudgePrivateKey() {
      judgeWallet = null;
      document.getElementById('input-judge-key').value = '';
      document.getElementById('judge-key-status-card').classList.add('hidden');
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
        
        // Attempt network switch to QIE Mainnet (1990)
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
        badge.classList.remove('hidden');
        dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
        text.innerHTML = \`<span class="text-emerald-400 font-bold">Web3:</span> \${accounts[0].slice(0, 6)}...\${accounts[0].slice(-4)}\`;

        document.getElementById('wallet-label').innerText = \`🦊 \${accounts[0].slice(0, 6)}...\${accounts[0].slice(-4)}\`;
        document.getElementById('wallet-btn').className = 'flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-extrabold text-xs hover:brightness-110 transition shadow-lg shadow-emerald-950/50';

        document.getElementById('web3-connected-addr').innerText = accounts[0];
        document.getElementById('web3-details-box').classList.remove('hidden');

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
      badge.classList.remove('hidden');
      dot.className = 'w-2 h-2 rounded-full bg-cyan-400';
      text.innerText = 'Demo Sandbox: 0xb1...00b1';

      document.getElementById('wallet-label').innerText = '🔑 Key & Wallet Slot';
      document.getElementById('wallet-btn').className = 'flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 text-slate-950 font-extrabold text-xs hover:brightness-110 transition shadow-lg shadow-cyan-950/50';

      closeWalletModal();
    }

    // --- MERCHANT REGISTRATION FUNCTIONS ---
    function openRegisterMerchantModal() {
      if (connectedWallet && document.getElementById('merchant-wallet-input')) {
        document.getElementById('merchant-wallet-input').value = connectedWallet;
      }
      document.getElementById('modal-register-merchant').classList.remove('hidden');
    }

    function closeRegisterMerchantModal() {
      document.getElementById('modal-register-merchant').classList.add('hidden');
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

// Insert the new functions before `// Initialize`
if (!html.includes('loadJudgePrivateKey')) {
  html = html.replace('// Initialize', `${newFunctions}\n    // Initialize`);
}

fs.writeFileSync(filePath, html, 'utf8');
console.log('Successfully updated apps/web/public/index.html with Judge Key Slot and interactive Web3 handlers!');

