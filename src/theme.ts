// Bright theme: white cards on a soft background, tuk tuk yellow for actions.
export const colors = {
  bg: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceRaised: '#EEF2F7',
  border: '#E1E7EF',
  text: '#111827',
  textMuted: '#6B7280',
  accent: '#FFC107', // tuk tuk yellow: buttons, highlights
  accentText: '#1A1400', // text on yellow
  link: '#B45309', // readable amber for text and links on white
  display: '#111827', // the meter's dark fare display
  go: '#22C55E',
  stop: '#EF4444',
  wait: '#F97316',
  good: '#16A34A',
  warn: '#D97706',
  bad: '#DC2626',
} as const;

/** Pastel tile colours from the home screen design. */
export const tiles = {
  meter: { bg: '#FFF4D1', icon: '#FFC107', iconText: '#1A1400' },
  route: { bg: '#DCF5E6', icon: '#22C55E', iconText: '#FFFFFF' },
  trips: { bg: '#DCEBFF', icon: '#5B9DFF', iconText: '#FFFFFF' },
  settings: { bg: '#EDE4FF', icon: '#8B5CF6', iconText: '#FFFFFF' },
  earnings: { bg: '#E6F7EC', icon: '#16A34A' },
  trips2: { bg: '#E7F0FF', icon: '#2563EB' },
  distance: { bg: '#FDECEE', icon: '#E11D48' },
} as const;

export const radius = { sm: 8, md: 14, lg: 22 } as const;
