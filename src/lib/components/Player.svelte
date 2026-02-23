<script context="module" lang="ts">
    declare const YT: any;
</script>

<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';

    export let channel: string | null;

    const params = $page.url.searchParams;
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

    const availableVoices = ["Aditi","Amy","Astrid","Bianca","Brian","Camila","Carla","Carmen","Celine","Chantal","Conchita","Cristiano","Dora","Emma","Enrique","Ewa","Filiz","Geraint","Giorgio","Gwyneth","Hans","Ines","Ivy","Jacek","Jan","Joanna","Joey","Justin","Karl","Kendra","Kimberly","Lea","Liv","Lotte","Lucia","Lupe","Mads","Maja","Marlene","Mathieu","Matthew","Maxim","Mia","Miguel","Mizuki","Naja","Nicole","Penelope","Raveena","Ricardo","Ruben","Russell","Salli","Seoyeon","Takumi","Tatyana","Vicki","Vitoria","Zeina","Zhiyu"];

    function isUserAllowed(user: string, flags: any) {
        const lower = user.toLowerCase();
        if (flags.broadcaster) return true;
        if (blackList.includes(lower)) return false;
        if (whiteList.length === 0 && !allowMods && !allowVips) return false;
        return whiteList.includes(lower) || (allowMods && flags.mod) || (allowVips && flags.vip);
    }

    function extractVideoId(url: string) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    function cleanText(text: string): string {
        let res = text.replace(/(.)\1{3,}/gi, '$1$1$1');
        res = res.replace(/(https?:\/\/[^\s]+)/g, 'ссылка');
        return res.replace(/([!?.]){2,}/g, '$1').replace(/[^\w\sа-яА-ЯёЁ!,?.]/g, '').replace(/\s+/g, ' ').trim();
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
                    audioEl.play().catch(() => { isPlaying = false; setTimeout(processQueue, 100); });
                    audioEl.onended = () => { isPlaying = false; setTimeout(processQueue, 100); };
                } else { throw new Error(); }
            } catch { isPlaying = false; setTimeout(processQueue, 100); }
        }
    }

    export function skipAll() {
        clearTimeout(ytTimeout);
        if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); }
        if (isYtReady && ytPlayer?.stopVideo) ytPlayer.stopVideo();
        isPlaying = false;
        setTimeout(processQueue, 100);
    }

    export function clearAll() { msgQueue = []; skipAll(); }

    export function setVolume(val: number) {
        globalVolume = Math.min(Math.max(val, 0), 100);
        if (isYtReady && ytPlayer) ytPlayer.setVolume(globalVolume);
        if (audioEl) audioEl.volume = globalVolume / 100;
    }

    export function handleCommand(user: string, command: string, message: string, flags: any) {
        const cmd = command.toLowerCase();
        const msgTrim = message.trim();
        if (cmd === 'skip' && (flags.broadcaster || flags.mod)) { skipAll(); return; }
        if (cmd === 'clear' && (flags.broadcaster || flags.mod)) { clearAll(); return; }
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
                    'onStateChange': (e: any) => { if (e.data === 0) { isPlaying = false; setTimeout(processQueue, 100); } },
                    'onError': () => { isPlaying = false; setTimeout(processQueue, 100); }
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