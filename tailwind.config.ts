import type { Config } from 'tailwindcss';

export default <Partial<Config>>{
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: '#141414',
        moss: '#3d5f43',
        clay: '#a8583f',
        river: '#1f6f8b',
        paper: '#f7f3ec',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 18px 60px rgba(20, 20, 20, 0.18)',
      },
    },
  },
};
