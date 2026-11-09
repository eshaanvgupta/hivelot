// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IHivelotTypes.sol";
import "./SupplierBondVault.sol";

/**
 * @title SupplierAuction
 * @notice Executes the cryptographically sealed commit-reveal supplier auction.
 * Enforces domain separation, deterministic tie-breakers, bond requirements, and quote validity.
 */
contract SupplierAuction is Ownable, ReentrancyGuard, IHivelotTypes {
    using SafeERC20 for IERC20;

    SupplierBondVault public immutable bondVault;

    // poolId => supplier => BidCommitment
    mapping(bytes32 => mapping(address => BidCommitment)) public commitments;
    // poolId => list of suppliers who committed
    mapping(bytes32 => address[]) private _committedSuppliers;
    // poolId => list of revealed bids
    mapping(bytes32 => RevealedBid[]) private _revealedBids;
    // poolId => supplier => has revealed
    mapping(bytes32 => mapping(address => bool)) public hasRevealed;

    mapping(address => bool) public authorizedCallers;

    event BidCommitted(
        bytes32 indexed poolId,
        address indexed supplier,
        bytes32 commitmentHash,
        uint256 bondAmount,
        uint256 timestamp
    );
    event BidRevealed(
        bytes32 indexed poolId,
        address indexed supplier,
        uint256 unitPrice,
        uint256 capacity,
        uint256 deliveryDeadline,
        bool valid
    );
    event AuthorizedCallerUpdated(address indexed caller, bool authorized);

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender] && msg.sender != owner()) revert UnauthorizedCaller();
        _;
    }

    constructor(address _bondVault) Ownable(msg.sender) {
        if (_bondVault == address(0)) revert ZeroAddress();
        bondVault = SupplierBondVault(_bondVault);
    }

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    /**
     * @notice Computes domain-separated commitment hash
     */
    function computeCommitmentHash(
        bytes32 poolId,
        address supplier,
        uint256 unitPrice,
        uint256 capacity,
        uint256 deliveryDeadline,
        bytes32 termsHash,
        uint256 bidNonce,
        bytes32 salt
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid,
                address(this),
                poolId,
                supplier,
                unitPrice,
                capacity,
                deliveryDeadline,
                termsHash,
                bidNonce,
                salt
            )
        );
    }

    /**
     * @notice Supplier submits sealed commitment hash and transfers bond into bondVault
     */
    function commitBid(
        bytes32 poolId,
        bytes32 commitmentHash,
        address token,
        uint256 requiredBondAmount
    ) external nonReentrant {
        if (commitmentHash == bytes32(0)) revert InvalidParameters();
        if (commitments[poolId][msg.sender].commitmentHash != bytes32(0)) revert AlreadyCommitted();

        if (requiredBondAmount > 0) {
            IERC20(token).safeTransferFrom(msg.sender, address(this), requiredBondAmount);
            IERC20(token).approve(address(bondVault), requiredBondAmount);
            bondVault.lockBond(poolId, msg.sender, token, requiredBondAmount);
        }

        commitments[poolId][msg.sender] = BidCommitment({
            supplier: msg.sender,
            commitmentHash: commitmentHash,
            commitmentTimestamp: block.timestamp,
            commitmentBlockNumber: block.number,
            bondAmount: requiredBondAmount,
            revealed: false
        });

        _committedSuppliers[poolId].push(msg.sender);

        emit BidCommitted(poolId, msg.sender, commitmentHash, requiredBondAmount, block.timestamp);
    }

    /**
     * @notice Supplier reveals their sealed offer during the reveal window
     */
    function revealBid(
        bytes32 poolId,
        uint256 unitPrice,
        uint256 capacity,
        uint256 deliveryDeadline,
        bytes32 termsHash,
        uint256 bidNonce,
        bytes32 salt
    ) external nonReentrant {
        BidCommitment storage commitment = commitments[poolId][msg.sender];
        if (commitment.commitmentHash == bytes32(0)) revert CommitmentNotFound();
        if (commitment.revealed) revert AlreadyRevealed();

        bytes32 expectedHash = computeCommitmentHash(
            poolId,
            msg.sender,
            unitPrice,
            capacity,
            deliveryDeadline,
            termsHash,
            bidNonce,
            salt
        );

        if (expectedHash != commitment.commitmentHash) revert CommitmentMismatch();

        commitment.revealed = true;
        hasRevealed[poolId][msg.sender] = true;

        RevealedBid memory revealed = RevealedBid({
            supplier: msg.sender,
            unitPrice: unitPrice,
            capacity: capacity,
            deliveryDeadline: deliveryDeadline,
            termsHash: termsHash,
            bidNonce: bidNonce,
            valid: true
        });

        _revealedBids[poolId].push(revealed);

        emit BidRevealed(poolId, msg.sender, unitPrice, capacity, deliveryDeadline, true);
    }

    // --- View Functions ---
    function getRevealedBids(bytes32 poolId) external view returns (RevealedBid[] memory) {
        return _revealedBids[poolId];
    }

    function getCommittedSuppliers(bytes32 poolId) external view returns (address[] memory) {
        return _committedSuppliers[poolId];
    }

    function getBidCommitment(bytes32 poolId, address supplier) external view returns (BidCommitment memory) {
        return commitments[poolId][supplier];
    }
}
