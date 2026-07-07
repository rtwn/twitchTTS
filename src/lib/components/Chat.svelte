<script lang="ts">
    import { onMount } from 'svelte';
    import {
        fetch7TVEmotesByTwitchId,
        fetch7TVUserCosmetics,
        fetchFFZEmotes,
        fetchFFZBadges,
        fetchFFZPersonalBadges,
        preloadSevenTVPaintCatalog,
        resolveTwitchUser
    } from '$lib/services/twitch-api';
    import type { ChatMessage } from '$lib/services/twitch-irc';
    import { page } from '$app/state';

    export let channel: string;
    // Статус реального WebSocket-подключения к Twitch IRC — приходит из
    // widget/+page.svelte (там живёт TwitchIRC). Индикатор загрузки должен
    // висеть, пока не готовы ОБА источника: и бейджи/эмоуты канала, и сам
    // сокет чата — иначе он пропадал бы раньше, чем реально появятся
    // сообщения.
    export let ircConnected = true;

    const urlParams = page.url.searchParams;

    // Персональные плюшки (7TV-цвет/бейдж, личный FFZ-бейдж) можно выключить
    // через ?personalCosmetics=false, если не нужны доп. запросы на чатера.
    const personalCosmeticsEnabled = urlParams.get('personalCosmetics') !== 'false';
    // Через сколько сообщение исчезает само по себе (0 — не исчезает,
    // только вытесняется новыми, как раньше).
    const messageLifetimeMs = parseInt(urlParams.get('messageLifetime') || '0');

    // Независимые тумблеры отображения — сеть/расчёт всё равно идут (кроме
    // случая personalCosmeticsEnabled=false выше), эти флаги решают только,
    // показывать ли уже готовый результат.
    const showBadges = urlParams.get('showBadges') !== 'false';
    const showStvColors = urlParams.get('showStvColors') !== 'false';
    const showHighlighted = urlParams.get('showHighlighted') !== 'false';
    const showFirstTimeChatter = urlParams.get('showFirstTimeChatter') !== 'false';

    // Скрытие команд (!tts, !skip и т.п.) из ВИЗУАЛЬНОГО чата — сама
    // обработка команд для TTS живёт отдельно в widget/+page.svelte и тут
    // никак не затрагивается, это только про то, что видно на оверлее.
    const hideCommands = urlParams.get('hideCommands') === 'true';
    const commandPrefixes = (urlParams.get('commandPrefixes') || '!,#,=')
        .split(',').map((p) => p.trim()).filter(Boolean);

    // Автоопределение известных чат-ботов — без ручного вписывания ников.
    // Список — самые распространённые публичные чат-боты Twitch; их логины
    // фиксированы и не меняются от канала к каналу, поэтому просто держим
    // такой список, а не просим стримера перечислять их вручную.
    const hideBots = urlParams.get('hideBots') !== 'false';
    const KNOWN_BOTS = new Set([
        'nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot',
        'wizebot', 'deepbot', 'phantombot', 'ankhbot', 'scorpbot', 'sery_bot',
        'commanderroot', 'soundalerts', 'blerp', 'own3d', 'restreambot',
        'botisimo', 'coebot', 'stay_hydrated_bot', 'kofistreambot', 'streamholics'
    ]);

    // Превью-режим для страницы настроек: рендерит несколько демо-сообщений
    // без единого сетевого запроса или подключения к Twitch — используется,
    // чтобы честно показать РЕАЛЬНЫЙ компонент чата (тот же код, тот же CSS)
    // в превью настроек, а не отдельную, легко рассинхронизирующуюся копию.
    const previewMode = urlParams.get('preview') === 'true';

    let chatConfig = {
        fontSize: urlParams.get('fontSize') || '28px',
        emoteSize: urlParams.get('emoteSize') || '1.5em',
        badgeSize: urlParams.get('badgeSize') || '1em',
        fontWeight: urlParams.get('fontWeight') || '600',
        outlineColor: '#000000',
        outlineSize: urlParams.get('outlineSize') || '4px',
        spacing: urlParams.get('spacing') || '10px',
        fontFamily: urlParams.get('font') || 'sans-serif'
    };

    type Fragment =
        | { type: 'text'; val: string; mentionColor?: string }
        | { type: 'emote'; urls: string[] };
    type UIMessage = {
        id: string;
        username: string; // login, нужен для докладки бейджей после resolve
        user: string;
        color: string;
        paintBackgroundImage?: string;
        paintDropShadow?: string;
        fragments: Fragment[];
        badgeUrls: string[];
        isHighlighted: boolean;
        isFirstMessage: boolean;
    };

    let messages: UIMessage[] = [];
    let isLoadingData = true; // пока грузятся бейджи/эмоуты канала
    $: showLoadingStatus = !previewMode && (isLoadingData || !ircConnected);
    let emoteMap = new Map<string, { url: string; zeroWidth: boolean }>();
    let channelEmoteMap = new Map<string, string>();
    let badgeDictionary: Record<string, string> = {};
    let ffzModBadge: string | undefined;
    let ffzVipBadge: string | undefined;
    let ffzChannelUserBadges = new Map<string, string[]>();

    // Цвета зрителей, которые уже писали в чат (login -> цвет). Используется
    // для подсветки упоминаний (@ник и просто ник) их собственным цветом.
    // Обновляется по мере поступления сообщений — упоминания людей, которые
    // ещё не написали ни разу в этой сессии, подсветить нечем, это ожидаемо.
    let userColorMap = new Map<string, string>();

    // Стандартная палитра Twitch для зрителей, которые никогда не выбирали
    // себе цвет ника — тег `color` в IRC у них пустой. Раньше такие ники
    // просто становились белыми; так делают "настоящие" клиенты (сам Twitch,
    // Chatterino и т.д.) — выбирают стабильный цвет из этого набора по нику,
    // чтобы разные зрители визуально не сливались в один белый.
    const DEFAULT_NAME_COLORS = [
        '#FF0000', '#0000FF', '#00FF00', '#B22222', '#FF7F50',
        '#9ACD32', '#FF4500', '#2E8B57', '#DAA520', '#D2691E',
        '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F'
    ];

    function defaultColorForUser(username: string): string {
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
        }
        return DEFAULT_NAME_COLORS[hash % DEFAULT_NAME_COLORS.length];
    }

    function handleImageError(event: Event) {
        const img = event.currentTarget as HTMLImageElement;
        if (img) img.style.display = 'none';
    }

    async function loadBadges(broadcasterId: string) {
        try {
            const res = await fetch(`/api/v1/badges?broadcasterId=${broadcasterId}`);
            if (!res.ok) return;
            const data = await res.json();
            badgeDictionary = data.badges || {};
        } catch (e) {
            console.error('Не удалось загрузить бейджи Twitch:', e);
        }
    }

    async function loadChannelExtras(twitchId: string, login: string) {
        const [ffzEmotes, stv, ffzBadges] = await Promise.all([
            fetchFFZEmotes(login).catch(() => new Map<string, string>()),
            fetch7TVEmotesByTwitchId(twitchId).catch(() => new Map()),
            fetchFFZBadges(login).catch(() => ({ userBadges: new Map() } as import('$lib/services/twitch-api').FFZBadges))
        ]);
        channelEmoteMap = ffzEmotes;
        emoteMap = stv as Map<string, { url: string; zeroWidth: boolean }>;
        ffzModBadge = ffzBadges.moderatorBadgeUrl;
        ffzVipBadge = ffzBadges.vipBadgeUrl;
        ffzChannelUserBadges = ffzBadges.userBadges;
    }

    /**
     * Разбирает текст сообщения на фрагменты текст/эмоут.
     * Порядок приоритета: нативные твич-эмоуты (по индексам из тегов IRC,
     * это единственно надёжный способ, т.к. текст мог содержать похожие
     * слова) → 7TV → FFZ. Плюс упоминания (@ник / ник) подсвечиваются
     * цветом упомянутого, если он уже писал в чат.
     *
     * Zero-width 7TV эмоуты (оверлеи вроде рожек/шапок) не создают новый
     * фрагмент, а докладываются в `urls` последнего эмоут-фрагмента — так
     * несколько оверлеев подряд корректно стопкой садятся на один и тот же
     * обычный смайл, а не рисуются рядом как отдельные картинки.
     */
    function parseMessage(text: string, twitchEmotes: Record<string, string[]> | undefined): Fragment[] {
        const nodes: { type: 'emote'; val: string; start: number; end: number }[] = [];
        if (twitchEmotes) {
            Object.entries(twitchEmotes).forEach(([id, positions]) => {
                positions.forEach((range) => {
                    const [start, end] = range.split('-').map(Number);
                    nodes.push({
                        type: 'emote',
                        val: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`,
                        start,
                        end
                    });
                });
            });
        }
        nodes.sort((a, b) => a.start - b.start);

        const result: Fragment[] = [];
        let cur = 0;
        // Последний СОДЕРЖАТЕЛЬНЫЙ (не пустой пробел) фрагмент — по нему
        // решаем, стакать ли следующий zero-width эмоут. Раньше смотрели
        // просто на result[result.length - 1], но между двумя словами-
        // эмоутами в тексте всегда есть пробел, который тоже кладётся в
        // result как текстовый фрагмент — и именно НА НЕГО попадала эта
        // проверка, из-за чего стаканье не срабатывало вообще никогда и
        // оверлеи всегда рисовались рядом, а не поверх предыдущего смайла.
        let lastMeaningful: Fragment | null = null;

        const pushEmote = (url: string, zeroWidth: boolean) => {
            if (zeroWidth && lastMeaningful && lastMeaningful.type === 'emote') {
                lastMeaningful.urls.push(url);
                return;
            }
            const frag: Fragment = { type: 'emote', urls: [url] };
            result.push(frag);
            lastMeaningful = frag;
        };

        const processText = (str: string) => {
            str.split(/(\s+)/).forEach((word) => {
                const clean = word.trim();
                if (!clean) { if (word) result.push({ type: 'text', val: word }); return; }

                const stv = emoteMap.get(clean);
                if (stv) { pushEmote(stv.url, stv.zeroWidth); return; }

                const ffz = channelEmoteMap.get(clean);
                if (ffz) { pushEmote(ffz, false); return; }

                // Упоминание: "@ник" или просто "ник", если это известный по
                // чату логин (без учёта регистра и хвостовой пунктуации вроде
                // запятой/двоеточия). Твичевые логины — это [a-zA-Z0-9_].
                const mentionMatch = /^(@?)([a-zA-Z0-9_]{2,25})([.,!?:;)]*)$/.exec(clean);
                if (mentionMatch) {
                    const mentionColor = userColorMap.get(mentionMatch[2].toLowerCase());
                    if (mentionColor) {
                        const frag: Fragment = { type: 'text', val: word, mentionColor };
                        result.push(frag);
                        lastMeaningful = frag;
                        return;
                    }
                }

                const frag: Fragment = { type: 'text', val: word };
                result.push(frag);
                lastMeaningful = frag;
            });
        };

        nodes.forEach((n) => {
            if (n.start > cur) processText(text.substring(cur, n.start));
            pushEmote(n.val, false);
            cur = n.end + 1;
        });
        if (cur < text.length) processText(text.substring(cur));
        return result;
    }

    function badgeUrlFor(name: string, version: string): string {
        return badgeDictionary[`${name}:${version}`] || `https://static-cdn.jtvnw.net/badges/v1/${name}/${version}/2`;
    }

    /**
     * Обводка для градиентных 7TV-ников. Обычный text-shadow здесь не
     * подходит (см. комментарий у .username-paint в блоке стилей ниже) —
     * используем filter: drop-shadow, который корректно обтекает
     * прозрачную заливку. Собирается в JS, а не в CSS, потому что filter
     * в inline-style полностью замещает filter из класса, а не складывается
     * с ним — если бы обводка жила в классе, а тень пейнта в inline-style,
     * тень пейнта просто стёрла бы обводку.
     */
    function usernameOutlineFilter(paintDropShadow: string | undefined): string {
        const outline = 'drop-shadow(1px 1px 1.5px rgba(0,0,0,1)) drop-shadow(0 0 2px rgba(0,0,0,1))';
        return paintDropShadow ? `${outline} ${paintDropShadow}` : outline;
    }

    /**
     * Кастомные бейджи FFZ, назначенные стримером конкретным зрителям своего
     * канала (боты и т.п.), плюс кастомный мод/VIP-бейдж канала.
     */
    function collectFFZChannelBadges(msg: ChatMessage): string[] {
        const urls: string[] = [];
        if (msg.isMod && ffzModBadge) urls.push(ffzModBadge);
        if (msg.isVip && ffzVipBadge) urls.push(ffzVipBadge);
        const personal = ffzChannelUserBadges.get(msg.username);
        if (personal) urls.push(...personal);
        return urls;
    }

    export function addMessage(msg: ChatMessage) {
        if (messages.some((m) => m.id === msg.id)) return;
        if (hideBots && KNOWN_BOTS.has(msg.username)) return;
        if (hideCommands && commandPrefixes.some((p) => msg.text.startsWith(p))) return;

        const color = msg.color || defaultColorForUser(msg.username);
        userColorMap.set(msg.username, color);

        const uiMsg: UIMessage = {
            id: msg.id,
            username: msg.username,
            user: msg.displayName,
            color,
            fragments: parseMessage(msg.text, msg.emotes),
            badgeUrls: [...msg.badges.map((b) => badgeUrlFor(b.name, b.version)), ...collectFFZChannelBadges(msg)],
            isHighlighted: msg.isHighlighted,
            isFirstMessage: msg.isFirstMessage
        };

        messages = [...messages, uiMsg].slice(-30);

        if (messageLifetimeMs > 0) {
            setTimeout(() => { messages = messages.filter((m) => m.id !== uiMsg.id); }, messageLifetimeMs);
        }

        if (personalCosmeticsEnabled && !previewMode) void enrichWithPersonalCosmetics(msg.username, msg.userId, uiMsg.id);
    }

    /**
     * Личные плюшки зрителя, не завязанные на конкретный канал:
     * цвет/бейдж 7TV и персональный (не канальный) бейдж FFZ вроде Supporter.
     * Резолвятся асинхронно и докладываются в уже отрисованное сообщение,
     * т.к. ждать их перед показом сообщения не хочется — это лишняя задержка
     * в живом чате.
     *
     * userId уже приходит прямо в теге IRC-сообщения (user-id) — раньше тут
     * был отдельный поход в api.ivr.fi, чтобы узнать тот же самый ID по
     * логину. Один из двух round-trip'ов, из-за которых была задержка
     * ~0.5с на каждого НОВОГО зрителя, теперь просто не нужен.
     */
    async function enrichWithPersonalCosmetics(username: string, userId: string, msgId: string) {
        try {
            const resolvedId = userId || (await resolveTwitchUser(username))?.id;

            const [stvCosmetics, ffzPersonalBadges] = await Promise.all([
                resolvedId ? fetch7TVUserCosmetics(resolvedId) : Promise.resolve(null),
                fetchFFZPersonalBadges(username).catch(() => [])
            ]);

            if (!stvCosmetics && ffzPersonalBadges.length === 0) return;

            const finalColor = showStvColors ? stvCosmetics?.paintColor : undefined;
            if (finalColor) userColorMap.set(username, finalColor);

            messages = messages.map((m) => {
                if (m.id !== msgId) return m;
                return {
                    ...m,
                    color: finalColor || m.color,
                    paintBackgroundImage: showStvColors ? stvCosmetics?.paintBackgroundImage : undefined,
                    paintDropShadow: showStvColors ? stvCosmetics?.paintDropShadow : undefined,
                    badgeUrls: [
                        ...m.badgeUrls,
                        ...(stvCosmetics?.badgeUrl ? [stvCosmetics.badgeUrl] : []),
                        ...ffzPersonalBadges
                    ]
                };
            });
        } catch { /* косметика необязательна, тихо игнорируем */ }
    }

    export function clearUser(username: string) {
        messages = messages.filter((m) => m.username.toLowerCase() !== username.toLowerCase());
    }

    export function clearAllMessages() {
        messages = [];
    }

    /** Несколько демо-сообщений для превью настроек — см. `previewMode` выше. */
    function loadPreviewMessages() {
        // Простые SVG-плейсхолдеры для 7TV/FFZ — не тянем их с реального CDN
        // (в previewMode принципиально нет сети), но по размеру/масштабу
        // на экране они ведут себя абсолютно так же, как настоящие эмоуты,
        // т.к. рендерятся тем же <img class="emote">.
        const svg = (bg: string, label: string) =>
            'data:image/svg+xml;utf8,' + encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">` +
                `<rect width="28" height="28" rx="6" fill="${bg}"/>` +
                `<text x="14" y="19" font-size="11" font-family="sans-serif" fill="white" text-anchor="middle">${label}</text></svg>`
            );

        emoteMap.set('StvSample', { url: svg('#5b21b6', '7TV'), zeroWidth: false });
        emoteMap.set('StvOverlay', { url: svg('#facc15', '✦'), zeroWidth: true });
        channelEmoteMap.set('FfzSample', svg('#00b6f0', 'FFZ'));

        const text1 = 'Добро пожаловать на стрим! Погнали Kappa';
        const kappaStart = text1.indexOf('Kappa');

        const demo: ChatMessage[] = [
            {
                id: 'preview-1', channel: '', username: 'zonlex', userId: '1',
                displayName: 'Zonlex', color: '#00ff7f',
                badges: [{ name: 'broadcaster', version: '1' }], badgeInfo: [],
                emotes: kappaStart >= 0 ? { '25': [`${kappaStart}-${kappaStart + 4}`] } : {},
                isMod: false, isVip: false, isBroadcaster: true, isSubscriber: false, isAction: false,
                isHighlighted: false, isFirstMessage: false,
                text: text1, raw: ''
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
                // Демонстрация: FfzSample — обычный смайл, StvSample —
                // обычный смайл, StvOverlay — zero-width, должен сесть
                // ПОВЕРХ предыдущего (StvSample), а не рядом с ним.
                text: 'вот так теперь выглядят оверлеи FfzSample StvSample StvOverlay', raw: ''
            }
        ];
        let i = 0;
        const feed = () => {
            if (i >= demo.length) return;
            addMessage(demo[i]);
            i++;
            setTimeout(feed, 500);
        };
        feed();
    }

    onMount(async () => {
        if (previewMode) {
            isLoadingData = false;
            loadPreviewMessages();
            return;
        }

        // Не блокирует остальной onMount и рендер — просто прогревает кэш
        // пейнтов к моменту, когда придёт первое сообщение с градиентом.
        preloadSevenTVPaintCatalog();

        try {
            const user = await resolveTwitchUser(channel);
            if (!user) return;
            await Promise.all([
                loadBadges(user.id),
                loadChannelExtras(user.id, user.login)
            ]);
        } catch (e) {
            console.error('Chat mount error:', e);
        } finally {
            // Снимаем индикатор в любом случае — даже если часть запросов
            // не удалась, зависший навсегда статус "Загрузка..." хуже, чем
            // чат без пары бейджей/эмоутов.
            isLoadingData = false;
        }
    });
</script>

<div class="chat-wrapper"
     style="
      --chat-fs: {chatConfig.fontSize};
      --chat-es: {chatConfig.emoteSize};
      --chat-fw: {chatConfig.fontWeight};
      --chat-oc: {chatConfig.outlineColor};
      --chat-os: {chatConfig.outlineSize};
      --chat-sp: {chatConfig.spacing};
      --chat-font: '{chatConfig.fontFamily}';
     ">
    {#if showLoadingStatus}
        <div class="chat-status">
            {#if !ircConnected}Подключение к чату…{:else}Загрузка бейджей и эмоутов…{/if}
        </div>
    {/if}
    <div class="chat-container">
        {#each messages as m (m.id)}
            <div class="message-row"
                 class:highlighted={showHighlighted && m.isHighlighted}
                 class:first-time={showFirstTimeChatter && m.isFirstMessage && !(showHighlighted && m.isHighlighted)}
            >
                {#if showBadges}
                    <span class="badges">
                        {#each m.badgeUrls as url}
                            <img src={url} class="badge" on:error={handleImageError} alt="" />
                        {/each}
                    </span>
                {/if}

                {#if showStvColors && m.paintBackgroundImage}
                    <span
                        class="username username-paint"
                        style="background-image: {m.paintBackgroundImage}; filter: {usernameOutlineFilter(m.paintDropShadow)}"
                    >{m.user}</span>
                {:else}
                    <span class="username" style="color: {m.color}">{m.user}</span>
                {/if}
                <span class="colon">:</span>

                {#each m.fragments as f}
                    {#if f.type === 'text'}
                        {#if f.mentionColor}
                            <span class="chat-text mention" style="color: {f.mentionColor}">{f.val}</span>
                        {:else}
                            <span class="chat-text">{f.val}</span>
                        {/if}
                    {:else if f.urls.length > 1}
                        <span class="emote-stack">
                            {#each f.urls as url}
                                <img src={url} class="emote" on:error={handleImageError} alt="" />
                            {/each}
                        </span>
                    {:else}
                        <img src={f.urls[0]} class="emote" on:error={handleImageError} alt="" />
                    {/if}
                {/each}
            </div>
        {/each}
    </div>
</div>

<style>
    .chat-wrapper {
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        pointer-events: none;
        font-family: var(--chat-font), sans-serif;
    }

    .message-row {
        margin-bottom: var(--chat-sp);
        animation: slideIn 0.3s ease-out forwards;
        line-height: 1.2;
        display: block;
        word-wrap: break-word;
        overflow-wrap: break-word;
        border-radius: 6px;
        padding: 2px 6px;
    }

    .message-row.highlighted {
        background: rgba(145, 71, 255, 0.28);
        border-left: 4px solid #9147ff;
    }

    .message-row.first-time {
        background: rgba(78, 30, 80, 0.45);
        border-left: 4px solid #ff75e6;
    }

    .chat-status {
        display: inline-block;
        color: #ccc;
        background: rgba(0, 0, 0, 0.5);
        font-size: 14px;
        padding: 4px 10px;
        border-radius: 6px;
        margin-bottom: 8px;
    }

    .username, .chat-text, .colon {
        font-size: var(--chat-fs);
        font-weight: var(--chat-fw);
        color: white;
        vertical-align: middle;
        text-shadow:
                calc(var(--chat-os) / 4) calc(var(--chat-os) / 4) var(--chat-os) rgba(0,0,0,1),
                0px 0px calc(var(--chat-os) * 1.2) rgba(0,0,0,1);
    }

    .username {
        font-weight: 800;
    }

    /* Двоеточие после ника всегда обычного цвета — раньше было внутри
       того же <span>, что и ник, и красилось в его цвет/градиент вместе
       с ним. Теперь это отдельный элемент вне цветного span. */
    .colon {
        margin-right: 4px;
    }

    .username-paint {
        background-clip: text;
        -webkit-background-clip: text;
        background-size: cover;
        background-repeat: no-repeat;
        color: transparent;
        -webkit-text-fill-color: transparent;
        /*
         * text-shadow рисует чёрную копию формы глифа позади текста — она
         * не знает, что заливка текста прозрачная, и это чёрное пятно
         * почти полностью перекрывает градиент изнутри буквы (это и было
         * на скриншоте: ник залит чёрным, градиент виден только по краям).
         * filter: drop-shadow() строит тень по итоговым видимым пикселям
         * элемента, поэтому корректно обводит именно градиент. Обводка
         * задаётся через filter в template (usernameOutlineFilter), тут
         * её дублировать не нужно.
         */
        text-shadow: none;
    }

    .chat-text {
        white-space: pre-wrap;
    }

    .mention {
        font-weight: 800;
    }

    .badges {
        display: inline;
    }

    .badge {
        height: var(--chat-fs);
        width: auto;
        margin-right: 4px;
        vertical-align: middle;
        filter: drop-shadow(1px 1px 1px black);
    }

    .emote {
        height: var(--chat-es) !important;
        width: auto !important;
        vertical-align: middle;
        margin: 0 2px;
        filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));
    }

    /*
     * Стопка нескольких картинок в одной "ячейке" (обычный смайл + один
     * или несколько zero-width оверлеев 7TV поверх него). grid укладывает
     * все img в одну и ту же область (grid-area: 1/1), поэтому они рисуются
     * друг на друге, а не рядом.
     */
    .emote-stack {
        position: relative;
        display: inline-grid;
        vertical-align: middle;
        margin: 0 2px;
    }

    .emote-stack .emote {
        grid-area: 1 / 1;
        margin: 0;
    }

    @keyframes slideIn {
        from { opacity: 0; transform: translateX(-10px); }
        to { opacity: 1; transform: translateX(0); }
    }
</style>
