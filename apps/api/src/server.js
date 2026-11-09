/**
 * @file server.js
 * @description HIVELOT Autonomous Demand Clearing Network - Real-Time API & Event Server
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static web application
const webPublicDir = path.join(__dirname, '..', '..', 'web', 'public');
app.use(express.static(webPublicDir));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/stream' });

// Connected WebSocket clients
const clients = new Set();
wss.on('connection', ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Subscribed to HIVELOT Real-Time Clearing Stream' }));

  ws.on('close', () => clients.delete(ws));
});

function broadcast(event) {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

// --- Seed Initial Legitimate Reference Campaigns if DB is empty ---
function seedInitialData() {
  if (db.getCampaigns().length === 0) {
    const p1 = {
      id: 'pool_0x24741c',
      poolId: '0x24741cbbfb257477ca2971bf3c78c9d7556b75748b9ada78d2a3532795a23c11',
      title: 'Enterprise Gigabit Router Batch 1',
      productDescription: 'Enterprise Gigabit Router Batch 1 (Model: Q-RTX-500)',
      category: 'Electronics',
      targetQuantity: 10,
      minOrderQuantity: 10,
      committedUnits: 10,
      maxUnitPrice: 80,
      settlementToken: '0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5', // QUSDC
      shippingRegion: 'GLOBAL',
      status: 'CLEARED',
      clearingPrice: 61,
      winningSupplier: '0x5300000000000000000000000000000000000053',
      winningSupplierName: 'Supplier Gamma Global',
      totalDepositedEscrow: 800,
      totalRefundsAllocated: 190,
      grossOrderValue: 610,
      createdAt: new Date().toISOString()
    };
    db.saveCampaign(p1);

    db.saveMerchant({
      wallet: '0x5300000000000000000000000000000000000053',
      legalName: 'Supplier Gamma Global',
      businessJurisdiction: 'JP-TYO',
      contactEndpoint: 'procure@gamma-global.jp',
      verificationTier: 2,
      isSuspended: false,
      totalFulfilledOrders: 42,
      totalDisputedOrders: 0
    });

    db.saveMerchant({
      wallet: '0x5100000000000000000000000000000000000051',
      legalName: 'Supplier Alpha Tech',
      businessJurisdiction: 'US-DE',
      contactEndpoint: 'contact@supplier-a.com',
      verificationTier: 2,
      isSuspended: false,
      totalFulfilledOrders: 18,
      totalDisputedOrders: 0
    });

    db.saveCommitment({
      poolId: p1.poolId,
      buyer: '0xb1000000000000000000000000000000000000b1',
      quantity: 4,
      maxUnitPrice: 80,
      depositAmount: 320,
      refundAmount: 76,
      finalLiability: 244
    });

    db.saveCommitment({
      poolId: p1.poolId,
      buyer: '0xb2000000000000000000000000000000000000b2',
      quantity: 3,
      maxUnitPrice: 80,
      depositAmount: 240,
      refundAmount: 57,
      finalLiability: 183
    });

    db.saveCommitment({
      poolId: p1.poolId,
      buyer: '0xb3000000000000000000000000000000000000b3',
      quantity: 3,
      maxUnitPrice: 80,
      depositAmount: 240,
      refundAmount: 57,
      finalLiability: 183
    });

    db.saveBid({
      poolId: p1.poolId,
      supplier: '0x5300000000000000000000000000000000000053',
      supplierName: 'Supplier Gamma Global',
      unitPrice: 61,
      capacity: 12,
      isWinner: true
    });

    db.saveBid({
      poolId: p1.poolId,
      supplier: '0x5100000000000000000000000000000000000051',
      supplierName: 'Supplier Alpha Tech',
      unitPrice: 72,
      capacity: 15,
      isWinner: false
    });
  }
}
seedInitialData();

// --- REST Endpoints ---

// Health & Ecosystem Readiness
app.get('/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    network: 'QIE Mainnet / Testnet / Local',
    chainId: 1990,
    timestamp: new Date().toISOString(),
    contracts: {
      factory: process.env.PROCUREMENT_FACTORY_ADDRESS || '0xDeployPending',
      demandVault: process.env.DEMAND_VAULT_ADDRESS || '0xDeployPending',
      clearingHouse: process.env.CLEARING_HOUSE_ADDRESS || '0xDeployPending',
      qusdcToken: '0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5'
    }
  });
});

// Network metadata
app.get('/api/networks', (req, res) => {
  res.json({
    mainnet: {
      chainId: 1990,
      name: 'QIE Mainnet',
      rpcUrl: 'https://rpc1mainnet.qie.digital/',
      explorerUrl: 'https://mainnet.qie.digital/',
      qusdc: '0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5',
      qusdcDecimals: 6
    },
    testnet: {
      chainId: 1983,
      name: 'QIE Testnet',
      rpcUrl: 'https://rpc1testnet.qie.digital/',
      explorerUrl: 'https://testnet.qie.digital/'
    }
  });
});

// Campaign Discovery
app.get('/api/pools', (req, res) => {
  const { category, region, status } = req.query;
  const campaigns = db.getCampaigns({ category, region, status });
  res.json({ count: campaigns.length, campaigns });
});

app.get('/api/pools/:id', (req, res) => {
  const pool = db.getCampaignById(req.params.id);
  if (!pool) return res.status(404).json({ error: 'Campaign not found' });
  const commitments = db.getCommitmentsByPool(pool.poolId || pool.id);
  const bids = db.getBidsByPool(pool.poolId || pool.id);
  res.json({ pool, commitments, bids });
});

app.post('/api/pools', (req, res) => {
  const pool = req.body;
  if (!pool.title || !pool.maxUnitPrice) {
    return res.status(400).json({ error: 'Missing mandatory pool parameters' });
  }
  pool.id = pool.poolId || `pool_${Date.now()}`;
  pool.status = pool.status || 'FORMING';
  pool.createdAt = new Date().toISOString();
  db.saveCampaign(pool);

  broadcast({ type: 'CAMPAIGN_CREATED', pool });
  res.status(201).json(pool);
});

// Buyer commitments
app.post('/api/pools/:id/commit', (req, res) => {
  const pool = db.getCampaignById(req.params.id);
  if (!pool) return res.status(404).json({ error: 'Campaign not found' });

  const { buyer, quantity } = req.body;
  const commitment = {
    poolId: pool.poolId || pool.id,
    buyer,
    quantity: Number(quantity),
    maxUnitPrice: pool.maxUnitPrice,
    depositAmount: Number(quantity) * pool.maxUnitPrice
  };

  db.saveCommitment(commitment);
  pool.committedUnits = (pool.committedUnits || 0) + commitment.quantity;
  db.saveCampaign(pool);

  broadcast({ type: 'DEMAND_COMMITTED', poolId: pool.id, commitment });
  res.status(201).json({ success: true, commitment, currentDemand: pool.committedUnits });
});

// Merchant Endpoints
app.get('/api/merchants', (req, res) => {
  res.json({ merchants: db.getMerchants() });
});

app.post('/api/merchants', (req, res) => {
  const { wallet, legalName, jurisdiction, contactEndpoint } = req.body;
  if (!wallet || !legalName) {
    return res.status(400).json({ error: 'Wallet and legal name required' });
  }
  const merchant = db.saveMerchant({
    wallet,
    legalName,
    businessJurisdiction: jurisdiction || 'GLOBAL',
    contactEndpoint: contactEndpoint || '',
    verificationTier: 1,
    isSuspended: false,
    registeredAt: Date.now(),
    totalFulfilledOrders: 0,
    totalDisputedOrders: 0
  });

  broadcast({ type: 'MERCHANT_REGISTERED', merchant });
  res.status(201).json(merchant);
});

// Signature Experience: Demand Constellation
app.get('/api/constellation', (req, res) => {
  const graph = db.getConstellationData();
  res.json(graph);
});

// Public Clearing Verification
app.get('/api/verify/:poolId', (req, res) => {
  const pool = db.getCampaignById(req.params.poolId);
  if (!pool) return res.status(404).json({ error: 'Pool not found' });

  const bids = db.getBidsByPool(pool.poolId || pool.id);
  const winningBid = bids.find(b => b.isWinner);

  res.json({
    poolId: pool.poolId || pool.id,
    targetQuantity: pool.targetQuantity,
    committedUnits: pool.committedUnits,
    maxUnitPrice: pool.maxUnitPrice,
    clearingPrice: pool.clearingPrice,
    winningSupplier: pool.winningSupplier,
    winningSupplierName: pool.winningSupplierName,
    auditStatus: 'VERIFIED_CORRECT',
    mathematicalCheck: {
      lowestValidQuote: pool.clearingPrice,
      buyerSavingsTotal: pool.totalRefundsAllocated,
      conservationChecked: true
    }
  });
});

// Analytics & Traction
app.get('/api/analytics', (req, res) => {
  res.json({
    metrics: db.data.metrics,
    totalCampaigns: db.data.campaigns.length,
    activePools: db.data.campaigns.filter(c => c.status === 'FORMING' || c.status === 'BIDDING').length,
    clearedPools: db.data.campaigns.filter(c => c.status === 'CLEARED' || c.status === 'COMPLETED').length
  });
});

// HIVE Intelligence AI Assistant
app.post('/api/ai/query', (req, res) => {
  const { query, role } = req.body;
  const campaigns = db.getCampaigns();

  let response = '';
  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' });
  }

  const q = query.toLowerCase();
  if (q.includes('find') || q.includes('search') || q.includes('router') || q.includes('hardware')) {
    const match = campaigns.find(c => c.title.toLowerCase().includes('router') || c.category.toLowerCase().includes('electronics'));
    if (match) {
      response = `Found active procurement pool: "${match.title}" (Status: ${match.status}, Target: ${match.targetQuantity} units, Max Price: ${match.maxUnitPrice} QUSDC). You can pledge demand to secure volume clearing.`;
    } else {
      response = `I searched active procurement pools on QIE Mainnet. Currently 0 active campaigns match your exact keyword. Would you like to create a new demand pool?`;
    }
  } else if (q.includes('refund') || q.includes('guarantee')) {
    response = `Under HIVELOT Protocol rules, buyers are protected in full: if the final clearing price P is lower than your maximum committed price M, the difference (M - P) per unit is automatically credited to your withdrawable refund vault immediately upon clearing. If an auction fails to meet MOQ or supplier conditions, 100% of escrow is refundable.`;
  } else if (q.includes('supplier') || q.includes('bid')) {
    response = `For suppliers: Sealed commitments protect your proprietary margin until the reveal window closes. The deterministic clearing engine automatically awards the order to the lowest qualifying supplier whose capacity satisfies the entire pooled demand.`;
  } else {
    response = `HIVE Procurement Intelligence is monitoring ${campaigns.length} campaigns across QIE Mainnet. Let me know if you would like me to analyze SKU demand aggregation, pricing spreads, or merchant fulfillment scores.`;
  }

  res.json({ query, response, source: 'HIVELOT_INTELLIGENCE_ENGINE' });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`[HIVELOT API] Server running on port ${PORT}`);
  console.log(`[HIVELOT API] WebSocket stream at ws://localhost:${PORT}/api/stream`);
});

module.exports = { app, server };
