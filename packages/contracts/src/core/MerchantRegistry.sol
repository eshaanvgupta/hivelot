// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IHivelotTypes.sol";

/**
 * @title MerchantRegistry
 * @notice Manages verified merchant profiles, qualification credentials, and reputation metrics on QIE.
 */
contract MerchantRegistry is Ownable, IHivelotTypes {
    mapping(address => MerchantProfile) private _merchants;
    mapping(address => bool) private _isRegistered;
    mapping(address => bool) public authorizedCallers;
    address[] private _merchantList;

    event MerchantRegistered(
        address indexed wallet,
        string legalName,
        string jurisdiction,
        string contactEndpoint,
        uint8 tier,
        uint256 timestamp
    );
    event MerchantTierUpdated(address indexed wallet, uint8 oldTier, uint8 newTier);
    event MerchantSuspended(address indexed wallet, bool suspended, string reason);
    event MerchantStatsUpdated(address indexed wallet, uint256 fulfilledCount, uint256 disputedCount);
    event AuthorizedCallerUpdated(address indexed caller, bool authorized);

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender] && msg.sender != owner()) revert UnauthorizedCaller();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    function registerMerchant(
        string calldata legalName,
        string calldata jurisdiction,
        string calldata contactEndpoint
    ) external {
        if (_isRegistered[msg.sender]) revert AlreadyCommitted();
        if (bytes(legalName).length == 0) revert InvalidParameters();

        _merchants[msg.sender] = MerchantProfile({
            wallet: msg.sender,
            legalName: legalName,
            businessJurisdiction: jurisdiction,
            contactEndpoint: contactEndpoint,
            verificationTier: 1, // Tier 1: Registered self-attested
            isSuspended: false,
            registeredAt: block.timestamp,
            totalFulfilledOrders: 0,
            totalDisputedOrders: 0
        });

        _isRegistered[msg.sender] = true;
        _merchantList.push(msg.sender);

        emit MerchantRegistered(msg.sender, legalName, jurisdiction, contactEndpoint, 1, block.timestamp);
    }

    function setMerchantTier(address wallet, uint8 newTier) external onlyOwner {
        if (!_isRegistered[wallet]) revert CommitmentNotFound();
        uint8 oldTier = _merchants[wallet].verificationTier;
        _merchants[wallet].verificationTier = newTier;
        emit MerchantTierUpdated(wallet, oldTier, newTier);
    }

    function setMerchantSuspended(address wallet, bool suspended, string calldata reason) external onlyOwner {
        if (!_isRegistered[wallet]) revert CommitmentNotFound();
        _merchants[wallet].isSuspended = suspended;
        emit MerchantSuspended(wallet, suspended, reason);
    }

    function recordFulfillmentOutcome(address supplier, bool successful) external onlyAuthorized {
        if (!_isRegistered[supplier]) return;
        if (successful) {
            _merchants[supplier].totalFulfilledOrders += 1;
        } else {
            _merchants[supplier].totalDisputedOrders += 1;
        }
        emit MerchantStatsUpdated(
            supplier,
            _merchants[supplier].totalFulfilledOrders,
            _merchants[supplier].totalDisputedOrders
        );
    }

    function getMerchant(address wallet) external view returns (MerchantProfile memory) {
        if (!_isRegistered[wallet]) revert CommitmentNotFound();
        return _merchants[wallet];
    }

    function isQualifiedMerchant(address wallet) external view returns (bool) {
        if (!_isRegistered[wallet]) return false;
        return !_merchants[wallet].isSuspended;
    }

    function totalMerchants() external view returns (uint256) {
        return _merchantList.length;
    }

    function getMerchantList() external view returns (address[] memory) {
        return _merchantList;
    }
}
