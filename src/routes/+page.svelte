<script lang="ts">
    import VoiceSelect from '$lib/components/VoiceSelect.svelte';
    import { generateTTSLink, copyToClipboard } from '$lib/services/utils';
    import type { TTSConfig } from '$lib/types';

    // Состояние формы (используем твой объект config)
    let config: TTSConfig = {
        channel: "",
        voice: "Brian",
        mods: false,
        vips: false,
        customVoice: false,
        white: "",
        black: ""
    };

    let toasts: { id: number; msg: string }[] = [];
    let toastIdCounter = 0;
    let buttonClicked = false;
    const MAX_TOASTS = 3;

    async function handleCopy() {
        if (!config.channel.trim()) {
            showToastMsg("Please enter your Twitch channel name.");
            return;
        }

        const link = generateTTSLink(window.location.origin, config);
        const success = await copyToClipboard(link);

        if (success) {
            showToastMsg("Link copied to clipboard!");
            animateButton();
        } else {
            showToastMsg("Failed to copy link.");
        }
    }

    function showToastMsg(msg: string) {
        const id = toastIdCounter++;
        if (toasts.length >= MAX_TOASTS) {
            toasts = toasts.slice(1);
        }
        toasts = [...toasts, { id, msg }];
        setTimeout(() => {
            toasts = toasts.filter(t => t.id !== id);
        }, 2500);
    }

    function animateButton() {
        buttonClicked = true;
        setTimeout(() => {
            buttonClicked = false;
        }, 200);
    }
</script>

<main>
    <h1>Twitch TTS Link Generator</h1>

    <div class="form-group">
        <label for="channel">Twitch Channel:</label>
        <input
                id="channel"
                type="text"
                bind:value={config.channel}
                placeholder="Enter your channel"
        />
    </div>

    <div class="form-group">
        <VoiceSelect bind:selected={config.voice} />
    </div>

    <div class="form-group checkbox-container">
        <label class="checkbox-label">
            <input type="checkbox" bind:checked={config.mods} />
            Allow Moderators
        </label>
        <label class="checkbox-label">
            <input type="checkbox" bind:checked={config.vips} />
            Allow VIPs
        </label>
        <label class="checkbox-label">
            <input type="checkbox" bind:checked={config.customVoice} />
            Allow custom voice per message (!tts -v)
        </label>
    </div>

    <div class="form-group">
        <label for="white">Whitelist (comma-separated usernames):</label>
        <input
                id="white"
                type="text"
                bind:value={config.white}
                placeholder="e.g. user1,user2"
        />
    </div>

    <div class="form-group">
        <label for="black">Blacklist (comma-separated usernames):</label>
        <input
                id="black"
                type="text"
                bind:value={config.black}
                placeholder="e.g. user3,user4"
        />
    </div>

    <button
            class="generate-btn {buttonClicked ? 'clicked' : ''}"
            on:click={handleCopy}
    >
        Generate & Copy Link
    </button>

    <div class="toast-container">
        {#each toasts as t (t.id)}
            <div class="toast">{t.msg}</div>
        {/each}
    </div>
</main>

<style>
    main {
        font-family: sans-serif;
        max-width: 600px;
        margin: 50px auto;
        padding: 24px;
        border: 1px solid #ddd;
        border-radius: 12px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        position: relative;
        background-color: white;
    }

    h1 {
        text-align: center;
        margin-bottom: 24px;
        font-size: 1.8rem;
        color: #111827;
    }

    .form-group {
        margin-bottom: 16px;
    }

    label {
        display: block;
        margin-bottom: 6px;
        font-weight: 600;
        font-size: 0.9rem;
        color: #374151;
    }

    input[type="text"] {
        width: 100%;
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #ccc;
        font-size: 14px;
        box-sizing: border-box;
    }

    input[type="text"]:focus {
        outline: none;
        border-color: #7c3aed;
        box-shadow: 0 0 0 2px #ddd6fe;
    }

    .checkbox-container {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin: 20px 0;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        font-weight: normal;
        cursor: pointer;
        font-size: 0.95rem;
    }

    input[type="checkbox"] {
        margin-right: 10px;
        width: 16px;
        height: 16px;
        cursor: pointer;
    }

    .generate-btn {
        width: 100%;
        padding: 12px 20px;
        font-size: 15px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        color: white;
        background-color: #7c3aed;
        margin-top: 8px;
        font-weight: bold;
        transition: all 0.15s ease;
    }

    .generate-btn:hover {
        background-color: #6d28d9;
    }

    .generate-btn.clicked {
        transform: scale(0.95);
        background-color: #5b21b6;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    }

    .toast-container {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column-reverse;
        align-items: center;
        gap: 8px;
        z-index: 9999;
    }

    .toast {
        background-color: rgba(0, 0, 0, 0.85);
        color: white;
        padding: 12px 24px;
        border-radius: 12px;
        font-weight: 600;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        animation: slideFadeIn 0.3s forwards, slideFadeOut 0.3s forwards 2.2s;
    }

    @keyframes slideFadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to   { opacity: 1; transform: translateY(0); }
    }

    @keyframes slideFadeOut {
        from { opacity: 1; transform: translateY(0); }
        to   { opacity: 0; transform: translateY(20px); }
    }
</style>