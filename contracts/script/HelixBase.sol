// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

/// @notice Shared helpers for HELIX exploit-forensics proof-of-concept tests.
///         Builds the structured JSON artifact consumed by the TypeScript backend.
abstract contract HelixBase is Test {
    /* ------------------------------------------------------------------ */
    /* primitive formatters                                              */
    /* ------------------------------------------------------------------ */

    function _u(uint256 v) internal view returns (string memory) {
        return vm.toString(v);
    }

    function _i(int256 v) internal view returns (string memory) {
        return vm.toString(v);
    }

    function _addr(address a) internal view returns (string memory) {
        return vm.toString(a);
    }

    /// @notice 32-byte hex string, e.g. "0x0000...0001".
    function _hex32(bytes32 b) internal pure returns (string memory) {
        bytes16 alphabet = "0123456789abcdef";
        bytes memory out = new bytes(66);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            uint8 v = uint8(b[i]);
            out[2 + i * 2] = alphabet[v >> 4];
            out[3 + i * 2] = alphabet[v & 0x0f];
        }
        return string(out);
    }

    /// @notice wei -> decimal ETH string with 18 decimals, trailing zeros trimmed ("10.0", "0.8").
    function _eth(uint256 weiAmount) internal view returns (string memory) {
        uint256 whole = weiAmount / 1e18;
        uint256 frac = weiAmount % 1e18;
        bytes memory fb = bytes(vm.toString(frac));
        bytes memory padded = new bytes(18);
        uint256 pad = 18 - fb.length;
        for (uint256 i = 0; i < pad; i++) padded[i] = 0x30;
        for (uint256 i = 0; i < fb.length; i++) padded[pad + i] = fb[i];
        uint256 len = 18;
        while (len > 1 && padded[len - 1] == 0x30) len--;
        bytes memory trimmed = new bytes(len);
        for (uint256 j = 0; j < len; j++) trimmed[j] = padded[j];
        return string.concat(vm.toString(whole), ".", string(trimmed));
    }

    function _join(string[] memory parts, uint256 n) internal pure returns (string memory out) {
        out = "";
        for (uint256 i = 0; i < n; i++) {
            if (i == 0) {
                out = parts[i];
            } else {
                out = string.concat(out, ",", parts[i]);
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* artifact entry builders                                            */
    /* ------------------------------------------------------------------ */

    function _step(uint256 n, string memory title, string memory desc, uint256 gasUsed, uint256 valueWei)
        internal
        view
        returns (string memory)
    {
        return string.concat(
            "{\"n\":",
            _u(n),
            ",\"title\":\"",
            title,
            "\",\"description\":\"",
            desc,
            "\",\"txHash\":\"0x0\",\"gasUsed\":",
            _u(gasUsed),
            ",\"valueWei\":\"",
            _u(valueWei),
            "\"}"
        );
    }

    function _bal(address who, string memory label, uint256 beforeWei, uint256 afterWei)
        internal
        view
        returns (string memory)
    {
        int256 delta = int256(afterWei) - int256(beforeWei);
        return string.concat(
            "{\"address\":\"",
            _addr(who),
            "\",\"label\":\"",
            label,
            "\",\"beforeWei\":\"",
            _u(beforeWei),
            "\",\"afterWei\":\"",
            _u(afterWei),
            "\",\"deltaWei\":\"",
            _i(delta),
            "\"}"
        );
    }

    function _sw(
        address c,
        string memory cname,
        bytes32 slot,
        string memory label,
        bytes32 before,
        bytes32 afterValue,
        string memory kind
    ) internal view returns (string memory) {
        return string.concat(
            "{\"contract\":\"",
            _addr(c),
            "\",\"contractName\":\"",
            cname,
            "\",\"slot\":\"",
            _hex32(slot),
            "\",\"label\":\"",
            label,
            "\",\"before\":\"",
            _hex32(before),
            "\",\"after\":\"",
            _hex32(afterValue),
            "\",\"kind\":\"",
            kind,
            "\"}"
        );
    }

    function _logJson(Vm.Log memory l, string memory name, string memory args) internal view returns (string memory) {
        return string.concat(
            "{\"contract\":\"", _addr(l.emitter), "\",\"name\":\"", name, "\",\"args\":\"", args, "\"}"
        );
    }

    /// @notice Match a captured write slot against a table of known slots.
    function _labelFor(
        bytes32 slot,
        bytes32[] memory knownSlots,
        string[] memory labels,
        string[] memory kinds
    ) internal pure returns (string memory l, string memory k) {
        for (uint256 i = 0; i < knownSlots.length; i++) {
            if (knownSlots[i] == slot) {
                return (labels[i], kinds[i]);
            }
        }
        return ("storage slot", "state");
    }

    /* ------------------------------------------------------------------ */
    /* artifact assembly                                                  */
    /* ------------------------------------------------------------------ */

    function _artifactDir() internal view returns (string memory) {
        return vm.envOr("HELIX_ARTIFACT_DIR", string("../artifacts"));
    }

    function _artifact(
        string memory scenario,
        string memory attackVector,
        string memory contractName,
        address target,
        address attacker,
        uint256 lossWei,
        string memory rootCause,
        string memory severity,
        string[] memory steps,
        string[] memory balances,
        string[] memory storageWrites,
        string[] memory logs
    ) internal view returns (string memory) {
        return string.concat(
            "{\"scenario\":\"",
            scenario,
            "\",\"attackVector\":\"",
            attackVector,
            "\",\"chain\":\"Ethereum\",\"contractName\":\"",
            contractName,
            "\",\"target\":\"",
            _addr(target),
            "\",\"attacker\":\"",
            _addr(attacker),
            "\",\"exploited\":true,\"lossWei\":\"",
            _u(lossWei),
            "\",\"lossEth\":\"",
            _eth(lossWei),
            "\",\"rootCause\":\"",
            rootCause,
            "\",\"severity\":\"",
            severity,
            "\",\"steps\":[",
            _join(steps, steps.length),
            "],\"balances\":[",
            _join(balances, balances.length),
            "],\"storageWrites\":[",
            _join(storageWrites, storageWrites.length),
            "],\"logs\":[",
            _join(logs, logs.length),
            "]}"
        );
    }

    function _writeArtifact(string memory scenario, string memory json) internal {
        vm.writeFile(string.concat(_artifactDir(), "/", scenario, ".json"), json);
    }
}
