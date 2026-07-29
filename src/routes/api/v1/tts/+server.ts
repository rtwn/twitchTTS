import { error, json } from '@sveltejs/kit';
import { ALL_STREAMLABS_VOICES } from '$lib/constants/voices';

/**
 * Простой rate-limit по IP в памяти процесса. Эндпоинт полностью публичный
 * (никакой аутентификации, вызвать может кто угодно, кто узнает URL) —
 * без ограничения частоты его можно было использовать как бесплатный
 * релей к Streamlabs Polly в обход собственного оверлея. В памяти процесса,
 * а не в общей БД — этого достаточно для личного/некоммерческого масштаба
 * этого проекта; при развёртывании на нескольких инстансах за балансировщиком
 * лимит будет считаться независимо на каждом инстансе, но это по-прежнему
 * лучше, чем полное отсутствие лимита.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestLog = new Map<string, number[]>();
let callsSinceCleanup = 0;

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    timestamps.push(now);
    requestLog.set(ip, timestamps);

    // Иначе requestLog сам по себе рос бы бесконечно на долго работающем
    // сервере — по записи на каждый уникальный IP, который когда-либо
    // сюда заходил, без единой уборки.
    if (++callsSinceCleanup > 200) {
        callsSinceCleanup = 0;
        for (const [key, times] of requestLog) {
            if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) requestLog.delete(key);
        }
    }

    return timestamps.length > RATE_LIMIT_MAX_REQUESTS;
}

export async function POST({ request, getClientAddress }) {
    try {
        if (isRateLimited(getClientAddress())) {
            throw error(429, 'Too many requests, please slow down');
        }

        const { voice, text } = await request.json();

        if (!text || text.trim().length === 0) {
            throw error(400, 'Message text is required');
        }

        // Раньше длину ограничивал только клиент (Player.svelte, .substring(0,
        // 500)) — а этот эндпоинт публичный, его может вызвать кто угодно
        // напрямую, в обход клиента. Дублируем ограничение на сервере.
        const trimmedText = text.trim().substring(0, 500);

        const isValidVoice = ALL_STREAMLABS_VOICES.some((v) => v.value === voice);
        const selectedVoice = isValidVoice ? voice : 'Brian';

        const response = await fetch('https://streamlabs.com/polly/speak', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Referer': 'https://streamlabs.com/'
            },
            body: JSON.stringify({
                voice: selectedVoice,
                text: trimmedText
            })
        });

        if (!response.ok) throw error(500, 'TTS provider unavailable');

        const data = await response.json();

        if (data.success && data.speak_url) {
            return json({ success: true, url: data.speak_url });
        }

        throw error(500, 'TTS generation failed');
    } catch (err: any) {
        if (err.status) throw err;
        throw error(500, 'Internal Server Error');
    }
}