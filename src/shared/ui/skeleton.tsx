type SkeletonLineWidth = 'full' | 'half' | 'three-quarters'

const BASE_CLASSES =
  'block animate-pulse rounded-sm bg-border-default motion-reduce:animate-none'

const LINE_WIDTH_CLASSES = {
  full: 'w-full',
  half: 'w-1/2',
  'three-quarters': 'w-3/4',
} as const satisfies Record<SkeletonLineWidth, string>

function SkeletonAvatar() {
  return (
    <span
      className={`${BASE_CLASSES} size-12 rounded-full`}
      data-skeleton="avatar"
      aria-hidden="true"
    />
  )
}

interface SkeletonLineProps {
  width: SkeletonLineWidth
}

function SkeletonLine({ width }: SkeletonLineProps) {
  return (
    <span
      className={`${BASE_CLASSES} h-4 ${LINE_WIDTH_CLASSES[width]}`}
      data-skeleton="line"
      aria-hidden="true"
    />
  )
}

function SkeletonField() {
  return (
    <span
      className={`${BASE_CLASSES} h-11 w-full`}
      data-skeleton="field"
      aria-hidden="true"
    />
  )
}

export const Skeleton = {
  Avatar: SkeletonAvatar,
  Field: SkeletonField,
  Line: SkeletonLine,
} as const
