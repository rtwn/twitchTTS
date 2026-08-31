import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    // Конфигурация препроцессоров (позволяет использовать TypeScript в .svelte файлах)
    preprocess: vitePreprocess(),

    kit: {
        adapter: adapter({ runtime: 'nodejs24.x' }),

        // Настройка алиасов (псевдонимов)
        alias: {
            $lib: './src/lib',
            '$lib/*': './src/lib/*'
        }
    }
};

export default config;