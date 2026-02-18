export interface Voice {
    label: string;
    value: string;
}

export interface VoiceGroup {
    lang: string;
    voices: Voice[];
}

export interface TTSConfig {
    channel: string;
    voice: string;
    mods: boolean;
    vips: boolean;
    customVoice: boolean;
    white: string;
    black: string;
}