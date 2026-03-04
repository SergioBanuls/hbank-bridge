'use client'

/**
 * Custodial Confirm Dialog
 *
 * Explicit confirmation dialog before signing a transaction via KMS.
 * Since there's no wallet popup for custodial users, this serves as
 * the user's chance to review and confirm the operation.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Shield } from 'lucide-react'

interface CustodialConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  details?: { label: string; value: string }[]
  onConfirm: () => void
  loading?: boolean
}

export function CustodialConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  details,
  onConfirm,
  loading = false,
}: CustodialConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='bg-neutral-900 border-neutral-700 max-w-sm'>
        <DialogHeader>
          <div className='flex items-center gap-2'>
            <Shield className='w-5 h-5 text-amber-400' />
            <DialogTitle className='text-white'>{title}</DialogTitle>
          </div>
          <DialogDescription className='text-neutral-400'>
            {description}
          </DialogDescription>
        </DialogHeader>

        {details && details.length > 0 && (
          <div className='bg-neutral-800 rounded-lg p-3 space-y-2'>
            {details.map((detail, i) => (
              <div key={i} className='flex justify-between text-sm'>
                <span className='text-neutral-400'>{detail.label}</span>
                <span className='text-white font-mono text-xs'>{detail.value}</span>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className='flex flex-row gap-2 mt-2'>
          <Button
            onClick={() => onOpenChange(false)}
            disabled={loading}
            variant='ghost'
            className='flex-1 text-neutral-400 hover:text-white'
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className='flex-1 bg-blue-600 hover:bg-blue-700 text-white'
          >
            {loading ? (
              <span className='flex items-center gap-2'>
                <Loader2 className='w-4 h-4 animate-spin' />
                Signing...
              </span>
            ) : (
              'Confirm & Sign'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
