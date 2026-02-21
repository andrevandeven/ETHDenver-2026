import { createConfig, http } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { defineChain } from "viem";

export const zgGalileo = defineChain({
  id: 16602,
  name: "0G Galileo Testnet",
  nativeCurrency: { decimals: 18, name: "A0GI", symbol: "A0GI" },
  rpcUrls: {
    default: { http: ["https://evmrpc-testnet.0g.ai"] },
  },
  blockExplorers: {
    default: {
      name: "0G Galileo Explorer",
      url: "https://chainscan-galileo.0g.ai",
    },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [zgGalileo],
  connectors: [metaMask()],
  transports: {
    [zgGalileo.id]: http("https://evmrpc-testnet.0g.ai"),
  },
  ssr: true,
});
