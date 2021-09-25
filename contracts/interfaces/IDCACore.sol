// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

interface IDCACore {
    struct Position {
        uint256 id;
        address owner;
        address tokenFund;
        address tokenAsset;
        uint256 amountFund;
        uint256 amountDCA;
        uint256 amountAsset;
        uint256 interval;
    }

    event PositionCreated(
        uint256 indexed positionId,
        address indexed owner,
        address tokenFund,
        address tokenAsset,
        uint256 amountDCA,
        uint256 interval
    );
    event DepositFund(uint256 indexed positionId, uint256 indexed amount);
    event WithdrawFund(uint256 indexed positionId, uint256 indexed amount);
    event Withdraw(uint256 indexed positionId, uint256 indexed amount);
    event ExecuteDCA(uint256 indexed positionId);

    event AllowedTokenFundSet(address indexed token, bool indexed allowed);
    event AllowedTokenAssetSet(address indexed token, bool indexed allowed);
    event AllowedPairSet(
        address indexed tokenFund,
        address indexed tokenAsset,
        bool indexed allowed
    );
    event PausedSet(bool indexed paused);

    function executeDCA(uint256 _positionId, bytes memory _extraData) external;
}
