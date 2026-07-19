<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/state';
    import { TwitchIRC } from '$lib/services/twitch-irc';
    import type { ChatMessage } from '$lib/services/twitch-irc';

    import Player from '$lib/components/Player.svelte';
    import Chat from '$lib/components/Chat.svelte';

    let playerRef: Player;
    let chatRef: Chat;

    const channel = page.url.searchParams.get('channel') || '';
    const chatEnabled = page.url.searchParams.get('chat') !== 'false';
    const ttsEnabled = page.url.searchParams.get('tts') !== 'false';
    // В превью настроек Chat.svelte сам подставляет демо-сообщения —
    // реальное IRC-подключение тут не нужно и было бы просто потрачено
    // впустую на несуществующий/тестовый канал.
    const previewMode = page.url.searchParams.get('preview') === 'true';

    let irc: TwitchIRC | null = null;
    // Раньше onConnect/onDisconnect у TwitchIRC были в публичном API, но
    // никем не вызывались — теперь на них строится индикатор "Загрузка
    // чата..." в самом Chat.svelte.
    let ircConnected = false;

    function parseCommand(msg: ChatMessage): { command: string; rest: string } | null {
        if (!msg.text.startsWith('!')) return null;
        const spaceIdx = msg.text.indexOf(' ');
        const command = (spaceIdx === -1 ? msg.text.slice(1) : msg.text.slice(1, spaceIdx));
        const rest = spaceIdx === -1 ? '' : msg.text.slice(spaceIdx + 1);
        return { command, rest };
    }

    onMount(() => {
        if (!channel || previewMode) return;

        irc = new TwitchIRC();

        irc.onConnect(() => { ircConnected = true; });
        irc.onDisconnect(() => { ircConnected = false; });

        irc.onMessage((msg) => {
            if (chatEnabled && chatRef) chatRef.addMessage(msg);

            const parsed = parseCommand(msg);
            if (!parsed) return;
            const isPrivileged = msg.isBroadcaster || msg.isMod;

            // !refresh / !reload — административные команды оверлея, доступны
            // только модераторам/стримеру, чтобы рядовые зрители не могли
            // их спамить. Реализованы тут, а не в Player.svelte, т.к. они не
            // про TTS, а про сам чат-оверлей и IRC-соединение.
            if (isPrivileged && chatEnabled && chatRef) {
                if (parsed.command === 'refresh') { chatRef.refreshEmotes(); return; }
                if (parsed.command === 'reload') {
                    chatRef.reloadChat();
                    // Полная перезагрузка включает и сам сокет чата — не
                    // только данные канала (бейджи/эмоуты), которые перегружает reloadChat().
                    irc?.disconnect();
                    irc?.connect(channel);
                    return;
                }
            }

            if (ttsEnabled && playerRef) {
                const flags = { broadcaster: msg.isBroadcaster, mod: msg.isMod, vip: msg.isVip };
                playerRef.handleCommand(msg.username, parsed.command, parsed.rest, flags);
            }
        });

        irc.onClearChat((evt) => {
            if (!chatRef) return;
            if (evt.targetUser) chatRef.clearUser(evt.targetUser);
            else chatRef.clearAllMessages();
        });

        irc.connect(channel);
    });

    onDestroy(() => {
        irc?.disconnect();
        irc = null;
    });
</script>

{#if ttsEnabled}
    <Player bind:this={playerRef} />
{/if}

{#if chatEnabled}
    <Chat bind:this={chatRef} {channel} ircConnected={previewMode || ircConnected} />
{/if}

<style>
    :global(body), :global(html) {
        margin: 0; padding: 0; overflow: hidden; background-color: transparent !important;
    }
</style>
