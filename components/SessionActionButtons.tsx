'use client'

import { useState, useEffect } from 'react'
import { useConnectionContext } from '@/contexts/ConnectionContext'
import { LoginDialog } from './auth/LoginDialog'
import { FundAccountDialog } from './FundAccountDialog'
import { Button } from './ui/button'
import { Loader2, LogOut, User } from 'lucide-react'

export function SessionActionButtons() {
    const {
        account,
        loading,
        isConnected,
        disconnect,
        user,
        hasCustodialAccount,
        createCustodialAccount,
        creatingAccount,
    } = useConnectionContext()

    const [isConnectionSelectorOpen, setIsConnectionSelectorOpen] = useState(false)
    const [fundDialogAccountId, setFundDialogAccountId] = useState<string | null>(null)

    // Check for pending fund dialog from OAuth account creation
    useEffect(() => {
        const pendingAccount = localStorage.getItem('pending_fund_account')
        if (pendingAccount) {
            localStorage.removeItem('pending_fund_account')
            setFundDialogAccountId(pendingAccount)
        }
    }, [])

    const formatAccount = (acc: string) => {
        return `${acc.slice(0, 6)}...${acc.slice(-4)}`
    }

    const handleCreate = async () => {
        const newAccountId = await createCustodialAccount()
        setFundDialogAccountId(newAccountId)
    }

    // Determine which buttons to render
    let buttons: React.ReactNode

    if (account) {
        // Connected state with Hedera account
        buttons = (
            <div className='flex items-center gap-2'>
                <Button
                    variant="ghost"
                    className='relative group overflow-hidden bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/30 text-white rounded-full pl-2 pr-4 h-11 transition-all duration-300'
                >
                    <div className='absolute inset-0 bg-linear-to-r from-blue-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500' />

                    <div className='flex items-center gap-3 relative z-10'>
                        <div className='w-7 h-7 rounded-full bg-linear-to-br from-blue-500 to-cyan-600 p-px shadow-lg shadow-blue-500/20'>
                            <div className='w-full h-full rounded-full bg-black flex items-center justify-center'>
                                <User className='w-3.5 h-3.5 text-green-400' />
                            </div>
                        </div>
                        <span className='font-mono font-bold text-sm tracking-tight'>
                            {formatAccount(account)}
                        </span>
                    </div>
                </Button>
                <Button
                    onClick={disconnect}
                    variant='ghost'
                    size='icon'
                    className='text-neutral-400 hover:text-white h-11 w-11 rounded-full'
                >
                    <LogOut className='w-4 h-4' />
                </Button>
            </div>
        )
    } else if (user && !hasCustodialAccount) {
        // Signed in but no Hedera account yet
        buttons = (
            <div className='flex items-center gap-2'>
                <Button
                    onClick={handleCreate}
                    disabled={creatingAccount}
                    className='bg-green-600 hover:bg-green-700 text-white font-bold h-11 px-5 rounded-full'
                >
                    {creatingAccount ? (
                        <span className='flex items-center gap-2'>
                            <Loader2 className='w-4 h-4 animate-spin' />
                            Creating Account...
                        </span>
                    ) : (
                        'Create Hedera Account'
                    )}
                </Button>
                <Button
                    onClick={disconnect}
                    variant='ghost'
                    size='icon'
                    className='text-neutral-400 hover:text-white h-11 w-11 rounded-full'
                >
                    <LogOut className='w-4 h-4' />
                </Button>
            </div>
        )
    } else {
        // Not connected - show login dialog
        buttons = (
            <>
                <button
                    onClick={() => setIsConnectionSelectorOpen(true)}
                    disabled={loading}
                    className='auth-btn-primary relative overflow-hidden text-white font-semibold h-11 px-6 rounded-full flex items-center gap-2 text-[14px] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
                >
                    {loading ? (
                        <>
                            <Loader2 className='w-4 h-4 animate-spin' />
                            <span>Connecting...</span>
                        </>
                    ) : (
                        <>
                            <span>Login</span>
                        </>
                    )}
                </button>
                <LoginDialog
                    open={isConnectionSelectorOpen}
                    onOpenChange={setIsConnectionSelectorOpen}
                />
            </>
        )
    }

    return (
        <>
            {buttons}
            {fundDialogAccountId && (
                <FundAccountDialog
                    open={!!fundDialogAccountId}
                    onOpenChange={(open) => { if (!open) setFundDialogAccountId(null) }}
                    accountId={fundDialogAccountId}
                />
            )}
        </>
    )
}
