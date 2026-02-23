<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import ComfyJS from 'comfy.js';

    import Player from '$lib/components/Player.svelte';
    import Chat from '$lib/components/Chat.svelte';

    let playerRef: Player;
    let chatRef: Chat;

    const channel = $page.url.searchParams.get('channel') || '';
    const chatEnabled = $page.url.searchParams.get('chat') !== 'false';
    const ttsEnabled = $page.url.searchParams.get('tts') !== 'false';

    // Глобальная переменная для предотвращения двойной инициализации
    let initialized = false;

    onMount(() => {
        if (!channel || initialized) return;
        initialized = true;

        console.log("Initializing ComfyJS for channel:", channel);

        ComfyJS.onCommand = (user, command, message, flags, extra) => {
            if (ttsEnabled && playerRef) {
                playerRef.handleCommand(user, command, message, flags);
            }
        };

        ComfyJS.onChat = (user, message, flags, self, extra) => {
            if (chatEnabled && chatRef) {
                chatRef.addMessage(user, message, flags, extra);
            }
        };

        ComfyJS.Init(channel);

        return () => {
            initialized = false;
            try { ComfyJS.Disconnect(); } catch (e) {}
        };
    });
</script>

{#if ttsEnabled}
    <Player bind:this={playerRef} {channel} />
{/if}

{#if chatEnabled}
    <Chat bind:this={chatRef} {channel} />
{/if}

<style>
    :global(body), :global(html) {
        margin: 0; padding: 0; overflow: hidden; background-color: transparent !important;
    }
</style>