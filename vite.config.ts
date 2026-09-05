import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Конфигурация сборки. Плагин Tailwind подключается здесь.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Абсолютные пути от корня: сайт развёрнут на корневом домене (mypins.site,
  // github.io/events-map 301-редиректит на него). Чистые URL (/event/<id>/...)
  // отдаются через 404.html-фолбэк GitHub Pages — при base './' ассеты на
  // вложенном пути ушли бы в подпапку маршрута (404).
  base: '/',
  // Разрешаем доступ к сайту через внешние адреса (туннели для просмотра с телефона)
  preview: {
    host: true,
    allowedHosts: true,
  },
});
