// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IHivelotTypes.sol";
import "./DemandVault.sol";
import "./ClearingHouse.sol";
import "./SupplierBondVault.sol";

/**
 * @title DisputeResolver
 * @notice Resolves fulfillment disputes between buyers and suppliers.
 * Authorized arbitrator renders binding outcomes (Refund, Payout, or Split) with evidence hashing.
 */
contract DisputeResolver is Ownable, ReentrancyGuard, IHivelotTypes {
    using SafeERC20 for IERC20;

    DemandVault public immutable demandVault;
    ClearingHouse public immutable clearingHouse;
    SupplierBondVault public immutable bondVault;

    struct DisputeRecord {
        address initiator;
        bytes32 evidenceHash;
        uint256 openedAt;
        bool isResolved;
        DisputeDecisionType decision;
        bytes32 verdictHash;
        uint256 resolvedAt;
    }

    // poolId => buyer => DisputeRecord
    mapping(bytes32 => mapping(address => DisputeRecord)) public disputes;
    // poolId => arbitrator
    mapping(bytes32 => address) public poolArbitrators;
    mapping(address => bool) public authorizedCallers;

    event DisputeOpened(
        bytes32 indexed poolId,
        address indexed buyer,
        address indexed initiator,
        bytes32 evidenceHash,
        uint256 timestamp
    );
    event DisputeResolved(
        bytes32 indexed poolId,
        address indexed buyer,
        address indexed arbitrator,
        DisputeDecisionType decision,
        uint256 buyerPayout,
        uint256 supplierPayout,
        bytes32 verdictHash,
        uint256 timestamp
    );
    event AuthorizedCallerUpdated(address indexed caller, bool authorized);

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender] && msg.sender != owner()) revert UnauthorizedCaller();
        _;
    }

    constructor(
        address _demandVault,
        address _clearingHouse,
        address _bondVault
    ) Ownable(msg.sender) {
        if (
            _demandVault == address(0) ||
            _clearingHouse == address(0) ||
            _bondVault == address(0)
        ) revert ZeroAddress();

        demandVault = DemandVault(_demandVault);
        clearingHouse = ClearingHouse(_clearingHouse);
        bondVault = SupplierBondVault(_bondVault);
    }

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    function registerPoolArbitrator(bytes32 poolId, address arbitrator) external onlyAuthorized {
        if (arbitrator == address(0)) revert ZeroAddress();
        poolArbitrators[poolId] = arbitrator;
    }

    /**
     * @notice Buyer or supplier initiates a formal fulfillment dispute
     */
    function openDispute(
        bytes32 poolId,
        address buyer,
        bytes32 evidenceHash
    ) external nonReentrant {
        ClearingOutcome memory outcome = clearingHouse.getClearingOutcome(poolId);
        if (msg.sender != buyer && msg.sender != outcome.winningSupplier) revert UnauthorizedCaller();
        if (evidenceHash == bytes32(0)) revert InvalidParameters();

        DisputeRecord storage record = disputes[poolId][buyer];
        if (record.openedAt > 0 && !record.isResolved) revert DisputeAlreadyActive();

        record.initiator = msg.sender;
        record.evidenceHash = evidenceHash;
        record.openedAt = block.timestamp;
        record.isResolved = false;

        emit DisputeOpened(poolId, buyer, msg.sender, evidenceHash, block.timestamp);
    }

    /**
     * @notice Authorized arbitrator executes binding settlement
     */
    function resolveDispute(
        bytes32 poolId,
        address buyer,
        DisputeDecisionType decision,
        uint256 buyerBps,
        uint256 supplierBps,
        bytes32 verdictHash
    ) external nonReentrant {
        address authorizedArbitrator = poolArbitrators[poolId];
        if (authorizedArbitrator == address(0)) authorizedArbitrator = owner();
        if (msg.sender != authorizedArbitrator) revert UnauthorizedCaller();

        DisputeRecord storage record = disputes[poolId][buyer];
        if (record.openedAt == 0 || record.isResolved) revert DisputeNotActive();

        ClearingOutcome memory outcome = clearingHouse.getClearingOutcome(poolId);
        address supplier = outcome.winningSupplier;
        BuyerCommitment memory comm = demandVault.getBuyerCommitment(poolId, buyer);
        uint256 totalLiability = comm.finalLiability;

        if (totalLiability == 0) revert NothingToWithdraw();

        uint256 buyerPayout = 0;
        uint256 supplierPayout = 0;

        if (decision == DisputeDecisionType.BUYER_REFUND) {
            buyerPayout = totalLiability;
        } else if (decision == DisputeDecisionType.SUPPLIER_PAYOUT) {
            supplierPayout = totalLiability;
        } else if (decision == DisputeDecisionType.SPLIT_SETTLEMENT) {
            if (buyerBps + supplierBps != 10000) revert InvalidSplitTotal();
            buyerPayout = (totalLiability * buyerBps) / 10000;
            supplierPayout = totalLiability - buyerPayout;
        }

        record.isResolved = true;
        record.decision = decision;
        record.verdictHash = verdictHash;
        record.resolvedAt = block.timestamp;

        // Execute disbursements via DemandVault
        if (buyerPayout > 0) {
            demandVault.refundBuyerOrderEscrow(poolId, buyer, buyer);
        }
        if (supplierPayout > 0) {
            demandVault.releaseBuyerOrderEscrow(poolId, buyer, supplier);
        }

        emit DisputeResolved(
            poolId,
            buyer,
            msg.sender,
            decision,
            buyerPayout,
            supplierPayout,
            verdictHash,
            block.timestamp
        );
    }

    function getDispute(bytes32 poolId, address buyer) external view returns (DisputeRecord memory) {
        return disputes[poolId][buyer];
    }
}
