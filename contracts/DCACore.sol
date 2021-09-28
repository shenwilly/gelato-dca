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

    mapping(address => bool) public allowedTokenFunds;
    mapping(address => bool) public allowedTokenAssets;
    mapping(address => mapping(address => bool)) public allowedPairs;

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
        address _tokenFund,
        address _tokenAsset,
        uint256 _amountFund,
        uint256 _amountDCA,
        uint256 _interval
    ) external payable notPaused {
        require(allowedTokenFunds[_tokenFund], "_tokenFund not allowed");
        require(allowedTokenAssets[_tokenAsset], "_tokenAsset not allowed");
        require(allowedPairs[_tokenFund][_tokenAsset], "Pair not allowed");
        require(
            _amountFund > 0 && _amountDCA > 0 && _interval >= 60,
            "Invalid inputs"
        );
        require(_amountFund % _amountDCA == 0, "Improper DCA amount");

        IERC20(_tokenFund).safeTransferFrom(
            msg.sender,
            address(this),
            _amountFund
        );

        Position memory position;
        position.id = positions.length;
        position.owner = msg.sender;
        position.tokenFund = _tokenFund;
        position.tokenAsset = _tokenAsset;
        position.amountFund = _amountFund;
        position.amountDCA = _amountDCA;
        position.interval = _interval;

        positions.push(position);

        emit PositionCreated(
            position.id,
            msg.sender,
            _tokenFund,
            _tokenAsset,
            _amountDCA,
            _interval
        );
        emit DepositFund(position.id, _amountFund);
    }

    function depositFund(uint256 _positionId, uint256 _amount)
        external
        payable
        notPaused
    {
        require(_amount > 0, "_amount must be > 0");
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner, "Sender must be owner");
        position.amountFund = position.amountFund + _amount;
        require(
            position.amountFund % position.amountDCA == 0,
            "Improper amountFund"
        );

        IERC20(position.tokenFund).safeTransferFrom(
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
        position.amountFund = position.amountFund - _amount;
        require(
            position.amountFund % position.amountDCA == 0,
            "Improper amountFund"
        );

        IERC20(position.tokenFund).safeTransfer(position.owner, _amount);

        emit WithdrawFund(_positionId, _amount);
    }

    function withdraw(uint256 _positionId) external {
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner, "Sender must be owner");
        require(position.amountAsset > 0, "DCA asset amount must be > 0");

        uint256 withdrawable = position.amountAsset;
        position.amountAsset = 0;

        IERC20(position.tokenAsset).safeTransfer(position.owner, withdrawable);

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
            position.tokenFund == _extraData.swapPath[0] &&
                position.tokenAsset == _extraData.swapPath[1],
            "Invalid swap path"
        );

        position.lastDCA = block.timestamp; // solhint-disable-line not-rely-on-time
        position.amountFund = position.amountFund - position.amountDCA;

        IERC20(position.tokenFund).approve(
            address(uniRouter),
            position.amountDCA
        );
        uint256[] memory amounts = _swap(
            position.amountDCA,
            _extraData.swapAmountOutMin,
            _extraData.swapPath
        );
        position.amountAsset = position.amountAsset + amounts[1];

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

    function setAllowedTokenFund(address _token, bool _allowed)
        external
        onlyOwner
    {
        require(allowedTokenFunds[_token] != _allowed, "Same _allowed value");
        allowedTokenFunds[_token] = _allowed;

        emit AllowedTokenFundSet(_token, _allowed);
    }

    function setAllowedTokenAsset(address _token, bool _allowed)
        external
        onlyOwner
    {
        require(allowedTokenAssets[_token] != _allowed, "Same _allowed value");
        allowedTokenAssets[_token] = _allowed;

        emit AllowedTokenAssetSet(_token, _allowed);
    }

    function setAllowedPair(
        address _tokenFund,
        address _tokenAsset,
        bool _allowed
    ) external onlyOwner {
        require(_tokenFund != _tokenAsset, "Duplicate tokens");
        require(
            allowedPairs[_tokenFund][_tokenAsset] != _allowed,
            "Same _allowed value"
        );
        allowedPairs[_tokenFund][_tokenAsset] = _allowed;

        emit AllowedPairSet(_tokenFund, _tokenAsset, _allowed);
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
        if ((_position.lastDCA + _position.interval) > block.timestamp) {
            return (false, "Not time to DCA");
        }

        if (_position.amountFund < _position.amountDCA) {
            return (false, "Insufficient fund");
        }
        if (!allowedPairs[_position.tokenFund][_position.tokenAsset]) {
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
