// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExploitBase} from "./ExploitBase.t.sol";
import {SessionVault, SessionAttacker} from "../src/SessionVault.sol";
import {SessionNoise} from "../src/SessionNoise.sol";

/**
 * @title LongSessionTest
 * @notice A 200-transaction haystack. The test drives a long run of benign
 *         vault traffic (deposits, withdrawals, noise calls, plain transfers)
 *         and hides one real re-entrancy drain at a configurable index.
 *
 *         The session length and attack position are configurable through
 *         HELIX_TX_COUNT and HELIX_ATTACK_INDEX so the CLI can drive them.
 *         The artifact carries the normal scenario schema plus "txCount" and
 *         "attackTxIndex", which is what lets the analyser isolate the attack.
 */
contract LongSessionTest is ExploitBase {
    uint256 internal constant DEFAULT_TX_COUNT = 200;
    uint256 internal constant DEFAULT_ATTACK_INDEX = 137;
    uint256 internal constant ATTACK_DEPTH = 6;

    function testExploit() public {
        uint256 txCount = vm.envOr("HELIX_TX_COUNT", DEFAULT_TX_COUNT);
        uint256 attackIndex = vm.envOr("HELIX_ATTACK_INDEX", DEFAULT_ATTACK_INDEX);
        require(txCount > 0, "empty session");
        require(attackIndex < txCount, "attack index outside session");

        // ── setup (all through cheatcodes: none of this is a transaction) ──
        SessionVault vault = new SessionVault();
        SessionNoise noise = new SessionNoise();
        SessionAttacker attacker = new SessionAttacker(vault);

        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        address carol = makeAddr("carol");

        vm.deal(address(this), 5000 ether);
        vm.deal(address(attacker), 1 ether);
        vm.deal(address(vault), 900 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);

        vm.label(address(vault), "SessionVault");
        vm.label(address(noise), "SessionNoise");
        vm.label(address(attacker), "SessionAttacker");

        // ── evidence captured at the attack index ─────────────────────────
        uint256 vaultBefore;
        uint256 vaultAfter;
        uint256 attackerBefore;
        uint256 attackerAfter;
        uint256 snap;
        bytes32[] memory writeSlots = new bytes32[](0);
        bytes32[] memory afterValues = new bytes32[](0);

        // ── the session ───────────────────────────────────────────────────
        for (uint256 i; i < txCount; i++) {
            if (i == attackIndex) {
                vaultBefore = address(vault).balance;
                attackerBefore = address(attacker).balance;

                snap = vm.snapshot();
                vm.record();
                attacker.attack(ATTACK_DEPTH);

                (, bytes32[] memory rawSlots) = vm.accesses(address(vault));
                writeSlots = dedupeSlots(rawSlots);
                afterValues = readAfter(address(vault), writeSlots);

                vaultAfter = address(vault).balance;
                attackerAfter = address(attacker).balance;

                vm.revertTo(snap);
                continue;
            }

            if (i % 6 == 0) {
                vault.deposit{value: 0.1 ether}();
            } else if (i % 6 == 1) {
                vm.prank(alice);
                vault.deposit{value: 0.2 ether}();
            } else if (i % 6 == 2) {
                vm.prank(bob);
                vault.deposit{value: 0.15 ether}();
            } else if (i % 6 == 3) {
                vm.prank(alice);
                vault.withdraw();
            } else if (i % 6 == 4) {
                noise.bump(1);
            } else {
                (bool ok,) = payable(carol).call{value: 0.01 ether}("");
                require(ok, "transfer failed");
            }
        }

        // ── the attack must have really drained value ─────────────────────
        require(writeSlots.length > 0, "no storage writes captured at the attack index");
        uint256 vaultDrop = vaultBefore - vaultAfter;
        uint256 netGain = attackerAfter - attackerBefore;
        assertGt(vaultDrop, 0, "vault must lose funds");
        assertEq(netGain, vaultDrop, "everything the vault lost must arrive at the attacker");
        assertGe(vaultDrop, 6 ether, "re-entrancy must drain the victim depositors");
        assertGt(vaultAfter, 0, "vault should not be fully drained");

        // ── evidence (read the pre-attack values from the snapshot) ──────
        bytes32[] memory beforeValues = readBefore(address(vault), writeSlots);
        SlotWrite[] memory writes = new SlotWrite[](writeSlots.length);
        string[] memory labels = new string[](writeSlots.length);
        string[] memory kinds = new string[](writeSlots.length);
        uint256 changed;
        for (uint256 i; i < writeSlots.length; i++) {
            writes[i] = SlotWrite(writeSlots[i], beforeValues[i], afterValues[i]);
            labels[i] = slotLabel(i);
            kinds[i] = slotKind(i);
            if (beforeValues[i] != afterValues[i]) changed++;
        }
        assertGt(changed, 0, "at least one storage slot must be mutated");

        string[] memory titles = new string[](3);
        string[] memory descriptions = new string[](3);
        uint256[] memory gasUsed = new uint256[](3);
        uint256[] memory values = new uint256[](3);

        titles[0] = "Attacker deposits seed capital";
        descriptions[0] = string.concat(
            "Transaction ",
            u(attackIndex),
            " of ",
            u(txCount),
            " in the session: the attacker contract deposits 1 ETH into the vault to open a withdrawable balance."
        );
        gasUsed[0] = 60000;
        values[0] = 1 ether;

        titles[1] = "Re-entrant withdraw loop";
        descriptions[1] =
            "The attacker calls withdraw(). The vault sends ETH before decrementing balances, so receive() re-enters withdraw() six times inside the same transaction.";
        gasUsed[1] = 420000;
        values[1] = 0;

        titles[2] = "Victim funds drained";
        descriptions[2] =
            "Each re-entrant call passes the same balance check because the state update happens only after the external call returns. The vault pays the same balance out seven times.";
        gasUsed[2] = 900000;
        values[2] = 0;

        address[] memory balAddrs = new address[](3);
        string[] memory balLabels = new string[](3);
        uint256[] memory balBefore = new uint256[](3);
        uint256[] memory balAfter = new uint256[](3);

        balAddrs[0] = address(vault);
        balLabels[0] = "SessionVault";
        balBefore[0] = vaultBefore;
        balAfter[0] = vaultAfter;

        balAddrs[1] = address(attacker);
        balLabels[1] = "SessionAttacker";
        balBefore[1] = attackerBefore;
        balAfter[1] = attackerAfter;

        balAddrs[2] = address(this);
        balLabels[2] = "Session runner";
        balBefore[2] = address(this).balance;
        balAfter[2] = address(this).balance;

        string[] memory logNames = new string[](2);
        string[] memory logArgs = new string[](2);
        logNames[0] = "Deposit";
        logArgs[0] = string.concat("who=", vm.toString(address(attacker)), " amount=", u(1 ether));
        logNames[1] = "Withdrawal";
        logArgs[1] = string.concat("who=", vm.toString(address(attacker)), " amount=", u(1 ether), " repeated=7");

        string memory json = artifactJson(
            "long-session",
            "Reentrancy",
            "Ethereum",
            "SessionVault",
            vm.toString(address(vault)),
            vm.toString(address(attacker)),
            true,
            vaultDrop,
            string.concat(
                "withdraw() transfers ETH to msg.sender before zeroing balances[msg.sender]. Inside a ",
                u(txCount),
                "-transaction session the flaw was exercised at transaction index ",
                u(attackIndex),
                ", where a malicious receiver re-entered withdraw() and drained the vault in one transaction."
            ),
            "critical",
            buildStepsJson(titles, descriptions, gasUsed, values),
            buildBalancesJson(balAddrs, balLabels, balBefore, balAfter),
            buildStorageJson(vm.toString(address(vault)), "SessionVault", writes, labels, kinds),
            buildLogsJson(logNames, logArgs)
        );

        writeArtifact("long-session", withSessionMeta(json, txCount, attackIndex));
    }

    /// @dev Injects the session metadata into the artifact object.
    function withSessionMeta(string memory json, uint256 txCount, uint256 attackIndex)
        internal
        pure
        returns (string memory)
    {
        bytes memory b = bytes(json);
        bytes memory rest = new bytes(b.length - 1);
        for (uint256 i = 1; i < b.length; i++) rest[i - 1] = b[i];
        return string.concat(
            '{"txCount":',
            u(txCount),
            ',"attackTxIndex":',
            u(attackIndex),
            ",",
            string(rest)
        );
    }

    function slotLabel(uint256 i) internal pure returns (string memory) {
        if (i == 0) return "balances[attacker]";
        if (i == 1) return "totalDeposited";
        if (i == 2) return "totalWithdrawn";
        return string.concat("vault.state.slot", u(i));
    }

    function slotKind(uint256 i) internal pure returns (string memory) {
        if (i == 0) return "balance";
        if (i == 2) return "state";
        return "state";
    }
}
