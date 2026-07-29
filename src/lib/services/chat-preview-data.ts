import type { ChatMessage } from './twitch-irc';
import type { SevenTVEmoteEntry } from './message-parser';

/**
 * Демо-данные для preview-режима страницы настроек (Chat.svelte рендерит их
 * без единого сетевого запроса к Twitch/7TV/FFZ — см. previewMode в
 * Chat.svelte). Вынесено в отдельный файл, чтобы не мешать основную логику
 * компонента с содержимым демо-сообщений.
 */

// Простые SVG-плейсхолдеры для 7TV/FFZ — не тянем их с реального CDN (в
// preview-режиме принципиально нет сети), но по размеру/масштабу на экране
// они ведут себя абсолютно так же, как настоящие эмоуты, т.к. рендерятся
// тем же <img class="emote">.
function placeholderEmoteSvg(bg: string, label: string): string {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">` +
        `<rect width="28" height="28" rx="6" fill="${bg}"/>` +
        `<text x="14" y="19" font-size="11" font-family="sans-serif" fill="white" text-anchor="middle">${label}</text></svg>`
    );
}

export function buildPreviewEmoteMaps(): {
    emoteMap: Map<string, SevenTVEmoteEntry>;
    channelEmoteMap: Map<string, string>;
} {
    const emoteMap = new Map<string, SevenTVEmoteEntry>();
    const channelEmoteMap = new Map<string, string>();

    emoteMap.set('StvSample', { url: placeholderEmoteSvg('#5b21b6', '7TV'), zeroWidth: false });
    emoteMap.set('StvOverlay', { url: placeholderEmoteSvg('#facc15', '✦'), zeroWidth: true });
    channelEmoteMap.set('FfzSample', placeholderEmoteSvg('#00b6f0', 'FFZ'));

    return { emoteMap, channelEmoteMap };
}

const WELCOME_TEXT = 'Добро пожаловать на стрим! Погнали Kappa';
const kappaStart = WELCOME_TEXT.indexOf('Kappa');

export const PREVIEW_MESSAGES: ChatMessage[] = [
    {
        id: 'preview-1', channel: '', username: 'zonlex', userId: '1',
        displayName: 'Zonlex', color: '#00ff7f',
        badges: [{ name: 'broadcaster', version: '1' }], badgeInfo: [],
        emotes: kappaStart >= 0 ? { '25': [`${kappaStart}-${kappaStart + 4}`] } : {},
        isMod: false, isVip: false, isBroadcaster: true, isSubscriber: false, isAction: false,
        isHighlighted: false, isFirstMessage: false,
        text: WELCOME_TEXT, raw: ''
    },
    {
        id: 'preview-2', channel: '', username: 'bicme', userId: '2',
        displayName: 'bicme', color: '#9146ff',
        badges: [{ name: 'subscriber', version: '12' }], badgeInfo: [], emotes: {},
        isMod: false, isVip: false, isBroadcaster: false, isSubscriber: true, isAction: false,
        isHighlighted: false, isFirstMessage: true,
        text: 'Первый раз тут, красиво оформлено!', raw: ''
    },
    {
        id: 'preview-3', channel: '', username: 'moderatorsam', userId: '3',
        displayName: 'ModeratorSam', color: '',
        badges: [{ name: 'moderator', version: '1' }], badgeInfo: [], emotes: {},
        isMod: true, isVip: false, isBroadcaster: false, isSubscriber: false, isAction: false,
        isHighlighted: false, isFirstMessage: false,
        text: '@Zonlex спасибо за стрим, было круто!', raw: ''
    },
    {
        id: 'preview-4', channel: '', username: 'donor228', userId: '4',
        displayName: 'donor228', color: '#ff69b4',
        badges: [], badgeInfo: [], emotes: {},
        isMod: false, isVip: false, isBroadcaster: false, isSubscriber: false, isAction: false,
        isHighlighted: true, isFirstMessage: false,
        text: 'Задонатил, чтобы это увидели все!', raw: ''
    },
    {
        id: 'preview-5', channel: '', username: 'stvfan', userId: '5',
        displayName: 'stvfan', color: '#3b82f6',
        badges: [], badgeInfo: [], emotes: {},
        isMod: false, isVip: false, isBroadcaster: false, isSubscriber: false, isAction: false,
        isHighlighted: false, isFirstMessage: false,
        // Демонстрация: FfzSample — обычный смайл, StvSample — обычный
        // смайл, StvOverlay — zero-width, должен сесть ПОВЕРХ предыдущего
        // (StvSample), а не рядом с ним.
        text: 'вот так теперь выглядят оверлеи FfzSample StvSample StvOverlay', raw: ''
    }
];
