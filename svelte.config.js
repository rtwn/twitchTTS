import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    // Конфигурация препроцессоров (позволяет использовать TypeScript в .svelte файлах)
    preprocess: vitePreprocess(),

    kit: {
        // adapter-auto для автоматического деплоя на Vercel/Netlify/etc.
        adapter: adapter(),

        // Настройка алиасов (псевдонимов)
        alias: {
            $lib: './src/lib',
            '$lib/*': './src/lib/*'
        }
    }
};

export default config;