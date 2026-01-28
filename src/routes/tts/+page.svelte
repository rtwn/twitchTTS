<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import ComfyJS from 'comfy.js';

	const params = $page.url.searchParams;
	let ttsVoice = params.get('voice') || 'Brian';
	const channel = params.get('channel');
	const charLimit = 500;
	const ui = params.get('ui') === 'true';
	const customVoiceEnabled = params.get('customVoice') === 'true';

	let audioEl: HTMLAudioElement;

	type TTSMessage = { text: string; voice: string };
	let msgQueue: TTSMessage[] = [];
	let isPlaying = false;
	let currentAudio: TTSMessage | null = null;

	const whiteList: string[] = (params.get('white') || '')
		.split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
	const blackList: string[] = (params.get('black') || '')
		.split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
	const allowMods = params.get('mods') === 'true';
	const allowVips = params.get('vips') === 'true';

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

	function isUserAllowed(user: string, flags: { mod: boolean; vip: boolean; broadcaster: boolean }) {
		const lower = user.toLowerCase();
		if (flags.broadcaster) return true;
		if (blackList.includes(lower)) return false;
		if (whiteList.length === 0 && !allowMods && !allowVips) return false;
		if (whiteList.includes(lower)) return true;
		if (allowMods && flags.mod) return true;
		if (allowVips && flags.vip) return true;
		return false;
	}

	async function processQueue() {
		if (isPlaying || msgQueue.length === 0) return;

		isPlaying = true;
		currentAudio = msgQueue.shift()!;

		try {
			const res = await fetch('/api/v1/tts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ voice: currentAudio.voice, text: currentAudio.text })
			});
			const json = await res.json();
			if (!json.success) throw new Error('TTS failed');

			audioEl.preload = 'auto';
			audioEl.src = json.speak_url;
			audioEl.volume = 1;

			await new Promise<void>((resolve) => {
				audioEl.onended = () => resolve();
				audioEl.play();
			});
		} catch (e) {
			console.error(e);
		} finally {
			isPlaying = false;
			currentAudio = null;
			if (msgQueue.length > 0) await processQueue();
		}
	}

	async function skipTTS() {
		if (!isPlaying) return;
		audioEl.pause();
		audioEl.currentTime = 0;
		isPlaying = false;
		currentAudio = null;
		await processQueue();
	}

	onMount(() => {
		if (!channel) return;

		ComfyJS.Init(channel);

		ComfyJS.onCommand = (user, command, message, flags) => {
			if (command !== 'tts') return;
			if (!isUserAllowed(user, flags)) return;

			let voice = ttsVoice;
			let ttsMessage = message.trim();

			if (customVoiceEnabled) {
				const voiceMatch = ttsMessage.match(/^-v\s+(\S+)\s*/i); // любое слово после -v
				if (voiceMatch) {
					const candidate = voiceMatch[1];
					if (availableVoices.includes(candidate)) {
						voice = candidate; // меняем голос, если есть в списке
					}
					// всегда убираем "-v что_бы_ни_было" из текста
					ttsMessage = ttsMessage.replace(voiceMatch[0], '');
				}
			} else {
				if (ttsMessage.startsWith('-v ')) {
					ttsMessage = ttsMessage.replace(/^-v\s+/, '');
				}
			}

			if (!ttsMessage) return;

			msgQueue.push({ text: ttsMessage.substring(0, charLimit), voice });
			processQueue();
			console.log(`[ALLOWED] ${user}: "${ttsMessage}" (voice: ${voice})`);
		};
	});
</script>

<svelte:head>
	<title>Twitch TTS</title>
	<script src="https://cdn.jsdelivr.net/npm/comfy.js@latest/dist/comfy.min.js"></script>
</svelte:head>

{#if ui}
	<button class="skip-tts-btn" on:click={skipTTS}>Skip TTS</button>
{/if}

<style>
    .skip-tts-btn {
        position: fixed;
        bottom: 24px;
        left: 24px;
        padding: 12px 24px;
        background-color: #7c3aed;
        color: white;
        font-weight: 600;
        font-size: 16px;
        border: none;
        border-radius: 16px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .skip-tts-btn:hover {
        background-color: #6d28d9;
        box-shadow: 0 6px 10px rgba(0,0,0,0.25);
    }

    .skip-tts-btn:active {
        transform: scale(0.95);
    }

    .skip-tts-btn:focus {
        outline: none;
        box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.5);
    }
</style>

<audio bind:this={audioEl} style="display:none" />