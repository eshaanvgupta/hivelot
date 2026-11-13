/* GitHub Pages serves the interface without the Express API or settlement worker. */
(() => {
  if (!window.HIVELOT_PAGES_PREVIEW && !window.location.hostname.endsWith('.github.io')) return;

  const unavailable = () => window.alert(
    'This GitHub Pages site is a read-only product preview. This action requires the HIVELOT backend and deployed contracts. No transaction has been submitted and no funds have moved.'
  );

  // Override before DOMContentLoaded so the static host never requests /api routes.
  window.fetchCampaigns = async () => {
    const grid = document.getElementById('campaign-grid');
    if (grid) {
      grid.innerHTML = '<div class="col-span-3 glass-card rounded-2xl p-6 text-slate-300 text-sm">'
        + '<strong class="text-cyan-400">Explore the HIVELOT interface</strong>'
        + '<p class="mt-2">Live procurement pools require the separately hosted API. The buyer, supplier, clearing, and constellation tabs show the existing example scenario.</p>'
        + '<a class="inline-block mt-3 text-teal-400 underline" href="https://github.com/eshaanvgupta/hivelot">View source and local setup instructions</a></div>';
    }
    const tbody = document.getElementById('buyer-commitments-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-slate-400">No live wallet commitments are loaded in this static preview.</td></tr>';
  };

  [
    'submitNewPool', 'pledgeDemand', 'submitRegisterMerchant',
    'handleCommitBid', 'handleRecordDispatch', 'loadJudgePrivateKey',
    'sendAiQuery'
  ].forEach(name => { window[name] = unavailable; });

  window.triggerBrowserAudit = () => {
    document.getElementById('audit-result-box').textContent =
      'Live verification is unavailable in this static preview. Run the repository verification tools with a configured backend. No blockchain audit has been performed by this page.';
  };

  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('aside');
    banner.id = 'pages-preview-notice';
    banner.setAttribute('role', 'status');
    banner.className = 'border-b border-amber-800 bg-amber-950 px-4 py-3 text-center text-sm text-amber-200';
    banner.textContent = 'GitHub Pages · Read-only product preview. Figures, suppliers, and visualizations are examples, not verified live activity. Payments, registration, AI, and settlement require a backend and deployed contracts.';
    document.querySelector('header').after(banner);

    // A public preview does not need visitors to import private keys.
    const keyTab = document.getElementById('wtab-btn-judge');
    if (keyTab) keyTab.hidden = true;
    const keyPanel = document.getElementById('wtab-content-judge');
    if (keyPanel) keyPanel.hidden = true;
    window.switchWalletTab('web3');
    const label = document.getElementById('wallet-label');
    if (label) label.textContent = 'Connect Wallet';

    // Keep every main view reachable on narrow screens.
    const nav = document.querySelector('header nav');
    if (nav) {
      const mobileNav = nav.cloneNode(true);
      mobileNav.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
      mobileNav.removeAttribute('id');
      mobileNav.className = 'flex md:hidden gap-2 overflow-x-auto px-4 py-3 text-xs border-b border-slate-800';
      banner.after(mobileNav);
    }
  });
})();
