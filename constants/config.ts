export const INFURA_API_KEY = process.env.INFURA_API_KEY!;
export const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY!;

// Network RPCs
export const NETWORK_FORK_URL = `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`;
export const NETWORK_MAINNET_URL = `https://mainnet.infura.io/v3/${INFURA_API_KEY}`;
export const NETWORK_RINKEBY_URL = `https://rinkeby.infura.io/v3/${INFURA_API_KEY}`;
export const NETWORK_ROPSTEN_URL = `https://ropsten.infura.io/v3/${INFURA_API_KEY}`;
export const NETWORK_POLYGON_URL = "https://rpc-mainnet.matic.quiknode.pro";

// Accounts
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
export const MAINNET_PRIVATE_KEY = PRIVATE_KEY;
export const RINKEBY_PRIVATE_KEY = PRIVATE_KEY;
export const ROPSTEN_PRIVATE_KEY = PRIVATE_KEY;
export const POLYGON_PRIVATE_KEY = PRIVATE_KEY;

export const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY!;
