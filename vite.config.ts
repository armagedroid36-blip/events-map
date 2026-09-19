import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Правки <head> на этапе сборки (index.html → dist/index.html, а через него и
 * все пре-рендеренные страницы, т.к. seo-prerender наследует head):
 *
 * 1) Входной CSS встраивается в HTML вместо тега <link rel="stylesheet">.
 *    Стилевой файл (19.7 КБ) — единственный render-blocking ресурс: браузер не
 *    рисует первую краску, пока его не скачает, а в мобильной модели он ещё и
 *    конкурирует за канал с чанками приложения. Инлайн убирает и запрос, и
 *    ожидание. Файл остаётся в сборке (на случай повторных визитов и для
 *    кэша), но в разметке на него больше нет ссылки.
 *
 * 2) preconnect к API Supabase: первый запрос данных (list_active_events)
 *    стартует примерно на 600 мс позже первого пакета, и всё это время
 *    соединение (DNS + TLS) устанавливается заново. Lighthouse оценивает
 *    экономию в 300 мс на этом.
 */
function headOptimizations(supabaseUrl: string | undefined): Plugin {
  let origin = '';
  try {
    origin = supabaseUrl ? new URL(supabaseUrl).origin : '';
  } catch {
    origin = '';
  }
  return {
    name: 'head-optimizations',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        let out = html;
        if (ctx.bundle) {
          for (const [file, asset] of Object.entries(ctx.bundle)) {
            if (asset.type !== 'asset' || !file.endsWith('.css')) continue;
            const css =
              typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source);
            const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const linkRe = new RegExp(`<link[^>]*href="/${escaped}"[^>]*>`);
            if (linkRe.test(out)) out = out.replace(linkRe, `<style>${css}</style>`);
          }
        }
        if (origin && !out.includes(`rel="preconnect" href="${origin}"`)) {
          out = out.replace(
            /(<meta charset="UTF-8" \/>)/,
            `$1\n    <link rel="preconnect" href="${origin}" crossorigin />`,
          );
        }
        return out;
      },
    },
  };
}

/**
 * Конфигурация сборки. Плагин Tailwind подключается здесь, плюс правки head
 * (инлайн CSS и preconnect к API) — см. headOptimizations выше.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss(), headOptimizations(env.VITE_SUPABASE_URL)],
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
  };
});
