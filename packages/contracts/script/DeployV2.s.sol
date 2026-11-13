// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Script.sol";
import "../src/v2/HivelotProtocol.sol";
contract DeployV2 is Script {
    function run() external {
        if(block.chainid==1990)require(vm.envBool("ALLOW_MAINNET"),"Explicit mainnet authorization required");
        address settlementToken=vm.envAddress("SETTLEMENT_TOKEN_ADDRESS");
        address treasury=vm.envAddress("FEE_RECIPIENT_ADDRESS");
        require(settlementToken.code.length>0&&treasury!=address(0),"Invalid deployment addresses");
        (bool ok,bytes memory data)=settlementToken.staticcall(abi.encodeWithSignature("decimals()"));
        require(ok&&data.length>=32&&abi.decode(data,(uint256))==6,"Verify six-decimal token");
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        HivelotProtocol protocol=new HivelotProtocol(settlementToken,treasury);
        vm.stopBroadcast();
        console.log("HIVELOT v2:",address(protocol));
        console.log("Settlement token:",settlementToken);
        console.log("Fee recipient:",treasury);
    }
}
