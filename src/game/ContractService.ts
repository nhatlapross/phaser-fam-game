import {
    createWalletClient,
    createPublicClient,
    custom,
    http,
    type EIP1193Provider,
    type Chain,
} from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { creditcoin } from '../config/privy';
import { EventBus } from './EventBus';

// Contract addresses per chain
const IDENTITY_REGISTRY: Record<number, `0x${string}`> = {
    [arbitrumSepolia.id]: (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY as `0x${string}`) ??
        '0x27558E49D50E398C34e665A62d8f3DAcc1941449',
    [creditcoin.id]: (process.env.NEXT_PUBLIC_CREADIT_COIN_IDENTITY_REGISTRY as `0x${string}`) ??
        '0x28F170E6f3C3216482F8d8BF0A936844076B0A63',
};

const CHAIN_CONFIG: Record<number, Chain> = {
    [arbitrumSepolia.id]: arbitrumSepolia,
    [creditcoin.id]: creditcoin,
};

const AGENT_URI = 'agent.overguild.com';

// Minimal ABI — only the function we need (same on all chains)
const REGISTER_ABI = [
    {
        type: 'function',
        name: 'register',
        inputs: [{ name: 'agentURI', type: 'string' }],
        outputs: [{ name: 'agentId', type: 'uint256' }],
        stateMutability: 'nonpayable',
    },
] as const;

export interface RegisterAgentResult {
    success: boolean;
    agentId?: string;
    txHash?: string;
    chainName?: string;
    explorerBaseUrl?: string;
    error?: string;
}

export class ContractService {
    /** Tracks the active chain; updated by 'chain-changed' EventBus event. */
    private static activeChainId: number = arbitrumSepolia.id;

    static {
        EventBus.on('chain-changed', ({ chainId }: { chainId: number }) => {
            ContractService.activeChainId = chainId;
        });
    }

    /**
     * Request the EIP-1193 provider from the React layer via EventBus.
     */
    private static getProvider(): Promise<EIP1193Provider> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                EventBus.off('eth-provider-response');
                reject(new Error('Wallet provider not available. Please connect your wallet.'));
            }, 5000);

            EventBus.once('eth-provider-response', (provider: EIP1193Provider | null) => {
                clearTimeout(timeout);
                if (provider) {
                    resolve(provider);
                } else {
                    reject(new Error('No wallet connected.'));
                }
            });

            EventBus.emit('request-eth-provider');
        });
    }

    /**
     * Call `register(agentURI)` on the Identity Registry contract.
     * Automatically uses the correct contract address and chain for the
     * currently selected chain (ARB Sepolia or Creditcoin).
     */
    static async registerAgent(): Promise<RegisterAgentResult> {
        try {
            const chainId = ContractService.activeChainId;
            const chain = CHAIN_CONFIG[chainId];
            const contractAddress = IDENTITY_REGISTRY[chainId];

            if (!chain || !contractAddress) {
                return { success: false, error: `Unsupported chain: ${chainId}` };
            }

            const provider = await ContractService.getProvider();

            const walletClient = createWalletClient({
                chain,
                transport: custom(provider),
            });

            const publicClient = createPublicClient({
                chain,
                transport: http(),
            });

            const [account] = await walletClient.getAddresses();
            if (!account) {
                return { success: false, error: 'No account found in wallet.' };
            }

            const txHash = await walletClient.writeContract({
                address: contractAddress,
                abi: REGISTER_ABI,
                functionName: 'register',
                args: [AGENT_URI],
                account,
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

            if (receipt.status === 'reverted') {
                return { success: false, txHash, error: 'Transaction reverted.' };
            }

            let agentId: string | undefined;
            if (receipt.logs.length > 0) {
                const log = receipt.logs[0];
                if (log.topics[1]) {
                    agentId = BigInt(log.topics[1]).toString();
                }
            }

            const chainName = chain.name;
            const explorerBaseUrl = chain.blockExplorers?.default?.url ?? '';

            return { success: true, agentId, txHash, chainName, explorerBaseUrl };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error occurred';
            console.error('ContractService.registerAgent error:', err);
            return { success: false, error: message };
        }
    }
}
