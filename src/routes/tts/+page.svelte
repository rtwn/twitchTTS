<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import ComfyJS from 'comfy.js';

    // Словарь замены эмодзи и смайлов
    const emojiMap: Record<string, string> = {
        ':)': 'улыбка', ':-)': 'улыбка', ':(': 'грусть', ':-(': 'грусть',
        ':D': 'смех', ':-D': 'смех', 'XD': 'сильный смех', 'xD': 'сильный смех',
        ';)': 'подмигивание', ';-)': 'подмигивание', ':P': 'показывает язык',
        ':-P': 'показывает язык', ':/': 'сомнение', ':|': 'без эмоций',
        ':O': 'удивление', 'O_O': 'шок', '<3': 'сердце', '</3': 'разбитое сердце',
        '^_^': 'радость', '-_-': 'усталость', 'T_T': 'плач', '>:(': 'злость',
        ')': 'скобочка', '(': 'грустная скобочка', 'KEKW': 'кекв',
        'wa1mi': 'вэлман', 'WW': 'даблъю даблъю', 'LL': 'эл эл', 'LMAO': 'лмао',
        '👍': 'лайк', '👎': 'дизлайк', '👌': 'окей', '👏': 'аплодисменты', '🙏': 'молитва'
    };

    // 1. Параметры URL
    const params = $page.url.searchParams;
    let ttsVoice = params.get('voice') || 'Brian';
    const channel = params.get('channel');
    const charLimit = 500;
    const ui = params.get('ui') === 'true';
    const customVoiceEnabled = params.get('customVoice') === 'true';

    // 2. Настройки доступа
    const whiteList = (params.get('white') || '').split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
    const blackList = (params.get('black') || '').split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
    const allowMods = params.get('mods') === 'true';
    const allowVips = params.get('vips') === 'true';

    // 3. Состояние
    type TTSMessage = { text: string; voice: string };
    let msgQueue: TTSMessage[] = [];
    let isPlaying = false;
    let audioEl: HTMLAudioElement;

    const availableVoices = [
        "Aditi","Amy","Astrid","Bianca","Brian","Camila","Carla",
        "Carmen","Celine","Chantal","Conchita","Cristiano","Dora","Emma",
        "Enrique","Ewa","Filiz","Geraint","Giorgio","Gwyneth","Hans",
        "Ines","Ivy","Jacek","Jan","Joanna","Joey","Justin",
        "Karl","Kendra","Kimberly","Lea","Liv","Lotte","Lucia",
        "Lupe","Mads","Maja","Marlene","Mathieu","Matthew","Maxim",
        "Mia","Miguel","Mizuki","Naja","Nicole","Penelope","Raveena",
        "Ricardo","Ruben","Russell","Salli","Seoyeon","Takumi","Tatyana",
        "Vicki","Vitoria","Zeina","Zhiyu"
    ];

    // 4. Логика прав доступа (строго по вашему примеру)
    function isUserAllowed(user: string, flags: any) {
        const lower = user.toLowerCase();
        if (flags.broadcaster) return true; // Стримеру всегда можно
        if (blackList.includes(lower)) return false; // Черный список

        // Если вайтлист пуст и моды/випы выключены — доступ закрыт всем (кроме стримера выше)
        if (whiteList.length === 0 && !allowMods && !allowVips) return false;

        if (whiteList.includes(lower)) return true;
        if (allowMods && flags.mod) return true;
        if (allowVips && flags.vip) return true;

        return false;
    }

    function cleanText(text: string): string {
        let processedText = text;
        processedText = processedText.replace(/(https?:\/\/[^\s]+)/g, 'ссылка');

        Object.entries(emojiMap).forEach(([emoji, translation]) => {
            const escapedEmoji = emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(?<=^|\\s)${escapedEmoji}(?=\\s|$)`, 'gi');
            processedText = processedText.replace(regex, ` ${translation} `);
        });

        return processedText
            .replace(/([!?.]){2,}/g, '$1')
            .replace(/[^\w\sа-яА-ЯёЁ!,?.]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // 5. Очередь
    async function processQueue() {
        if (isPlaying || msgQueue.length === 0) return;

        isPlaying = true;
        const nextMessage = msgQueue.shift();
        if (!nextMessage) { isPlaying = false; return; }

        try {
            const res = await fetch('/api/v1/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voice: nextMessage.voice, text: nextMessage.text })
            });

            const json = await res.json();
            const audioUrl = json.speak_url || json.url;

            if (audioUrl) {
                audioEl.src = audioUrl;
                await new Promise<void>((resolve) => {
                    audioEl.onended = () => resolve();
                    audioEl.onerror = () => resolve();
                    audioEl.play().catch(() => resolve());
                });
            }
        } catch (e) {
            console.error("TTS Error:", e);
        } finally {
            isPlaying = false;
            setTimeout(() => processQueue(), 100);
        }
    }

    function skipTTS() {
        if (!isPlaying) return;
        audioEl.pause();
        audioEl.src = "";
        isPlaying = false;
        processQueue();
    }

    function clearQueue() {
        msgQueue = [];
        skipTTS();
    }

    // 6. Init
    onMount(() => {
        if (!channel) return;

        ComfyJS.onCommand = (user, command, message, flags) => {
            const cmd = command.toLowerCase();
            const isMod = flags.broadcaster || flags.mod;

            if (cmd === 'skip' || (cmd === 'tts' && message.trim() === 'skip')) {
                if (isMod) skipTTS();
                return;
            }

            if (cmd === 'clear' || (cmd === 'tts' && message.trim() === 'clear')) {
                if (isMod) clearQueue();
                return;
            }

            if (cmd !== 'tts') return;
            if (!isUserAllowed(user, flags)) return;

            let voice = ttsVoice;
            let ttsMessage = message.trim();

            if (customVoiceEnabled) {
                const voiceMatch = ttsMessage.match(/^-v\s+(\S+)\s*/i);
                if (voiceMatch) {
                    const candidate = voiceMatch[1];
                    const found = availableVoices.find(v => v.toLowerCase() === candidate.toLowerCase());
                    if (found) voice = found;
                    ttsMessage = ttsMessage.replace(voiceMatch[0], '');
                }
            } else {
                if (ttsMessage.startsWith('-v ')) {
                    ttsMessage = ttsMessage.replace(/^-v\s+\S+\s*/, '');
                }
            }

            ttsMessage = cleanText(ttsMessage);
            if (!ttsMessage) return;

            msgQueue.push({ text: ttsMessage.substring(0, charLimit), voice });
            processQueue();
        };

        ComfyJS.Init(channel);
        return () => ComfyJS.Disconnect();
    });
</script>

<audio bind:this={audioEl} style="display:none" />

{#if ui}
    <div class="controls">
        <button class="skip-btn" on:click={skipTTS}>Skip TTS</button>
        <button class="clear-btn" on:click={clearQueue}>Clear Queue</button>
    </div>
{/if}

<style>
    :global(body) {
        background-color: transparent !important;
        margin: 0;
        overflow: hidden;
    }

    .controls {
        position: fixed;
        bottom: 24px;
        left: 24px;
        display: flex;
        gap: 12px;
    }

    button {
        padding: 12px 24px;
        color: white;
        font-weight: 600;
        border: none;
        border-radius: 16px;
        cursor: pointer;
        box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        transition: all 0.2s ease;
    }

    .skip-btn { background-color: #7c3aed; }
    .skip-btn:hover { background-color: #6d28d9; }

    .clear-btn { background-color: #dc2626; }
    .clear-btn:hover { background-color: #b91c1c; }

    button:active { transform: scale(0.95); }
</style>