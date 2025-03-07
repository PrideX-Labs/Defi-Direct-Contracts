import { ethers } from "hardhat";

const deploy = async () => {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
  
    const StableFiatBridge = await ethers.getContractFactory("FiatBridge");
    const spreadFee = 100; // 1% initial fee
    const bridge = await StableFiatBridge.deploy(spreadFee);
  
    await bridge.waitForDeployment();
    console.log("StableFiatBridge deployed to:", bridge.target);
  };
  
  deploy()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });