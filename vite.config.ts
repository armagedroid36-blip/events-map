import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Конфигурация сборки. Плагин Tailwind подключается здесь.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Относительные пути — сайт работает из подпапки (GitHub Pages)
  base: './',
  // Разрешаем доступ к сайту через внешние адреса (туннели для просмотра с телефона)
  preview: {
    host: true,
    allowedHosts: true,
  },
});
