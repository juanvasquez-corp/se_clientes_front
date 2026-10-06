import type { IconName } from './icon-names'

export type { IconName } from './icon-names'
export type IconSize = 'small' | 'control' | 'navigation'

const SIZE_CLASSES = {
  small: 'size-4',
  control: 'size-5',
  navigation: 'size-6',
} as const satisfies Record<IconSize, string>

interface DecorativeIconProps {
  name: IconName
  size?: IconSize
}

interface InformativeIconProps extends DecorativeIconProps {
  label: string
}

function DecorativeIcon({ name, size = 'control' }: DecorativeIconProps) {
  return (
    <svg
      className={`shrink-0 ${SIZE_CLASSES[size]}`}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`/assets/icons.svg#${name}`} />
    </svg>
  )
}

function InformativeIcon({
  label,
  name,
  size = 'control',
}: InformativeIconProps) {
  return (
    <svg
      className={`shrink-0 ${SIZE_CLASSES[size]}`}
      role="img"
      aria-label={label}
      focusable="false"
    >
      <use href={`/assets/icons.svg#${name}`} />
    </svg>
  )
}

export const Icon = {
  Decorative: DecorativeIcon,
  Informative: InformativeIcon,
} as const
