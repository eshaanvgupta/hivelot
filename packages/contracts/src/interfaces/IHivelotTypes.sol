// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IHivelotTypes
 * @notice Canonical types, enums, structs, and custom errors for the HIVELOT Demand Clearing Network
 */
interface IHivelotTypes {
    enum PoolStatus {
        FORMING,     // Buyers are committing funds and aggregating demand
        BIDDING,     // Demand locked, suppliers submit sealed commitments + bonds
        REVEALING,   // Suppliers reveal unit prices, capacities, and nonces
        CLEARED,     // ClearingHouse evaluated bids, uniform price P determined
        FULFILLING,  // Orders assigned to winning supplier, dispatch in progress
        COMPLETED,   // All orders confirmed / settled
        CANCELLED,   // Pool cancelled (e.g. MOQ not met or no valid supplier)
        DISPUTED     // Active dispute under review by arbitrator
    }

    enum FulfillmentStatus {
        PENDING,     // Awaiting dispatch from winning supplier
        DISPATCHED,  // Supplier has submitted dispatch evidence
        DELIVERED,   // Buyer confirmed delivery and accepted
        DISPUTED,    // Disputed by buyer or supplier
        RESOLVED,    // Dispute resolved by arbitrator
        REFUNDED     // Escrow refunded to buyer due to supplier default
    }

    enum DisputeDecisionType {
        BUYER_REFUND,    // 100% of disputed escrow returned to buyer
        SUPPLIER_PAYOUT, // 100% of disputed escrow paid to supplier
        SPLIT_SETTLEMENT // Escrow split between buyer and supplier per decision basis points
    }

    struct PoolTerms {
        address creator;
        address settlementToken;     // Verified ERC-20 (e.g. QUSDC, 6 decimals)
        bytes32 canonicalSkuHash;    // Keccak256 hash of standardized product specification
        string productDescription;   // Human-readable product name and SKU summary
        uint256 targetQuantity;      // Target aggregated units
        uint256 minOrderQuantity;    // Minimum order quantity (MOQ) required to clear
        uint256 maxUnitPrice;        // Maximum unit price willing to pay (in token units)
        uint256 purchasingDeadline;  // Timestamp after which no new buyers can join
        uint256 supplierCommitDeadline; // Timestamp after which no bids can be committed
        uint256 supplierRevealDeadline; // Timestamp after which no bids can be revealed
        uint256 fulfillmentDeadline; // Timestamp by which supplier must dispatch order
        string shippingRegion;       // Standard ISO region / country code
        bytes32 deliveryTermsHash;   // Keccak256 hash of delivery obligations
        bytes32 disputeTermsHash;    // Keccak256 hash of dispute policy
        uint256 supplierBondAmount;  // Performance bond required per supplier bid
        uint256 platformFeeBps;      // Protocol fee in basis points (e.g. 75 = 0.75%)
        address arbitrator;          // Authorized dispute arbitrator
    }

    struct BuyerCommitment {
        uint256 quantity;            // Number of units committed by buyer
        uint256 depositAmount;       // Escrow deposited: quantity * maxUnitPrice
        uint256 refundAmount;        // Price adjustment refund: quantity * (maxUnitPrice - clearingPrice)
        uint256 finalLiability;      // Net purchase cost: quantity * clearingPrice
        bool refundWithdrawn;        // Whether price adjustment refund has been withdrawn
        FulfillmentStatus fulfillmentStatus; // Individual order fulfillment status
        bytes32 dispatchEvidenceHash;// Supplier dispatch evidence commitment
        uint256 dispatchedAt;        // Timestamp of dispatch
        bool deliveryAccepted;       // Buyer accepted delivery
    }

    struct BidCommitment {
        address supplier;
        bytes32 commitmentHash;      // keccak256(abi.encode(chainid, auction, poolId, supplier, price, capacity, deadline, terms, nonce, salt))
        uint256 commitmentTimestamp; // Block timestamp of commitment (used for deterministic tie-breaker)
        uint256 commitmentBlockNumber;
        uint256 bondAmount;          // Escrowed performance bond
        bool revealed;
    }

    struct RevealedBid {
        address supplier;
        uint256 unitPrice;           // Price offered per unit
        uint256 capacity;            // Deliverable units
        uint256 deliveryDeadline;    // Guaranteed delivery timestamp
        bytes32 termsHash;           // Must match pool's deliveryTermsHash
        uint256 bidNonce;
        bool valid;                  // Whether bid satisfies all pool terms
    }

    struct ClearingOutcome {
        address winningSupplier;
        uint256 clearingPrice;       // Uniform clearing price P per unit
        uint256 totalAcceptedQuantity; // Total units cleared (Q)
        uint256 grossOrderValue;     // Q * P
        uint256 platformFeeAmount;   // Protocol fee deducted
        uint256 netSupplierEntitlement; // grossOrderValue - platformFeeAmount
        uint256 totalRefundsAllocated; // Q * (maxUnitPrice - P)
        uint256 clearedAt;           // Timestamp of clearing
        bool settled;
    }

    struct MerchantProfile {
        address wallet;
        string legalName;
        string businessJurisdiction;
        string contactEndpoint;
        uint8 verificationTier;      // 0 = unverified, 1 = basic, 2 = verified, 3 = enterprise
        bool isSuspended;
        uint256 registeredAt;
        uint256 totalFulfilledOrders;
        uint256 totalDisputedOrders;
    }

    // --- Custom Errors ---
    error ZeroAddress();
    error ZeroAmount();
    error InvalidParameters();
    error InvalidState(PoolStatus expected, PoolStatus actual);
    error DeadlinePassed();
    error DeadlineNotPassed();
    error InsufficientDeposit();
    error TokenTransferFailed();
    error MinimumDemandNotMet(uint256 current, uint256 minimum);
    error MaximumQuantityExceeded(uint256 requested, uint256 available);
    error UnauthorizedCaller();
    error AlreadyCommitted();
    error CommitmentNotFound();
    error CommitmentMismatch();
    error AlreadyRevealed();
    error BondRequired();
    error InsufficientBond();
    error IneligibleBid();
    error PriceExceedsMaximum(uint256 bidPrice, uint256 maxPrice);
    error InsufficientCapacity(uint256 bidCapacity, uint256 requiredQuantity);
    error TermsHashMismatch();
    error AlreadyCleared();
    error NoQualifyingSuppliers();
    error NothingToWithdraw();
    error RefundAlreadyWithdrawn();
    error OrderNotFulfilled();
    error AlreadyDelivered();
    error DisputeAlreadyActive();
    error DisputeNotActive();
    error InvalidArbitratorSignature();
    error InvalidSplitTotal();
}

