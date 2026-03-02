import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { ConnectionProviderWrapper } from '@/contexts/ConnectionProviderWrapper'
import { Header } from '@/components/Header'
import { Toaster } from 'sonner'

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
})

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
})

export const metadata: Metadata = {
    title: 'HBank',
    description: 'Hedera DeFi Bank',
    icons: {
        icon: '/hbank-icon.ico',
    },
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang='en' className='dark'>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <Providers>
                    <ConnectionProviderWrapper>
                        <Header />
                        {children}
                        <Toaster
                            position='bottom-right'
                            toastOptions={{
                                style: {
                                    background: '#262626',
                                    color: '#fff',
                                    border: '1px solid #404040',
                                },
                            }}
                        />
                    </ConnectionProviderWrapper>
                </Providers>
            </body>
        </html>
    )
}
