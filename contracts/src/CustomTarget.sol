// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CustomTarget
 * @notice A single, deliberately vulnerable vault used by the Mayall Custom
 *         Attack Lab. Behaviour is switched by the `Family` enum so one Foundry
 *         test can drive every attack family against the same contract:
 *
 *   Reentrancy          withdraw() pays before zeroing the balance
 *   AccessControl       setOwner() is unguarded; drain() trusts tx.origin
 *   OracleManipulation  collateral is priced from spot reserves, no TWAP
 *   FlashLoan           flashLoan() never verifies settlement
 *   Delegatecall        execute() delegatecalls an unvetted implementation
 *   Selfdestruct        destroy() forwards the whole balance to the caller
 *
 * This is a teaching target for a LOCAL simulation. It is not a template for
 * production code and it is not a reproduction of any mainnet deployment.
 */
contract CustomTarget {
    enum Family {
        Reentrancy,
        AccessControl,
        OracleManipulation,
        FlashLoan,
        Delegatecall,
        Selfdestruct
    }

    /* ─────────────────────────── storage ─────────────────────────── */

    /// @dev slot 0 — privileged identity. Deliberately mutable without auth.
    address public owner;
    /// @dev slot 1 — which vulnerability the instance currently exposes.
    Family public family;
    /// @dev slot 2 — depositor ledger used by the re-entrancy path.
    mapping(address => uint256) public balances;
    /// @dev slot 3 — accounting total, mutated after the external call.
    uint256 public totalDeposited;
    /// @dev slot 4 — ETH side of the spot pool used as a price source.
    uint256 public poolEth;
    /// @dev slot 5 — token side of the spot pool.
    uint256 public poolToken;
    /// @dev slot 6 — collateral credited to a borrower, in token units.
    mapping(address => uint256) public collateral;
    /// @dev slot 7 — outstanding debt, in wei.
    mapping(address => uint256) public debt;
    /// @dev slot 8 — implementation used by the delegatecall path.
    address public implementation;
    /// @dev slot 9 — flash-loan counter.
    uint256 public flashNonce;

    /* ─────────────────────────── events ─────────────────────────── */

    event Deposited(address indexed who, uint256 amount);
    event Withdrawn(address indexed who, uint256 amount);
    event OwnerChanged(address indexed previous, address indexed next);
    event Drained(address indexed who, uint256 amount);
    event PoolPumped(address indexed who, uint256 paid, uint256 poolEthAfter, uint256 poolTokenAfter);
    event Borrowed(address indexed who, uint256 amount, uint256 collateralValue);
    event FlashSettled(address indexed who, uint256 amount, uint256 balanceBefore, uint256 balanceAfter);
    event ImplementationSet(address indexed previous, address indexed next);
    event Destroyed(address indexed who, uint256 balance);

    constructor() {
        owner = msg.sender;
    }

    /* ─────────────────────── configuration ─────────────────────── */

    /// @notice Selects which vulnerability this instance exposes.
    function setFamily(Family next) external {
        family = next;
    }

    /* ───────────────────── reentrancy vault ───────────────────── */

    function deposit() external payable {
        require(msg.value > 0, "zero deposit");
        balances[msg.sender] += msg.value;
        totalDeposited += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @dev VULNERABLE: the external call precedes the state update, so a
    ///      contract receiver can re-enter while its balance still reads full.
    function withdraw() external {
        require(family == Family.Reentrancy, "family: reentrancy");
        uint256 bal = balances[msg.sender];
        require(bal > 0, "nothing to withdraw");

        (bool ok,) = msg.sender.call{value: bal}("");
        require(ok, "payout failed");

        balances[msg.sender] = 0;
        if (totalDeposited >= bal) {
            totalDeposited -= bal;
        }
        emit Withdrawn(msg.sender, bal);
    }

    /* ───────────────────── access control ───────────────────── */

    /// @dev VULNERABLE: no authorisation at all. Any caller can transfer the
    ///      owner role — the "predictable, compromisable owner".
    function setOwner(address next) external {
        require(family == Family.AccessControl || family == Family.Selfdestruct, "family: access control");
        address previous = owner;
        owner = next;
        emit OwnerChanged(previous, next);
    }

    /// @dev VULNERABLE: identity is checked with tx.origin, so a phishing
    ///      contract invoked by the real owner satisfies the check while the
    ///      payout goes to the attacker.
    function drain(uint256 amount) external {
        require(family == Family.AccessControl, "family: access control");
        require(msg.sender == owner || tx.origin == owner, "not owner");

        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "payout failed");
        emit Drained(msg.sender, amount);
    }

    /* ───────────────────── oracle manipulation ───────────────────── */

    function seedPool(uint256 tokens) external payable {
        require(msg.value > 0, "eth required");
        poolEth += msg.value;
        poolToken += tokens;
    }

    /// @notice ETH per collateral token, 18 decimals, derived from spot
    ///         reserves. No TWAP window and no deviation bound.
    function spotPrice() public view returns (uint256) {
        if (poolToken == 0) return 0;
        return (poolEth * 1e18) / poolToken;
    }

    /// @dev The caller is assumed to already hold the tokens; custody is
    ///      simplified to a credit so the price path can be inspected alone.
    function postCollateral(uint256 tokens) external {
        require(family == Family.OracleManipulation, "family: oracle");
        collateral[msg.sender] += tokens;
    }

    /// @dev VULNERABLE: plain ETH moves the spot reserve instantly.
    function pump() external payable {
        require(family == Family.OracleManipulation, "family: oracle");
        require(msg.value > 0, "pump needs value");
        poolEth += msg.value;
        emit PoolPumped(msg.sender, msg.value, poolEth, poolToken);
    }

    function borrow(uint256 amount) external {
        require(family == Family.OracleManipulation, "family: oracle");
        uint256 value = (collateral[msg.sender] * spotPrice()) / 1e18;
        uint256 limit = (value * 80) / 100;
        require(debt[msg.sender] + amount <= limit, "over borrow limit");

        debt[msg.sender] += amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "payout failed");
        emit Borrowed(msg.sender, amount, value);
    }

    /* ───────────────────── flash loan ───────────────────── */

    /// @dev VULNERABLE: the pool hands out the balance and never checks that
    ///      the borrower returned it. There is no settlement assertion.
    function flashLoan(uint256 amount, address borrower) external {
        require(family == Family.FlashLoan, "family: flash loan");
        require(amount <= address(this).balance, "insufficient liquidity");

        uint256 before = address(this).balance;
        (bool sent,) = borrower.call{value: amount}("");
        require(sent, "transfer failed");

        IFlashBorrower(borrower).onFlashLoan(amount);

        flashNonce += 1;
        emit FlashSettled(borrower, amount, before, address(this).balance);
    }

    /* ───────────────────── delegatecall injection ───────────────────── */

    /// @dev VULNERABLE: the implementation is caller-supplied and unvalidated.
    function upgradeTo(address next) external {
        require(family == Family.Delegatecall, "family: delegatecall");
        address previous = implementation;
        implementation = next;
        emit ImplementationSet(previous, next);
    }

    function execute(bytes calldata data) external {
        require(family == Family.Delegatecall, "family: delegatecall");
        address impl = implementation;
        require(impl != address(0), "no implementation");

        (bool ok,) = impl.delegatecall(data);
        require(ok, "delegatecall failed");
    }

    /* ───────────────────── selfdestruct ───────────────────── */

    /// @dev VULNERABLE: reachable after the unguarded setOwner(), and it
    ///      force-transfers the whole balance to the caller.
    function destroy() external {
        require(family == Family.Selfdestruct, "family: selfdestruct");
        require(msg.sender == owner || tx.origin == owner, "not owner");

        uint256 bal = address(this).balance;
        emit Destroyed(msg.sender, bal);
        selfdestruct(payable(msg.sender));
    }
}

interface IFlashBorrower {
    function onFlashLoan(uint256 amount) external;
}

/**
 * @title CustomImplementation
 * @notice Attacker-authored implementation used by the delegatecall path.
 *         When executed by delegatecall it runs in the target's context, so
 *         `to.call` spends the target's balance.
 */
contract CustomImplementation {
    function sweep(address payable to, uint256 amount) external {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "sweep failed");
    }

    receive() external payable {}
}
