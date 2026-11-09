/**
 * @file types.ts
 * @description Canonical domain models and contract types for the HIVELOT Demand Clearing Network
 */

export enum PoolStatus {
  FORMING = 0,     // Buyers committing funds & aggregating demand
  BIDDING = 1,     // Demand locked, suppliers submit sealed bids + bonds
  REVEALING = 2,   // Suppliers reveal prices & capacity
  CLEARED = 3,     // Deterministic uniform clearing price established
  FULFILLING = 4,  // Orders dispatched, awaiting buyer delivery confirmation
  COMPLETED = 5,   // All orders fulfilled & settled
  CANCELLED = 6,   // Pool cancelled (e.g., MOQ unmet or no qualifying suppliers)
  DISPUTED = 7     // Order in active arbitration
}

export enum FulfillmentStatus {
  PENDING = 0,
  DISPATCHED = 1,
  DELIVERED = 2,
  DISPUTED = 3,
  RESOLVED = 4,
  REFUNDED = 5
}

export enum DisputeDecisionType {
  BUYER_REFUND = 0,
  SUPPLIER_PAYOUT = 1,
  SPLIT_SETTLEMENT = 2
}

export interface PoolTerms {
  creator: string;
  settlementToken: string;
  canonicalSkuHash: string;
  productDescription: string;
  targetQuantity: bigint;
  minOrderQuantity: bigint;
  maxUnitPrice: bigint;
  purchasingDeadline: bigint;
  supplierCommitDeadline: bigint;
  supplierRevealDeadline: bigint;
  fulfillmentDeadline: bigint;
  shippingRegion: string;
  deliveryTermsHash: string;
  disputeTermsHash: string;
  supplierBondAmount: bigint;
  platformFeeBps: bigint;
  arbitrator: string;
}

export interface BuyerCommitment {
  quantity: bigint;
  depositAmount: bigint;
  refundAmount: bigint;
  finalLiability: bigint;
  refundWithdrawn: boolean;
  fulfillmentStatus: FulfillmentStatus;
  dispatchEvidenceHash: string;
  dispatchedAt: bigint;
  deliveryAccepted: boolean;
}

export interface BidCommitment {
  supplier: string;
  commitmentHash: string;
  commitmentTimestamp: bigint;
  commitmentBlockNumber: bigint;
  bondAmount: bigint;
  revealed: boolean;
}

export interface RevealedBid {
  supplier: string;
  unitPrice: bigint;
  capacity: bigint;
  deliveryDeadline: bigint;
  termsHash: string;
  bidNonce: bigint;
  valid: boolean;
}

export interface ClearingOutcome {
  winningSupplier: string;
  clearingPrice: bigint;
  totalAcceptedQuantity: bigint;
  grossOrderValue: bigint;
  platformFeeAmount: bigint;
  netSupplierEntitlement: bigint;
  totalRefundsAllocated: bigint;
  clearedAt: bigint;
  settled: boolean;
}

export interface MerchantProfile {
  wallet: string;
  legalName: string;
  businessJurisdiction: string;
  contactEndpoint: string;
  verificationTier: number;
  isSuspended: boolean;
  registeredAt: bigint;
  totalFulfilledOrders: bigint;
  totalDisputedOrders: bigint;
}

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  fallbackRpcUrl?: string;
  explorerUrl: string;
  qusdcAddress: string;
  qusdcDecimals: number;
}

export const QIE_MAINNET: NetworkConfig = {
  chainId: 1990,
  name: 'QIE Mainnet',
  rpcUrl: 'https://rpc1mainnet.qie.digital/',
  fallbackRpcUrl: 'https://rpc2mainnet.qie.digital/',
  explorerUrl: 'https://mainnet.qie.digital/',
  qusdcAddress: '0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5',
  qusdcDecimals: 6
};

export const QIE_TESTNET: NetworkConfig = {
  chainId: 1983,
  name: 'QIE Testnet',
  rpcUrl: 'https://rpc1testnet.qie.digital/',
  explorerUrl: 'https://testnet.qie.digital/',
  qusdcAddress: '0x0000000000000000000000000000000000000000',
  qusdcDecimals: 6
};

export const LOCAL_ANVIL: NetworkConfig = {
  chainId: 31337,
  name: 'Local Anvil',
  rpcUrl: 'http://127.0.0.1:8545',
  explorerUrl: 'http://localhost:8545',
  qusdcAddress: '0x0000000000000000000000000000000000000000',
  qusdcDecimals: 6
};

