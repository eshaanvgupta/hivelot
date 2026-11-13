// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Fixed-token procurement escrow. No administrator can withdraw customer escrow.
/// Physical delivery relies on buyer acceptance or the disclosed challenge/arbitration policy.
contract HivelotProtocol is ReentrancyGuard {
    using SafeERC20 for IERC20;
    string public constant VERSION = "2.0.0";
    uint256 public constant CHALLENGE_PERIOD = 7 days;
    uint256 public constant ARBITRATION_PERIOD = 14 days;
    uint256 public constant MAX_BUYERS = 128;
    uint256 public constant MAX_BIDDERS = 128;
    bytes32 public constant VERDICT_TYPEHASH = keccak256("Verdict(uint256 poolId,address buyer,uint256 buyerBps,bytes32 evidenceHash,uint256 nonce,uint256 deadline)");

    IERC20 public immutable token;
    address public immutable feeRecipient;
    uint256 public poolCount;
    uint256 public accountedBalance;
    mapping(address => uint256) public credits;

    enum State { OPEN, CLEARED, FAILED, COMPLETED }
    enum OrderState { NONE, PENDING, DISPATCHED, DISPUTED, SETTLED }
    struct Terms {
        bytes32 specificationHash;
        bytes32 termsHash;
        uint256 target;
        uint256 minimum;
        uint256 maximumPrice;
        uint256 fundingDeadline;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 dispatchDeadline;
        uint256 bond;
        uint256 feeBps;
        address arbitrator;
    }
    struct Pool {
        address creator;
        Terms terms;
        State state;
        uint256 quantity;
        address winner;
        uint256 price;
        uint256 openOrders;
    }
    struct Order {
        uint256 quantity;
        uint256 deposit;
        uint256 liability;
        OrderState state;
        bytes32 evidenceHash;
        uint256 dispatchedAt;
        uint256 disputedAt;
        uint256 verdictNonce;
        bool listed;
    }
    struct Bid {
        bytes32 commitment;
        uint256 price;
        uint256 capacity;
        bool revealed;
        bool bondClaimed;
    }
    mapping(uint256 => Pool) private _pools;
    mapping(uint256 => mapping(address => Order)) public orders;
    mapping(uint256 => mapping(address => Bid)) public bids;
    mapping(uint256 => mapping(address => bytes32)) public disputeEvidence;
    mapping(uint256 => address[]) private _buyers;
    mapping(uint256 => mapping(address => uint256)) private _buyerIndex;
    mapping(uint256 => address[]) private _suppliers;

    event PoolCreated(uint256 indexed poolId, address indexed creator, bytes32 specificationHash);
    event DemandFunded(uint256 indexed poolId, address indexed buyer, uint256 quantity, uint256 amount);
    event DemandCancelled(uint256 indexed poolId, address indexed buyer, uint256 amount);
    event BidCommitted(uint256 indexed poolId, address indexed supplier, bytes32 commitment);
    event BidRevealed(uint256 indexed poolId, address indexed supplier, uint256 price, uint256 capacity);
    event Cleared(uint256 indexed poolId, address indexed winner, uint256 price, uint256 quantity);
    event Failed(uint256 indexed poolId);
    event Dispatched(uint256 indexed poolId, address indexed buyer, bytes32 evidenceHash);
    event Disputed(uint256 indexed poolId, address indexed buyer, bytes32 evidenceHash);
    event VerdictApplied(uint256 indexed poolId, address indexed buyer, address indexed arbitrator, uint256 buyerBps, bytes32 evidenceHash, uint256 nonce);
    event OrderSettled(uint256 indexed poolId, address indexed buyer, uint256 buyerAmount, uint256 supplierAmount, uint256 fee);
    event Withdrawal(address indexed account, uint256 amount);

    constructor(address settlementToken, address treasury) {
        require(settlementToken.code.length > 0 && treasury != address(0), "Invalid configuration");
        token = IERC20(settlementToken);
        feeRecipient = treasury;
    }

    function createPool(Terms calldata terms) external returns (uint256 id) {
        require(terms.specificationHash != 0 && terms.termsHash != 0, "Missing terms");
        require(terms.minimum > 0 && terms.target >= terms.minimum && terms.target <= 1000000, "Invalid quantity");
        require(terms.maximumPrice > 0 && terms.maximumPrice <= type(uint128).max / terms.target, "Invalid price");
        require(terms.fundingDeadline > block.timestamp && terms.commitDeadline > terms.fundingDeadline
            && terms.revealDeadline > terms.commitDeadline && terms.dispatchDeadline > terms.revealDeadline, "Invalid deadlines");
        require(terms.feeBps <= 200 && terms.arbitrator != address(0), "Invalid policy");
        require(terms.dispatchDeadline <= block.timestamp + 365 days && terms.bond <= type(uint128).max, "Terms too large");
        id = ++poolCount;
        Pool storage p = _pools[id];
        p.creator = msg.sender;
        p.terms = terms;
        emit PoolCreated(id, msg.sender, terms.specificationHash);
    }

    function fund(uint256 id, uint256 quantity) external nonReentrant {
        Pool storage p = _pool(id);
        require(p.state == State.OPEN && block.timestamp < p.terms.fundingDeadline, "Funding closed");
        require(quantity > 0 && p.quantity + quantity <= p.terms.target, "Invalid quantity");
        Order storage o = orders[id][msg.sender];
        if (!o.listed) {
            require(_buyers[id].length < MAX_BUYERS, "Buyer limit");
            _buyers[id].push(msg.sender);
            _buyerIndex[id][msg.sender] = _buyers[id].length;
            o.listed = true;
        }
        uint256 amount = quantity * p.terms.maximumPrice;
        o.quantity += quantity;
        o.deposit += amount;
        o.state = OrderState.PENDING;
        p.quantity += quantity;
        _take(msg.sender, amount);
        emit DemandFunded(id, msg.sender, quantity, amount);
    }

    function cancel(uint256 id) external {
        Pool storage p = _pool(id);
        require(p.state == State.OPEN && block.timestamp < p.terms.fundingDeadline, "Cancellation closed");
        Order storage o = orders[id][msg.sender];
        require(o.deposit > 0, "No deposit");
        uint256 amount = o.deposit;
        p.quantity -= o.quantity;
        o.quantity = 0;
        o.deposit = 0;
        o.state = OrderState.NONE;
        uint256 index = _buyerIndex[id][msg.sender] - 1;
        uint256 last = _buyers[id].length - 1;
        if (index != last) {
            address moved = _buyers[id][last];
            _buyers[id][index] = moved;
            _buyerIndex[id][moved] = index + 1;
        }
        _buyers[id].pop();
        delete _buyerIndex[id][msg.sender];
        o.listed = false;
        credits[msg.sender] += amount;
        emit DemandCancelled(id, msg.sender, amount);
    }

    function bidHash(uint256 id, address supplier, uint256 price, uint256 capacity, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), id, supplier, price, capacity, _pools[id].terms.termsHash, salt));
    }

    function commitBid(uint256 id, bytes32 commitment) external nonReentrant {
        Pool storage p = _pool(id);
        require(p.state == State.OPEN && block.timestamp >= p.terms.fundingDeadline && block.timestamp < p.terms.commitDeadline, "Not commit phase");
        require(p.quantity >= p.terms.minimum && commitment != 0, "Invalid bid");
        require(bids[id][msg.sender].commitment == 0 && _suppliers[id].length < MAX_BIDDERS, "Bid limit");
        bids[id][msg.sender].commitment = commitment;
        _suppliers[id].push(msg.sender);
        if (p.terms.bond > 0) _take(msg.sender, p.terms.bond);
        emit BidCommitted(id, msg.sender, commitment);
    }

    function revealBid(uint256 id, uint256 price, uint256 capacity, bytes32 salt) external {
        Pool storage p = _pool(id);
        require(p.state == State.OPEN && block.timestamp >= p.terms.commitDeadline && block.timestamp < p.terms.revealDeadline, "Not reveal phase");
        Bid storage b = bids[id][msg.sender];
        require(!b.revealed && b.commitment != 0 && b.commitment == bidHash(id, msg.sender, price, capacity, salt), "Commitment mismatch");
        require(price > 0 && price <= p.terms.maximumPrice && capacity >= p.quantity, "Unqualified bid");
        b.revealed = true;
        b.price = price;
        b.capacity = capacity;
        emit BidRevealed(id, msg.sender, price, capacity);
    }

    function clear(uint256 id) external {
        Pool storage p = _pool(id);
        require(p.state == State.OPEN && block.timestamp >= p.terms.revealDeadline, "Clearing unavailable");
        if (p.quantity >= p.terms.minimum) {
            address[] storage suppliers = _suppliers[id];
            for (uint256 i; i < suppliers.length; ++i) {
                Bid storage b = bids[id][suppliers[i]];
                if (b.revealed && (p.winner == address(0) || b.price < p.price)) {
                    p.winner = suppliers[i];
                    p.price = b.price;
                }
            }
        }
        if (p.winner == address(0)) {
            p.state = State.FAILED;
            emit Failed(id);
        } else {
            p.state = State.CLEARED;
            emit Cleared(id, p.winner, p.price, p.quantity);
        }
        address[] storage buyers = _buyers[id];
        for (uint256 i; i < buyers.length; ++i) {
            Order storage o = orders[id][buyers[i]];
            if (o.quantity == 0) continue;
            uint256 liability = p.state == State.FAILED ? 0 : o.quantity * p.price;
            credits[buyers[i]] += o.deposit - liability;
            o.deposit = 0;
            o.liability = liability;
            if (liability > 0) ++p.openOrders;
            else o.state = OrderState.SETTLED;
        }
    }

    function claimBond(uint256 id) external {
        Pool storage p = _pool(id);
        require(p.state != State.OPEN, "Auction not closed");
        require(msg.sender != p.winner || p.openOrders == 0, "Fulfillment pending");
        Bid storage b = bids[id][msg.sender];
        require(b.commitment != 0 && !b.bondClaimed, "No bond");
        b.bondClaimed = true;
        // Non-reveals are refundable; this initial policy does not slash collateral.
        credits[msg.sender] += p.terms.bond;
    }

    function dispatch(uint256 id, address buyer, bytes32 evidenceHash) external {
        Pool storage p = _pool(id);
        require(p.state == State.CLEARED && msg.sender == p.winner && block.timestamp <= p.terms.dispatchDeadline, "Dispatch unavailable");
        Order storage o = orders[id][buyer];
        require(o.state == OrderState.PENDING && o.liability > 0 && evidenceHash != 0, "Invalid order");
        o.evidenceHash = evidenceHash;
        o.dispatchedAt = block.timestamp;
        o.state = OrderState.DISPATCHED;
        emit Dispatched(id, buyer, evidenceHash);
    }

    function accept(uint256 id) external {
        require(orders[id][msg.sender].state == OrderState.DISPATCHED, "Not dispatched");
        _settle(id, msg.sender, 0);
    }

    function acceptAfterChallenge(uint256 id, address buyer) external {
        Order storage o = orders[id][buyer];
        require(o.state == OrderState.DISPATCHED && block.timestamp >= o.dispatchedAt + CHALLENGE_PERIOD, "Challenge active");
        _settle(id, buyer, 0);
    }

    function refundDefault(uint256 id) external {
        Pool storage p = _pool(id);
        Order storage o = orders[id][msg.sender];
        require(p.state == State.CLEARED && o.state == OrderState.PENDING && block.timestamp > p.terms.dispatchDeadline, "Default unavailable");
        _settle(id, msg.sender, 10000);
    }

    function dispute(uint256 id, bytes32 evidenceHash) external {
        Order storage o = orders[id][msg.sender];
        require(o.state == OrderState.DISPATCHED && block.timestamp < o.dispatchedAt + CHALLENGE_PERIOD && evidenceHash != 0, "Dispute unavailable");
        o.state = OrderState.DISPUTED;
        o.disputedAt = block.timestamp;
        disputeEvidence[id][msg.sender] = evidenceHash;
        emit Disputed(id, msg.sender, evidenceHash);
    }

    function resolve(uint256 id, address buyer, uint256 buyerBps, bytes32 evidenceHash) external {
        require(msg.sender == _pool(id).terms.arbitrator, "Not arbitrator");
        require(evidenceHash != 0, "Missing verdict evidence");
        uint256 nonce = orders[id][buyer].verdictNonce;
        _resolve(id, buyer, buyerBps);
        emit VerdictApplied(id,buyer,msg.sender,buyerBps,evidenceHash,nonce);
    }

    function resolveSigned(uint256 id, address buyer, uint256 buyerBps, bytes32 evidenceHash, uint256 deadline, bytes calldata signature) external {
        require(block.timestamp <= deadline && evidenceHash != 0, "Verdict expired");
        bytes32 structHash = keccak256(abi.encode(VERDICT_TYPEHASH, id, buyer, buyerBps, evidenceHash, orders[id][buyer].verdictNonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", domainSeparator(), structHash));
        require(ECDSA.recover(digest, signature) == _pool(id).terms.arbitrator, "Invalid verdict");
        uint256 nonce = orders[id][buyer].verdictNonce;
        _resolve(id, buyer, buyerBps);
        emit VerdictApplied(id,buyer,_pools[id].terms.arbitrator,buyerBps,evidenceHash,nonce);
    }

    function refundUnresolvedDispute(uint256 id) external {
        Order storage o = orders[id][msg.sender];
        require(o.state == OrderState.DISPUTED && block.timestamp >= o.disputedAt + ARBITRATION_PERIOD, "Arbitration active");
        _settle(id, msg.sender, 10000);
    }

    function withdraw() external nonReentrant {
        uint256 amount = credits[msg.sender];
        require(amount > 0, "No credit");
        credits[msg.sender] = 0;
        accountedBalance -= amount;
        uint256 beforeRecipient = token.balanceOf(msg.sender);
        token.safeTransfer(msg.sender, amount);
        require(token.balanceOf(msg.sender) == beforeRecipient + amount, "Unsupported token");
        require(token.balanceOf(address(this)) >= accountedBalance, "Insolvent token");
        emit Withdrawal(msg.sender, amount);
    }

    function _resolve(uint256 id, address buyer, uint256 buyerBps) private {
        Order storage o = orders[id][buyer];
        require(o.state == OrderState.DISPUTED && block.timestamp < o.disputedAt + ARBITRATION_PERIOD, "Not arbitrable");
        ++o.verdictNonce;
        _settle(id, buyer, buyerBps);
    }

    function _settle(uint256 id, address buyer, uint256 buyerBps) private {
        require(buyerBps <= 10000, "Invalid split");
        Pool storage p = _pool(id);
        Order storage o = orders[id][buyer];
        uint256 liability = o.liability;
        require(p.state == State.CLEARED && liability > 0 && o.state != OrderState.SETTLED, "Already settled");
        o.liability = 0;
        o.state = OrderState.SETTLED;
        --p.openOrders;
        uint256 buyerAmount = liability * buyerBps / 10000;
        uint256 grossSupplier = liability - buyerAmount;
        uint256 fee = grossSupplier * p.terms.feeBps / 10000;
        credits[buyer] += buyerAmount;
        credits[p.winner] += grossSupplier - fee;
        credits[feeRecipient] += fee;
        if (p.openOrders == 0) p.state = State.COMPLETED;
        emit OrderSettled(id, buyer, buyerAmount, grossSupplier - fee, fee);
    }

    function _take(address from, uint256 amount) private {
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        require(token.balanceOf(address(this)) == beforeBalance + amount, "Unsupported token");
        accountedBalance += amount;
    }

    function _pool(uint256 id) private view returns (Pool storage p) {
        require(id > 0 && id <= poolCount, "Unknown pool");
        p = _pools[id];
    }
    function getPool(uint256 id) external view returns (Pool memory) { return _pool(id); }
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("HIVELOT"),keccak256("2"),block.chainid,address(this)));
    }
    function getBuyers(uint256 id) external view returns (address[] memory) { return _buyers[id]; }
    function getSuppliers(uint256 id) external view returns (address[] memory) { return _suppliers[id]; }
}
