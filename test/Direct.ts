const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("FIAT_BRIDGE", function () {
  
  const SPREAD_FEE_PERCENTAGE = 100; 
  const MAX_FEE = 500; 
  const AMOUNT = ethers.parseEther("1000");
  const LOCK_DURATION = 60 * 60 * 24; 
  const PERMISSION_DURATION = 60 * 60 * 24 * 30; 

  async function deployContractFixture() {
    
    const [owner, user1, user2] = await ethers.getSigners();
    
    
    const MockToken = await ethers.getContractFactory("MOCKERC20");
    const mockToken = await MockToken.deploy("USD Coin", "USDC", 6);
    await mockToken.mint(user1.address, ethers.parseUnits("10000", 6));
    await mockToken.mint(user2.address, ethers.parseUnits("10000", 6));
    
    
    const StableFiatBridge = await ethers.getContractFactory("FiatBridge");
    const bridge = await StableFiatBridge.deploy(SPREAD_FEE_PERCENTAGE);
    
    
    await bridge.addSupportedToken(mockToken.target);
    
    
    await mockToken.connect(user1).approve(bridge.target, ethers.parseUnits("10000", 6));
    await mockToken.connect(user2).approve(bridge.target, ethers.parseUnits("10000", 6));
    
    return { bridge, mockToken, owner, user1, user2 };
  }
  
  describe("Permission Management", function () {
    it("Should grant permission with correct parameters", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      const maxAmount = ethers.parseUnits("5000", 6);
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        maxAmount,
        PERMISSION_DURATION
      );
      
      
      const permission = await bridge.userPermissions(user1.address, mockToken.target);
      expect(permission.maxAmount).to.equal(maxAmount);
      expect(permission.isActive).to.equal(true);
      expect(permission.expiryTime).to.be.closeTo(
        BigInt(Math.floor(Date.now() / 1000) + PERMISSION_DURATION),
        60n 
      );
    });
    
    it("Should reject permission for unsupported token", async function () {
      const { bridge, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      const UnsupportedToken = await ethers.getContractFactory("MOCKERC20");
      const unsupportedToken = await UnsupportedToken.deploy("Unsupported Token", "UNSUP", 18);
      
      
      await expect(
        bridge.connect(user1).grantPermission(
          unsupportedToken.target,
          ethers.parseEther("1000"),
          PERMISSION_DURATION
        )
      ).to.be.revertedWith("Token not supported");
    });
    
    it("Should reject permission with too long duration", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      const tooLongDuration = 366 * 24 * 60 * 60; 
      await expect(
        bridge.connect(user1).grantPermission(
          mockToken.target,
          ethers.parseUnits("1000", 6),
          tooLongDuration
        )
      ).to.be.revertedWith("Duration too long");
    });
    
    it("Should not allow operations when contract is paused", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(owner).pause();
      
      
      await expect(
        bridge.connect(user1).grantPermission(
          mockToken.target,
          ethers.parseUnits("1000", 6),
          PERMISSION_DURATION
        )
      ).to.be.reverted;
      
      
      await bridge.connect(owner).unpause();
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("1000", 6),
        PERMISSION_DURATION
      );
    });
  });
  
  describe("Transaction Initiation", function () {
    it("Should initiate transaction with correct parameters", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      const balanceBefore = await mockToken.balanceOf(user1.address);
      
      
      const amount = ethers.parseUnits("1000", 6);
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount,
        LOCK_DURATION
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
      const expectedBalanceAfter = BigInt(balanceBefore) - BigInt(amount) - BigInt(feeAmount);
      const actualBalanceAfter = await mockToken.balanceOf(user1.address);
      expect(actualBalanceAfter).to.equal(expectedBalanceAfter);
      
      
      const contractBalance = await mockToken.balanceOf(bridge.target);
      expect(contractBalance).to.equal(amount + feeAmount);
      
      
      const collectedFees = await bridge.collectedFees(mockToken.target);
      expect(collectedFees).to.equal(feeAmount);
      
      return { txId, amount }; 
    });
    
    it("Should reject transaction without active permission", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      await expect(
        bridge.connect(user1).initiateFiatTransaction(
          mockToken.target,
          ethers.parseUnits("1000", 6),
          LOCK_DURATION
        )
      ).to.be.revertedWith("No active permission");
    });
    
    it("Should reject transaction with expired permission", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        60 
      );
      
      
      await ethers.provider.send("evm_increaseTime", [120]); 
      await ethers.provider.send("evm_mine");
      
      
      await expect(
        bridge.connect(user1).initiateFiatTransaction(
          mockToken.target,
          ethers.parseUnits("1000", 6),
          LOCK_DURATION
        )
      ).to.be.revertedWith("Permission expired");
    });
    
    it("Should reject transaction exceeding permitted amount", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      const maxAmount = ethers.parseUnits("1000", 6);
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        maxAmount,
        PERMISSION_DURATION
      );
      
      
      await expect(
        bridge.connect(user1).initiateFiatTransaction(
          mockToken.target,
          ethers.parseUnits("1001", 6),
          LOCK_DURATION
        )
      ).to.be.revertedWith("Amount exceeds limit");
    });
  });
  
  describe("Transaction Completion", function () {
    it("Should complete transaction with full amount spent", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      const amount = ethers.parseUnits("1000", 6);
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount,
        LOCK_DURATION
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      const userBalanceBefore = await mockToken.balanceOf(user1.address);
      await bridge.connect(owner).completeTransaction(txId, amount);
      
      
      const transaction = await bridge.transactions(txId);
      expect(transaction.isCompleted).to.equal(true);
      expect(transaction.amountSpent).to.equal(amount);
      
      
      const userBalanceAfter = await mockToken.balanceOf(user1.address);
      expect(userBalanceAfter).to.equal(userBalanceBefore);
    });
    
    it("Should complete transaction with partial amount and refund remainder", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      const amount = ethers.parseUnits("1000", 6);
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount,
        LOCK_DURATION
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      const amountSpent = ethers.parseUnits("700", 6);
      const refundAmount = amount - amountSpent;
      
      const userBalanceBefore = await mockToken.balanceOf(user1.address);
      await bridge.connect(owner).completeTransaction(txId, amountSpent);
      
      
      const transaction = await bridge.transactions(txId);
      expect(transaction.isCompleted).to.equal(true);
      expect(transaction.amountSpent).to.equal(amountSpent);
      
      
      const userBalanceAfter = await mockToken.balanceOf(user1.address);
      expect(userBalanceAfter).to.equal(userBalanceBefore + refundAmount);
    });
    
    it("Should reject completion after lock expiration", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      const shortLock = 60; 
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("1000", 6),
        shortLock
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      await ethers.provider.send("evm_increaseTime", [120]); 
      await ethers.provider.send("evm_mine");
      
      
      await expect(
        bridge.connect(owner).completeTransaction(txId, ethers.parseUnits("1000", 6))
      ).to.be.revertedWith("Lock expired");
    });
    
    it("Should reject completion amount greater than transaction amount", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      const amount = ethers.parseUnits("1000", 6);
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount,
        LOCK_DURATION
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      await expect(
        bridge.connect(owner).completeTransaction(txId, amount + 1n)
      ).to.be.revertedWith("Amount spent exceeds locked amount");
    });
  });
  
  describe("Expired Lock Claims", function () {
    it("Should allow claiming expired locks", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      const amount = ethers.parseUnits("1000", 6);
      const shortLock = 60; 
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount,
        shortLock
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      await ethers.provider.send("evm_increaseTime", [120]); 
      await ethers.provider.send("evm_mine");
      
      
      const userBalanceBefore = await mockToken.balanceOf(user1.address);
      
      
      await bridge.connect(user1).claimExpiredLock(txId);
      
      
      const transaction = await bridge.transactions(txId);
      expect(transaction.isRefunded).to.equal(true);
      
      
      const userBalanceAfter = await mockToken.balanceOf(user1.address);
      expect(userBalanceAfter).to.equal(userBalanceBefore + amount);
    });
    
    it("Should reject claiming non-expired locks", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("1000", 6),
        LOCK_DURATION
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      await expect(
        bridge.connect(user1).claimExpiredLock(txId)
      ).to.be.revertedWith("Lock not expired");
    });
    
    it("Should reject claiming by non-owner of transaction", async function () {
      const { bridge, mockToken, user1, user2 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      const shortLock = 60; 
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("1000", 6),
        shortLock
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      await ethers.provider.send("evm_increaseTime", [120]); 
      await ethers.provider.send("evm_mine");
      
      
      await expect(
        bridge.connect(user2).claimExpiredLock(txId)
      ).to.be.revertedWith("Not transaction owner");
    });
    
    it("Should reject claiming already processed transactions", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      const tx = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("1000", 6),
        LOCK_DURATION
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent = bridge.interface.parseLog(event);
      const txId = parsedEvent.args[0];
      
      
      await bridge.connect(owner).completeTransaction(txId, ethers.parseUnits("1000", 6));
      
      
      await ethers.provider.send("evm_increaseTime", [LOCK_DURATION + 60]);
      await ethers.provider.send("evm_mine");
      
      
      await expect(
        bridge.connect(user1).claimExpiredLock(txId)
      ).to.be.revertedWith("Transaction already processed");
    });
  });
  
  describe("Fee Management", function () {
    it("Should allow owner to withdraw collected fees", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      const amount = ethers.parseUnits("1000", 6);
      await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount,
        LOCK_DURATION
      );
      
      
      const feeAmount = (amount * BigInt(SPREAD_FEE_PERCENTAGE)) / 10000n;
      const collectedFees = await bridge.collectedFees(mockToken.target);
      expect(collectedFees).to.equal(feeAmount);
      
      
      const ownerBalanceBefore = await mockToken.balanceOf(owner.address);
      
      
      const withdrawAmount = feeAmount / 2n;
      await bridge.connect(owner).withdrawFees(mockToken.target, withdrawAmount);
      
      
      const ownerBalanceAfter = await mockToken.balanceOf(owner.address);
      expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + withdrawAmount);
      
      
      const remainingFees = await bridge.collectedFees(mockToken.target);
      expect(remainingFees).to.equal(feeAmount - withdrawAmount);
    });
    
    it("Should reject fee withdrawal exceeding collected amount", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      const amount = ethers.parseUnits("1000", 6);
      await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        amount,
        LOCK_DURATION
      );
      
      
      const feeAmount = (amount * BigInt(SPREAD_FEE_PERCENTAGE)) / 10000n;
      
      
      await expect(
        bridge.connect(owner).withdrawFees(mockToken.target, feeAmount + 1n)
      ).to.be.revertedWith("Insufficient collected fees");
    });
    
    it("Should reject fee withdrawal by non-owner", async function () {
      const { bridge, mockToken, user1, user2 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("1000", 6),
        LOCK_DURATION
      );
      
      
      await expect(
        bridge.connect(user2).withdrawFees(mockToken.target, ethers.parseUnits("10", 6))
      ).to.be.reverted;
    });
    
    it("Should validate fee percentage when updating", async function () {
      const { bridge, owner } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(owner).updateSpreadFee(200); 
      expect(await bridge.spreadFeePercentage()).to.equal(200);
      
      
      await expect(
        bridge.connect(owner).updateSpreadFee(501) 
      ).to.be.revertedWith("Fee too high");
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
    
    it("Should handle pause and unpause correctly", async function () {
      const { bridge, mockToken, owner, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(owner).pause();
      
      
      await expect(
        bridge.connect(user1).grantPermission(
          mockToken.target,
          ethers.parseUnits("1000", 6),
          PERMISSION_DURATION
        )
      ).to.be.reverted;
      
      
      await bridge.connect(owner).unpause();
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("1000", 6),
        PERMISSION_DURATION
      );
    });
  });
  
  
  describe("Edge Cases", function () {
    it("Should handle multiple transactions from same user", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      
      await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("1000", 6),
        LOCK_DURATION
      );
      
      
      await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("2000", 6),
        LOCK_DURATION
      );
      
      
      const permission = await bridge.userPermissions(user1.address, mockToken.target);
      expect(permission.isActive).to.equal(true);
    });
    
    it("Should generate unique transaction IDs", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);
      
      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      const tx1 = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("1000", 6),
        LOCK_DURATION
      );
      
      const receipt1 = await tx1.wait();
      const event1 = receipt1.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent1 = bridge.interface.parseLog(event1);
      const txId1 = parsedEvent1.args[0];

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const tx2 = await bridge.connect(user1).initiateFiatTransaction(
        mockToken.target,
        ethers.parseUnits("1000", 6),
        LOCK_DURATION
      );
      
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs.find(
        log => bridge.interface.parseLog(log)?.name === "TransactionInitiated"
      );
      const parsedEvent2 = bridge.interface.parseLog(event2);
      const txId2 = parsedEvent2.args[0];

      expect(txId1).to.not.equal(txId2);
    });
    
    it("Should reject transaction with zero amount", async function () {
      const { bridge, mockToken, user1 } = await loadFixture(deployContractFixture);

      await bridge.connect(user1).grantPermission(
        mockToken.target,
        ethers.parseUnits("5000", 6),
        PERMISSION_DURATION
      );
      
      await expect(
        bridge.connect(user1).initiateFiatTransaction(
          mockToken.target,
          0n,
          LOCK_DURATION
        )
      ).to.be.revertedWith("Amount must be greater than zero");
    });
  });
});