// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

interface IDCACore {
    struct Position {
        uint256 id;
        address owner;
        address tokenIn;
        address tokenOut;
        uint256 balanceIn;
        uint256 balanceOut;
        uint256 amountDCA;
        uint256 intervalDCA;
        uint256 lastDCA; //timestamp
    }

    struct DCAExtraData {
        // minimal swap output amount to prevent manipulation
        uint256 swapAmountOutMin;
        // swap path
        address[] swapPath;
    }

    event PositionCreated(
        uint256 indexed positionId,
        address indexed owner,
        address tokenIn,
        address tokenOut,
        uint256 amountDCA,
        uint256 intervalDCA
    );
    event PositionUpdated(
        uint256 indexed positionId,
        uint256 indexed amountDCA,
        uint256 indexed intervalDCA
    );
    event Deposit(uint256 indexed positionId, uint256 indexed amount);
    event WithdrawTokenIn(uint256 indexed positionId, uint256 indexed amount);
    event WithdrawTokenOut(uint256 indexed positionId, uint256 indexed amount);
    event ExecuteDCA(uint256 indexed positionId);
    event AllowedTokenPairSet(
        address indexed tokenIn,
        address indexed tokenOut,
        bool indexed allowed
    );
    event PausedSet(bool indexed paused);

    function executeDCA(uint256 _positionId, DCAExtraData calldata _extraData)
        external;

    function executeDCAs(
        uint256[] calldata _positionIds,
        DCAExtraData[] calldata _extraDatas
    ) external;

    function getReadyPositionIds() external view returns (uint256[] memory);

    function getPositions(uint256[] calldata positionIds)
        external
        view
        returns (Position[] memory);
}
