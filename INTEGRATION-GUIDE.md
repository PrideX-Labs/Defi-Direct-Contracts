# FiatBridge Integration Guide

## Contract Overview
The FiatBridge smart contract facilitates fiat-to-crypto transactions with fee management and transaction tracking.

## Contract Functions

### User Functions

#### Initiating a Transaction
```javascript
// 1. Approve tokens first
await tokenContract.approve(bridgeAddress, totalAmount);

// 2. Initiate transaction
const tx = await bridgeContract.initiateFiatTransaction(
  tokenAddress,  // Address of token to use
  amount         // Amount in token's smallest unit (e.g., wei)
);

// 3. Get transaction ID from event
const receipt = await tx.wait();
const event = receipt.events.find(e => e.event === "TransactionInitiated");
const txId = event.args.txId;
```

**Notes:**
- User must have sufficient token balance
- Token must be in the supported list
- Contract calculates fee automatically (currently 1%)
- Tokens are locked in contract until completion or refund

#### Checking Transaction Status
```javascript
const txDetails = await bridgeContract.transactions(txId);
const {
  user,             // Address that initiated transaction
  token,            // Token address used
  amount,           // Original amount (without fees)
  amountSpent,      // Amount processed (should match amount when completed)
  transactionFee,   // Fee amount charged
  transactionTimestamp,  // When transaction was initiated (Unix timestamp)
  isCompleted,      // True if transaction is complete
  isRefunded        // True if transaction was refunded
} = txDetails;
```

### Transaction Manager Functions

#### Completing a Transaction
```javascript
// Only callable by designated transaction manager
await bridgeContract.completeTransaction(
  txId,     // Transaction ID to complete
  amount    // Must match original amount
);
```

**Notes:**
- Upon completion, original amount is sent to vault address
- Fee amount is sent to fee receiver address
- Transaction is marked as completed

### Admin Functions

#### Refunding a Transaction
```javascript
// Only callable by contract owner
await bridgeContract.refund(txId);
```

**Notes:**
- Can only refund if transaction is not completed or already refunded
- Returns original amount + fee to the user
- Transaction is marked as refunded

#### Adding Supported Tokens
```javascript
// Only callable by contract owner
await bridgeContract.addSupportedToken(tokenAddress);
```

#### Removing Supported Tokens
```javascript
// Only callable by contract owner
await bridgeContract.removeSupportedToken(tokenAddress);
```

#### Updating Fee Percentage
```javascript
// Only callable by contract owner
await bridgeContract.updateSpreadFee(newFeePercentage);
```
**Note:** Fee percentage is in basis points (100 = 1%)

#### Setting Fee Receiver
```javascript
// Only callable by contract owner
await bridgeContract.setFeeReceiver(newFeeReceiverAddress);
```

#### Setting Vault Address
```javascript
// Only callable by contract owner
await bridgeContract.setVaultAddress(newVaultAddress);
```

#### Pausing/Unpausing Contract
```javascript
// Only callable by contract owner
await bridgeContract.pause();
await bridgeContract.unpause();
```

## Event Listeners

### Transaction Initiated
```javascript
bridgeContract.on("TransactionInitiated", (txId, user, amount) => {
  console.log(`New transaction ${txId} initiated by ${user} for ${amount}`);
});
```

### Transaction Completed
```javascript
bridgeContract.on("TransactionCompleted", (txId, amountSpent) => {
  console.log(`Transaction ${txId} completed with ${amountSpent}`);
});
```

### Transaction Refunded
```javascript
bridgeContract.on("TransactionRefunded", (txId, amountRefunded) => {
  console.log(`Transaction ${txId} refunded with ${amountRefunded}`);
});
```

## Common Error Codes

- "Token not supported" - The token address is not in the supported list
- "Insufficient Balance" - User doesn't have enough tokens
- "Amount must be greater than zero" - Zero amount transactions are not allowed
- "Transaction already processed" - Transaction is already completed or refunded
- "Amount spent not equal locked amount" - Completion amount must match original amount
- "Not transaction manager" - Only the transaction manager can complete transactions
- "Fee too high" - Fee percentage exceeds maximum allowed (5%)