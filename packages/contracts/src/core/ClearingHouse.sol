// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IHivelotTypes.sol";
import "./DemandVault.sol";
import "./SupplierAuction.sol";
import "./SupplierBondVault.sol";
import "./ProtocolTreasury.sol";

/**
 * @title ClearingHouse
 * @notice The deterministic on-chain Demand Clearing Engine.
 * Evaluates revealed supplier quotes against aggregate demand, computes uniform clearing price,
 * allocates excess deposits to buyer refund vaults, and locks fulfillment liabilities.
 */
contract ClearingHouse is Ownable, ReentrancyGuard, IHivelotTypes {
    DemandVault public immutable demandVault;
    SupplierAuction public immutable supplierAuction;
    SupplierBondVault public immutable bondVault;
    ProtocolTreasury public immutable treasury;

    // poolId => ClearingOutcome
    mapping(bytes32 => ClearingOutcome) public clearingOutcomes;
    mapping(bytes32 => bool) public isPoolCleared;
    mapping(address => bool) public authorizedCallers;

    event PoolCleared(
        bytes32 indexed poolId,
        address indexed winningSupplier,
        uint256 clearingPrice,
        uint256 totalAcceptedQuantity,
        uint256 grossOrderValue,
        uint256 platformFeeAmount,
        uint256 netSupplierEntitlement,
        uint256 totalRefundsAllocated,
        uint256 clearedAt
    );
    event AuthorizedCallerUpdated(address indexed caller, bool authorized);

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender] && msg.sender != owner()) revert UnauthorizedCaller();
        _;
    }

    constructor(
        address _demandVault,
        address _supplierAuction,
        address _bondVault,
        address _treasury
    ) Ownable(msg.sender) {
        if (
            _demandVault == address(0) ||
            _supplierAuction == address(0) ||
            _bondVault == address(0) ||
            _treasury == address(0)
        ) revert ZeroAddress();

        demandVault = DemandVault(_demandVault);
        supplierAuction = SupplierAuction(_supplierAuction);
        bondVault = SupplierBondVault(_bondVault);
        treasury = ProtocolTreasury(_treasury);
    }

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    struct BestSupplierResult {
        address winningSupplier;
        uint256 lowestPrice;
    }

    function _findWinningSupplier(
        bytes32 poolId,
        uint256 totalDemand,
        PoolTerms calldata terms
    ) internal view returns (BestSupplierResult memory res) {
        RevealedBid[] memory revealedBids = supplierAuction.getRevealedBids(poolId);
        res.lowestPrice = type(uint256).max;
        uint256 winningCommitmentTime = type(uint256).max;

        for (uint256 i = 0; i < revealedBids.length; i++) {
            RevealedBid memory bid = revealedBids[i];
            if (!bid.valid || bid.capacity < totalDemand || bid.unitPrice > terms.maxUnitPrice) {
                continue;
            }
            if (bid.termsHash != terms.deliveryTermsHash) {
                continue;
            }
            if (bid.deliveryDeadline > terms.fulfillmentDeadline) {
                continue;
            }

            BidCommitment memory comm = supplierAuction.getBidCommitment(poolId, bid.supplier);

            if (bid.unitPrice < res.lowestPrice) {
                res.lowestPrice = bid.unitPrice;
                res.winningSupplier = bid.supplier;
                winningCommitmentTime = comm.commitmentTimestamp;
            } else if (bid.unitPrice == res.lowestPrice) {
                // Deterministic tie-breaker: Earliest commitment timestamp
                if (comm.commitmentTimestamp < winningCommitmentTime) {
                    res.winningSupplier = bid.supplier;
                    winningCommitmentTime = comm.commitmentTimestamp;
                } else if (comm.commitmentTimestamp == winningCommitmentTime) {
                    // Secondary tie-breaker: Lowest address value
                    if (uint160(bid.supplier) < uint160(res.winningSupplier)) {
                        res.winningSupplier = bid.supplier;
                    }
                }
            }
        }
    }

    /**
     * @notice Deterministically clears the procurement pool and establishes uniform clearing price P
     */
    function clearPool(
        bytes32 poolId,
        PoolTerms calldata terms
    ) external onlyAuthorized nonReentrant returns (ClearingOutcome memory outcome) {
        if (isPoolCleared[poolId]) revert AlreadyCleared();

        uint256 totalDemand = demandVault.totalCommittedUnits(poolId);
        if (totalDemand < terms.minOrderQuantity) {
            revert MinimumDemandNotMet(totalDemand, terms.minOrderQuantity);
        }

        BestSupplierResult memory best = _findWinningSupplier(poolId, totalDemand, terms);
        if (best.winningSupplier == address(0)) revert NoQualifyingSuppliers();

        uint256 gross = totalDemand * best.lowestPrice;
        uint256 fee = (gross * terms.platformFeeBps) / 10000;
        uint256 net = gross - fee;
        uint256 refunds = totalDemand * (terms.maxUnitPrice - best.lowestPrice);

        outcome = ClearingOutcome({
            winningSupplier: best.winningSupplier,
            clearingPrice: best.lowestPrice,
            totalAcceptedQuantity: totalDemand,
            grossOrderValue: gross,
            platformFeeAmount: fee,
            netSupplierEntitlement: net,
            totalRefundsAllocated: refunds,
            clearedAt: block.timestamp,
            settled: true
        });

        clearingOutcomes[poolId] = outcome;
        isPoolCleared[poolId] = true;

        // Apply price adjustments in demand vault
        demandVault.applyClearingPrice(poolId, best.lowestPrice, terms.maxUnitPrice);

        // Record platform fee in treasury
        if (fee > 0) {
            treasury.recordFee(poolId, terms.settlementToken, fee);
        }

        // Release bonds of non-winning revealed suppliers
        _releaseNonWinningBonds(poolId, best.winningSupplier);

        emit PoolCleared(
            poolId,
            best.winningSupplier,
            best.lowestPrice,
            totalDemand,
            gross,
            fee,
            net,
            refunds,
            block.timestamp
        );
    }

    function _releaseNonWinningBonds(bytes32 poolId, address winner) internal {
        address[] memory committedSuppliers = supplierAuction.getCommittedSuppliers(poolId);
        for (uint256 j = 0; j < committedSuppliers.length; j++) {
            address s = committedSuppliers[j];
            if (s != winner && supplierAuction.hasRevealed(poolId, s)) {
                if (bondVault.getBond(poolId, s) > 0) {
                    bondVault.releaseBond(poolId, s, s);
                }
            }
        }
    }

    function getClearingOutcome(bytes32 poolId) external view returns (ClearingOutcome memory) {
        return clearingOutcomes[poolId];
    }
}
