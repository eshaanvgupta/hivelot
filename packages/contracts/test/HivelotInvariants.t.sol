// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/mocks/MockQUSDC.sol";
import "../src/core/MerchantRegistry.sol";
import "../src/core/ProtocolTreasury.sol";
import "../src/core/SupplierBondVault.sol";
import "../src/core/DemandVault.sol";
import "../src/core/SupplierAuction.sol";
import "../src/core/ClearingHouse.sol";
import "../src/core/FulfillmentRegistry.sol";
import "../src/core/DisputeResolver.sol";
import "../src/core/ProcurementFactory.sol";
import "../src/interfaces/IHivelotTypes.sol";

contract HivelotInvariantsTest is Test, IHivelotTypes {
    MockQUSDC public token;
    MerchantRegistry public merchantRegistry;
    ProtocolTreasury public treasury;
    SupplierBondVault public bondVault;
    DemandVault public demandVault;
    SupplierAuction public supplierAuction;
    ClearingHouse public clearingHouse;
    FulfillmentRegistry public fulfillmentRegistry;
    DisputeResolver public disputeResolver;
    ProcurementFactory public factory;

    address public admin = address(0xAD);
    address public buyer1 = address(0x101);
    address public buyer2 = address(0x102);
    address public supplierA = address(0x201);
    address public supplierB = address(0x202);
    address public arbitrator = address(0x301);

    bytes32 public canonicalSku = keccak256("SKU-HARDWARE-INVARIANT-TEST");
    bytes32 public termsHash = keccak256("TERMS-FOB-INSURED");
    bytes32 public disputeHash = keccak256("DISPUTE-STANDARD");

    uint256 public constant MAX_PRICE = 100 * 10 ** 6; // 100 QUSDC
    uint256 public constant BOND = 20 * 10 ** 6;      // 20 QUSDC

    function setUp() public {
        vm.startPrank(admin);
        token = new MockQUSDC();
        merchantRegistry = new MerchantRegistry();
        treasury = new ProtocolTreasury();
        bondVault = new SupplierBondVault();
        demandVault = new DemandVault();
        supplierAuction = new SupplierAuction(address(bondVault));
        clearingHouse = new ClearingHouse(
            address(demandVault),
            address(supplierAuction),
            address(bondVault),
            address(treasury)
        );
        fulfillmentRegistry = new FulfillmentRegistry(
            address(demandVault),
            address(clearingHouse),
            address(bondVault),
            address(merchantRegistry)
        );
        disputeResolver = new DisputeResolver(
            address(demandVault),
            address(clearingHouse),
            address(bondVault)
        );
        factory = new ProcurementFactory(
            address(demandVault),
            address(supplierAuction),
            address(clearingHouse),
            address(fulfillmentRegistry),
            address(disputeResolver),
            address(bondVault),
            address(treasury),
            address(merchantRegistry)
        );

        demandVault.setAuthorizedCaller(address(factory), true);
        demandVault.setAuthorizedCaller(address(clearingHouse), true);
        demandVault.setAuthorizedCaller(address(fulfillmentRegistry), true);
        demandVault.setAuthorizedCaller(address(disputeResolver), true);

        bondVault.setAuthorizedCaller(address(supplierAuction), true);
        bondVault.setAuthorizedCaller(address(clearingHouse), true);
        bondVault.setAuthorizedCaller(address(fulfillmentRegistry), true);
        bondVault.setAuthorizedCaller(address(disputeResolver), true);

        disputeResolver.setAuthorizedCaller(address(factory), true);
        merchantRegistry.setAuthorizedCaller(address(fulfillmentRegistry), true);
        treasury.setAuthorizedCaller(address(clearingHouse), true);
        clearingHouse.setAuthorizedCaller(address(factory), true);

        factory.setTokenWhitelist(address(token), true);
        vm.stopPrank();

        token.faucet(buyer1, 5000 * 10 ** 6);
        token.faucet(buyer2, 5000 * 10 ** 6);
        token.faucet(supplierA, 2000 * 10 ** 6);
        token.faucet(supplierB, 2000 * 10 ** 6);
    }

    function _createAndFundPool() internal returns (bytes32 pId, PoolTerms memory terms) {
        uint256 nowTs = block.timestamp;
        terms = PoolTerms({
            creator: buyer1,
            settlementToken: address(token),
            canonicalSkuHash: canonicalSku,
            productDescription: "Invariant Test Product",
            targetQuantity: 10,
            minOrderQuantity: 5,
            maxUnitPrice: MAX_PRICE,
            purchasingDeadline: nowTs + 1 days,
            supplierCommitDeadline: nowTs + 2 days,
            supplierRevealDeadline: nowTs + 3 days,
            fulfillmentDeadline: nowTs + 10 days,
            shippingRegion: "GLOBAL",
            deliveryTermsHash: termsHash,
            disputeTermsHash: disputeHash,
            supplierBondAmount: BOND,
            platformFeeBps: 75,
            arbitrator: arbitrator
        });

        vm.prank(buyer1);
        pId = factory.createPool(terms);

        vm.startPrank(buyer1);
        token.approve(address(factory), 5 * MAX_PRICE);
        factory.joinPool(pId, 5);
        vm.stopPrank();

        vm.startPrank(buyer2);
        token.approve(address(factory), 5 * MAX_PRICE);
        factory.joinPool(pId, 5);
        vm.stopPrank();
    }

    // Invariant 1 & 4: Exact Token Conservation & Balances Never Exceed Deposited
    function testInvariant_TokenConservationAndSolvency() public {
        (bytes32 pId, PoolTerms memory terms) = _createAndFundPool();
        uint256 deliveryDeadline = terms.fulfillmentDeadline - 1;

        uint256 totalEscrow = demandVault.totalDepositedEscrow(pId);
        assertEq(totalEscrow, 10 * MAX_PRICE);
        assertEq(token.balanceOf(address(demandVault)), totalEscrow);

        vm.warp(terms.purchasingDeadline + 1);
        factory.transitionToBidding(pId);

        bytes32 saltA = keccak256("SALTA");
        bytes32 commA = supplierAuction.computeCommitmentHash(
            pId, supplierA, 80 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA
        );
        vm.startPrank(supplierA);
        token.approve(address(supplierAuction), BOND);
        supplierAuction.commitBid(pId, commA, address(token), BOND);
        vm.stopPrank();

        vm.warp(terms.supplierCommitDeadline + 1);
        factory.transitionToRevealing(pId);

        vm.prank(supplierA);
        supplierAuction.revealBid(pId, 80 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA);

        vm.warp(terms.supplierRevealDeadline + 1);
        factory.executeClearing(pId);

        uint256 refunds = demandVault.totalAllocatedRefunds(pId);
        uint256 remainingEscrow = demandVault.totalFulfillmentEscrow(pId);
        assertEq(totalEscrow, refunds + remainingEscrow);
    }

    // Invariant 2: A buyer cannot withdraw the same refund twice
    function testInvariant_NoDoubleRefundWithdrawal() public {
        (bytes32 pId, PoolTerms memory terms) = _createAndFundPool();
        uint256 deliveryDeadline = terms.fulfillmentDeadline - 1;

        vm.warp(terms.purchasingDeadline + 1);
        factory.transitionToBidding(pId);

        bytes32 saltA = keccak256("SALTA");
        bytes32 commA = supplierAuction.computeCommitmentHash(
            pId, supplierA, 80 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA
        );
        vm.startPrank(supplierA);
        token.approve(address(supplierAuction), BOND);
        supplierAuction.commitBid(pId, commA, address(token), BOND);
        vm.stopPrank();

        vm.warp(terms.supplierCommitDeadline + 1);
        factory.transitionToRevealing(pId);
        vm.prank(supplierA);
        supplierAuction.revealBid(pId, 80 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA);

        vm.warp(terms.supplierRevealDeadline + 1);
        factory.executeClearing(pId);

        vm.prank(buyer1);
        demandVault.withdrawRefund(pId, buyer1);

        vm.expectRevert(RefundAlreadyWithdrawn.selector);
        vm.prank(buyer1);
        demandVault.withdrawRefund(pId, buyer1);
    }

    // Invariant 3: A seller cannot withdraw funds for the same fulfilled order twice
    function testInvariant_NoDoubleOrderRelease() public {
        (bytes32 pId, PoolTerms memory terms) = _createAndFundPool();
        uint256 deliveryDeadline = terms.fulfillmentDeadline - 1;

        vm.warp(terms.purchasingDeadline + 1);
        factory.transitionToBidding(pId);

        bytes32 saltA = keccak256("SALTA");
        bytes32 commA = supplierAuction.computeCommitmentHash(
            pId, supplierA, 80 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA
        );
        vm.startPrank(supplierA);
        token.approve(address(supplierAuction), BOND);
        supplierAuction.commitBid(pId, commA, address(token), BOND);
        vm.stopPrank();

        vm.warp(terms.supplierCommitDeadline + 1);
        factory.transitionToRevealing(pId);
        vm.prank(supplierA);
        supplierAuction.revealBid(pId, 80 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA);

        vm.warp(terms.supplierRevealDeadline + 1);
        factory.executeClearing(pId);

        vm.prank(supplierA);
        fulfillmentRegistry.recordDispatch(pId, buyer1, keccak256("EV1"));

        vm.prank(buyer1);
        fulfillmentRegistry.confirmDelivery(pId);

        vm.expectRevert(AlreadyDelivered.selector);
        vm.prank(buyer1);
        fulfillmentRegistry.confirmDelivery(pId);
    }

    // Invariant 5: An invalid supplier cannot win
    function testInvariant_InvalidSupplierCannotWin() public {
        (bytes32 pId, PoolTerms memory terms) = _createAndFundPool();
        uint256 deliveryDeadline = terms.fulfillmentDeadline - 1;

        vm.warp(terms.purchasingDeadline + 1);
        factory.transitionToBidding(pId);

        bytes32 saltA = keccak256("SALTA");
        bytes32 commA = supplierAuction.computeCommitmentHash(
            pId, supplierA, 120 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA
        );
        vm.startPrank(supplierA);
        token.approve(address(supplierAuction), BOND);
        supplierAuction.commitBid(pId, commA, address(token), BOND);
        vm.stopPrank();

        vm.warp(terms.supplierCommitDeadline + 1);
        factory.transitionToRevealing(pId);
        vm.prank(supplierA);
        supplierAuction.revealBid(pId, 120 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA);

        vm.warp(terms.supplierRevealDeadline + 1);
        vm.expectRevert(NoQualifyingSuppliers.selector);
        factory.executeClearing(pId);
    }

    // Invariant 6: A bid cannot be revealed under a different commitment
    function testInvariant_CryptographicCommitmentMismatchReverts() public {
        (bytes32 pId, PoolTerms memory terms) = _createAndFundPool();
        uint256 deliveryDeadline = terms.fulfillmentDeadline - 1;

        vm.warp(terms.purchasingDeadline + 1);
        factory.transitionToBidding(pId);

        bytes32 saltA = keccak256("SALTA");
        bytes32 commA = supplierAuction.computeCommitmentHash(
            pId, supplierA, 80 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA
        );
        vm.startPrank(supplierA);
        token.approve(address(supplierAuction), BOND);
        supplierAuction.commitBid(pId, commA, address(token), BOND);
        vm.stopPrank();

        vm.warp(terms.supplierCommitDeadline + 1);
        factory.transitionToRevealing(pId);

        vm.expectRevert(CommitmentMismatch.selector);
        vm.prank(supplierA);
        supplierAuction.revealBid(pId, 75 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA);
    }

    // Invariant 7: A contract cannot be finalized twice
    function testInvariant_NoDoubleClearing() public {
        (bytes32 pId, PoolTerms memory terms) = _createAndFundPool();
        uint256 deliveryDeadline = terms.fulfillmentDeadline - 1;

        vm.warp(terms.purchasingDeadline + 1);
        factory.transitionToBidding(pId);

        bytes32 saltA = keccak256("SALTA");
        bytes32 commA = supplierAuction.computeCommitmentHash(
            pId, supplierA, 80 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA
        );
        vm.startPrank(supplierA);
        token.approve(address(supplierAuction), BOND);
        supplierAuction.commitBid(pId, commA, address(token), BOND);
        vm.stopPrank();

        vm.warp(terms.supplierCommitDeadline + 1);
        factory.transitionToRevealing(pId);
        vm.prank(supplierA);
        supplierAuction.revealBid(pId, 80 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA);

        vm.warp(terms.supplierRevealDeadline + 1);
        factory.executeClearing(pId);

        vm.expectRevert(abi.encodeWithSelector(InvalidState.selector, PoolStatus.REVEALING, PoolStatus.CLEARED));
        factory.executeClearing(pId);
    }

    // Invariant 8: Supplier bonds cannot be misclassified as buyer deposits
    function testInvariant_BondVaultAndDemandVaultPartition() public {
        (bytes32 pId, PoolTerms memory terms) = _createAndFundPool();
        uint256 deliveryDeadline = terms.fulfillmentDeadline - 1;

        vm.warp(terms.purchasingDeadline + 1);
        factory.transitionToBidding(pId);

        bytes32 saltA = keccak256("SALTA");
        bytes32 commA = supplierAuction.computeCommitmentHash(
            pId, supplierA, 80 * 10 ** 6, 10, deliveryDeadline, termsHash, 1, saltA
        );
        vm.startPrank(supplierA);
        token.approve(address(supplierAuction), BOND);
        supplierAuction.commitBid(pId, commA, address(token), BOND);
        vm.stopPrank();

        assertEq(token.balanceOf(address(demandVault)), 10 * MAX_PRICE);
        assertEq(token.balanceOf(address(bondVault)), BOND);
    }

    // Invariant 12: Failed pools allow buyers to recover funds (cannot permanently trap escrow)
    function testInvariant_FailedAuctionRecoversBuyerFunds() public {
        uint256 nowTs = block.timestamp;
        PoolTerms memory terms = PoolTerms({
            creator: buyer1,
            settlementToken: address(token),
            canonicalSkuHash: canonicalSku,
            productDescription: "Unmet MOQ Pool",
            targetQuantity: 10,
            minOrderQuantity: 10,
            maxUnitPrice: MAX_PRICE,
            purchasingDeadline: nowTs + 1 days,
            supplierCommitDeadline: nowTs + 2 days,
            supplierRevealDeadline: nowTs + 3 days,
            fulfillmentDeadline: nowTs + 10 days,
            shippingRegion: "GLOBAL",
            deliveryTermsHash: termsHash,
            disputeTermsHash: disputeHash,
            supplierBondAmount: BOND,
            platformFeeBps: 75,
            arbitrator: arbitrator
        });

        vm.prank(buyer1);
        bytes32 pId = factory.createPool(terms);

        vm.startPrank(buyer1);
        token.approve(address(factory), 4 * MAX_PRICE);
        factory.joinPool(pId, 4);
        vm.stopPrank();

        vm.warp(terms.purchasingDeadline + 1);
        factory.transitionToBidding(pId);

        assertEq(uint8(factory.getPoolStatus(pId)), uint8(PoolStatus.CANCELLED));

        uint256 balBefore = token.balanceOf(buyer1);
        vm.prank(buyer1);
        factory.cancelCommitment(pId);
        assertEq(token.balanceOf(buyer1), balBefore + 4 * MAX_PRICE);
    }
}
