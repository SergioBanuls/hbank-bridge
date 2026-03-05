/**
 * Bridge V3 Contract ABI
 *
 * Based on HBANK_Bridge pattern (OApp) with:
 * - 0.3% fee (stays in contract)
 * - Optional gas drop (~$2 ETH on destination)
 * - Simple msg.value passthrough
 */
export const BRIDGE_V3_ABI = [
    // ============ Read Functions ============
    {
        name: 'supportedTokens',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'symbol', type: 'string' }],
        outputs: [{ name: '', type: 'address' }],
    },
    {
        name: 'feeBasisPoints',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint16' }],
    },
    {
        name: 'GAS_DROP_AMOUNT',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint128' }],
    },
    {
        name: 'LZ_RECEIVE_GAS',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint128' }],
    },

    // ============ Quote Functions ============
    {
        name: 'quote',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'symbol', type: 'string' },
            { name: 'amount', type: 'uint256' },
            { name: 'receiver', type: 'address' },
            { name: 'targetChainId', type: 'uint32' },
        ],
        outputs: [{ name: 'nativeFee', type: 'uint256' }],
    },
    {
        name: 'quoteWithGasDrop',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'symbol', type: 'string' },
            { name: 'amount', type: 'uint256' },
            { name: 'receiver', type: 'address' },
            { name: 'targetChainId', type: 'uint32' },
            { name: 'requestGasDrop', type: 'bool' },
        ],
        outputs: [{ name: 'nativeFee', type: 'uint256' }],
    },

    // ============ Bridge Functions ============
    {
        name: 'bridgeTokens',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
            { name: 'symbol', type: 'string' },
            { name: 'amount', type: 'uint256' },
            { name: 'receiver', type: 'address' },
            { name: 'targetChainId', type: 'uint32' },
        ],
        outputs: [
            {
                name: 'receipt',
                type: 'tuple',
                components: [
                    { name: 'guid', type: 'bytes32' },
                    { name: 'nonce', type: 'uint64' },
                    {
                        name: 'fee',
                        type: 'tuple',
                        components: [
                            { name: 'nativeFee', type: 'uint256' },
                            { name: 'lzTokenFee', type: 'uint256' },
                        ],
                    },
                ],
            },
        ],
    },
    {
        name: 'bridgeTokensWithGasDrop',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
            { name: 'symbol', type: 'string' },
            { name: 'amount', type: 'uint256' },
            { name: 'receiver', type: 'address' },
            { name: 'targetChainId', type: 'uint32' },
            { name: 'requestGasDrop', type: 'bool' },
        ],
        outputs: [
            {
                name: 'receipt',
                type: 'tuple',
                components: [
                    { name: 'guid', type: 'bytes32' },
                    { name: 'nonce', type: 'uint64' },
                    {
                        name: 'fee',
                        type: 'tuple',
                        components: [
                            { name: 'nativeFee', type: 'uint256' },
                            { name: 'lzTokenFee', type: 'uint256' },
                        ],
                    },
                ],
            },
        ],
    },

    // ============ Events ============
    {
        type: 'event',
        name: 'TokensBridged',
        inputs: [
            { name: 'guid', type: 'bytes32', indexed: true },
            { name: 'sender', type: 'address', indexed: true },
            { name: 'token', type: 'address', indexed: false },
            { name: 'amount', type: 'uint256', indexed: false },
            { name: 'receiver', type: 'address', indexed: false },
            { name: 'fee', type: 'uint256', indexed: false },
            { name: 'targetChainId', type: 'uint32', indexed: false },
        ],
    },
    {
        type: 'event',
        name: 'TokensReleased',
        inputs: [
            { name: 'guid', type: 'bytes32', indexed: true },
            { name: 'receiver', type: 'address', indexed: true },
            { name: 'token', type: 'address', indexed: false },
            { name: 'amount', type: 'uint256', indexed: false },
        ],
    },

    // ============ Errors ============
    {
        type: 'error',
        name: 'TokenNotSupported',
        inputs: [{ name: 'symbol', type: 'string' }],
    },
    {
        type: 'error',
        name: 'FeeExceedMaximum',
        inputs: [
            { name: 'feeBasisPoints', type: 'uint16' },
            { name: 'maxFeeBasisPoints', type: 'uint16' },
        ],
    },
    {
        type: 'error',
        name: 'InvalidReceiverAddress',
        inputs: [],
    },
] as const

/**
 * ERC20 ABI for token approvals and balance checks
 */
export const ERC20_ABI = [
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const
