const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("FIAT_BRIDGE", function () {
  
  const SPREAD_FEE_PERCENTAGE = 100; 
  const MAX_FEE = 500; 
  const AMOUNT = ethers.parseEther("1000");

  async function deployContractFixture() {
    
    const [owner, transactionManager, user1, user2, user3, user4] = await ethers.getSigners();
    
    
    const MockToken = await ethers.getContractFactory("MOCKERC20");
    const mockToken = await MockToken.deploy("USD Coin", "USDC", 6);
    await mockToken.mint(owner.address, ethers.parseUnits("10000", 6));
    await mockToken.mint(user1.address, ethers.parseUnits("10000", 6));
    await mockToken.mint(user2.address, ethers.parseUnits("10000", 6));
    await mockToken.mint(user3.address, ethers.parseUnits("10000", 6));
    await mockToken.mint(user4.address, ethers.parseUnits("10000", 6));
    
    
    const feeReceiver = user3.address;
    const vaultAddress = user4.address; 
    
    const StableFiatBridge = await ethers.getContractFactory("FiatBridge");
    const bridge = await StableFiatBridge.deploy(
      SPREAD_FEE_PERCENTAGE, 
      transactionManager.address, 
      feeReceiver, 
      vaultAddress
    );
    
    
    await bridge.addSupportedToken(mockToken.target);
    
    
    await mockToken.connect(user1).approve(bridge.target, ethers.parseUnits("10000", 6));
    await mockToken.connect(user2).approve(bridge.target, ethers.parseUnits("10000", 6));
    await mockToken.connect(user3).approve(bridge.target, ethers.parseUnits("10000", 6));
    await mockToken.connect(user4).approve(bridge.target, ethers.parseUnits("10000", 6));
    
    return { bridge, mockToken, owner, transactionManager, user1, user2, feeReceiver, vaultAddress };
  }
  
  describe("Transaction Initiation", function () {
    it("Should initiate transaction with correct parameters", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      const balanceBefore = await mockToken.balanceOf(user1.address);
      
      
      const amount = ethers.parseUnits("1000", 6);
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount
      );
      
      const receipt = await tx.wait();
      
      
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      const transaction = await bridge.transactions(txId);
      expect(transaction.user).to.equal(user1.address);
      expect(transaction.token).to.equal(mockToken.target);
      expect(transaction.amount).to.equal(amount);
      expect(transaction.isCompleted).to.equal(false);
      expect(transaction.isRefunded).to.equal(false);
      
      
      const feeAmount = (amount * BigInt(SPREAD_FEE_PERCENTAGE)) / 10000n;
      const totalAmount = amount + feeAmount;
      const expectedBalanceAfter = balanceBefore - totalAmount;
      const actualBalanceAfter = await mockToken.balanceOf(user1.address);
      expect(actualBalanceAfter).to.equal(expectedBalanceAfter);
      
      
      const contractBalance = await mockToken.balanceOf(bridge.target);
      expect(contractBalance).to.equal(totalAmount);
      
      
      const collectedFees = await bridge.collectedFees(mockToken.target);
      expect(collectedFees).to.equal(feeAmount);
      
      return { txId, amount }; 
    });
    
    it("Should reject transaction with unsupported token", async function () {
      const { bridge, user1 } = await loadFixture(deployContractFixture);
      
      
      const UnsupportedToken = await ethers.getContractFactory("MOCKERC20");
      const unsupportedToken = await UnsupportedToken.deploy("Unsupported Token", "UNSUP", 18);
      
      
      await expect(
        bridge.connect(user1).initiateFiatTransaction(
          unsupportedToken.target,
          ethers.parseEther("1000")
        )
      ).to.be.revertedWith("Token not supported");
    });
    
    it("Should not allow operations when contract is paused", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(owner).pause();
      
      
      await expect(
        bridge.connect(user1).initiateFiatTransaction(
          mockToken.target,
          ethers.parseUnits("1000", 6)
        )
      ).to.be.reverted;
      
      
      await bridge.connect(owner).unpause();
      
      
      await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("1000", 6)
      );
    });
  });
  
  describe("Transaction Completion", function () {
    it("Should complete transaction successfully", async function () {
      const { bridge, mockToken, transactionManager, user1, feeReceiver, vaultAddress } = await loadFixture(deployContractFixture);
      
      
      const amount = ethers.parseUnits("1000", 6);
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      const feeReceiverBalanceBefore = await mockToken.balanceOf(feeReceiver);
      const vaultBalanceBefore = await mockToken.balanceOf(vaultAddress);
      
      
      await bridge.connect(transactionManager).completeTransaction(txId, amount);
      
      
      const transaction = await bridge.transactions(txId);
      expect(transaction.isCompleted).to.equal(true);
      expect(transaction.amountSpent).to.equal(amount);
      
      
      const feeAmount = (amount * BigInt(SPREAD_FEE_PERCENTAGE)) / 10000n;
      const feeReceiverBalanceAfter = await mockToken.balanceOf(feeReceiver);
      const vaultBalanceAfter = await mockToken.balanceOf(vaultAddress);

      console.log("feeReceiverBalanceBefore", feeReceiverBalanceBefore);
      console.log("feeAmount", feeAmount.toString());
      console.log("feeReceiverBalanceAfter", feeReceiverBalanceAfter);
      
      expect(feeReceiverBalanceAfter).to.equal(feeReceiverBalanceBefore + feeAmount);
      expect(vaultBalanceAfter).to.equal(vaultBalanceBefore + amount);
    });
    
    it("Should reject completion by non-transaction manager", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      const amount = ethers.parseUnits("1000", 6);
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      await expect(
        bridge.connect(owner).completeTransaction(txId, amount)
      ).to.be.revertedWith("Not transaction manager");
    });
    
    it("Should reject completion of already processed transaction", async function () {
      const { bridge, mockToken, transactionManager, user1 } = await loadFixture(deployContractFixture);
      
      
      const amount = ethers.parseUnits("1000", 6);
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      await bridge.connect(transactionManager).completeTransaction(txId, amount);
      
      
      await expect(
        bridge.connect(transactionManager).completeTransaction(txId, amount)
      ).to.be.revertedWith("Transaction already processed");
    });
    
    it("Should reject completion with amount not equal to locked amount", async function () {
      const { bridge, mockToken, transactionManager, user1 } = await loadFixture(deployContractFixture);
      
      
      const amount = ethers.parseUnits("1000", 6);
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      await expect(
        bridge.connect(transactionManager).completeTransaction(txId, amount - 1n)
      ).to.be.revertedWith("Amount spent not equal locked amount");
    });
  });
  
  describe("Refund", function () {
    it("Should allow owner to refund a transaction", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      const amount = ethers.parseUnits("1000", 6);

      const feeAmount = (amount * BigInt(SPREAD_FEE_PERCENTAGE)) / 10000n;

      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      const userBalanceBefore = await mockToken.balanceOf(user1.address);
      
      
      await bridge.connect(owner).refund(txId);
      
      
      const transaction = await bridge.transactions(txId);
      expect(transaction.isRefunded).to.equal(true);
      
      
      const userBalanceAfter = await mockToken.balanceOf(user1.address);
      expect(userBalanceAfter).to.equal(userBalanceBefore + (amount+feeAmount));
    });
    
    it("Should reject refund by non-owner", async function () {
      const { bridge, mockToken, user1, user2 } = await loadFixture(deployContractFixture);
      
      
      const amount = ethers.parseUnits("1000", 6);
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      await expect(
        bridge.connect(user2).refund(txId)
      ).to.be.reverted;
    });
    
    it("Should reject refund of already processed transaction", async function () {
      const { bridge, mockToken, owner, transactionManager, user1 } = await loadFixture(deployContractFixture);
      
      
      const amount = ethers.parseUnits("1000", 6);
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      await bridge.connect(transactionManager).completeTransaction(txId, amount);
      
      
      await expect(
        bridge.connect(owner).refund(txId)
      ).to.be.revertedWith("Transaction already processed");
    });
  });
  
  describe("Admin Functions", function () {
    it("Should allow adding and removing supported tokens", async function () {
      const { bridge, owner } = await loadFixture(deployContractFixture);
      
      
      const NewToken = await ethers.getContractFactory("MOCKERC20");
      const newToken = await NewToken.deploy("New Token", "NEW", 18);
      
      
      await bridge.connect(owner).addSupportedToken(newToken.target);
      expect(await bridge.supportedTokens(newToken.target)).to.equal(true);
      
      
      await bridge.connect(owner).removeSupportedToken(newToken.target);
      expect(await bridge.supportedTokens(newToken.target)).to.equal(false);
    });
    
    it("Should allow updating spread fee", async function () {
      const { bridge, owner } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(owner).updateSpreadFee(200);
      expect(await bridge.spreadFeePercentage()).to.equal(200);
      
      
      await expect(
        bridge.connect(owner).updateSpreadFee(501)
      ).to.be.revertedWith("Fee too high");
    });
    
    it("Should allow updating fee receiver", async function () {
      const { bridge, owner, user2 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(owner).setFeeReceiver(user2.address);
      expect(await bridge.getFeeReceiver()).to.equal(user2.address);
      
      
      await expect(
        bridge.connect(owner).setFeeReceiver(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });
    
    it("Should allow updating vault address", async function () {
      const { bridge, owner, user2 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(owner).setVaultAddress(user2.address);
      expect(await bridge.getVaultAddress()).to.equal(user2.address);
      
      
      await expect(
        bridge.connect(owner).setVaultAddress(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });
    
    it("Should restrict admin functions to owner", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      await expect(
        bridge.connect(user1).addSupportedToken(mockToken.target)
      ).to.be.reverted;
      
      
      await expect(
        bridge.connect(user1).removeSupportedToken(mockToken.target)
      ).to.be.reverted;
      
      
      await expect(
        bridge.connect(user1).updateSpreadFee(200)
      ).to.be.reverted;
      
      
      await expect(
        bridge.connect(user1).pause()
      ).to.be.reverted;
    });
  });
  
  describe("Edge Cases", function () {
    it("Should reject transaction with zero amount", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      await expect(
        bridge.connect(user1).initiateFiatTransaction(
          mockToken.target,
          0
        )
      ).to.be.revertedWith("Amount must be greater than zero");
    });
    
    it("Should generate unique transaction IDs", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      const tx1 = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("1000", 6)
      );
      
      const receipt1 = await tx1.wait();
      const event1 = receipt1.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent1 = bridge.interface.parseLog(event1);
      const txId1 = parsedEvent1.args[0];

      
      await ethers.provider.send("evm_increaseTime", [1]);
      await ethers.provider.send("evm_mine", []);
      
      
      const tx2 = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("1000", 6)
      );
      
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent2 = bridge.interface.parseLog(event2);
      const txId2 = parsedEvent2.args[0];

      
      expect(txId1).to.not.equal(txId2);
    });
    
    it("Should handle multiple transactions from same user", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("1000", 6)
      );
      
      
      await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("2000", 6)
      );
      
      
      const txIds = await bridge.getTransactionIds(user1.address);
      expect(txIds.length).to.equal(2);
    });
  });
});