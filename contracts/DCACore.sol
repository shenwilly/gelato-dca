// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IUniswapV2Router} from "./interfaces/IUniswapV2Router.sol";

contract DCACore is Ownable {
    using SafeERC20 for IERC20;

    struct Position {
        uint256 id;
        address owner;
        address tokenFund;
        address tokenAsset;
        uint256 amountFund;
        uint256 amountDCA;
        uint256 amountAsset;
        uint256 interval;
        bool active;
    }

    Position[] public positions;
    IUniswapV2Router public uniRouter;
    address public executor;
    mapping(address => bool) public allowedTokenFunds;
    mapping(address => bool) public allowedTokenAssets;
    mapping(address => mapping(address => bool)) public allowedPairs;

    modifier onlyExecutor() {
        require(msg.sender == executor);
        _;
    }

    constructor(address _uniRouter, address _executor) {
        uniRouter = IUniswapV2Router(_uniRouter);
        executor = _executor;
    }

    function createAndDepositFund(
        address _tokenFund,
        address _tokenAsset,
        uint256 _amountFund,
        uint256 _amountDCA,
        uint256 _interval
    ) external payable {
        require(allowedTokenFunds[_tokenFund]);
        require(allowedTokenFunds[_tokenAsset]);
        require(allowedPairs[_tokenFund][_tokenAsset]);
        require(_amountFund > 0 && _amountDCA > 0 && _interval >= 60);
        require(_amountFund % _amountDCA == 0);

        IERC20(_tokenFund).safeTransferFrom(
            msg.sender,
            address(this),
            _amountFund
        );

        Position memory position;

        position.id = positions.length;
        position.tokenFund = _tokenFund;
        position.tokenAsset = _tokenAsset;
        position.amountFund = _amountFund;
        position.amountDCA = _amountDCA;
        position.interval = _interval;

        positions.push(position);

        // emit created
    }

    function doDCA(uint256 _positionId, bytes memory _extraData)
        external
        onlyExecutor
    {
        (uint256 amountOutMin, address[] memory path) = abi.decode(
            _extraData,
            (uint256, address[])
        );

        Position storage position = positions[_positionId];
        require(position.amountFund >= position.amountDCA);
        position.amountFund = position.amountFund - position.amountDCA;

        uint256[] memory amounts = _swap(
            position.amountDCA,
            amountOutMin,
            path
        );
        position.amountAsset = position.amountAsset + amounts[1];
    }

    function setAllowedTokenFunds(address _token, bool _allowed)
        external
        onlyOwner
    {
        allowedTokenFunds[_token] = _allowed;
    }

    function setAllowedTokenAssets(address _token, bool _allowed)
        external
        onlyOwner
    {
        allowedTokenAssets[_token] = _allowed;
    }

    function setAllowedPair(
        address _tokenFund,
        address _tokenAsset,
        bool _allowed
    ) external onlyOwner {
        allowedPairs[_tokenFund][_tokenAsset] = _allowed;
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
                block.timestamp
            );
    }
}
