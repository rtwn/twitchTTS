/**
 * Лёгкий клиент Twitch chat поверх WebSocket IRC.
 * Заменяет ComfyJS: подключается анонимно (justinfan###), не требует OAuth
 * для чтения чата, сам обрабатывает PING/PONG, RECONNECT и переподключение
 * с экспоненциальной задержкой.
 *
 * Двойное экранирование по IRCv3 (tag values) и формат тегов Twitch описаны тут:
 * https://dev.twitch.tv/docs/irc/tags/
 */

export interface TwitchBadge {
    name: string;
    version: string;
}

export interface ChatMessage {
    id: string;
    channel: string;
    username: string;      // login (нижний регистр)
    userId: string;        // числовой Twitch ID — приходит прямо в теге, резолвить через IVR не нужно
    displayName: string;
    color: string;         // может быть '' — пользователь не задавал цвет
    badges: TwitchBadge[];
    badgeInfo: TwitchBadge[]; // например subscriber:N (число месяцев)
    emotes: Record<string, string[]>; // emoteId -> ['start-end', ...]
    isMod: boolean;
    isVip: boolean;
    isBroadcaster: boolean;
    isSubscriber: boolean;
    isAction: boolean;     // /me сообщение
    isHighlighted: boolean; // зритель оплатил "Highlight My Message"
    isFirstMessage: boolean; // первое сообщение этого зрителя в канале
    text: string;
    raw: string;
}

export interface ClearChatEvent {
    channel: string;
    targetUser?: string;   // если undefined — очистка всего чата
}

// CLEARMSG — модератор удалил ОДНО конкретное сообщение (не таймаут/бан
// всего пользователя, для этого есть отдельный CLEARCHAT выше).
export interface ClearMsgEvent {
    channel: string;
    targetMsgId: string;
}

interface IRCTagMap { [key: string]: string; }

interface ParsedIRC {
    tags: IRCTagMap;
    prefix: string;
    command: string;
    params: string[];
    trailing: string;
}

const UNESCAPE_MAP: Record<string, string> = {
    ':': ';',
    's': ' ',
    '\\': '\\',
    'r': '\r',
    'n': '\n'
};

function unescapeTagValue(value: string): string {
    let out = '';
    for (let i = 0; i < value.length; i++) {
        if (value[i] === '\\' && i + 1 < value.length) {
            const next = value[i + 1];
            out += UNESCAPE_MAP[next] ?? next;
            i++;
        } else {
            out += value[i];
        }
    }
    return out;
}

function parseIRCMessage(raw: string): ParsedIRC | null {
    if (!raw) return null;
    let rest = raw;
    const tags: IRCTagMap = {};

    if (rest.startsWith('@')) {
        const sp = rest.indexOf(' ');
        if (sp === -1) return null; // повреждённая/обрезанная строка — не пытаемся угадать
        const rawTags = rest.slice(1, sp);
        rest = rest.slice(sp + 1);
        rawTags.split(';').forEach((pair) => {
            const eq = pair.indexOf('=');
            if (eq === -1) { tags[pair] = ''; return; }
            const key = pair.slice(0, eq);
            const val = pair.slice(eq + 1);
            tags[key] = unescapeTagValue(val);
        });
    }

    let prefix = '';
    if (rest.startsWith(':')) {
        const sp = rest.indexOf(' ');
        if (sp === -1) return null;
        prefix = rest.slice(1, sp);
        rest = rest.slice(sp + 1);
    }

    let trailing = '';
    const trailingIdx = rest.indexOf(' :');
    let paramsPart = rest;
    if (trailingIdx !== -1) {
        paramsPart = rest.slice(0, trailingIdx);
        trailing = rest.slice(trailingIdx + 2);
    } else if (rest.startsWith(':')) {
        trailing = rest.slice(1);
        paramsPart = '';
    }

    const params = paramsPart.split(' ').filter(Boolean);
    const command = params.shift() || '';

    return { tags, prefix, command, params, trailing };
}

function parseBadgeList(raw: string | undefined): TwitchBadge[] {
    if (!raw) return [];
    return raw.split(',').filter(Boolean).map((entry) => {
        const [name, version] = entry.split('/');
        return { name, version: version ?? '0' };
    });
}

function parseEmotes(raw: string | undefined): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    if (!raw) return result;
    raw.split('/').filter(Boolean).forEach((chunk) => {
        const [id, ranges] = chunk.split(':');
        if (!id || !ranges) return;
        result[id] = ranges.split(',');
    });
    return result;
}

type MessageHandler = (msg: ChatMessage) => void;
type ClearChatHandler = (evt: ClearChatEvent) => void;
type ClearMsgHandler = (evt: ClearMsgEvent) => void;
type StatusHandler = () => void;

export class TwitchIRC {
    private ws: WebSocket | null = null;
    private channel = '';
    private reconnectAttempts = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private manuallyClosed = false;
    private readonly nick: string;

    private readonly messageHandlers: MessageHandler[] = [];
    private readonly clearChatHandlers: ClearChatHandler[] = [];
    private readonly clearMsgHandlers: ClearMsgHandler[] = [];
    private readonly connectHandlers: StatusHandler[] = [];
    private readonly disconnectHandlers: StatusHandler[] = [];

    constructor() {
        this.nick = `justinfan${Math.floor(10000 + Math.random() * 80000)}`;
    }

    onMessage(handler: MessageHandler) { this.messageHandlers.push(handler); }
    onClearChat(handler: ClearChatHandler) { this.clearChatHandlers.push(handler); }
    onClearMsg(handler: ClearMsgHandler) { this.clearMsgHandlers.push(handler); }
    // onConnect/onDisconnect сейчас не используются виджетом чата (ему хватает
    // onMessage/onClearChat), но это осознанно оставлено в публичном API
    // класса — стандартные хуки для любого потребителя WebSocket-обёртки
    // (например, чтобы показать "переподключение..." в UI). Не мёртвый код,
    // а просто пока не задействованная часть интерфейса.
    onConnect(handler: StatusHandler) { this.connectHandlers.push(handler); }
    onDisconnect(handler: StatusHandler) { this.disconnectHandlers.push(handler); }

    connect(channel: string) {
        this.channel = channel.toLowerCase().replace(/^#/, '');
        this.manuallyClosed = false;
        this.open();
    }

    disconnect() {
        this.manuallyClosed = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.ws) {
            try { this.ws.close(); } catch { /* noop */ }
        }
        this.ws = null;
    }

    private open() {
        this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

        this.ws.onopen = () => {
            this.reconnectAttempts = 0;
            this.ws!.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
            this.ws!.send(`NICK ${this.nick}`);
            this.ws!.send(`JOIN #${this.channel}`);
            this.connectHandlers.forEach((h) => h());
        };

        this.ws.onmessage = (ev) => this.handleRaw(ev.data as string);

        this.ws.onclose = () => {
            this.disconnectHandlers.forEach((h) => h());
            if (!this.manuallyClosed) this.scheduleReconnect();
        };

        this.ws.onerror = () => {
            // onclose всё равно сработает следом — переподключение планируем там
            try { this.ws?.close(); } catch { /* noop */ }
        };
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.manuallyClosed) this.open();
        }, delay);
    }

    private handleRaw(data: string) {
        // Twitch может прислать несколько IRC-строк в одном WS-фрейме
        data.split('\r\n').filter(Boolean).forEach((line) => this.handleLine(line));
    }

    private handleLine(line: string) {
        const parsed = parseIRCMessage(line);
        if (!parsed) return;

        switch (parsed.command) {
            case 'PING':
                this.ws?.send(`PONG :${parsed.trailing || 'tmi.twitch.tv'}`);
                break;

            case 'RECONNECT':
                try { this.ws?.close(); } catch { /* noop */ }
                break;

            case 'PRIVMSG':
                this.handlePrivmsg(parsed);
                break;

            case 'CLEARCHAT': {
                const targetChannel = (parsed.params[0] || '').replace('#', '');
                this.clearChatHandlers.forEach((h) => h({
                    channel: targetChannel,
                    targetUser: parsed.trailing || undefined
                }));
                break;
            }

            case 'CLEARMSG': {
                const targetMsgId = parsed.tags['target-msg-id'];
                if (!targetMsgId) break; // без id нечего удалять
                const targetChannel = (parsed.params[0] || '').replace('#', '');
                this.clearMsgHandlers.forEach((h) => h({ channel: targetChannel, targetMsgId }));
                break;
            }

            default:
                break;
        }
    }

    private handlePrivmsg(parsed: ParsedIRC) {
        const t = parsed.tags;
        const channel = (parsed.params[0] || '').replace('#', '');
        const loginMatch = /^([^!]+)!/.exec(parsed.prefix);
        const username = (loginMatch?.[1] || t['display-name'] || '').toLowerCase();

        let text = parsed.trailing;
        let isAction = false;
        // /me сообщения оборачиваются в \x01ACTION ... \x01
        const actionMatch = /^\x01ACTION (.*)\x01$/.exec(text);
        if (actionMatch) { isAction = true; text = actionMatch[1]; }

        const badges = parseBadgeList(t['badges']);
        const isMod = t['mod'] === '1' || badges.some((b) => b.name === 'moderator');
        const isBroadcaster = badges.some((b) => b.name === 'broadcaster');
        const isVip = badges.some((b) => b.name === 'vip');
        const isSubscriber = t['subscriber'] === '1' || badges.some((b) => b.name === 'subscriber');

        const msg: ChatMessage = {
            id: t['id'] || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            channel,
            username,
            userId: t['user-id'] || '',
            displayName: t['display-name'] || username,
            color: t['color'] || '',
            badges,
            badgeInfo: parseBadgeList(t['badge-info']),
            emotes: parseEmotes(t['emotes']),
            isMod,
            isVip,
            isBroadcaster,
            isSubscriber,
            isAction,
            isHighlighted: t['msg-id'] === 'highlighted-message',
            isFirstMessage: t['first-msg'] === '1',
            text,
            raw: parsed.trailing
        };

        this.messageHandlers.forEach((h) => h(msg));
    }
}
