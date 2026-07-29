<script context="module" lang="ts">
    declare const YT: any;
</script>

<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { ALL_STREAMLABS_VOICES } from '$lib/constants/voices';

    const params = page.url.searchParams;
    const ttsVoiceDefault = params.get('voice') || 'Brian';
    const customVoiceEnabled = params.get('customVoice') === 'true';
    const ytEnabled = params.get('ytEnabled') === 'true';
    const ytMaxLen = parseInt(params.get('ytMaxLen') || '0');

    const whiteList = (params.get('white') || '').split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
    const blackList = (params.get('black') || '').split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
    const allowMods = params.get('mods') === 'true';
    const allowVips = params.get('vips') === 'true';

    type QueueItem = { type: 'tts' | 'youtube'; text?: string; voice?: string; videoId?: string; start?: number; duration?: number; };

    let msgQueue: QueueItem[] = [];
    let isPlaying = false;
    let audioEl: HTMLAudioElement;
    let ytPlayer: any;
    let isYtReady = false;
    let ytTimeout: any;
    let globalVolume = 100;

    // Раньше тут был отдельный захардкоженный список имён голосов, который
    // держали в актуальном состоянии вручную — он успел разойтись с тем
    // списком, что использует сервер для валидации (`ALL_STREAMLABS_VOICES`
    // в voices.ts): там был лишний "Gwyneth", которого сервер не знает, из-за
    // чего `!tts -v Gwyneth текст` клиент считал валидным, а сервер вместо
    // этого тихо подставлял Brian. Импорт того же самого списка, что и на
    // странице настроек/сервере, делает такое расхождение впредь невозможным.
    // Сравниваем по `value` — оно всегда латиница без эмодзи-флагов, флаги
    // есть только в `label` для выпадающего списка на странице настроек.
    const availableVoices = ALL_STREAMLABS_VOICES.map(v => v.value);

    function isUserAllowed(user: string, flags: any) {
        const lower = user.toLowerCase();
        if (flags.broadcaster) return true;
        if (blackList.includes(lower)) return false;
        if (whiteList.length === 0 && !allowMods && !allowVips) return false;
        return whiteList.includes(lower) || (allowMods && flags.mod) || (allowVips && flags.vip);
    }

    function extractVideoId(url: string) {
        const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    function cleanText(text: string): string {
        // Явно вырезаем эмодзи-пиктограммы (смайлы, флаги, жесты и т.д.),
        // чтобы TTS не пытался их озвучивать. \p{Extended_Pictographic} —
        // это правильное Unicode-свойство именно для "эмодзи-картинок": в
        // отличие от общего \p{Emoji}, оно не цепляет обычные цифры 0-9
        // (те формально тоже "Emoji", т.к. могут стать эмодзи-клавишей в
        // сочетании с U+FE0F, но сами по себе — просто цифры).
        let res = text.replace(/\p{Extended_Pictographic}/gu, '');
        res = res.replace(/(.)\1{3,}/gi, '$1$1$1');
        res = res.replace(/(https?:\/\/\S+)/g, 'ссылка');
        // Раньше здесь был жёстко зашитый диапазон а-яА-ЯёЁ — это резало
        // украинские (і, ї, є, ґ), польские, турецкие и любые другие буквы
        // с диакритикой, превращая слова в мусор для TTS. \p{L}/\p{N} с
        // флагом /u покрывают буквы и цифры любого языка одинаково (и заодно
        // подчищают любые оставшиеся не-пиктографические эмодзи-символы).
        return res.replace(/([!?.]){2,}/g, '$1')
            .replace(/[^\p{L}\p{N}\s!,?.]/gu, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Один и тот же паттерн "остановить, отпустить очередь, попробовать
    // сыграть следующее" повторялся пятью разными копипастами по всему
    // файлу — вынес в одно место, чтобы не расходились случайно.
    function finishAndAdvance() {
        isPlaying = false;
        setTimeout(processQueue, 100);
    }

    async function processQueue() {
        if (isPlaying || msgQueue.length === 0) return;
        isPlaying = true;
        const next = msgQueue.shift();
        if (!next) { isPlaying = false; return; }

        if (next.type === 'youtube' && isYtReady) {
            ytPlayer.loadVideoById({ videoId: next.videoId, startSeconds: next.start });
            ytPlayer.setVolume(globalVolume);
            ytPlayer.playVideo();
            if (next.duration && next.duration > 0) {
                clearTimeout(ytTimeout);
                ytTimeout = setTimeout(() => skipAll(), next.duration * 1000);
            }
        } else if (next.type === 'tts') {
            try {
                const res = await fetch('/api/v1/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voice: next.voice, text: next.text })
                });
                const json = await res.json();
                const url = json.speak_url || json.url;
                if (url && audioEl) {
                    audioEl.volume = globalVolume / 100;
                    audioEl.src = url;
                    audioEl.play().catch(finishAndAdvance);
                    audioEl.onended = finishAndAdvance;
                } else {
                    finishAndAdvance();
                }
            } catch { finishAndAdvance(); }
        }
    }

    export function skipAll() {
        clearTimeout(ytTimeout);
        if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); }
        if (isYtReady && ytPlayer?.stopVideo) ytPlayer.stopVideo();
        finishAndAdvance();
    }

    export function clearAll() { msgQueue = []; skipAll(); }

    export function setVolume(val: number) {
        if (isNaN(val)) return;
        globalVolume = Math.min(Math.max(val, 0), 100);
        if (isYtReady && ytPlayer) ytPlayer.setVolume(globalVolume);
        if (audioEl) audioEl.volume = globalVolume / 100;
    }

    export function handleCommand(user: string, command: string, message: string, flags: any) {
        const cmd = command.toLowerCase();
        const msgTrim = message.trim();
        if (cmd === 'skip' && (flags.broadcaster || flags.mod)) { skipAll(); return; }
        if (cmd === 'clear' && (flags.broadcaster || flags.mod)) { clearAll(); return; }
        // Раньше parseInt('') / parseInt('abc') давал NaN и setVolume молча
        // ставил громкость в NaN навсегда (Math.max(NaN, 0) тоже NaN) — теперь
        // setVolume сам игнорирует NaN, невалидный !vol просто ничего не делает.
        if (cmd === 'vol' && (flags.broadcaster || flags.mod)) { setVolume(parseInt(msgTrim)); return; }

        if (cmd === 'play' && ytEnabled && isUserAllowed(user, flags)) {
            const videoId = extractVideoId(msgTrim.split(/\s+/)[0]);
            if (videoId) {
                const parts = msgTrim.split(/\s+/);
                const start = parseInt(parts[1]) || 0;
                let duration = parseInt(parts[2]) || ytMaxLen;
                msgQueue = [...msgQueue, { type: 'youtube', videoId, start, duration }];
                processQueue();
            }
        }
        if (cmd === 'tts' && isUserAllowed(user, flags) && msgTrim) {
            let voice = ttsVoiceDefault;
            let ttsMsg = msgTrim;
            if (customVoiceEnabled) {
                const match = ttsMsg.match(/^-v\s+(\S+)\s*/i);
                if (match) {
                    const found = availableVoices.find(v => v.toLowerCase() === match[1].toLowerCase());
                    if (found) voice = found;
                    ttsMsg = ttsMsg.replace(match[0], '');
                }
            }
            ttsMsg = cleanText(ttsMsg);
            if (!ttsMsg || ttsMsg === 'ссылка') return;
            msgQueue = [...msgQueue, { type: 'tts', text: ttsMsg.substring(0, 500), voice }];
            processQueue();
        }
    }

    onMount(() => {
        const initYT = () => {
            if (ytPlayer) return;
            ytPlayer = new YT.Player('yt-player', {
                height: '1', width: '1',
                playerVars: { 'autoplay': 1, 'controls': 0, 'disablekb': 1 },
                events: {
                    'onReady': () => { isYtReady = true; },
                    'onStateChange': (e: any) => { if (e.data === 0) finishAndAdvance(); },
                    'onError': () => finishAndAdvance()
                }
            });
        };
        (window as any).onYouTubeIframeAPIReady = initYT;
        if (typeof YT !== 'undefined' && YT.Player) initYT();
    });
</script>

<svelte:head><script src="https://www.youtube.com/iframe_api"></script></svelte:head>
<div id="yt-player" style="position: absolute; top: -1000px; left: -1000px;"></div>
<audio bind:this={audioEl} style="display:none" />