import type { TTSConfig } from '../types';

export function generateTTSLink(origin: string, config: TTSConfig): string {
    const params = new URLSearchParams({
        channel: config.channel.trim(),
        voice: config.voice,
        mods: config.mods.toString(),
        vips: config.vips.toString(),
        customVoice: config.customVoice.toString(),
        white: config.white.trim(),
        black: config.black.trim()
    });
    return `${origin}/tts?${params.toString()}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (!navigator.clipboard) return false;
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export function parseUserList(list: string): string[] {
    if (!list) return [];
    return list.split(',').map(n => n.trim().toLowerCase()).filter(n => n !== '');
}