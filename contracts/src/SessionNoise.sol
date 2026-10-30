// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SessionNoise
 * @notice Benign counter/escrow contract whose only purpose is to generate
 *         filler traffic inside a long forensic session. Nothing here moves
 *         value; it exists so real activity is buried in mundane calls.
 */
contract SessionNoise {
    uint256 public counter;
    mapping(address => uint256) public touches;
    uint256 public lastPing;

    event Bump(address indexed who, uint256 next);
    event Ping(address indexed who, uint256 at);

    function bump(uint256 by) external returns (uint256) {
        counter += by;
        touches[msg.sender] += 1;
        emit Bump(msg.sender, counter);
        return counter;
    }

    function ping() external returns (uint256) {
        lastPing = block.number;
        touches[msg.sender] += 1;
        emit Ping(msg.sender, block.number);
        return lastPing;
    }

    function touchCount(address who) external view returns (uint256) {
        return touches[who];
    }
}
