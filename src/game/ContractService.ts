import {
    createWalletClient,
    createPublicClient,
    custom,
    http,
    type EIP1193Provider,
} from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { EventBus } from './EventBus';

const IDENTITY_REGISTRY_ADDRESS =
    (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY as `0x${string}`) ??
    '0x27558E49D50E398C34e665A62d8f3DAcc1941449';

const AGENT_URI = 'agent.overguild.com';

// Minimal ABI — only the function we need
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
    error?: string;
}

export class ContractService {
    /**
     * Request the EIP-1193 provider from the React layer via EventBus.
     * App.tsx listens for 'request-eth-provider' and responds with the provider.
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
     * Call `register(agentURI)` on the ERC-8004 Identity Registry contract.
     */
    static async registerAgent(): Promise<RegisterAgentResult> {
        try {
            const provider = await this.getProvider();

            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });

            const publicClient = createPublicClient({
                chain: arbitrumSepolia,
                transport: http(),
            });

            const [account] = await walletClient.getAddresses();
            if (!account) {
                return { success: false, error: 'No account found in wallet.' };
            }

            // Send the register transaction
            const txHash = await walletClient.writeContract({
                address: IDENTITY_REGISTRY_ADDRESS,
                abi: REGISTER_ABI,
                functionName: 'register',
                args: [AGENT_URI],
                account,
            });

            // Wait for transaction receipt
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

            if (receipt.status === 'reverted') {
                return { success: false, txHash, error: 'Transaction reverted.' };
            }

            // Try to extract agentId from logs (first topic after event sig is usually the id)
            let agentId: string | undefined;
            if (receipt.logs.length > 0) {
                const log = receipt.logs[0];
                if (log.topics[1]) {
                    agentId = BigInt(log.topics[1]).toString();
                }
            }

            return { success: true, agentId, txHash };
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Unknown error occurred';
            console.error('ContractService.registerAgent error:', err);
            return { success: false, error: message };
        }
    }
}
