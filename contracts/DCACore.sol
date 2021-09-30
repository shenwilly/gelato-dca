// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDCACore} from "./interfaces/IDCACore.sol";
import {IUniswapV2Router} from "./interfaces/IUniswapV2Router.sol";
import {IWETH} from "./external/IWETH.sol";

contract DCACore is IDCACore, Ownable {
    using SafeERC20 for IERC20;

    Position[] public positions;
    IUniswapV2Router public uniRouter;
    address public executor;

    bool public paused;
    mapping(address => mapping(address => bool)) public allowedTokenPairs;
    uint256 public minSlippage = 25; // 0.25%

    address public constant ETH_TOKEN =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address public immutable weth;

    modifier onlyExecutor() {
        require(msg.sender == executor, "Only Executor");
        _;
    }

    modifier notPaused() {
        require(!paused, "System is paused");
        _;
    }

    receive() external payable {} // solhint-disable-line no-empty-blocks

    constructor(
        address _uniRouter,
        address _executor,
        address _weth
    ) {
        uniRouter = IUniswapV2Router(_uniRouter);
        executor = _executor;
        weth = _weth;
        paused = false;
    }

    function createPositionAndDeposit(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn,
        uint256 _amountDCA,
        uint256 _intervalDCA,
        uint256 _maxSlippage
    ) external payable notPaused {
        uint256 amountIn;
        address tokenIn;
        if (_tokenIn == ETH_TOKEN) {
            tokenIn = weth;
            IWETH(weth).deposit{value: msg.value}();
            amountIn = msg.value;
        } else {
            IERC20(_tokenIn).safeTransferFrom(
                msg.sender,
                address(this),
                _amountIn
            );
            amountIn = _amountIn;
        }

        require(allowedTokenPairs[tokenIn][_tokenOut], "Pair not allowed");
        require(
            amountIn > 0 &&
                _amountDCA > 0 &&
                _intervalDCA >= 60 &&
                _maxSlippage >= minSlippage,
            "Invalid inputs"
        );
        require(amountIn >= _amountDCA, "Deposit for at least 1 DCA");

        Position memory position;
        position.id = positions.length;
        position.owner = msg.sender;
        position.tokenIn = tokenIn;
        position.tokenOut = _tokenOut;
        position.balanceIn = amountIn;
        position.amountDCA = _amountDCA;
        position.intervalDCA = _intervalDCA;
        position.maxSlippage = _maxSlippage;

        positions.push(position);

        emit PositionCreated(
            position.id,
            msg.sender,
            _tokenIn,
            _tokenOut,
            _amountDCA,
            _intervalDCA,
            _maxSlippage
        );
        emit Deposit(position.id, _amountIn);
    }

    function updatePosition(
        uint256 _positionId,
        uint256 _amountDCA,
        uint256 _intervalDCA
    ) external {
        require(_amountDCA > 0 && _intervalDCA >= 60, "Invalid inputs");
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner, "Sender must be owner");
        position.amountDCA = _amountDCA;
        position.intervalDCA = _intervalDCA;

        emit PositionUpdated(_positionId, _amountDCA, _intervalDCA);
    }

    function deposit(uint256 _positionId, uint256 _amount) external notPaused {
        require(_amount > 0, "deposit amount must be > 0");
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner, "Sender must be owner");

        position.balanceIn = position.balanceIn + _amount;

        IERC20(position.tokenIn).safeTransferFrom(
            position.owner,
            address(this),
            _amount
        );

        emit Deposit(_positionId, _amount);
    }

    function depositETH(uint256 _positionId) external payable notPaused {
        require(msg.value > 0, "deposit amount must be > 0");
        IWETH(weth).deposit{value: msg.value}();

        Position storage position = positions[_positionId];
        require(msg.sender == position.owner, "Sender must be owner");
        require(position.tokenIn == weth, "tokenIn must be WETH");

        position.balanceIn = position.balanceIn + msg.value;

        emit Deposit(_positionId, msg.value);
    }

    function withdrawTokenIn(uint256 _positionId, uint256 _amount) public {
        require(_amount > 0, "_amount must be > 0");
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner, "Sender must be owner");

        position.balanceIn = position.balanceIn - _amount;
        _transfer(payable(position.owner), position.tokenIn, _amount);

        emit WithdrawTokenIn(_positionId, _amount);
    }

    function withdrawTokenOut(uint256 _positionId) public {
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner, "Sender must be owner");
        require(position.balanceOut > 0, "DCA asset amount must be > 0");

        uint256 withdrawable = position.balanceOut;
        position.balanceOut = 0;
        _transfer(payable(position.owner), position.tokenOut, withdrawable);

        emit WithdrawTokenOut(_positionId, withdrawable);
    }

    function exit(uint256 _positionId) public {
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner, "Sender must be owner");

        if (position.balanceIn > 0) {
            uint256 withdrawableTokenIn = position.balanceIn;
            position.balanceIn = 0;

            _transfer(
                payable(position.owner),
                position.tokenIn,
                withdrawableTokenIn
            );
            emit WithdrawTokenIn(_positionId, withdrawableTokenIn);
        }

        if (position.balanceOut > 0) {
            uint256 withdrawableTokenOut = position.balanceOut;
            position.balanceOut = 0;

            _transfer(
                payable(position.owner),
                position.tokenOut,
                withdrawableTokenOut
            );
            emit WithdrawTokenOut(_positionId, withdrawableTokenOut);
        }
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

        uint256 amountOutMin = _extraData.swapAmountOutMin -
            ((_extraData.swapAmountOutMin * position.maxSlippage) / 10_000);
        uint256[] memory amounts = _swap(
            position.amountDCA,
            amountOutMin,
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

    function setMinSlippage(uint256 _minSlippage) external onlyOwner {
        require(minSlippage != _minSlippage, "Same slippage value");
        require(_minSlippage <= 1000, "Min slippage too large"); // sanity check max slippage under 10%
        minSlippage = _minSlippage;

        emit MinSlippageSet(_minSlippage);
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

    function _transfer(
        address payable _to,
        address _token,
        uint256 _amount
    ) internal {
        if (_token == weth) {
            // solhint-disable-next-line avoid-low-level-calls,
            (bool success, ) = _to.call{value: _amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(_token).safeTransfer(_to, _amount);
        }
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
