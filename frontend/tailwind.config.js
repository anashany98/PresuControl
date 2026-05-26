/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Surface / Background ──
        surface: {
          bg:      '#f2ece3',
          panel:   '#fdfaf5',
          strong:  '#ffffff',
          cream:   '#efe5d5',
          warm:    '#fdf8f0',
          sand:    '#f9f6f2',
        },
        // ── Brand / Primary (terracotta) ──
        brand: {
          50:  '#fdf0eb',
          100: '#fce4d8',
          200: '#f8c9b1',
          300: '#f2a885',
          400: '#e8875d',
          500: '#d47043',  // primary
          600: '#b85a33',  // primary-dark
          700: '#9a4828',
          800: '#7e3c23',
          900: '#693420',
        },
        // ── Text / Muted ──
        ink: {
          DEFAULT: '#2d241e',
          muted:   '#69563d',
          faint:   '#9a8b7a',
          inverse: '#ffffff',
        },
        // ── Borders / Lines ──
        border: {
          DEFAULT: '#c4b49a',
          light:   '#d9ccb8',
          subtle:  '#e7ded2',
        },
        // ── Semantic ──
        danger: {
          DEFAULT: '#c0392b',
          light:   '#fef5f3',
        },
        warning: {
          DEFAULT: '#d97706',
          light:   '#fffbf5',
        },
        success: {
          DEFAULT: '#2d8a4e',
          light:   '#f3faf5',
        },
        info: {
          DEFAULT: '#3b82f6',
          light:   '#eff6ff',
        },
        // ── Presupuesto states ──
        state: {
          borrador:    '#a8a29e',
          pendiente:   '#e5e7eb',
          enviado:     '#3b82f6',
          aceptado:    '#22c55e',
          pedido:      '#8b5cf6',
          plazo:       '#06b6d4',
          fabricacion: '#ec4899',
          entregado:   '#6b7280',
          cancelado:   '#1c1917',
          incidencia:  '#ef4444',
        },
        // ── Priority ──
        priority: {
          verde:    '#22c55e',
          amarillo: '#eab308',
          naranja:  '#f97316',
          rojo:     '#ef4444',
          critico:  '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1.25' }],
        'xs':  ['0.75rem',   { lineHeight: '1.35' }],
        'sm':  ['0.8125rem', { lineHeight: '1.45' }],
        'base':['0.9375rem', { lineHeight: '1.6' }],
        'lg':  ['1.125rem',  { lineHeight: '1.5' }],
        'xl':  ['1.25rem',   { lineHeight: '1.4' }],
        '2xl': ['1.5rem',    { lineHeight: '1.3' }],
        '3xl': ['1.875rem',  { lineHeight: '1.2' }],
      },
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '14px',
        'xl': '20px',
        '2xl':'28px',
      },
      boxShadow: {
        'card':  '0 1px 3px rgba(0,0,0,.06), 0 8px 24px rgba(61,50,41,.10)',
        'soft':  '0 1px 2px rgba(0,0,0,.04), 0 4px 12px rgba(61,50,41,.08)',
        'btn':   '0 8px 20px rgba(184,115,51,.25)',
        'btn-hv':'0 10px 24px rgba(184,115,51,.30)',
        'modal': '0 12px 32px rgba(61,50,41,.12)',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease',
        'fade-slide': 'fadeSlideDown 0.2s ease',
        'slide-left': 'slideInLeft 0.25s ease',
        'badge-pop':  'badgeIn 0.3s ease',
        'toast-in':   'toastIn 0.3s ease',
        'shake':      'shake 0.3s ease',
        'shimmer':    'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeSlideDown: {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        badgeIn: {
          '0%':   { transform: 'scale(0)' },
          '100%': { transform: 'scale(1)' },
        },
        toastIn: {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%':      { transform: 'translateX(-4px)' },
          '75%':      { transform: 'translateX(4px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
    },
  },
  plugins: [],
}
