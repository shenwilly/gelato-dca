// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDCACore} from "./interfaces/IDCACore.sol";
import {IUniswapV2Router} from "./interfaces/IUniswapV2Router.sol";

contract DCACore is IDCACore, Ownable {
    using SafeERC20 for IERC20;

    Position[] public positions;
    IUniswapV2Router public uniRouter;
    address public executor;
    bool public paused;

    mapping(address => mapping(address => bool)) public allowedTokenPairs;

    modifier onlyExecutor() {
        require(msg.sender == executor, "Only Executor");
        _;
    }

    modifier notPaused() {
        require(!paused, "System is paused");
        _;
    }

    constructor(address _uniRouter, address _executor) {
        uniRouter = IUniswapV2Router(_uniRouter);
        executor = _executor;
        paused = false;
    }

    function createAndDepositFund(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _amountDCA,
        uint256 _intervalDCA
    ) external payable notPaused {
        require(allowedTokenPairs[_tokenIn][_tokenOut], "Pair not allowed");
        require(
            _amountIn > 0 && _amountDCA > 0 && _intervalDCA >= 60,
            "Invalid inputs"
        );
        require(_amountIn >= _amountDCA, "Deposit for at least 1 DCA");

        IERC20(_tokenIn).safeTransferFrom(msg.sender, address(this), _amountIn);

        Position memory position;
        position.id = positions.length;
        position.owner = msg.sender;
        position.tokenIn = _tokenIn;
        position.tokenOut = _tokenOut;
        position.balanceIn = _amountIn;
        position.amountDCA = _amountDCA;
        position.intervalDCA = _intervalDCA;

        positions.push(position);

        emit PositionCreated(
            position.id,
            msg.sender,
            _tokenIn,
            _tokenOut,
            _amountDCA,
            _intervalDCA
        );
        emit DepositFund(position.id, _amountIn);
    }

    function depositFund(uint256 _positionId, uint256 _amount)
        external
        payable
        notPaused
    {
        require(_amount > 0, "_amount must be > 0");
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner, "Sender must be owner");
        position.balanceIn = position.balanceIn + _amount;

        IERC20(position.tokenIn).safeTransferFrom(
            position.owner,
            address(this),
            _amount
        );

        emit DepositFund(_positionId, _amount);
    }

    function withdrawFund(uint256 _positionId, uint256 _amount) external {
        require(_amount > 0, "_amount must be > 0");
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner, "Sender must be owner");
        position.balanceIn = position.balanceIn - _amount;

        IERC20(position.tokenIn).safeTransfer(position.owner, _amount);

        emit WithdrawFund(_positionId, _amount);
    }

    function withdraw(uint256 _positionId) external {
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner, "Sender must be owner");
        require(position.balanceOut > 0, "DCA asset amount must be > 0");

        uint256 withdrawable = position.balanceOut;
        position.balanceOut = 0;

        IERC20(position.tokenOut).safeTransfer(position.owner, withdrawable);

        emit Withdraw(_positionId, withdrawable);
    }

    function executeDCA(uint256 _positionId, DCAExtraData calldata _extraData)
        public
        override
        onlyExecutor
        notPaused
    {
        Position storage position = positions[_positionId];

        (bool ready, string memory notReadyReason) = _checkReadyDCA(position);
        if (!ready) revert(notReadyReason);

        require(
            position.tokenIn == _extraData.swapPath[0] &&
                position.tokenOut ==
                _extraData.swapPath[_extraData.swapPath.length - 1],
            "Invalid swap path"
        );

        position.lastDCA = block.timestamp; // solhint-disable-line not-rely-on-time
        position.balanceIn = position.balanceIn - position.amountDCA;

        IERC20(position.tokenIn).approve(
            address(uniRouter),
            position.amountDCA
        );
        uint256[] memory amounts = _swap(
            position.amountDCA,
            _extraData.swapAmountOutMin,
            _extraData.swapPath
        );
        position.balanceOut = position.balanceOut + amounts[amounts.length - 1];

        emit ExecuteDCA(_positionId);
    }

    // 1. multiple DCAs over the same pair could cause unexpected slippage
    // 2. unbounded loop could cause gas limit revert
    function executeDCAs(
        uint256[] calldata _positionIds,
        DCAExtraData[] calldata _extraDatas
    ) public override {
        require(
            _positionIds.length == _extraDatas.length,
            "Params lengths must be equal"
        );
        for (uint256 i = 0; i < _positionIds.length; i++) {
            executeDCA(_positionIds[i], _extraDatas[i]);
        }
    }

    function setAllowedTokenPair(
        address _tokenIn,
        address _tokenOut,
        bool _allowed
    ) external onlyOwner {
        require(_tokenIn != _tokenOut, "Duplicate tokens");
        require(
            allowedTokenPairs[_tokenIn][_tokenOut] != _allowed,
            "Same _allowed value"
        );
        allowedTokenPairs[_tokenIn][_tokenOut] = _allowed;

        emit AllowedTokenPairSet(_tokenIn, _tokenOut, _allowed);
    }

    function setSystemPause(bool _paused) external onlyOwner {
        require(paused != _paused, "Same _paused value");
        paused = _paused;

        emit PausedSet(_paused);
    }

    function _checkReadyDCA(Position memory _position)
        internal
        view
        returns (bool, string memory)
    {
        /* solhint-disable-next-line not-rely-on-time */
        if ((_position.lastDCA + _position.intervalDCA) > block.timestamp) {
            return (false, "Not time to DCA");
        }

        if (_position.balanceIn < _position.amountDCA) {
            return (false, "Insufficient fund");
        }
        if (!allowedTokenPairs[_position.tokenIn][_position.tokenOut]) {
            return (false, "Token pair not allowed");
        }
        return (true, "");
    }

    function _swap(
        uint256 _amountIn,
        uint256 _amountOutMin,
        address[] memory _path
    ) internal returns (uint256[] memory amounts) {
        return
            IUniswapV2Router(uniRouter).swapExactTokensForTokens(
                _amountIn,
                _amountOutMin,
                _path,
                address(this),
                block.timestamp // solhint-disable-line not-rely-on-time,
            );
    }

    function getNextPositionId() external view returns (uint256) {
        return positions.length;
    }

    function getReadyPositionIds()
        external
        view
        override
        returns (uint256[] memory)
    {
        uint256 activePositionsLength;
        for (uint256 i = 0; i < positions.length; i++) {
            (bool ready, ) = _checkReadyDCA(positions[i]);
            if (ready) activePositionsLength++;
        }

        uint256 counter;
        uint256[] memory positionIds = new uint256[](activePositionsLength);
        for (uint256 i = 0; i < positions.length; i++) {
            (bool ready, ) = _checkReadyDCA(positions[i]);
            if (ready) {
                positionIds[counter] = positions[i].id;
                counter++;
            }
        }
        return positionIds;
    }

    function getPositions(uint256[] calldata positionIds)
        external
        view
        override
        returns (Position[] memory)
    {
        Position[] memory selectedPositions = new Position[](
            positionIds.length
        );
        for (uint256 i = 0; i < positionIds.length; i++) {
            selectedPositions[i] = positions[positionIds[i]];
        }
        return selectedPositions;
    }
}
