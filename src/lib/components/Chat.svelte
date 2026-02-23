<script lang="ts">
    import { onMount } from 'svelte';
    import { fetch7TVEmotesByNickname, fetchFFZEmotes } from '$lib/services/twitch-api';
    import { env } from '$env/dynamic/public';
    import { page } from '$app/stores';

    export let channel: string;

    const urlParams = $page.url.searchParams;

    let chatConfig = {
        fontSize: urlParams.get('fontSize') || '28px',
        emoteSize: urlParams.get('emoteSize') || '1.5em',
        badgeSize: urlParams.get('badgeSize') || '1em',
        fontWeight: urlParams.get('fontWeight') || '600',
        outlineColor: '#000000',
        outlineSize: urlParams.get('outlineSize') || '4px',
        spacing: urlParams.get('spacing') || '10px',
        fontFamily: urlParams.get('font') || "sans-serif"
    };

    const CLIENT_ID = env.PUBLIC_TWITCH_CLIENT_ID || '';
    const ACCESS_TOKEN = env.PUBLIC_TWITCH_ACCESS_TOKEN || '';

    type Fragment = { type: 'text' | 'emote'; val: string };
    type Message = { id: string; user: string; color: string; fragments: Fragment[]; badgeUrls: string[]; };

    let messages: Message[] = [];
    let emoteMap = new Map<string, string>();
    let channelEmoteMap = new Map<string, string>();
    let badgeDictionary: Record<string, string> = {};

    function handleImageError(event: Event) {
        const img = event.currentTarget as HTMLImageElement;
        if (img) img.style.display = 'none';
    }

    async function loadHelixData(broadcasterId: string) {
        if (!CLIENT_ID || !ACCESS_TOKEN) return;
        const headers = { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${ACCESS_TOKEN}` };
        try {
            const [gB, cB, gE, cE] = await Promise.all([
                fetch('https://api.twitch.tv/helix/chat/badges/global', { headers }),
                fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}`, { headers }),
                fetch('https://api.twitch.tv/helix/chat/emotes/global', { headers }),
                fetch(`https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${broadcasterId}`, { headers })
            ]);
            const gBadgeData = await gB.json();
            const cBadgeData = await cB.json();
            const gEmoteData = await gE.json();
            const cEmoteData = await cE.json();

            const pB = (res: any) => res?.data?.forEach((b: any) => b.versions.forEach((v: any) => {
                badgeDictionary[`${b.set_id}:${v.id}`] = v.image_url_4x;
            }));
            pB(gBadgeData); pB(cBadgeData);

            const pE = (data: any[]) => data?.forEach((e: any) => {
                const url = `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/3.0`;
                channelEmoteMap.set(e.name, url);
            });
            pE(gEmoteData.data); pE(cEmoteData.data);
        } catch (e) { console.error("Error loading Helix data:", e); }
    }

    function parseMessage(text: string, twitchEmotes: any): Fragment[] {
        let nodes: { type: 'emote'; val: string; start: number; end: number }[] = [];
        if (twitchEmotes) {
            Object.entries(twitchEmotes).forEach(([id, positions]) => {
                (positions as string[]).forEach((range: string) => {
                    const [start, end] = range.split('-').map(Number);
                    nodes.push({ type: 'emote', val: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`, start, end });
                });
            });
        }
        nodes.sort((a, b) => a.start - b.start);
        let result: Fragment[] = [];
        let cur = 0;

        const processText = (str: string) => {
            str.split(/(\s+)/).forEach(word => {
                const clean = word.trim();
                if (clean && channelEmoteMap.has(clean)) result.push({ type: 'emote', val: channelEmoteMap.get(clean)! });
                else if (clean && emoteMap.has(clean)) result.push({ type: 'emote', val: emoteMap.get(clean)! });
                else if (word) result.push({ type: 'text', val: word });
            });
        };

        nodes.forEach(n => {
            if (n.start > cur) processText(text.substring(cur, n.start));
            result.push({ type: 'emote', val: n.val });
            cur = n.end + 1;
        });
        if (cur < text.length) processText(text.substring(cur));
        return result;
    }

    export function addMessage(user: string, text: string, flags: any, extra: any) {
        const msgId = extra.id || Math.random().toString(36);
        if (messages.some(m => m.id === msgId)) return;

        const msg: Message = {
            id: msgId,
            user,
            color: extra.userColor || '#FFFFFF',
            fragments: parseMessage(text, extra.emotes),
            badgeUrls: extra.userBadges ? Object.entries(extra.userBadges).map(([n, v]) =>
                badgeDictionary[`${n}:${v}`] || `https://static-cdn.jtvnw.net/badges/v1/${n}/${v}/2`
            ) : []
        };

        messages = [...messages, msg].slice(-30);
    }

    onMount(async () => {
        try {
            const idRes = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${channel}`);
            const idData = await idRes.json();
            if (idData[0]?.id) await loadHelixData(idData[0].id);

            const [stv, ffz] = await Promise.all([
                fetch7TVEmotesByNickname(channel).catch(() => new Map()),
                fetchFFZEmotes(channel).catch(() => new Map())
            ]);
            emoteMap = new Map([...ffz, ...stv]);
        } catch (e) { console.error("Chat mount error:", e); }
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

                <span class="username" style="color: {m.color}">{m.user}:</span>

                {#each m.fragments as f}
                    {#if f.type === 'text'}
                        <span class="chat-text">{f.val}</span>
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
        /*display: inline-block;*/
    }

    .chat-text {
        white-space: pre-wrap;
    }

    .badges {
        display: inline;
        /*vertical-align: middle;*/
    }

    .badge {
        /* Бейджи чуть меньше текста, чтобы не распирали строку */
        height: calc(var(--chat-fs)); /* * 0.85 */
        width: auto;
        margin-right: 4px;
        vertical-align: middle;
        filter: drop-shadow(1px 1px 1px black);
    }

    .emote {
        height: var(--chat-es) !important;
        width: auto !important;
        /*display: inline-block;*/
        vertical-align: middle;

        margin: 0 2px;
        filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));
    }

    @keyframes slideIn {
        from { opacity: 0; transform: translateX(-10px); }
        to { opacity: 1; transform: translateX(0); }
    }
</style>