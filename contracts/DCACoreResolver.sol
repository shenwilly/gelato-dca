// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import {IDCACore} from "./interfaces/IDCACore.sol";
import {IUniswapV2Router} from "./interfaces/IUniswapV2Router.sol";

contract DCACoreResolver {
    IDCACore public dcaCore;
    IUniswapV2Router public uniRouter;

    uint256 public maxSlippage = 50; // 0.5%
    address public owner;

    constructor(address _dcaCore, address _uniRouter) {
        dcaCore = IDCACore(_dcaCore);
        uniRouter = IUniswapV2Router(_uniRouter);
        owner = msg.sender;
    }

    function setMaxSlippage(uint256 _maxSlippage) public {
        require(msg.sender == owner && _maxSlippage <= 500); // sanity check max slippage under 5%
        maxSlippage = _maxSlippage;
    }

    function getExecutablePositions()
        external
        view
        returns (bool canExec, bytes memory execPayload)
    {
        uint256[] memory positionIds = dcaCore.getReadyPositionIds();
        IDCACore.Position[] memory positions = dcaCore.getPositions(
            positionIds
        );
        IDCACore.DCAExtraData[] memory extraDatas = new IDCACore.DCAExtraData[](
            positionIds.length
        );

        if (positions.length > 0) {
            canExec = true;
        }

        for (uint256 i = 0; i < positions.length; i++) {
            address[] memory path = new address[](2);
            path[0] = positions[i].tokenFund;
            path[1] = positions[i].tokenAsset;

            uint256[] memory amounts = uniRouter.getAmountsOut(
                positions[i].amountDCA,
                path
            );
            uint256 amountOutMin = amounts[1] -
                ((amounts[1] * maxSlippage) / 10_000);

            extraDatas[i].swapAmountOutMin = amountOutMin;
            extraDatas[i].swapPath = path;
        }

        execPayload = abi.encodeWithSelector(
            IDCACore.executeDCAs.selector,
            positionIds,
            extraDatas
        );
    }
}
