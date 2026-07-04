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

    const urlParams = page.url.searchParams;

    // Персональные плюшки (7TV-цвет/бейдж, личный FFZ-бейдж) можно выключить
    // через ?personalCosmetics=false, если не нужны доп. запросы на чатера.
    const personalCosmeticsEnabled = urlParams.get('personalCosmetics') !== 'false';
    // Через сколько сообщение исчезает само по себе (0 — не исчезает,
    // только вытесняется новыми, как раньше).
    const messageLifetimeMs = parseInt(urlParams.get('messageLifetime') || '0');

    let chatConfig = {
        fontSize: urlParams.get('fontSize') || '24px',
        emoteSize: urlParams.get('emoteSize') || '1.5em',
        badgeSize: urlParams.get('badgeSize') || '2.2em',
        fontWeight: urlParams.get('fontWeight') || '600',
        outlineColor: '#000000',
        outlineSize: urlParams.get('outlineSize') || '4px',
        spacing: urlParams.get('spacing') || '8px',
        fontFamily: urlParams.get('font') || 'sans-serif'
    };

    type Fragment = { type: 'text' | 'emote'; val: string; zeroWidth?: boolean; mentionColor?: string };
    type UIMessage = {
        id: string;
        username: string; // login, нужен для докладки бейджей после resolve
        user: string;
        color: string;
        paintBackgroundImage?: string;
        paintDropShadow?: string;
        fragments: Fragment[];
        badgeUrls: string[];
    };

    let messages: UIMessage[] = [];
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
     * слова) → 7TV → FFZ. Плюс поддержка zero-width эмоутов 7TV — они не
     * добавляют новый фрагмент, а помечаются как оверлей поверх предыдущего.
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

        const processText = (str: string) => {
            str.split(/(\s+)/).forEach((word) => {
                const clean = word.trim();
                if (!clean) { if (word) result.push({ type: 'text', val: word }); return; }

                const stv = emoteMap.get(clean);
                if (stv) {
                    result.push({ type: 'emote', val: stv.url, zeroWidth: stv.zeroWidth });
                    return;
                }
                const ffz = channelEmoteMap.get(clean);
                if (ffz) { result.push({ type: 'emote', val: ffz }); return; }

                // Упоминание: "@ник" или просто "ник", если это известный по
                // чату логин (без учёта регистра и хвостовой пунктуации вроде
                // запятой/двоеточия). Твичевые логины — это [a-zA-Z0-9_].
                const mentionMatch = /^(@?)([a-zA-Z0-9_]{2,25})([.,!?:;)]*)$/.exec(clean);
                if (mentionMatch) {
                    const mentionColor = userColorMap.get(mentionMatch[2].toLowerCase());
                    if (mentionColor) {
                        result.push({ type: 'text', val: word, mentionColor });
                        return;
                    }
                }

                result.push({ type: 'text', val: word });
            });
        };

        nodes.forEach((n) => {
            if (n.start > cur) processText(text.substring(cur, n.start));
            result.push({ type: 'emote', val: n.val });
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
     * подходит (см. комментарий у .username-paint в <style>) — используем
     * filter: drop-shadow, который корректно обтекает прозрачную заливку.
     * Собирается в JS, а не в CSS, потому что filter в inline-style
     * полностью замещает filter из класса, а не складывается с ним — если
     * бы обводка жила в классе, а тень пейнта в inline-style, тень пейнта
     * просто стёрла бы обводку.
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

        const color = msg.color || defaultColorForUser(msg.username);
        userColorMap.set(msg.username, color);

        const uiMsg: UIMessage = {
            id: msg.id,
            username: msg.username,
            user: msg.displayName,
            color,
            fragments: parseMessage(msg.text, msg.emotes),
            badgeUrls: [...msg.badges.map((b) => badgeUrlFor(b.name, b.version)), ...collectFFZChannelBadges(msg)]
        };

        messages = [...messages, uiMsg].slice(-30);

        if (messageLifetimeMs > 0) {
            setTimeout(() => { messages = messages.filter((m) => m.id !== uiMsg.id); }, messageLifetimeMs);
        }

        if (personalCosmeticsEnabled) void enrichWithPersonalCosmetics(msg.username, msg.userId, uiMsg.id);
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

            const finalColor = stvCosmetics?.paintColor;
            if (finalColor) userColorMap.set(username, finalColor);

            messages = messages.map((m) => {
                if (m.id !== msgId) return m;
                return {
                    ...m,
                    color: finalColor || m.color,
                    paintBackgroundImage: stvCosmetics?.paintBackgroundImage,
                    paintDropShadow: stvCosmetics?.paintDropShadow,
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

    onMount(async () => {
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
    <div class="chat-container">
        {#each messages as m (m.id)}
            <div class="message-row">
                <span class="badges">
                    {#each m.badgeUrls as url}
                        <img src={url} class="badge" on:error={handleImageError} alt="" />
                    {/each}
                </span>

                {#if m.paintBackgroundImage}
                    <span
                        class="username username-paint"
                        style="background-image: {m.paintBackgroundImage}; filter: {usernameOutlineFilter(m.paintDropShadow)}"
                    >{m.user}:</span>
                {:else}
                    <span class="username" style="color: {m.color}">{m.user}:</span>
                {/if}

                {#each m.fragments as f, i}
                    {#if f.type === 'text'}
                        {#if f.mentionColor}
                            <span class="chat-text mention" style="color: {f.mentionColor}">{f.val}</span>
                        {:else}
                            <span class="chat-text">{f.val}</span>
                        {/if}
                    {:else if f.zeroWidth && i > 0}
                        <span class="emote-stack">
                            <img src={m.fragments[i - 1].val} class="emote" alt="" style="visibility:hidden" />
                            <img src={f.val} class="emote overlay" on:error={handleImageError} alt="" />
                        </span>
                    {:else}
                        <img src={f.val} class="emote" on:error={handleImageError} alt="" />
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
    }

    .username, .chat-text {
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

    .emote-stack {
        position: relative;
        display: inline-grid;
        vertical-align: middle;
    }

    .emote-stack .emote {
        grid-area: 1 / 1;
        margin: 0;
    }

    .emote-stack .overlay {
        filter: none;
    }

    @keyframes slideIn {
        from { opacity: 0; transform: translateX(-10px); }
        to { opacity: 1; transform: translateX(0); }
    }
</style>