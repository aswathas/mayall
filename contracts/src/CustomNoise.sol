// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CustomNoise
 * @notice Benign activity contracts for the Custom Attack Lab. They move no
 *         value; they exist so a simulated session contains normal traffic
 *         around the exploit and the trace has depth.
 */
contract CustomNoise {
    uint256 public counter;
    uint256 public lastTick;
    mapping(address => uint256) public touches;

    event Tick(address indexed who, uint256 counter);
    event Ping(address indexed who, uint256 at);

    function tick(uint256 by) external returns (uint256) {
        counter += by;
        touches[msg.sender] += 1;
        lastTick = block.number;
        emit Tick(msg.sender, counter);
        return counter;
    }

    function ping() external returns (uint256) {
        lastTick = block.number;
        touches[msg.sender] += 1;
        emit Ping(msg.sender, block.number);
        return lastTick;
    }

    function touchCount(address who) external view returns (uint256) {
        return touches[who];
    }
}

/**
 * @title CustomNoiseDesk
 * @notice A second benign contract that calls CustomNoise, producing two levels
 *         of call depth per noise burst.
 */
contract CustomNoiseDesk {
    CustomNoise public immutable noise;
    uint256 public brushes;

    constructor(CustomNoise noiseContract) {
        noise = noiseContract;
    }

    function brush(uint256 seed) external returns (uint256) {
        brushes += 1;
        noise.tick(seed + brushes);
        noise.ping();
        return noise.touchCount(address(this));
    }
}
