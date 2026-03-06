import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
    return (
        <div className="flex justify-center mt-28 w-full">
            <div className="max-w-6xl w-full px-4 space-y-6 pb-12">

                {/* Hero skeleton */}
                <div className="bg-neutral-900 rounded-3xl p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-12 w-56" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-16 w-40 rounded-2xl" />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Allocation bar skeleton */}
                <div className="bg-neutral-900 rounded-3xl p-6">
                    <Skeleton className="h-3 w-full rounded-full" />
                    <div className="flex gap-6 mt-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Skeleton className="w-2.5 h-2.5 rounded-full" />
                                <Skeleton className="h-4 w-28" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Portfolio card skeleton */}
                <div className="bg-neutral-900 rounded-3xl overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 pt-6 pb-2">
                        <Skeleton className="h-6 w-32" />
                        <div className="flex gap-1.5">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-9 w-32 rounded-full" />
                            ))}
                        </div>
                    </div>
                    <div className="px-6 pb-6 space-y-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-3.5">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="w-10 h-10 rounded-full" />
                                    <div className="space-y-2">
                                        <Skeleton className="h-3.5 w-24" />
                                        <Skeleton className="h-3 w-16" />
                                    </div>
                                </div>
                                <div className="text-right space-y-2">
                                    <Skeleton className="h-3.5 w-20 ml-auto" />
                                    <Skeleton className="h-3 w-14 ml-auto" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
