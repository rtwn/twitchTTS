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

    let irc: TwitchIRC | null = null;

    function parseCommand(msg: ChatMessage): { command: string; rest: string } | null {
        if (!msg.text.startsWith('!')) return null;
        const spaceIdx = msg.text.indexOf(' ');
        const command = (spaceIdx === -1 ? msg.text.slice(1) : msg.text.slice(1, spaceIdx));
        const rest = spaceIdx === -1 ? '' : msg.text.slice(spaceIdx + 1);
        return { command, rest };
    }

    onMount(() => {
        if (!channel) return;

        irc = new TwitchIRC();

        irc.onMessage((msg) => {
            if (chatEnabled && chatRef) chatRef.addMessage(msg);

            if (ttsEnabled && playerRef) {
                const parsed = parseCommand(msg);
                if (parsed) {
                    const flags = { broadcaster: msg.isBroadcaster, mod: msg.isMod, vip: msg.isVip };
                    playerRef.handleCommand(msg.username, parsed.command, parsed.rest, flags);
                }
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
    <Chat bind:this={chatRef} {channel} />
{/if}

<style>
    :global(body), :global(html) {
        margin: 0; padding: 0; overflow: hidden; background-color: transparent !important;
    }
</style>
