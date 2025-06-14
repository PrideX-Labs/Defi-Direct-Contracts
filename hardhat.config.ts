import * as dotenv from "dotenv";
dotenv.config();

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "hardhat-gas-reporter";

const myPrivateKey: string = <string>process.env.MY_PRIVATE_KEY;

const vaultPrivateKey: string = <string>process.env.VAULT_PRIVATE_KEY;
const feePrivateKey: string = <string>process.env.FEE_PRIVATE_KEY;


const cronosApiKeyMainnet: string = <string>(
    process.env.CRONOS_EXPLORER_MAINNET_API_KEY
);
const cronosApiKeyTestnet: string = <string>(
    process.env.CRONOS_EXPLORER_TESTNET_API_KEY
);
const scrollSepoliaApiKey: string = <string>(
    process.env.SCROLL_SEPOLIA_API_KEY
);


const config: HardhatUserConfig = {
    networks: {
        hardhat: {},
        scrollSepolia: {
            url: "https://sepolia-rpc.scroll.io/",
            accounts: myPrivateKey !== undefined ? [myPrivateKey, vaultPrivateKey, feePrivateKey] : [],
          },
        ganache: {
            url: "HTTP://127.0.0.1:7545",
            accounts: [myPrivateKey],
        },
        cronos: {
            url: "https://evm.cronos.org/",
            chainId: 25,
            accounts: [myPrivateKey, vaultPrivateKey, feePrivateKey],
            gasPrice: 10100000000000,
        },
        cronosTestnet: {
            url: "https://evm-t3.cronos.org/",
            chainId: 338,
            accounts: [myPrivateKey, vaultPrivateKey, feePrivateKey],
            gasPrice: 10100000000000,
        },
        ethereumSepoliaTestnet: {
            url: process.env.ETHEREUM_SEPOLIA_URL,
            chainId: 11155111,
            accounts: [myPrivateKey, vaultPrivateKey, feePrivateKey],
        },
        "lisk-sepolia": {
            url: 'https://rpc.sepolia-api.lisk.com',
            accounts: [myPrivateKey, vaultPrivateKey, feePrivateKey],
            gasPrice: 1000000000,
            },
        base_sepolia: {
            url: process.env.BASE_SEPOLIA_RPC_URL,
            accounts: [myPrivateKey],
        }

    },
    etherscan: {
        apiKey: {
            mainnet: <string>process.env["ETHERSCAN_API_KEY"],
            sepolia: <string>process.env["ETHERSCAN_API_KEY"],
            baseSepolia: <string>process.env["BASESCAN_KEY"],
            cronos: cronosApiKeyMainnet,
            cronosTestnet: cronosApiKeyTestnet,
            scrollSepolia: scrollSepoliaApiKey,
            "lisk-sepolia": "123",

        },
        customChains: [
            {
                network: "lisk-sepolia",
                chainId: 4202,
                urls: {
                    apiURL: "https://sepolia-blockscout.lisk.com/api",
                    browserURL: "https://sepolia-blockscout.lisk.com"
                }
            },
            {
                network: 'scrollSepolia',
                chainId: 534351,
                urls: {
                  apiURL: 'https://api-sepolia.scrollscan.com/api',
                  browserURL: 'https://sepolia.scrollscan.com/',
                },
              },
            {
                network: "cronos",
                chainId: 25,
                urls: {
                    apiURL:
                        "https://explorer-api.cronos.org/mainnet/api/v1/hardhat/contract?apikey=" +
                        cronosApiKeyMainnet,
                    browserURL: "https://explorer.cronos.org",
                },
            },
            {
                network: "cronosTestnet",
                chainId: 338,
                urls: {
                    apiURL:
                        "https://explorer-api.cronos.org/testnet/api/v1/hardhat/contract?apikey=" +
                        cronosApiKeyTestnet,
                    browserURL: "https://explorer.cronos.org/testnet",
                },
            },

        ],
    },
    solidity: {
        version: "0.8.28",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    gasReporter: {
        currency: "USD",
        gasPrice: 5000, // In GWei
        coinmarketcap: <string>process.env["COINMARKETCAP_API"],
    },
    sourcify: {
        enabled: false,
    },
};

export default config;