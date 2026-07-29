<script lang="ts">
    import { onMount } from 'svelte';
    import VoiceSelect from '$lib/components/VoiceSelect.svelte';
    import FontSelect from '$lib/components/FontSelect.svelte';
    import { fade, fly } from 'svelte/transition';
    import { browser } from '$app/environment';

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

    // Пресеты размеров вместо голых слайдеров — конкретные подписанные
    // варианты, число видно прямо на кнопке, а честно работающее превью
    // сразу показывает результат.
    const FONT_SIZE_PRESETS = [
        { label: 'Small', value: 20 },
        { label: 'Medium', value: 32 },
        { label: 'Large', value: 48 }
    ];
    const SHADOW_PRESETS = [
        { label: 'Off', value: 0 },
        { label: 'Small', value: 2 },
        { label: 'Medium', value: 4 },
        { label: 'Large', value: 8 }
    ];
    // max-height смайлов в 1x при каждом размере текста — числа заданы
    // явно (а не в em), т.к. em смайла всё равно резолвился не от размера
    // текста, а от базового шрифта браузера (16px), это была скрытая
    // причина, почему итоговый масштаб смайлов ощущался непредсказуемым.
    const EMOTE_BASE_HEIGHT: Record<number, number> = { 20: 28, 32: 42, 48: 60 };
    const EMOTE_MULTIPLIER_PRESETS = [
        { label: '1x', value: 1 },
        { label: '2x', value: 2 },
        { label: '3x', value: 3 }
    ];
    // 800 — новый дефолт (жирный, но не "самый жирный"), 900 — на ступень
    // толще, 400/600 — две ступени тоньше.
    const FONT_WEIGHT_PRESETS = [
        { label: 'Regular', value: '400' },
        { label: 'Semi-Bold', value: '600' },
        { label: 'Bold', value: '800' },
        { label: 'Thick', value: '900' }
    ];

    function emoteMaxHeightPx(config: any): number {
        const base = EMOTE_BASE_HEIGHT[config.fontSize] ?? 42;
        return Math.round(base * config.emoteMultiplier);
    }

    function generateTTSLink(origin: string, config: any) {
        const url = new URL(`${origin}/widget`);
        url.searchParams.set('channel', config.channel.trim());
        url.searchParams.set('chat', config.chat.toString());
        url.searchParams.set('tts', config.tts.toString());

        if (config.chat) {
            url.searchParams.set('fontSize', config.fontSize + 'px');
            url.searchParams.set('emoteMaxHeight', emoteMaxHeightPx(config) + 'px');
            url.searchParams.set('outlineSize', config.outlineSize + 'px');
            url.searchParams.set('spacing', config.spacing + 'px');
            url.searchParams.set('fontWeight', config.fontWeight);
            url.searchParams.set('font', config.fontFamily);

            url.searchParams.set('showBadgesTwitch', config.showBadgesTwitch.toString());
            url.searchParams.set('showBadgesFFZ', config.showBadgesFFZ.toString());
            url.searchParams.set('showBadgesSevenTV', config.showBadgesSevenTV.toString());
            url.searchParams.set('showBadgesHomies', config.showBadgesHomies.toString());
            url.searchParams.set('showStvColors', config.showStvColors.toString());
            url.searchParams.set('showHighlighted', config.showHighlighted.toString());
            url.searchParams.set('showFirstTimeChatter', config.showFirstTimeChatter.toString());

            url.searchParams.set('hideCommands', config.hideCommands.toString());
            if (config.commandPrefixes.trim()) url.searchParams.set('commandPrefixes', config.commandPrefixes);
            url.searchParams.set('hideBots', config.hideBots.toString());
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
        chat: false,
        tts: false,
        fontSize: 32,
        emoteMultiplier: 1,
        outlineSize: 4,
        spacing: 8,
        fontWeight: "800",
        fontFamily: "Roboto",
        showBadgesTwitch: true,
        showBadgesFFZ: true,
        showBadgesSevenTV: true,
        showBadgesHomies: true,
        showStvColors: true,
        showHighlighted: true,
        showFirstTimeChatter: true,
        hideCommands: true,
        commandPrefixes: "!,#,=,-",
        hideBots: true
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
        if (!config.chat && !config.tts) {
            showToastMsg("Enable at least Chat Overlay or TTS to generate a link.");
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

    // ---- Live Preview ----
    // Превью — это iframe с НАСТОЯЩИМ /widget?...&preview=true (Chat.svelte
    // в этом режиме сам подставляет демо-сообщения без единого сетевого
    // запроса к Twitch), отмасштабированный так, будто окно превью — кусок
    // реального холста OBS. Ширину этого "холста" можно подстроить под свой
    // реальный Browser Source.
    let previewRefWidth = 800;
    const PREVIEW_REF_HEIGHT = 420;

    let previewContainerWidth = 0;
    // Math.max(previewRefWidth, 100) — защита на случай, если поле вручную
    // очистят или впишут 0/отрицательное число: min="640" в <input> не
    // мешает временно получить 0 при ручном стирании поля, а без защиты
    // previewScale ушёл бы в Infinity и превью визуально сломалось бы.
    $: previewScale = previewContainerWidth > 0 ? previewContainerWidth / Math.max(previewRefWidth, 100) : 0.001;

    let previewSrc = '';
    let previewDebounceTimer: ReturnType<typeof setTimeout>;

    function updatePreviewSrc() {
        if (!browser) return;
        clearTimeout(previewDebounceTimer);
        previewDebounceTimer = setTimeout(() => {
            const url = new URL(generateTTSLink(window.location.origin, { ...config, channel: config.channel || 'preview', chat: true, tts: false }));
            url.searchParams.set('preview', 'true');
            previewSrc = url.toString();
        }, 250);
    }

    // Реактивная зависимость от всего config — перегенерирует превью при
    // изменении любой из настроек чата (Svelte 4 отслеживает присвоения
    // вида config.x = ..., которые делает bind:value/bind:checked).
    $: config, updatePreviewSrc();

    // ---- Сохранение настроек между визитами ----
    // Раньше ничего не сохранялось: обновили страницу — все настройки (имя
    // канала, все тумблеры, размеры) сбрасывались на дефолт. Сохраняем
    // config в localStorage при любом изменении и подгружаем при заходе.
    const SETTINGS_STORAGE_KEY = 'twitchtts_settings_v1';
    let settingsLoaded = false; // до первой загрузки не сохраняем — иначе
                                 // дефолтный config затёр бы уже сохранённый

    function loadSavedConfig() {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            // Спред в этом порядке: значения из saved перекрывают дефолты,
            // но поля, которых в saved ещё не было (добавили новую настройку
            // уже после того, как кто-то сохранил старую версию), берутся из
            // дефолтного config, а не остаются undefined.
            config = { ...config, ...saved };
        } catch {
            // битые/недоступные данные в localStorage — просто остаёмся на дефолтах
        }
    }

    let saveDebounceTimer: ReturnType<typeof setTimeout>;
    function saveConfig() {
        if (!browser || !settingsLoaded) return;
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = setTimeout(() => {
            try {
                localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(config));
            } catch {
                // квота/приватный режим localStorage — не критично, просто не сохранится
            }
        }, 300);
    }

    $: config, saveConfig();

    onMount(() => {
        loadSavedConfig();
        settingsLoaded = true;
    });
</script>

<svelte:head>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;600;800;900&family=Lato:wght@400;600;700;800;900&family=Noto+Sans:wght@400;600;800;900&family=Baloo+Tammudu+2:wght@400;600;700;800;900&family=Source+Code+Pro:wght@400;600;800;900&family=Comfortaa:wght@400;600;700&display=swap" rel="stylesheet">
</svelte:head>

<main>
    <h1>Chat Overlay Generator</h1>

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
            <span>Text-to-Speech</span>
            <label class="switch"><input type="checkbox" bind:checked={config.tts} /><span class="slider"></span></label>
        </div>
    </div>

    {#if config.chat}
        <div class="preview-box" transition:fly={{ y: -10, duration: 300 }}>
            <div class="preview-label-row">
                <div class="preview-label">Preview</div>
                <label class="preview-ref-width">
                    Reference OBS width
                    <input type="number" min="640" max="3840" step="10" bind:value={previewRefWidth} />
                </label>
            </div>
            <div class="preview-frame-outer" bind:clientWidth={previewContainerWidth}>
                <div class="preview-frame-wrap" style="height: {Math.round(PREVIEW_REF_HEIGHT * previewScale)}px;">
                    {#if previewSrc}
                        <iframe
                            title="Chat preview"
                            src={previewSrc}
                            width={previewRefWidth}
                            height={PREVIEW_REF_HEIGHT}
                            style="transform: scale({previewScale});"
                        ></iframe>
                    {/if}
                </div>
            </div>
        </div>

        <div class="settings-block" transition:fly={{ y: -10, duration: 300 }}>
            <hr />

            <div class="control">
                <label>Text Size</label>
                <div class="segmented">
                    {#each FONT_SIZE_PRESETS as p}
                        <button type="button" class:selected={config.fontSize === p.value} on:click={() => config.fontSize = p.value}>{p.label} ({p.value}px)</button>
                    {/each}
                </div>
            </div>
            <div class="control">
                <label>Text Shadow</label>
                <div class="segmented">
                    {#each SHADOW_PRESETS as p}
                        <button type="button" class:selected={config.outlineSize === p.value} on:click={() => config.outlineSize = p.value}>{p.label}</button>
                    {/each}
                </div>
            </div>
            <div class="control">
                <label>Text Weight</label>
                <div class="segmented">
                    {#each FONT_WEIGHT_PRESETS as p}
                        <button type="button" class:selected={config.fontWeight === p.value} on:click={() => config.fontWeight = p.value}>{p.label}</button>
                    {/each}
                </div>
            </div>
            <div class="control">
                <label>Emote Size ({emoteMaxHeightPx(config)}px max-height)</label>
                <div class="segmented">
                    {#each EMOTE_MULTIPLIER_PRESETS as p}
                        <button type="button" class:selected={config.emoteMultiplier === p.value} on:click={() => config.emoteMultiplier = p.value}>{p.label}</button>
                    {/each}
                </div>
            </div>
            <div class="control">
                <label>Message Spacing: {config.spacing}px</label>
                <input type="range" min="0" max="16" bind:value={config.spacing} />
            </div>

            <FontSelect bind:selected={config.fontFamily} {fonts} />

            <hr />
            <div class="form-group checkbox-container">
                <div class="switch-row"><span>Show Twitch badges</span><label class="switch"><input type="checkbox" bind:checked={config.showBadgesTwitch} /><span class="slider"></span></label></div>
                <div class="switch-row"><span>Show FFZ badges</span><label class="switch"><input type="checkbox" bind:checked={config.showBadgesFFZ} /><span class="slider"></span></label></div>
                <div class="switch-row"><span>Show 7TV badges</span><label class="switch"><input type="checkbox" bind:checked={config.showBadgesSevenTV} /><span class="slider"></span></label></div>
                <div class="switch-row"><span>Show Homies badges</span><label class="switch"><input type="checkbox" bind:checked={config.showBadgesHomies} /><span class="slider"></span></label></div>
                <div class="switch-row"><span>Show 7TV colors/paints</span><label class="switch"><input type="checkbox" bind:checked={config.showStvColors} /><span class="slider"></span></label></div>
                <div class="switch-row"><span>Highlight "Highlighted Messages"</span><label class="switch"><input type="checkbox" bind:checked={config.showHighlighted} /><span class="slider"></span></label></div>
                <div class="switch-row"><span>Highlight first-time chatters</span><label class="switch"><input type="checkbox" bind:checked={config.showFirstTimeChatter} /><span class="slider"></span></label></div>
                <div class="switch-row"><span>Hide bots (auto-detected via Twitch/FFZ/BTTV)</span><label class="switch"><input type="checkbox" bind:checked={config.hideBots} /><span class="slider"></span></label></div>
                <div class="switch-row"><span>Hide commands (!, #, =, - ...)</span><label class="switch"><input type="checkbox" bind:checked={config.hideCommands} /><span class="slider"></span></label></div>
                {#if config.hideCommands}
                    <div class="yt-sub-settings" transition:fade>
                        <label for="commandPrefixes">Command prefixes (comma-separated):</label>
                        <input id="commandPrefixes" type="text" bind:value={config.commandPrefixes} placeholder="!,#,=" />
                    </div>
                {/if}
            </div>
            <p class="hint">Broadcaster/mods can type <code>!refresh</code> in chat to reload emotes/badges, or <code>!reload</code> to reload the whole overlay.</p>
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
                <div class="switch-row"><span>Enable YouTube (as Audio)</span><label class="switch"><input type="checkbox" bind:checked={config.ytEnabled} /><span class="slider"></span></label></div>
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
                    <input type="text" bind:value={whiteInput} on:keydown={(e) => addTag('white', e)} placeholder={config.white.length === 0 ? "Type nickname and press Space..." : ""} />
                </div>
            </div>
            <div class="form-group">
                <label>Blacklist:</label>
                <div class="tags-input">
                    {#each config.black as tag, i}<span class="tag-badge black-list-tag" in:fade>{tag} <button on:click={() => removeTag('black', i)}>×</button></span>{/each}
                    <input type="text" bind:value={blackInput} on:keydown={(e) => addTag('black', e)} placeholder={config.black.length === 0 ? "Type nickname and press Space..." : ""} />
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

    /* Сегментированные группы пресетов размера (вместо голых слайдеров) */
    .control { margin-bottom: 16px; }
    .segmented { display: flex; gap: 6px; flex-wrap: wrap; }
    .segmented button {
        flex: 1;
        min-width: 70px;
        padding: 8px 10px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        background: white;
        color: #374151;
        font-size: 0.85rem;
        cursor: pointer;
        transition: 0.15s;
    }
    .segmented button:hover { border-color: #c4b5fd; }
    .segmented button.selected {
        background: #7c3aed;
        border-color: #7c3aed;
        color: white;
        font-weight: 600;
    }

    .hint { font-size: 0.8rem; color: #6b7280; margin-top: 4px; }
    .hint code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; color: #7c3aed; }

    /* PREVIEW */
    .preview-box { background: #3a3a3a; border-radius: 10px; padding: 16px; margin: 20px 0 10px; border: 2px solid #7c3aed; }
    .preview-label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 12px; flex-wrap: wrap; }
    .preview-label { color: #a78bfa; font-size: 10px; font-weight: bold; text-transform: uppercase; font-family: sans-serif; }
    .preview-ref-width {
        display: flex; align-items: center; gap: 6px;
        color: #8b8b9a; font-size: 11px; font-weight: normal; text-transform: none;
    }
    .preview-ref-width input {
        width: 70px; padding: 3px 6px; font-size: 12px;
        border: 1px solid #555; border-radius: 4px; background: #222; color: #eee;
    }

    /*
     * Реальный /widget рендерится в iframe шириной previewRefWidth (как
     * будто это полноразмерный холст OBS), затем весь iframe целиком
     * масштабируется вниз transform:scale, чтобы влезть в панель настроек.
     * Так пропорции шрифта/эмоутов относительно ширины оверлея всегда
     * совпадают с тем, что реально увидят зрители в OBS.
     */
    .preview-frame-outer {
        width: 100%;
    }
    .preview-frame-wrap {
        position: relative;
        overflow: hidden;
        border-radius: 6px;
        background-image:
            linear-gradient(45deg, #2a2a2a 25%, transparent 25%),
            linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #2a2a2a 75%),
            linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
        background-size: 20px 20px;
        background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        background-color: #333;
    }
    .preview-frame-wrap iframe {
        position: absolute;
        top: 0;
        left: 0;
        border: none;
        transform-origin: top left;
        pointer-events: none;
    }

    input[type="range"] { width: 100%; accent-color: #7c3aed; }
    .module-selector { background: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #f3f4f6; }
    .yt-sub-settings { margin-left: 10px; margin-top: 10px; border-left: 2px solid #7c3aed; padding-left: 15px; }
    hr { border: 0; border-top: 1px solid #eee; margin: 20px 0; }
    .generate-btn { width: 100%; padding: 14px; font-size: 15px; border: none; border-radius: 8px; cursor: pointer; color: white; background: #7c3aed; font-weight: bold; transition: 0.2s; margin-top: 20px; }
    .generate-btn.clicked { transform: scale(0.98); background: #5b21b6; }
    .toast-container { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 9999; }
    .toast { background: #111827; color: white; padding: 10px 20px; border-radius: 8px; margin-top: 5px; }
</style>
