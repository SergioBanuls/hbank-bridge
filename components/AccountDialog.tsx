'use client'

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Copy, LogOut, Check } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useConnectionContext } from '@/contexts/ConnectionContext'

interface AccountDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    accountId: string
}

export function AccountDialog({
    open,
    onOpenChange,
    accountId,
}: AccountDialogProps) {
    const { disconnect } = useConnectionContext();
    const [isCopied, setIsCopied] = useState(false)

    const handleDisconnect = async () => {
        try {
            // Disconnect and sign out
            await disconnect()
            onOpenChange(false)
        } catch (error) {
            console.error('Error disconnecting:', error)
        }
    }

    const handleCopyAddress = async () => {
        try {
            await navigator.clipboard.writeText(accountId)
            setIsCopied(true)
        } catch (error) {
            console.error('Error copying to clipboard:', error)
        }
    }

    // Reset the copied state after 3 seconds
    useEffect(() => {
        if (isCopied) {
            const timer = setTimeout(() => {
                setIsCopied(false)
            }, 1000)
            return () => clearTimeout(timer)
        }
    }, [isCopied])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='rounded-xl bg-white dark:bg-neutral-900 items-center w-[90%] sm:max-w-md border border-neutral-200 dark:border-neutral-700 shadow-lg'>
                <DialogHeader className='items-center'>
                    <div className='w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mb-4'>
                        <div className='w-8 h-8 bg-blue-600 rounded-full relative'>
                            <div className='absolute -top-1 -right-1 w-4 h-4 bg-blue-400 rounded-full'></div>
                            <div className='absolute top-1 left-1 w-3 h-3 bg-blue-300 rounded-full'></div>
                        </div>
                    </div>
                    <DialogTitle className='text-neutral-900 dark:text-white text-center text-xl font-semibold'>
                        {accountId}
                    </DialogTitle>
                </DialogHeader>

                <div className='flex flex-col gap-3 w-full mt-3'>
                    <Button
                        onClick={handleCopyAddress}
                        variant='outline'
                        className={`w-full flex items-center gap-2 py-3 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                            isCopied
                                ? 'text-green-600 dark:text-green-400 border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-950/20'
                                : 'text-neutral-700 dark:text-neutral-300'
                        }`}
                    >
                        {isCopied ? (
                            <Check className='w-4 h-4' />
                        ) : (
                            <Copy className='w-4 h-4' />
                        )}
                        {isCopied ? 'Copied!' : 'Copy Address'}
                    </Button>

                    <Button
                        onClick={handleDisconnect}
                        variant='outline'
                        className='w-full flex items-center gap-2 py-3 text-red-600 dark:text-red-400 border-neutral-200 dark:border-neutral-700 hover:bg-red-50 dark:hover:bg-red-950/20 hover:border-red-200 dark:hover:border-red-800'
                    >
                        <LogOut className='w-4 h-4' />
                        Disconnect
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}