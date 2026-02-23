<script lang="ts">
    import VoiceSelect from '$lib/components/VoiceSelect.svelte';
    import { fade, fly } from 'svelte/transition';

    // Список шрифтов
    const fonts = [
        { name: 'Segoe UI', family: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' },
        { name: 'Roboto', family: '"Roboto", sans-serif' },
        { name: 'Lato', family: '"Lato", sans-serif' },
        { name: 'Noto Sans', family: '"Noto Sans", sans-serif' },
        { name: 'Baloo Tammudu', family: '"Baloo Tammudu 2", cursive' },
        { name: 'Source Code Pro', family: '"Source Code Pro", monospace' },
        { name: 'Comfortaa', family: '"Comfortaa", cursive' }
    ];

    // Массив сообщений для реалистичного Live Preview
    let previewMessages = [
        { user: "bicme", color: "#9146ff", text: "Pseudamaurops calcaratus is a species of beetle. <img src='https://cdn.7tv.app/emote/01G6SFGEA80006H81S3K13JXS1/4x.avif' class='p-emote' alt='BEETLEJUICE' />"},
        { user: "Zonlex", color: "#00ff7f", text: "This font looks amazing! <img src='https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0' class='p-emote' alt='Kappa' />" }
    ];

    function generateTTSLink(origin: string, config: any) {
        const url = new URL(`${origin}/widget`);
        url.searchParams.set('channel', config.channel);
        url.searchParams.set('chat', config.chat.toString());
        url.searchParams.set('tts', config.tts.toString());

        if (config.chat) {
            url.searchParams.set('fontSize', config.fontSize + 'px');
            url.searchParams.set('emoteSize', config.emoteSize + 'em');
            url.searchParams.set('outlineSize', config.outlineSize + 'px');
            url.searchParams.set('spacing', config.spacing + 'px');
            url.searchParams.set('fontWeight', config.fontWeight);
            url.searchParams.set('font', config.fontFamily);
            url.searchParams.set('outlineColor', '#000000');
        }

        if (config.tts) {
            url.searchParams.set('voice', config.voice);
            url.searchParams.set('mods', config.mods.toString());
            url.searchParams.set('vips', config.vips.toString());
            url.searchParams.set('customVoice', config.customVoice.toString());
            url.searchParams.set('ytEnabled', config.ytEnabled.toString());
            url.searchParams.set('ytMaxLen', config.ytMaxLen.toString());
            if (config.white.length > 0) url.searchParams.set('white', config.white.join(','));
            if (config.black.length > 0) url.searchParams.set('black', config.black.join(','));
        }

        return url.toString();
    }

    async function copyToClipboard(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return false;
        }
    }

    let config = {
        channel: "",
        voice: "Brian",
        mods: false,
        vips: false,
        customVoice: false,
        white: [] as string[],
        black: [] as string[],
        ytEnabled: false,
        ytMaxLen: 30,
        chat: true,
        tts: true,
        fontSize: 28,
        emoteSize: 1.5,
        outlineSize: 4,
        spacing: 10,
        fontWeight: "600",
        fontFamily: "Roboto"
    };

    let whiteInput = "";
    let blackInput = "";
    let toasts: { id: number; msg: string }[] = [];
    let toastIdCounter = 0;
    let buttonClicked = false;
    const MAX_TOASTS = 3;

    function addTag(type: 'white' | 'black', event: KeyboardEvent) {
        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            const input = type === 'white' ? whiteInput : blackInput;
            const val = input.trim().replace(',', '');
            if (val && !config[type].includes(val)) {
                config[type] = [...config[type], val];
            }
            if (type === 'white') whiteInput = "";
            else blackInput = "";
        }
    }

    function removeTag(type: 'white' | 'black', index: number) {
        config[type] = config[type].filter((_, i) => i !== index);
    }

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
        if (toasts.length >= MAX_TOASTS) toasts = toasts.slice(1);
        toasts = [...toasts, { id, msg }];
        setTimeout(() => {
            toasts = toasts.filter(t => t.id !== id);
        }, 2500);
    }

    function animateButton() {
        buttonClicked = true;
        setTimeout(() => buttonClicked = false, 200);
    }
</script>

<svelte:head>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;600;800&family=Lato:wght@400;700;900&family=Noto+Sans:wght@400;600;800&family=Baloo+Tammudu+2:wght@400;600;800&family=Source+Code+Pro:wght@400;600;800&family=Comfortaa:wght@400;600;700&display=swap" rel="stylesheet">
</svelte:head>

<main>
    <h1>Twitch Overlay Generator</h1>

    <div class="form-group">
        <label for="channel">Twitch Channel:</label>
        <input id="channel" type="text" bind:value={config.channel} placeholder="Enter your channel" />
    </div>

    <div class="form-group module-selector">
        <label style="margin-bottom: 12px; color: #7c3aed; display: block;">Active Modules:</label>
        <div class="switch-row">
            <span>Visual Chat Overlay</span>
            <label class="switch"><input type="checkbox" bind:checked={config.chat} /><span class="slider"></span></label>
        </div>
        <div class="switch-row">
            <span>TTS & Media (Voice commands)</span>
            <label class="switch"><input type="checkbox" bind:checked={config.tts} /><span class="slider"></span></label>
        </div>
    </div>

    {#if config.chat}
        <div class="preview-box" transition:fly={{ y: -10, duration: 300 }}>
            <div class="preview-label">Live Preview:</div>
            <div class="chat-preview" style="
                --p-fs: {config.fontSize}px;
                --p-es: {config.emoteSize}em;
                --p-os: {config.outlineSize}px;
                --p-sp: {config.spacing}px;
                --p-fw: {config.fontWeight};
                --p-font: {fonts.find(f => f.name === config.fontFamily)?.family || 'sans-serif'};
            ">
                {#each previewMessages as msg}
                    <div class="preview-msg">
                        <span class="p-user" style="color: {msg.color}">{msg.user}:</span>
                        <span class="p-text">{@html msg.text}</span>
                    </div>
                {/each}
            </div>
        </div>

        <div class="settings-block" transition:fly={{ y: -10, duration: 300 }}>
            <hr />
            <div class="settings-grid">
                <div class="control">
                    <label>Font Size: {config.fontSize}px</label>
                    <input type="range" min="12" max="40" bind:value={config.fontSize} />
                </div>
                <div class="control">
                    <label>Emote Scale: {config.emoteSize}x</label>
                    <input type="range" min="1.5" max="3" step="0.1" bind:value={config.emoteSize} />
                </div>
                <div class="control">
                    <label>Shadow Blur: {config.outlineSize}px</label>
                    <input type="range" min="0" max="10" bind:value={config.outlineSize} />
                </div>
                <div class="control">
                    <label>Message Spacing: {config.spacing}px</label>
                    <input type="range" min="0" max="15" bind:value={config.spacing} />
                </div>
                <div class="control">
                    <label>Font Family</label>
                    <select bind:value={config.fontFamily}>
                        {#each fonts as font}<option value={font.name}>{font.name}</option>{/each}
                    </select>
                </div>
                <div class="control">
                    <label>Font Weight</label>
                    <select bind:value={config.fontWeight}>
                        <option value="400">Regular</option>
                        <option value="600">Semi-Bold</option>
                        <option value="800">Extra-Bold</option>
                    </select>
                </div>
            </div>
        </div>
    {/if}

    {#if config.tts}
        <div class="tts-settings-block" transition:fly={{ y: -10, duration: 300 }}>
            <hr />
            <div class="form-group"><VoiceSelect bind:selected={config.voice} /></div>
            <div class="form-group checkbox-container">
                <div class="switch-row"><span>Allow Moderators</span><label class="switch"><input type="checkbox" bind:checked={config.mods} /><span class="slider"></span></label></div>
                <div class="switch-row"><span>Allow VIPs</span><label class="switch"><input type="checkbox" bind:checked={config.vips} /><span class="slider"></span></label></div>
                <div class="switch-row"><span>Allow custom voice</span><label class="switch"><input type="checkbox" bind:checked={config.customVoice} /><span class="slider"></span></label></div>
                <div class="switch-row"><span>Enable YouTube Audio</span><label class="switch"><input type="checkbox" bind:checked={config.ytEnabled} /><span class="slider"></span></label></div>
                {#if config.ytEnabled}
                    <div class="yt-sub-settings" transition:fade>
                        <label for="ytMaxLen">Max duration (sec):</label>
                        <input id="ytMaxLen" type="number" bind:value={config.ytMaxLen} />
                    </div>
                {/if}
            </div>
            <div class="form-group">
                <label>Whitelist:</label>
                <div class="tags-input">
                    {#each config.white as tag, i}<span class="tag-badge" in:fade>{tag} <button on:click={() => removeTag('white', i)}>×</button></span>{/each}
                    <input type="text" bind:value={whiteInput} on:keydown={(e) => addTag('white', e)} placeholder={config.white.length === 0 ? "Type nick and press Space..." : ""} />
                </div>
            </div>
            <div class="form-group">
                <label>Blacklist:</label>
                <div class="tags-input">
                    {#each config.black as tag, i}<span class="tag-badge black-list-tag" in:fade>{tag} <button on:click={() => removeTag('black', i)}>×</button></span>{/each}
                    <input type="text" bind:value={blackInput} on:keydown={(e) => addTag('black', e)} placeholder={config.black.length === 0 ? "Type nick and press Space..." : ""} />
                </div>
            </div>
        </div>
    {/if}

    <button class="generate-btn {buttonClicked ? 'clicked' : ''}" on:click={handleCopy}>Generate & Copy Link</button>

    <div class="toast-container">
        {#each toasts as t (t.id)}<div class="toast" in:fly={{ y: 20 }} out:fade>{t.msg}</div>{/each}
    </div>
</main>

<style>
    main { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 24px; border: 1px solid #ddd; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); background: white; }
    h1 { text-align: center; margin-bottom: 24px; font-size: 1.8rem; color: #111827; }
    .form-group { margin-bottom: 16px; }
    label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.9rem; color: #374151; }
    input[type="text"], input[type="number"], select { width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid #ccc; font-size: 14px; box-sizing: border-box; }

    .switch-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 0.9rem; color: #4b5563; }
    .switch { position: relative; display: inline-block; width: 40px; height: 20px; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #d1d5db; transition: .3s; border-radius: 20px; }
    .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
    input:checked + .slider { background-color: #7c3aed; }
    input:checked + .slider:before { transform: translateX(20px); }

    .tags-input { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px; border: 1px solid #ccc; border-radius: 8px; background: white; min-height: 38px; align-items: center; }
    .tags-input:focus-within { border-color: #7c3aed; }
    .tags-input input { border: none !important; outline: none !important; padding: 4px !important; flex: 1; min-width: 80px; }
    .tag-badge { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 0.85rem; background: #ede9fe; color: #7c3aed; border: 1px solid #ddd6fe; }
    .black-list-tag { background: #444; color: #fff; border-color: #333; }
    .tag-badge button { background: none; border: none; color: inherit; font-size: 16px; cursor: pointer; padding: 0; opacity: 0.6; }

    /* PREVIEW */
    .preview-box { background: #3a3a3a; border-radius: 10px; padding: 25px 20px; margin: 20px 0 10px; border: 2px solid #7c3aed; overflow: hidden; }
    .preview-label { color: #a78bfa; font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 15px; font-family: sans-serif; }

    .preview-msg { margin-bottom: var(--p-sp); display: block; line-height: 1.2; word-wrap: break-word; overflow-wrap: break-word; }

    .p-user, .p-text {
        font-family: var(--p-font), sans-serif;
        font-size: var(--p-fs);
        font-weight: var(--p-fw);
        color: white;
        text-shadow: calc(var(--p-os) / 4) calc(var(--p-os) / 4) var(--p-os) rgba(0,0,0,1), 0px 0px calc(var(--p-os) * 1.5) rgba(0,0,0,1);
        vertical-align: middle;
    }

    .p-user {
        font-weight: 800;
        margin-right: 8px;
        display: inline-block;
    }

    .p-text {
        display: inline;
        white-space: pre-wrap;
    }

    /* Эмодзи в превью теперь будут соответствовать масштабу и центровке */
    .p-text :global(.p-emote) {
        height: var(--p-es) !important;
        width: auto !important;
        vertical-align: middle;
        display: inline-block;
        margin: 0 2px;
        filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));
    }

    .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 10px; }
    input[type="range"] { width: 100%; accent-color: #7c3aed; }
    .module-selector { background: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #f3f4f6; }
    .yt-sub-settings { margin-left: 10px; margin-top: 10px; border-left: 2px solid #7c3aed; padding-left: 15px; }
    hr { border: 0; border-top: 1px solid #eee; margin: 20px 0; }
    .generate-btn { width: 100%; padding: 14px; font-size: 15px; border: none; border-radius: 8px; cursor: pointer; color: white; background: #7c3aed; font-weight: bold; transition: 0.2s; margin-top: 20px; }
    .generate-btn.clicked { transform: scale(0.98); background: #5b21b6; }
    .toast-container { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 9999; }
    .toast { background: #111827; color: white; padding: 10px 20px; border-radius: 8px; margin-top: 5px; }
</style>