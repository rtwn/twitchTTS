import type { TTSConfig } from '../types';

/**
 * Генерирует полную ссылку для виджета TTS с учетом всех настроек.
 * Добавлены параметры ytEnabled и ytMaxLen для управления YouTube-плеером.
 */
export function generateTTSLink(origin: string, config: TTSConfig): string {
    const params = new URLSearchParams({
        channel: config.channel.trim(),
        voice: config.voice,
        mods: config.mods.toString(),
        vips: config.vips.toString(),
        customVoice: config.customVoice.toString(),
        // Новые параметры для YouTube
        ytEnabled: config.ytEnabled.toString(),
        ytMaxLen: config.ytMaxLen.toString(),
        white: config.white.trim(),
        black: config.black.trim()
    });

    return `${origin}/tts?${params.toString()}`;
}

/**
 * Копирует переданный текст в буфер обмена браузера.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (!navigator.clipboard) return false;
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * Превращает строку имен через запятую в массив очищенных имен в нижнем регистре.
 */
export function parseUserList(list: string): string[] {
    if (!list) return [];
    return list.split(',').map(n => n.trim().toLowerCase()).filter(n => n !== '');
}