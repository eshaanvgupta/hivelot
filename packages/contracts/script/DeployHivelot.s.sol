// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
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

contract DeployHivelot is Script {
    function run() external {
        require(block.chainid != 1990, "Legacy v1 contracts are not approved for mainnet; use DeployV2");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Settlement token setup
        address qusdcAddress;
        if (block.chainid == 1990) {
            // Canonical QUSDC address on QIE Mainnet
            qusdcAddress = 0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5;
        } else {
            MockQUSDC mockQusdc = new MockQUSDC();
            qusdcAddress = address(mockQusdc);
            console.log("MockQUSDC deployed at:", qusdcAddress);
        }

        // 2. Deploy Infrastructure & Registries
        MerchantRegistry merchantRegistry = new MerchantRegistry();
        ProtocolTreasury treasury = new ProtocolTreasury();
        SupplierBondVault bondVault = new SupplierBondVault();
        DemandVault demandVault = new DemandVault();

        // 3. Deploy Auction & Clearing Engines
        SupplierAuction supplierAuction = new SupplierAuction(address(bondVault));
        ClearingHouse clearingHouse = new ClearingHouse(
            address(demandVault),
            address(supplierAuction),
            address(bondVault),
            address(treasury)
        );

        // 4. Deploy Fulfillment & Disputes
        FulfillmentRegistry fulfillmentRegistry = new FulfillmentRegistry(
            address(demandVault),
            address(clearingHouse),
            address(bondVault),
            address(merchantRegistry)
        );

        DisputeResolver disputeResolver = new DisputeResolver(
            address(demandVault),
            address(clearingHouse),
            address(bondVault)
        );

        // 5. Deploy ProcurementFactory
        ProcurementFactory procurementFactory = new ProcurementFactory(
            address(demandVault),
            address(supplierAuction),
            address(clearingHouse),
            address(fulfillmentRegistry),
            address(disputeResolver),
            address(bondVault),
            address(treasury),
            address(merchantRegistry)
        );

        // 6. Configure Permissions & Inter-Contract Authorizations
        demandVault.setAuthorizedCaller(address(procurementFactory), true);
        demandVault.setAuthorizedCaller(address(clearingHouse), true);
        demandVault.setAuthorizedCaller(address(fulfillmentRegistry), true);
        demandVault.setAuthorizedCaller(address(disputeResolver), true);

        bondVault.setAuthorizedCaller(address(supplierAuction), true);
        bondVault.setAuthorizedCaller(address(clearingHouse), true);
        bondVault.setAuthorizedCaller(address(fulfillmentRegistry), true);
        bondVault.setAuthorizedCaller(address(disputeResolver), true);

        disputeResolver.setAuthorizedCaller(address(procurementFactory), true);
        merchantRegistry.setAuthorizedCaller(address(fulfillmentRegistry), true);
        treasury.setAuthorizedCaller(address(clearingHouse), true);
        clearingHouse.setAuthorizedCaller(address(procurementFactory), true);

        // Allow settlement token
        procurementFactory.setTokenWhitelist(qusdcAddress, true);

        vm.stopBroadcast();

        console.log("=== HIVELOT DEPLOYMENT MANIFEST ===");
        console.log("Chain ID:", block.chainid);
        console.log("Settlement Token (QUSDC):", qusdcAddress);
        console.log("MerchantRegistry:", address(merchantRegistry));
        console.log("ProtocolTreasury:", address(treasury));
        console.log("SupplierBondVault:", address(bondVault));
        console.log("DemandVault:", address(demandVault));
        console.log("SupplierAuction:", address(supplierAuction));
        console.log("ClearingHouse:", address(clearingHouse));
        console.log("FulfillmentRegistry:", address(fulfillmentRegistry));
        console.log("DisputeResolver:", address(disputeResolver));
        console.log("ProcurementFactory:", address(procurementFactory));
    }
}
