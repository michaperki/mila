// Theme utilities and constants

// Colors from CSS variables
export const colors = {
  primary: 'var(--primary-color)',
  primaryLight: 'var(--primary-light-color)',
  secondary: 'var(--secondary-color)',
  background: 'var(--background-color)',
  cardBackground: 'var(--card-background-color)',
  text: 'var(--text-color)',
  textLight: 'var(--text-light-color)',
  border: 'var(--border-color)',
  success: 'var(--success-color)',
  error: 'var(--error-color)',
};

// Typography
export const typography = {
  fontSans: 'var(--font-sans)',
  fontHebrew: 'var(--font-hebrew)',
};

// CSS utility for RTL text
export const rtlTextStyle = {
  direction: 'rtl',
  unicodeBidi: 'bidi-override',
  fontFamily: typography.fontHebrew,
  textAlign: 'right',
} as const;