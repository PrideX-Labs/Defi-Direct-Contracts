import { ethers } from "hardhat";
// usdc on sepolia:0x22e4068964e11648729Df47b160070f1d9B89C6d
// usdt on sepolia:0xe6cC80FD22712604376CDDB639eE2E52952740df

// usdt on lisk:0xe6cC80FD22712604376CDDB639eE2E52952740df
// usdc on lisk:0xc0A7D0E2f8107Df4834E8B52fD346D7C740F04b6

const supportedTokens = ["0xc0A7D0E2f8107Df4834E8B52fD346D7C740F04b6", "0xe6cC80FD22712604376CDDB639eE2E52952740df"];

const addSupportedTokens = async () => {
    const [deployer] = await ethers.getSigners();
    console.log("Adding supported tokens with account:", deployer.address);

    const StableFiatBridge = await ethers.getContractAt("FiatBridge", "0x88b11aB13cd7BE9846FA38AB85Ef133e3093375c");

    await Promise.all(
        supportedTokens.map(async (token) => {
            const tx = await StableFiatBridge.addSupportedToken(token, {
                gasPrice: ethers.parseUnits("100", "gwei"), // Adjust gas price as needed
            });
            console.log(`Transaction sent for token ${token}: ${tx.hash}`);
            await tx.wait(); // Wait for the transaction to be mined
            console.log(`Token ${token} added successfully.`);
        })
    );

    console.log("Supported tokens added to:", StableFiatBridge.target);
};

addSupportedTokens().catch((error) => {
    console.error(error);
    process.exit(1);
});