import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Veil Markets',
  projectId: 'b97b8d13f0a2473e9a9dc7d86c6a2e4f',
  chains: [sepolia],
  ssr: false,
});
