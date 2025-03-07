// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./DirectSettings.sol";

contract FiatBridge is DirectSettings, ReentrancyGuard {

    
    struct Transaction {
        address user;           
        address token;
        uint256 amount;
        uint256 amountSpent;   
        uint256 transactionFee;
        uint256 transactionTimestamp;
        bool isCompleted;
        bool isRefunded;        
    }

    
    mapping(bytes32 => Transaction) public transactions;
    mapping(address => bytes32[]) public userTransactionIds;
    mapping(address => uint256) public collectedFees;
    
    
    event TransactionInitiated(bytes32 indexed txId, address indexed user, uint256 amount);
    event TransactionCompleted(bytes32 indexed txId, uint256 amountSpent);
    event TransactionRefunded(bytes32 indexed txId, uint256 amountRefunded);
   
    
    constructor(uint256 _spreadFeePercentage, address _transactionManager, address _feeReceiver, address _vaultAddress) DirectSettings(_spreadFeePercentage, msg.sender, _transactionManager, _feeReceiver, _vaultAddress) {
    }


    modifier onlyTransactionManager() {
        require(msg.sender == transactionManager, "Not transaction manager");
        _;
    }
    
    function initiateFiatTransaction(
        address token,
        uint256 amount
    )
        external
        nonReentrant
        whenNotPaused
        returns (bytes32 txId)
    {
        require(amount > 0, "Amount must be greater than zero");
        require(supportedTokens[token], "Token not supported");

        
        uint256 feeAmount = (amount * spreadFeePercentage) / 10000;
        uint256 totalAmount = amount + feeAmount;
        
        IERC20 tokenContract = IERC20(token);

        require(tokenContract.balanceOf(msg.sender) >= totalAmount, "Insufficient Balance");
        require(
            tokenContract.transferFrom(msg.sender, address(this), totalAmount),
            "Transfer failed"
        );
        
        
        collectedFees[token] += feeAmount;
        
        txId = keccak256(abi.encodePacked(
            msg.sender,
            token,
            amount,
            block.timestamp
        ));
        
        transactions[txId] = Transaction({
            user: msg.sender,
            token: token,
            amount: amount,
            amountSpent: 0,
            transactionFee: feeAmount,
            transactionTimestamp: block.timestamp,
            isCompleted: false,
            isRefunded: false
        });

        userTransactionIds[msg.sender].push(txId);
        
        emit TransactionInitiated(txId, msg.sender, amount);
        return txId;
    }


    
    function completeTransaction(bytes32 txId, uint256 amountSpent)
        external
        onlyTransactionManager
        nonReentrant
    {
        Transaction storage txn = transactions[txId];
        require(!txn.isCompleted && !txn.isRefunded, "Transaction already processed");
        require(amountSpent == txn.amount, "Amount spent not equal locked amount");
        
        txn.amountSpent = amountSpent;
        txn.isCompleted = true;

        require(IERC20(txn.token).transfer(feeReceiver, txn.transactionFee), "Fee transfer failed");
        require(IERC20(txn.token).transfer(vaultAddress, amountSpent), "Transfer failed");

        
        emit TransactionCompleted(txId, amountSpent);
    }
    
    function refund(bytes32 txId)
        external
        onlyOwner
        nonReentrant
    {
        Transaction storage txn = transactions[txId];
        require(!txn.isCompleted && !txn.isRefunded, "Transaction already processed");
        
        txn.isRefunded = true;
        require(IERC20(txn.token).balanceOf(address(this)) >= txn.amount+txn.transactionFee, "Insufficient balance");
        require(IERC20(txn.token).transfer(txn.user, txn.amount+txn.transactionFee), "Transfer failed");
        
        emit TransactionRefunded(txId, txn.amount);
    }
    
    
    
}