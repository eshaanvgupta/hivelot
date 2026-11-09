// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IHivelotTypes.sol";
import "./DemandVault.sol";
import "./SupplierAuction.sol";
import "./ClearingHouse.sol";
import "./FulfillmentRegistry.sol";
import "./DisputeResolver.sol";
import "./SupplierBondVault.sol";
import "./ProtocolTreasury.sol";
import "./MerchantRegistry.sol";

/**
 * @title ProcurementFactory
 * @notice Top-level orchestration factory and lifecycle manager for HIVELOT procurement pools.
 * Manages deterministic pool deployment, token whitelists, immutable terms, and phase transitions.
 */
contract ProcurementFactory is Ownable, ReentrancyGuard, IHivelotTypes {
    using SafeERC20 for IERC20;

    DemandVault public immutable demandVault;
    SupplierAuction public immutable supplierAuction;
    ClearingHouse public immutable clearingHouse;
    FulfillmentRegistry public immutable fulfillmentRegistry;
    DisputeResolver public immutable disputeResolver;
    SupplierBondVault public immutable bondVault;
    ProtocolTreasury public immutable treasury;
    MerchantRegistry public immutable merchantRegistry;

    // Token whitelist for verified settlement assets (e.g. QUSDC)
    mapping(address => bool) public isWhitelistedToken;
    // poolId => PoolTerms
    mapping(bytes32 => PoolTerms) public poolTerms;
    // poolId => PoolStatus
    mapping(bytes32 => PoolStatus) public poolStatuses;
    // poolId list
    bytes32[] private _allPoolIds;
    uint256 public poolNonce;

    event PoolCreated(
        bytes32 indexed poolId,
        address indexed creator,
        address indexed settlementToken,
        bytes32 canonicalSkuHash,
        uint256 targetQuantity,
        uint256 minOrderQuantity,
        uint256 maxUnitPrice,
        uint256 purchasingDeadline,
        uint256 commitDeadline,
        uint256 revealDeadline,
        uint256 fulfillmentDeadline
    );
    event PoolStatusChanged(bytes32 indexed poolId, PoolStatus previousStatus, PoolStatus newStatus);
    event TokenWhitelistUpdated(address indexed token, bool whitelisted);

    constructor(
        address _demandVault,
        address _supplierAuction,
        address _clearingHouse,
        address _fulfillmentRegistry,
        address _disputeResolver,
        address _bondVault,
        address _treasury,
        address _merchantRegistry
    ) Ownable(msg.sender) {
        if (
            _demandVault == address(0) ||
            _supplierAuction == address(0) ||
            _clearingHouse == address(0) ||
            _fulfillmentRegistry == address(0) ||
            _disputeResolver == address(0) ||
            _bondVault == address(0) ||
            _treasury == address(0) ||
            _merchantRegistry == address(0)
        ) revert ZeroAddress();

        demandVault = DemandVault(_demandVault);
        supplierAuction = SupplierAuction(_supplierAuction);
        clearingHouse = ClearingHouse(_clearingHouse);
        fulfillmentRegistry = FulfillmentRegistry(_fulfillmentRegistry);
        disputeResolver = DisputeResolver(_disputeResolver);
        bondVault = SupplierBondVault(_bondVault);
        treasury = ProtocolTreasury(_treasury);
        merchantRegistry = MerchantRegistry(_merchantRegistry);
    }

    function setTokenWhitelist(address token, bool whitelisted) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        isWhitelistedToken[token] = whitelisted;
        emit TokenWhitelistUpdated(token, whitelisted);
    }

    /**
     * @notice Creates a new procurement pool with strict immutable parameters
     */
    function createPool(PoolTerms calldata terms) external returns (bytes32 poolId) {
        if (!isWhitelistedToken[terms.settlementToken]) revert InvalidParameters();
        if (terms.minOrderQuantity == 0 || terms.targetQuantity < terms.minOrderQuantity) revert InvalidParameters();
        if (terms.maxUnitPrice == 0) revert ZeroAmount();
        if (terms.purchasingDeadline <= block.timestamp) revert DeadlinePassed();
        if (terms.supplierCommitDeadline <= terms.purchasingDeadline) revert InvalidParameters();
        if (terms.supplierRevealDeadline <= terms.supplierCommitDeadline) revert InvalidParameters();
        if (terms.fulfillmentDeadline <= terms.supplierRevealDeadline) revert InvalidParameters();

        poolNonce++;
        poolId = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                msg.sender,
                terms.canonicalSkuHash,
                poolNonce,
                block.timestamp
            )
        );

        PoolTerms memory storedTerms = terms;
        storedTerms.creator = msg.sender;
        poolTerms[poolId] = storedTerms;
        poolStatuses[poolId] = PoolStatus.FORMING;
        _allPoolIds.push(poolId);

        // Register pool arbitrator in dispute resolver
        if (terms.arbitrator != address(0)) {
            disputeResolver.registerPoolArbitrator(poolId, terms.arbitrator);
        }

        emit PoolCreated(
            poolId,
            msg.sender,
            terms.settlementToken,
            terms.canonicalSkuHash,
            terms.targetQuantity,
            terms.minOrderQuantity,
            terms.maxUnitPrice,
            terms.purchasingDeadline,
            terms.supplierCommitDeadline,
            terms.supplierRevealDeadline,
            terms.fulfillmentDeadline
        );
    }

    /**
     * @notice Buyer joins pool by committing desired unit quantity and depositing escrow
     */
    function joinPool(bytes32 poolId, uint256 quantity) external nonReentrant {
        PoolTerms memory terms = poolTerms[poolId];
        if (terms.settlementToken == address(0)) revert CommitmentNotFound();
        if (poolStatuses[poolId] != PoolStatus.FORMING) revert InvalidState(PoolStatus.FORMING, poolStatuses[poolId]);
        if (block.timestamp > terms.purchasingDeadline) revert DeadlinePassed();

        uint256 currentDemand = demandVault.totalCommittedUnits(poolId);
        if (currentDemand + quantity > terms.targetQuantity) {
            revert MaximumQuantityExceeded(quantity, terms.targetQuantity - currentDemand);
        }

        // Pull tokens from buyer into DemandVault
        IERC20(terms.settlementToken).safeTransferFrom(msg.sender, address(this), quantity * terms.maxUnitPrice);
        IERC20(terms.settlementToken).approve(address(demandVault), quantity * terms.maxUnitPrice);
        demandVault.recordDeposit(poolId, msg.sender, terms.settlementToken, quantity, terms.maxUnitPrice);
    }

    /**
     * @notice Buyer cancels commitment if pool is still in FORMING stage
     */
    function cancelCommitment(bytes32 poolId) external nonReentrant {
        PoolStatus status = poolStatuses[poolId];
        if (status != PoolStatus.FORMING && status != PoolStatus.CANCELLED) {
            revert InvalidState(PoolStatus.FORMING, status);
        }
        demandVault.processCancellation(poolId, msg.sender);
    }

    /**
     * @notice Transition pool from FORMING to BIDDING once purchasing deadline passes or target quantity is met
     */
    function transitionToBidding(bytes32 poolId) external {
        if (poolStatuses[poolId] != PoolStatus.FORMING) revert InvalidState(PoolStatus.FORMING, poolStatuses[poolId]);
        PoolTerms memory terms = poolTerms[poolId];

        uint256 currentDemand = demandVault.totalCommittedUnits(poolId);
        if (currentDemand < terms.minOrderQuantity && block.timestamp <= terms.purchasingDeadline) {
            revert MinimumDemandNotMet(currentDemand, terms.minOrderQuantity);
        }

        // If deadline passed and MOQ not met, pool is cancelled
        if (currentDemand < terms.minOrderQuantity && block.timestamp > terms.purchasingDeadline) {
            poolStatuses[poolId] = PoolStatus.CANCELLED;
            emit PoolStatusChanged(poolId, PoolStatus.FORMING, PoolStatus.CANCELLED);
            return;
        }

        poolStatuses[poolId] = PoolStatus.BIDDING;
        emit PoolStatusChanged(poolId, PoolStatus.FORMING, PoolStatus.BIDDING);
    }

    /**
     * @notice Transition pool from BIDDING to REVEALING once supplier commit deadline passes
     */
    function transitionToRevealing(bytes32 poolId) external {
        if (poolStatuses[poolId] != PoolStatus.BIDDING) revert InvalidState(PoolStatus.BIDDING, poolStatuses[poolId]);
        PoolTerms memory terms = poolTerms[poolId];
        if (block.timestamp <= terms.supplierCommitDeadline) revert DeadlineNotPassed();

        poolStatuses[poolId] = PoolStatus.REVEALING;
        emit PoolStatusChanged(poolId, PoolStatus.BIDDING, PoolStatus.REVEALING);
    }

    /**
     * @notice Triggers clearing engine after reveal deadline passes
     */
    function executeClearing(bytes32 poolId) external nonReentrant returns (ClearingOutcome memory outcome) {
        if (poolStatuses[poolId] != PoolStatus.REVEALING) revert InvalidState(PoolStatus.REVEALING, poolStatuses[poolId]);
        PoolTerms memory terms = poolTerms[poolId];
        if (block.timestamp <= terms.supplierRevealDeadline) revert DeadlineNotPassed();

        outcome = clearingHouse.clearPool(poolId, terms);
        poolStatuses[poolId] = PoolStatus.CLEARED;

        emit PoolStatusChanged(poolId, PoolStatus.REVEALING, PoolStatus.CLEARED);
    }

    /**
     * @notice Marks pool as CANCELLED if no valid suppliers revealed or other failure conditions
     */
    function cancelPoolIfNoSuppliers(bytes32 poolId) external {
        if (poolStatuses[poolId] != PoolStatus.REVEALING) revert InvalidState(PoolStatus.REVEALING, poolStatuses[poolId]);
        PoolTerms memory terms = poolTerms[poolId];
        if (block.timestamp <= terms.supplierRevealDeadline) revert DeadlineNotPassed();

        RevealedBid[] memory revealed = supplierAuction.getRevealedBids(poolId);
        uint256 validCount = 0;
        uint256 demand = demandVault.totalCommittedUnits(poolId);

        for (uint256 i = 0; i < revealed.length; i++) {
            if (revealed[i].valid && revealed[i].capacity >= demand && revealed[i].unitPrice <= terms.maxUnitPrice) {
                validCount++;
            }
        }

        if (validCount == 0) {
            poolStatuses[poolId] = PoolStatus.CANCELLED;
            emit PoolStatusChanged(poolId, PoolStatus.REVEALING, PoolStatus.CANCELLED);
        }
    }

    // --- View Functions ---
    function getPoolTerms(bytes32 poolId) external view returns (PoolTerms memory) {
        return poolTerms[poolId];
    }

    function getPoolStatus(bytes32 poolId) external view returns (PoolStatus) {
        return poolStatuses[poolId];
    }

    function getAllPoolIds() external view returns (bytes32[] memory) {
        return _allPoolIds;
    }

    function totalPools() external view returns (uint256) {
        return _allPoolIds.length;
    }
}

