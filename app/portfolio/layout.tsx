import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Portfolio',
    description:
        'View and manage your Hedera portfolio. Track token balances, positions, and performance across HBank.',
}

export default function PortfolioLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return <>{children}</>
}

