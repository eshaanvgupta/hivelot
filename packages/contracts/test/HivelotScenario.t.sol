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

contract HivelotScenarioTest is Test, IHivelotTypes {
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
    address public buyer1 = address(0xB1);
    address public buyer2 = address(0xB2);
    address public buyer3 = address(0xB3);
    address public supplierA = address(0x51);
    address public supplierB = address(0x52);
    address public supplierC = address(0x53);
    address public arbitrator = address(0xAA);

    bytes32 public poolId;
    bytes32 public canonicalSku = keccak256("SKU-NETWORK-ROUTER-ENTERPRISE-GIGABIT-V1");
    bytes32 public termsHash = keccak256("DELIVERY-TERMS-FOB-INSURED-5-DAY-AIR");
    bytes32 public disputeTermsHash = keccak256("DISPUTE-TERMS-INDEPENDENT-ARBITRATION-EIP712");

    uint256 public constant MAX_UNIT_PRICE = 80 * 10 ** 6; // 80 QUSDC
    uint256 public constant BOND_AMOUNT = 50 * 10 ** 6;    // 50 QUSDC

    function setUp() public {
        vm.startPrank(admin);

        // Deploy contracts
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

        // Authorizations
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

        // Fund buyers and suppliers
        token.faucet(buyer1, 1000 * 10 ** 6);
        token.faucet(buyer2, 1000 * 10 ** 6);
        token.faucet(buyer3, 1000 * 10 ** 6);

        token.faucet(supplierA, 500 * 10 ** 6);
        token.faucet(supplierB, 500 * 10 ** 6);
        token.faucet(supplierC, 500 * 10 ** 6);

        // Register merchants
        vm.prank(supplierA);
        merchantRegistry.registerMerchant("Supplier Alpha Tech", "US-DE", "contact@supplier-a.com");
        vm.prank(supplierB);
        merchantRegistry.registerMerchant("Supplier Beta Hardware", "DE-BE", "sales@supplier-b.de");
        vm.prank(supplierC);
        merchantRegistry.registerMerchant("Supplier Gamma Global", "JP-TYO", "procure@gamma-global.jp");
    }

    function testCompleteCollectiveProcurementScenario() public {
        uint256 baseTs = block.timestamp;

        // 1. Create Procurement Pool
        PoolTerms memory terms = PoolTerms({
            creator: buyer1,
            settlementToken: address(token),
            canonicalSkuHash: canonicalSku,
            productDescription: "Enterprise Gigabit Router Batch 1",
            targetQuantity: 10,
            minOrderQuantity: 10,
            maxUnitPrice: MAX_UNIT_PRICE,
            purchasingDeadline: baseTs + 1 days,
            supplierCommitDeadline: baseTs + 2 days,
            supplierRevealDeadline: baseTs + 3 days,
            fulfillmentDeadline: baseTs + 10 days,
            shippingRegion: "GLOBAL",
            deliveryTermsHash: termsHash,
            disputeTermsHash: disputeTermsHash,
            supplierBondAmount: BOND_AMOUNT,
            platformFeeBps: 75, // 0.75%
            arbitrator: arbitrator
        });

        vm.prank(buyer1);
        poolId = factory.createPool(terms);
        assertEq(uint8(factory.getPoolStatus(poolId)), uint8(PoolStatus.FORMING));

        uint256 deadlineA = terms.fulfillmentDeadline - 1;
        uint256 deadlineB = terms.fulfillmentDeadline - 2;
        uint256 deadlineC = terms.fulfillmentDeadline - 3;

        // 2. Buyers join pool and deposit escrow
        // Buyer 1: commits 4 units ($320)
        vm.startPrank(buyer1);
        token.approve(address(factory), 4 * MAX_UNIT_PRICE);
        factory.joinPool(poolId, 4);
        vm.stopPrank();

        // Buyer 2: commits 3 units ($240)
        vm.startPrank(buyer2);
        token.approve(address(factory), 3 * MAX_UNIT_PRICE);
        factory.joinPool(poolId, 3);
        vm.stopPrank();

        // Buyer 3: commits 3 units ($240)
        vm.startPrank(buyer3);
        token.approve(address(factory), 3 * MAX_UNIT_PRICE);
        factory.joinPool(poolId, 3);
        vm.stopPrank();

        // Verify aggregated demand: 10 units, 800 QUSDC escrow
        assertEq(demandVault.totalCommittedUnits(poolId), 10);
        assertEq(demandVault.totalDepositedEscrow(poolId), 800 * 10 ** 6);

        // 3. Fast-forward past purchasing deadline and transition to BIDDING
        vm.warp(terms.purchasingDeadline + 1);
        factory.transitionToBidding(poolId);
        assertEq(uint8(factory.getPoolStatus(poolId)), uint8(PoolStatus.BIDDING));

        // 4. Suppliers submit sealed commitments + bond
        // Supplier A: 72 QUSDC
        bytes32 saltA = keccak256("SALT_A");
        bytes32 commA = supplierAuction.computeCommitmentHash(
            poolId, supplierA, 72 * 10 ** 6, 15, deadlineA, termsHash, 1, saltA
        );
        vm.startPrank(supplierA);
        token.approve(address(supplierAuction), BOND_AMOUNT);
        supplierAuction.commitBid(poolId, commA, address(token), BOND_AMOUNT);
        vm.stopPrank();

        // Supplier B: 67 QUSDC
        bytes32 saltB = keccak256("SALT_B");
        bytes32 commB = supplierAuction.computeCommitmentHash(
            poolId, supplierB, 67 * 10 ** 6, 20, deadlineB, termsHash, 2, saltB
        );
        vm.startPrank(supplierB);
        token.approve(address(supplierAuction), BOND_AMOUNT);
        supplierAuction.commitBid(poolId, commB, address(token), BOND_AMOUNT);
        vm.stopPrank();

        // Supplier C: 61 QUSDC (Winning quote)
        bytes32 saltC = keccak256("SALT_C");
        bytes32 commC = supplierAuction.computeCommitmentHash(
            poolId, supplierC, 61 * 10 ** 6, 12, deadlineC, termsHash, 3, saltC
        );
        vm.startPrank(supplierC);
        token.approve(address(supplierAuction), BOND_AMOUNT);
        supplierAuction.commitBid(poolId, commC, address(token), BOND_AMOUNT);
        vm.stopPrank();

        // Verify bonds locked
        assertEq(bondVault.getBond(poolId, supplierA), BOND_AMOUNT);
        assertEq(bondVault.getBond(poolId, supplierB), BOND_AMOUNT);
        assertEq(bondVault.getBond(poolId, supplierC), BOND_AMOUNT);

        // 5. Fast-forward past commit deadline and transition to REVEALING
        vm.warp(terms.supplierCommitDeadline + 1);
        factory.transitionToRevealing(poolId);
        assertEq(uint8(factory.getPoolStatus(poolId)), uint8(PoolStatus.REVEALING));

        // 6. Suppliers reveal sealed bids
        vm.prank(supplierA);
        supplierAuction.revealBid(poolId, 72 * 10 ** 6, 15, deadlineA, termsHash, 1, saltA);

        vm.prank(supplierB);
        supplierAuction.revealBid(poolId, 67 * 10 ** 6, 20, deadlineB, termsHash, 2, saltB);

        vm.prank(supplierC);
        supplierAuction.revealBid(poolId, 61 * 10 ** 6, 12, deadlineC, termsHash, 3, saltC);

        // 7. Fast-forward past reveal deadline and execute market clearing
        vm.warp(terms.supplierRevealDeadline + 1);
        ClearingOutcome memory outcome = factory.executeClearing(poolId);

        // Assert deterministic clearing results:
        // Supplier C wins at 61 QUSDC
        assertEq(outcome.winningSupplier, supplierC);
        assertEq(outcome.clearingPrice, 61 * 10 ** 6);
        assertEq(outcome.totalAcceptedQuantity, 10);
        assertEq(outcome.grossOrderValue, 610 * 10 ** 6);
        // Fee = 610 * 0.75% = 4.575 QUSDC = 4575000 units
        assertEq(outcome.platformFeeAmount, 4575000);
        // Aggregate refunds = 10 * (80 - 61) = 190 QUSDC = 190,000,000 units
        assertEq(outcome.totalRefundsAllocated, 190 * 10 ** 6);

        // Verify non-winning suppliers got their bonds released
        assertEq(bondVault.getBond(poolId, supplierA), 0);
        assertEq(bondVault.getBond(poolId, supplierB), 0);
        // Winner C bond remains locked as performance guarantee
        assertEq(bondVault.getBond(poolId, supplierC), BOND_AMOUNT);

        // 8. Buyers withdraw price-adjustment refunds
        // Buyer 1: 4 units * (80 - 61) = 76 QUSDC refund
        uint256 b1BalBefore = token.balanceOf(buyer1);
        vm.prank(buyer1);
        demandVault.withdrawRefund(poolId, buyer1);
        assertEq(token.balanceOf(buyer1), b1BalBefore + 76 * 10 ** 6);

        // Buyer 2: 3 units * (80 - 61) = 57 QUSDC refund
        uint256 b2BalBefore = token.balanceOf(buyer2);
        vm.prank(buyer2);
        demandVault.withdrawRefund(poolId, buyer2);
        assertEq(token.balanceOf(buyer2), b2BalBefore + 57 * 10 ** 6);

        // Buyer 3: 3 units * (80 - 61) = 57 QUSDC refund
        uint256 b3BalBefore = token.balanceOf(buyer3);
        vm.prank(buyer3);
        demandVault.withdrawRefund(poolId, buyer3);
        assertEq(token.balanceOf(buyer3), b3BalBefore + 57 * 10 ** 6);

        // Total refunds withdrawn = 76 + 57 + 57 = 190 QUSDC!

        // 9. Winning Supplier C fulfills orders
        bytes32 evidenceHash1 = keccak256("DHL_TRACKING_SH10001_HASH");
        bytes32 evidenceHash2 = keccak256("DHL_TRACKING_SH10002_HASH");
        bytes32 evidenceHash3 = keccak256("DHL_TRACKING_SH10003_HASH");

        vm.startPrank(supplierC);
        fulfillmentRegistry.recordDispatch(poolId, buyer1, evidenceHash1);
        fulfillmentRegistry.recordDispatch(poolId, buyer2, evidenceHash2);
        fulfillmentRegistry.recordDispatch(poolId, buyer3, evidenceHash3);
        vm.stopPrank();

        // 10. Buyers confirm delivery & acceptance -> releases fulfillment escrow to Supplier C
        uint256 supplierBalBefore = token.balanceOf(supplierC);

        vm.prank(buyer1);
        fulfillmentRegistry.confirmDelivery(poolId);

        vm.prank(buyer2);
        fulfillmentRegistry.confirmDelivery(poolId);

        vm.prank(buyer3);
        fulfillmentRegistry.confirmDelivery(poolId);

        // Verify supplier C received order payments: 610 QUSDC + performance bond released (50 QUSDC)
        assertEq(token.balanceOf(supplierC), supplierBalBefore + 610 * 10 ** 6 + BOND_AMOUNT);

        // Verify supplier C's performance bond is also released back to them upon complete delivery
        assertEq(bondVault.getBond(poolId, supplierC), 0);

        // 11. Final Solvency & Invariant check: DemandVault has 0 remaining unallocated escrow
        assertEq(demandVault.totalFulfillmentEscrow(poolId), 0);
    }
}
