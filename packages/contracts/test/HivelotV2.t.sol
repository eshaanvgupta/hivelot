// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../src/v2/HivelotProtocol.sol";
import "../src/mocks/MockQUSDC.sol";

contract HivelotV2Test is Test {
    MockQUSDC internal token;
    HivelotProtocol internal protocol;
    address internal buyer = address(11);
    address internal seller = address(12);
    address internal other = address(13);
    address internal treasury = address(14);
    uint256 internal id;
    HivelotProtocol.Terms internal terms;
    function setUp() public virtual {
        token = new MockQUSDC();
        protocol = new HivelotProtocol(address(token), treasury);
        terms = HivelotProtocol.Terms(keccak256("routers"), keccak256("policy"), 10, 1, 80e6,
            block.timestamp + 100, block.timestamp + 200, block.timestamp + 300, block.timestamp + 400, 50e6, 75, address(this));
        id = protocol.createPool(terms);
        address[3] memory actors = [buyer,seller,other];
        for(uint256 i;i<3;i++) { token.mint(actors[i], 10000e6); vm.prank(actors[i]); token.approve(address(protocol),type(uint256).max); }
    }
    function _fund() internal { vm.prank(buyer); protocol.fund(id, 2); }
    function _bid(address who, uint256 price) internal {
        bytes32 hash=keccak256(abi.encode(block.chainid,address(protocol),id,who,price,uint256(10),terms.termsHash,bytes32(uint256(7))));
        vm.prank(who); protocol.commitBid(id,hash);
    }
    function _clear() internal {
        _fund(); vm.warp(terms.fundingDeadline); _bid(seller,61e6);
        vm.warp(terms.commitDeadline); vm.prank(seller); protocol.revealBid(id,61e6,10,bytes32(uint256(7)));
        vm.warp(terms.revealDeadline); protocol.clear(id);
    }
    function _dispatch() internal { vm.prank(seller); protocol.dispatch(id,buyer,keccak256("manifest")); }
    function testLifecycleConservesFundsAndPaysFee() public {
        _clear(); assertEq(protocol.credits(buyer),38e6); assertEq(protocol.credits(seller),0);
        _dispatch(); vm.prank(buyer); protocol.accept(id);
        assertEq(protocol.credits(seller),121085000); assertEq(protocol.credits(treasury),915000);
        vm.prank(seller); protocol.claimBond(id);
        vm.prank(seller); protocol.withdraw(); vm.prank(buyer); protocol.withdraw(); vm.prank(treasury); protocol.withdraw();
        assertEq(token.balanceOf(address(protocol)),0); assertEq(protocol.accountedBalance(),0);
    }
    function testCancelRejoinDoesNotDuplicateBuyer() public {
        _fund(); vm.prank(buyer); protocol.cancel(id); vm.prank(buyer); protocol.fund(id,2);
        assertEq(protocol.getBuyers(id).length,1);
        vm.warp(terms.revealDeadline); protocol.clear(id); assertEq(protocol.credits(buyer),320e6);
    }
    function testLateAndPrematureAuctionActionsRevert() public {
        _fund(); vm.expectRevert("Not commit phase"); _bid(seller,61e6);
        vm.warp(terms.fundingDeadline); _bid(seller,61e6);
        vm.prank(seller); vm.expectRevert("Not reveal phase"); protocol.revealBid(id,61e6,10,bytes32(uint256(7)));
        vm.warp(terms.revealDeadline); vm.prank(seller); vm.expectRevert("Not reveal phase"); protocol.revealBid(id,61e6,10,bytes32(uint256(7)));
    }
    function testCommitmentCannotBeChanged() public {
        _fund(); vm.warp(terms.fundingDeadline); _bid(seller,61e6); vm.warp(terms.commitDeadline);
        vm.prank(seller); vm.expectRevert("Commitment mismatch"); protocol.revealBid(id,60e6,10,bytes32(uint256(7)));
    }
    function testTieGoesToFirstCommitEvenSameBlock() public {
        _fund(); vm.warp(terms.fundingDeadline); _bid(seller,61e6); _bid(other,61e6); vm.warp(terms.commitDeadline);
        vm.prank(other); protocol.revealBid(id,61e6,10,bytes32(uint256(7)));
        vm.prank(seller); protocol.revealBid(id,61e6,10,bytes32(uint256(7)));
        vm.warp(terms.revealDeadline); protocol.clear(id); assertEq(protocol.getPool(id).winner,seller);
    }
    function testNoRevealRefundsBothDepositsAndBonds() public {
        _fund(); vm.warp(terms.fundingDeadline); _bid(seller,61e6); vm.warp(terms.revealDeadline); protocol.clear(id);
        assertEq(protocol.credits(buyer),160e6); vm.prank(seller); protocol.claimBond(id); assertEq(protocol.credits(seller),50e6);
    }
    function testDoubleClearingAndWithdrawalRevert() public {
        _clear(); vm.expectRevert("Clearing unavailable"); protocol.clear(id);
        vm.prank(buyer); protocol.withdraw(); vm.prank(buyer); vm.expectRevert("No credit"); protocol.withdraw();
    }
    function testNoPrematureDefaultOrWinnerBondWithdrawal() public {
        _clear(); vm.prank(buyer); vm.expectRevert("Default unavailable"); protocol.refundDefault(id);
        vm.prank(seller); vm.expectRevert("Fulfillment pending"); protocol.claimBond(id);
    }
    function testDefaultUsesStoredDeadlineAndRefundsExactlyOnce() public {
        _clear(); vm.warp(terms.dispatchDeadline+1); vm.prank(buyer); protocol.refundDefault(id);
        assertEq(protocol.credits(buyer),160e6);
        vm.prank(buyer); vm.expectRevert("Default unavailable"); protocol.refundDefault(id);
    }
    function testDisputeFreezesAutoAcceptanceAndSplitsCorrectly() public {
        _clear(); _dispatch(); vm.prank(buyer); protocol.dispute(id,keccak256("damaged"));
        vm.warp(block.timestamp+7 days); vm.expectRevert("Challenge active"); protocol.acceptAfterChallenge(id,buyer);
        protocol.resolve(id,buyer,5000,keccak256("verdict"));
        assertEq(protocol.credits(buyer),99e6); assertEq(protocol.credits(seller),60542500); assertEq(protocol.credits(treasury),457500);
        vm.expectRevert("Not arbitrable"); protocol.resolve(id,buyer,5000,keccak256("verdict"));
    }
    function testArbitrationInactivityCannotTrapFunds() public {
        _clear(); _dispatch(); vm.prank(buyer); protocol.dispute(id,keccak256("damaged"));
        vm.warp(block.timestamp+14 days); vm.prank(buyer); protocol.refundUnresolvedDispute(id); assertEq(protocol.credits(buyer),160e6);
    }
    function testUnchallengedDispatchPaysOnlyAfterWindow() public {
        _clear(); _dispatch(); vm.expectRevert("Challenge active"); protocol.acceptAfterChallenge(id,buyer);
        vm.warp(block.timestamp+7 days); protocol.acceptAfterChallenge(id,buyer); assertEq(protocol.credits(seller),121085000);
    }
    function testArbitratorAndFeePolicyValidated() public {
        terms.feeBps=201; vm.expectRevert("Invalid policy"); protocol.createPool(terms);
        terms.feeBps=75; terms.arbitrator=address(0); vm.expectRevert("Invalid policy"); protocol.createPool(terms);
    }
    function testFuzzSplitConservesLiability(uint16 rawBps) public {
        uint256 bps=bound(rawBps,0,10000); _clear(); _dispatch(); vm.prank(buyer); protocol.dispute(id,keccak256("evidence"));
        protocol.resolve(id,buyer,bps,keccak256("verdict"));
        assertEq(protocol.credits(buyer)+protocol.credits(seller)+protocol.credits(treasury),160e6);
        assertEq(token.balanceOf(address(protocol)),protocol.accountedBalance());
    }
    function testCancelledBuyersDoNotConsumeActiveSlots() public {
        for(uint160 n=1000;n<1130;n++) {
            address actor=address(n);token.mint(actor,80e6);vm.startPrank(actor);token.approve(address(protocol),80e6);protocol.fund(id,1);protocol.cancel(id);protocol.withdraw();vm.stopPrank();
        }
        assertEq(protocol.getBuyers(id).length,0);_fund();assertEq(protocol.getBuyers(id).length,1);
    }
    function testMultiPoolCreditsStaySolvent() public {
        _fund();uint256 second=protocol.createPool(terms);vm.prank(other);protocol.fund(second,3);
        vm.prank(buyer);protocol.cancel(id);vm.prank(buyer);protocol.withdraw();
        assertEq(protocol.accountedBalance(),240e6);assertEq(token.balanceOf(address(protocol)),240e6);
        vm.warp(terms.revealDeadline);protocol.clear(second);vm.prank(other);protocol.withdraw();assertEq(protocol.accountedBalance(),0);
    }
    function testSignedVerdictBoundToNonceAndDomain() public {
        uint256 arbitratorKey=777;terms.arbitrator=vm.addr(arbitratorKey);id=protocol.createPool(terms);_clear();_dispatch();
        vm.prank(buyer);protocol.dispute(id,keccak256("evidence"));
        bytes32 evidence=keccak256("verdict");uint256 deadline=block.timestamp+1 days;
        bytes32 structHash=keccak256(abi.encode(protocol.VERDICT_TYPEHASH(),id,buyer,uint256(5000),evidence,uint256(0),deadline));
        bytes32 digest=keccak256(abi.encodePacked(hex"1901",protocol.domainSeparator(),structHash));
        (uint8 v,bytes32 r,bytes32 s)=vm.sign(arbitratorKey,digest);bytes memory signature=abi.encodePacked(r,s,v);
        vm.chainId(1990);vm.expectRevert("Invalid verdict");protocol.resolveSigned(id,buyer,5000,evidence,deadline,signature);
        vm.chainId(31337);protocol.resolveSigned(id,buyer,5000,evidence,deadline,signature);
        vm.expectRevert("Invalid verdict");protocol.resolveSigned(id,buyer,5000,evidence,deadline,signature);
    }
    function testMaximumClearingGasBound() public {
        terms.target=128;terms.minimum=128;id=protocol.createPool(terms);
        for(uint160 n=1000;n<1128;n++){address actor=address(n);token.mint(actor,80e6);vm.startPrank(actor);token.approve(address(protocol),80e6);protocol.fund(id,1);vm.stopPrank();}
        vm.warp(terms.fundingDeadline);
        for(uint160 n=2000;n<2128;n++){address actor=address(n);token.mint(actor,50e6);vm.prank(actor);token.approve(address(protocol),50e6);bytes32 hash=protocol.bidHash(id,actor,61e6,128,bytes32(uint256(7)));vm.prank(actor);protocol.commitBid(id,hash);}
        vm.warp(terms.commitDeadline);
        for(uint160 n=2000;n<2128;n++){vm.prank(address(n));protocol.revealBid(id,61e6,128,bytes32(uint256(7)));}
        vm.warp(terms.revealDeadline);uint256 beforeGas=gasleft();protocol.clear(id);uint256 used=beforeGas-gasleft();emit log_named_uint("Maximum clearing gas (128 buyers / 128 bidders)",used);assertLt(used,15000000);
    }
    function testRejectsIncomingAndOutgoingTransferTax() public {
        TaxToken taxed=new TaxToken();HivelotProtocol p=new HivelotProtocol(address(taxed),treasury);uint256 pool=p.createPool(terms);
        taxed.mint(buyer,160e6);vm.prank(buyer);taxed.approve(address(p),type(uint256).max);
        taxed.setTaxedSender(buyer);vm.prank(buyer);vm.expectRevert("Unsupported token");p.fund(pool,1);
        assertEq(p.accountedBalance(),0);taxed.setTaxedSender(address(0));vm.prank(buyer);p.fund(pool,1);vm.prank(buyer);p.cancel(pool);
        taxed.setTaxedSender(address(p));vm.prank(buyer);vm.expectRevert("Unsupported token");p.withdraw();
        assertEq(p.credits(buyer),80e6);assertEq(p.accountedBalance(),80e6);
    }
}

contract TaxToken is MockQUSDC {
    address public taxedSender;
    function setTaxedSender(address sender) external {taxedSender=sender;}
    function _update(address from,address to,uint256 amount) internal override {
        if(from!=address(0)&&to!=address(0)&&from==taxedSender){super._update(from,address(0),amount/100);super._update(from,to,amount-amount/100);}
        else super._update(from,to,amount);
    }
}

contract V2Handler is Test {
    HivelotProtocol public p; uint256 public id; uint256 public start; address public buyer=address(11); address public seller=address(12);
    constructor(HivelotProtocol _p,uint256 _id){ p=_p; id=_id; start=block.timestamp; }
    function fund(uint8 q) external { vm.prank(buyer); try p.fund(id,bound(q,1,3)) {} catch {} }
    function cancel() external { vm.prank(buyer); try p.cancel(id) {} catch {} }
    function advance(uint32 seconds_) external { vm.warp(block.timestamp+bound(seconds_,0,500)); }
    function commit() external { bytes32 hash=p.bidHash(id,seller,61e6,10,bytes32(uint256(7))); vm.prank(seller); try p.commitBid(id,hash) {} catch {} }
    function reveal() external { vm.prank(seller); try p.revealBid(id,61e6,10,bytes32(uint256(7))) {} catch {} }
    function clear() external { try p.clear(id) {} catch {} }
    function dispatch() external { vm.prank(seller); try p.dispatch(id,buyer,keccak256("manifest")) {} catch {} }
    function accept() external { vm.prank(buyer); try p.accept(id) {} catch {} }
    function dispute() external { vm.prank(buyer); try p.dispute(id,keccak256("evidence")) {} catch {} }
    function defaultRefund() external { vm.prank(buyer); try p.refundDefault(id) {} catch {} }
    function timeout() external { try p.acceptAfterChallenge(id,buyer) {} catch {} vm.prank(buyer); try p.refundUnresolvedDispute(id) {} catch {} }
    function bond() external { vm.prank(seller); try p.claimBond(id) {} catch {} }
    function withdraw(bool supplier) external { vm.prank(supplier?seller:buyer); try p.withdraw() {} catch {} }
}

contract HivelotV2Invariant is StdInvariant,HivelotV2Test {
    V2Handler internal handler;
    function setUp() public override {
        super.setUp(); handler=new V2Handler(protocol,id); targetContract(address(handler));
    }
    function invariant_ExactConservationAcrossDepositsLiabilitiesBondsAndCredits() public view {
        uint256 tracked=protocol.credits(buyer)+protocol.credits(seller)+protocol.credits(other)+protocol.credits(treasury);
        (,uint256 deposit,uint256 liability,,,,,,)=protocol.orders(id,buyer);
        tracked+=deposit+liability;
        (bytes32 commitment,,,,bool claimed)=protocol.bids(id,seller);
        if(commitment!=0&&!claimed)tracked+=terms.bond;
        assertEq(tracked,protocol.accountedBalance()); assertEq(token.balanceOf(address(protocol)),tracked);
    }
}
