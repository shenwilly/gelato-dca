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
    }

    Position[] public positions;
    IUniswapV2Router public uniRouter;
    address public executor;
    bool public paused;

    mapping(address => bool) public allowedTokenFunds;
    mapping(address => bool) public allowedTokenAssets;
    mapping(address => mapping(address => bool)) public allowedPairs;

    modifier onlyExecutor() {
        require(msg.sender == executor);
        _;
    }

    modifier notPaused() {
        require(!paused);
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

    function depositFund(uint256 _positionId, uint256 _amount)
        external
        payable
        notPaused
    {
        require(_amount > 0);
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner);
        position.amountFund = position.amountFund + _amount;
        require(position.amountFund % position.amountDCA == 0);

        IERC20(position.tokenFund).safeTransferFrom(
            position.owner,
            address(this),
            _amount
        );
        // emit event
    }

    function withdrawFund(uint256 _positionId, uint256 _amount) external {
        require(_amount > 0);
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner);
        position.amountFund = position.amountFund - _amount;
        require(position.amountFund % position.amountDCA == 0);

        IERC20(position.tokenFund).safeTransfer(position.owner, _amount);
        // emit event
    }

    function withdraw(uint256 _positionId) external {
        Position storage position = positions[_positionId];
        require(msg.sender == position.owner);
        require(position.amountAsset > 0);

        uint256 withdrawable = position.amountAsset;
        position.amountAsset = 0;

        IERC20(position.tokenAsset).safeTransfer(position.owner, withdrawable);
        // emit event
    }

    function doDCA(uint256 _positionId, bytes memory _extraData)
        external
        onlyExecutor
        notPaused
    {
        (uint256 amountOutMin, address[] memory path) = abi.decode(
            _extraData,
            (uint256, address[])
        );

        Position storage position = positions[_positionId];
        require(position.amountFund >= position.amountDCA);
        position.amountFund = position.amountFund - position.amountDCA;

        require(allowedPairs[position.tokenFund][position.tokenAsset]);
        uint256[] memory amounts = _swap(
            position.amountDCA,
            amountOutMin,
            path
        );
        position.amountAsset = position.amountAsset + amounts[1];

        // emit event
    }

    function setAllowedTokenFunds(address _token, bool _allowed)
        external
        onlyOwner
    {
        require(allowedTokenFunds[_token] != _allowed);
        allowedTokenFunds[_token] = _allowed;
        // emit event
    }

    function setAllowedTokenAssets(address _token, bool _allowed)
        external
        onlyOwner
    {
        require(allowedTokenAssets[_token] != _allowed);
        allowedTokenAssets[_token] = _allowed;
        // emit event
    }

    function setAllowedPair(
        address _tokenFund,
        address _tokenAsset,
        bool _allowed
    ) external onlyOwner {
        require(allowedPairs[_tokenFund][_tokenAsset] != _allowed);
        allowedPairs[_tokenFund][_tokenAsset] = _allowed;
        // emit event
    }

    function setSystemPause(bool _paused) external onlyOwner {
        require(paused != _paused);
        paused = _paused;
        //    emit event
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

    function getActivePositionIds() external view returns (uint256[] memory) {
        uint256 activePositionsLength;
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].amountFund > 0) {
                activePositionsLength++;
            }
        }

        uint256 counter;
        uint256[] memory positionIds = new uint256[](activePositionsLength);
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i].amountFund > 0) {
                positionIds[counter] = positions[i].id;
                counter++;
            }
        }
        return positionIds;
    }

    function getPositions(uint256[] calldata positionIds)
        external
        view
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
