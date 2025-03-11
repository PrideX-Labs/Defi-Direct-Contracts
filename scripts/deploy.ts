import { ethers } from "hardhat";

const deploy = async () => {
  const [deployer, transactionManager] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  
  const spreadFee = 100; 
  const feeReceiver = deployer.address; 
  const vaultAddress = deployer.address; 
  
  
  const txManagerAddress = transactionManager ? transactionManager.address : deployer.address;
  
  
  const StableFiatBridge = await ethers.getContractFactory("FiatBridge");
  const bridge = await StableFiatBridge.deploy(
    spreadFee,
    txManagerAddress,
    feeReceiver,
    vaultAddress
  );

  await bridge.waitForDeployment();
  console.log("StableFiatBridge deployed to:", bridge.target);
  console.log("Transaction Manager:", txManagerAddress);
  console.log("Fee Receiver:", feeReceiver);
  console.log("Vault Address:", vaultAddress);
};

deploy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });