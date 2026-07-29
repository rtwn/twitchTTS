export interface Voice {
    label: string;
    value: string;
}

export interface VoiceGroup {
    lang: string;
    voices: Voice[];
}