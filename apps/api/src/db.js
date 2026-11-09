/**
 * @file db.js
 * @description Local persistent/in-memory relational store for HIVELOT operational metadata
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'hivelot_store.json');

class Database {
  constructor() {
    this.data = {
      merchants: [],
      campaigns: [],
      commitments: [],
      bids: [],
      clearings: [],
      fulfillments: [],
      disputes: [],
      fees: [],
      metrics: {
        totalFundedVolumeQusdc: 0,
        totalRefundsClaimedQusdc: 0,
        totalSettledOrders: 0,
        uniqueBuyersCount: 0,
        uniqueSuppliersCount: 0,
        lastIndexedBlock: 0
      }
    };
    this.init();
  }

  init() {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
      } catch (err) {
        console.warn('Initializing fresh DB file:', err.message);
      }
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to persist DB file:', err.message);
    }
  }

  // --- Campaign Methods ---
  getCampaigns(filters = {}) {
    let list = this.data.campaigns;
    if (filters.status !== undefined) {
      list = list.filter(c => c.status === filters.status);
    }
    if (filters.category) {
      list = list.filter(c => c.category && c.category.toLowerCase() === filters.category.toLowerCase());
    }
    if (filters.region) {
      list = list.filter(c => c.shippingRegion && c.shippingRegion.toLowerCase() === filters.region.toLowerCase());
    }
    return list;
  }

  getCampaignById(id) {
    return this.data.campaigns.find(c => c.id === id || c.poolId === id) || null;
  }

  saveCampaign(campaign) {
    const idx = this.data.campaigns.findIndex(c => c.id === campaign.id || c.poolId === campaign.poolId);
    if (idx >= 0) {
      this.data.campaigns[idx] = { ...this.data.campaigns[idx], ...campaign };
    } else {
      this.data.campaigns.push(campaign);
    }
    this.save();
    return campaign;
  }

  // --- Merchant Methods ---
  getMerchants() {
    return this.data.merchants;
  }

  getMerchantByWallet(wallet) {
    return this.data.merchants.find(m => m.wallet.toLowerCase() === wallet.toLowerCase()) || null;
  }

  saveMerchant(merchant) {
    const idx = this.data.merchants.findIndex(m => m.wallet.toLowerCase() === merchant.wallet.toLowerCase());
    if (idx >= 0) {
      this.data.merchants[idx] = { ...this.data.merchants[idx], ...merchant };
    } else {
      this.data.merchants.push(merchant);
      this.data.metrics.uniqueSuppliersCount++;
    }
    this.save();
    return merchant;
  }

  // --- Commitment & Order Methods ---
  saveCommitment(commitment) {
    this.data.commitments.push(commitment);
    this.save();
    return commitment;
  }

  getCommitmentsByPool(poolId) {
    return this.data.commitments.filter(c => c.poolId === poolId);
  }

  // --- Supplier Bids ---
  saveBid(bid) {
    this.data.bids.push(bid);
    this.save();
    return bid;
  }

  getBidsByPool(poolId) {
    return this.data.bids.filter(b => b.poolId === poolId);
  }

  // --- Clearing Results ---
  saveClearing(clearing) {
    this.data.clearings.push(clearing);
    this.data.metrics.totalSettledOrders++;
    this.data.metrics.totalFundedVolumeQusdc += Number(clearing.grossOrderValue || 0);
    this.save();
    return clearing;
  }

  getClearingByPool(poolId) {
    return this.data.clearings.find(c => c.poolId === poolId) || null;
  }

  // --- Constellation Graph Data ---
  getConstellationData() {
    const nodes = [];
    const links = [];

    // Pools as core cluster nodes
    this.data.campaigns.forEach(c => {
      nodes.push({
        id: `pool_${c.poolId || c.id}`,
        type: 'campaign',
        label: c.title || c.productDescription || 'Procurement Pool',
        committedUnits: c.committedUnits || 0,
        targetUnits: c.targetQuantity || 10,
        status: c.status || 'FORMING',
        maxPrice: c.maxUnitPrice || 80
      });
    });

    // Buyers
    const buyerMap = new Map();
    this.data.commitments.forEach(comm => {
      const bId = `buyer_${comm.buyer}`;
      if (!buyerMap.has(bId)) {
        buyerMap.set(bId, true);
        nodes.push({
          id: bId,
          type: 'buyer',
          label: comm.buyer.slice(0, 6) + '...' + comm.buyer.slice(-4),
          address: comm.buyer
        });
      }
      links.push({
        source: bId,
        target: `pool_${comm.poolId}`,
        type: 'demand_pledge',
        quantity: comm.quantity || 1
      });
    });

    // Suppliers
    this.data.bids.forEach(bid => {
      const sId = `supplier_${bid.supplier}`;
      if (!nodes.some(n => n.id === sId)) {
        nodes.push({
          id: sId,
          type: 'supplier',
          label: bid.supplierName || bid.supplier.slice(0, 6) + '...',
          address: bid.supplier
        });
      }
      links.push({
        source: sId,
        target: `pool_${bid.poolId}`,
        type: bid.isWinner ? 'winning_clear' : 'bid_offer',
        unitPrice: bid.unitPrice
      });
    });

    return { nodes, links };
  }
}

module.exports = new Database();

