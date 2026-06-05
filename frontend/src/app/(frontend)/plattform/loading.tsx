import { ListingSkeleton } from '@/components/Skeletons'

export default function Loading() {
  return <ListingSkeleton maxW="max-w-5xl" withFilters={false} />
}
