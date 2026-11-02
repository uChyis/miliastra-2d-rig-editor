/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        panel: 'var(--panel)',
        surface: 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        'surface-active': 'var(--surface-active)',
        outline: 'var(--outline)',
        'outline-strong': 'var(--outline-strong)',
        text: 'var(--text)',
        muted: 'var(--text-muted)',
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        'primary-text': 'var(--primary-text)',
        'on-primary': 'var(--on-primary)',
        danger: 'var(--danger)',
        'danger-text': 'var(--danger-text)',
        warning: 'var(--warning)',
        'warning-text': 'var(--warning-text)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
        inner: 'var(--radius-inner)',
      },
      fontFamily: {
        sans: ['Google Sans', 'Noto Sans SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
