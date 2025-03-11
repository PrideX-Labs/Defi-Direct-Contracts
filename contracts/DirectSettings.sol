// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract DirectSettings is Ownable, Pausable {
    uint256 public constant MAX_FEE = 500;
    uint256 public spreadFeePercentage;
    mapping(address => bool) public supportedTokens;
    address transactionManager;
    address feeReceiver;
    address vaultAddress;


    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);
    event FeesWithdrawn(address indexed token, uint256 amount);


    constructor(uint256 _spreadFeePercentage, address _owner, address _transactionManager, address _feeReceiver, address _vaultAddress) Ownable(_owner) {
        require(_spreadFeePercentage <= MAX_FEE, "Fee too high");
        spreadFeePercentage = _spreadFeePercentage;
        transactionManager = _transactionManager;
        feeReceiver = _feeReceiver;
        vaultAddress = _vaultAddress;
    }

    function addSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = true;
        emit TokenAdded(token);
    }
    
    function removeSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = false;
        emit TokenRemoved(token);
    }
    
    function updateSpreadFee(uint256 newFee) external onlyOwner {
        require(newFee <= MAX_FEE, "Fee too high");
        spreadFeePercentage = newFee;
    }

    function setFeeReceiver(address _feeReceiver) external onlyOwner {
        require(_feeReceiver != address(0), "Invalid address");
        feeReceiver = _feeReceiver;
    }

    function setVaultAddress(address _vaultAddress) external onlyOwner {
        require(_vaultAddress != address(0), "Invalid address");
        vaultAddress = _vaultAddress;
    }

    function getFeeReceiver() external view onlyOwner returns (address) {
        return feeReceiver;
    }

    function getVaultAddress() external view onlyOwner returns (address) {
        return vaultAddress;
    }
    
    function setTokenManager(address _transactionManager) external onlyOwner {
        require(_transactionManager != address(0), "Invalid address");
        transactionManager = _transactionManager;
    }

    function getTokenManager() external view onlyOwner returns (address) {
        return transactionManager;
    }

    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
}