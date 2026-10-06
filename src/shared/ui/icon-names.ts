export const ICON_IDS = [
  'icon-user',
  'icon-users',
  'icon-search',
  'icon-plus',
  'icon-eye',
  'icon-edit',
  'icon-trash',
  'icon-filter',
  'icon-lock',
  'icon-shield',
  'icon-logout',
  'icon-chevron-down',
  'icon-chevron-right',
  'icon-menu',
  'icon-mail',
  'icon-phone',
  'icon-home',
] as const

export type IconName = (typeof ICON_IDS)[number]
