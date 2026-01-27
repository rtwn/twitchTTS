<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import ComfyJS from 'comfy.js';

	// URL parameters
	const params = $page.url.searchParams;
	let ttsVoice = params.get('voice') || 'Brian';
	const channel = params.get('channel');
	const charLimit = 500;
	const ui = params.get('ui') === 'true'; // show skip button

	// Audio elements
	let audioEl: HTMLAudioElement;
	let audioSrcEl: HTMLSourceElement;

	// TTS queue
	let msgQueue: string[] = [];
	let isPlaying = false;
	let currentAudio: string | null = null; // tracks currently playing text

	// Users lists
	const whiteList: string[] = (params.get('white') || '')
		.split(',')
		.map(u => u.trim().toLowerCase())
		.filter(Boolean);

	const blackList: string[] = (params.get('black') || '')
		.split(',')
		.map(u => u.trim().toLowerCase())
		.filter(Boolean);

	const allowMods = params.get('mods') === 'true';
	const allowVips = params.get('vips') === 'true';

	// helper: check if user is allowed
	function isUserAllowed(user: string, flags: { mod: boolean; vip: boolean; broadcaster: boolean }) {
		const lower = user.toLowerCase();
		if (flags.broadcaster) return true; // broadcaster always allowed
		if (blackList.includes(lower)) return false;
		if (whiteList.length === 0 && !allowMods && !allowVips) return false; // nothing explicitly allowed
		if (whiteList.includes(lower)) return true;
		if (allowMods && flags.mod) return true;
		if (allowVips && flags.vip) return true;
		return false;
	}

	// main queue processor
	async function processQueue() {
		if (isPlaying || msgQueue.length === 0) return;

		isPlaying = true;
		currentAudio = msgQueue.shift()!; // get the next message

		try {
			const res = await fetch('/api/v1/tts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ voice: ttsVoice, text: currentAudio })
			});
			const json = await res.json();
			if (!json.success) throw new Error('TTS failed');

			audioSrcEl.src = json.speak_url;
			audioEl.load();
			audioEl.volume = 1;

			// Wait for audio to finish
			await new Promise<void>((resolve) => {
				audioEl.onended = () => resolve();
				audioEl.play();
			});
		} catch (e) {
			console.error(e);
		} finally {
			isPlaying = false;
			currentAudio = null;
			// process next message
			if (msgQueue.length > 0) processQueue();
		}
	}

	async function skipTTS() {
		if (!isPlaying) return;
		audioEl.pause();
		audioEl.currentTime = 0;
		isPlaying = false;
		currentAudio = null;
		processQueue();
	}

	onMount(() => {
		if (!channel) return;

		ComfyJS.Init(channel);

		// handle !tts command
		ComfyJS.onCommand = (user, command, message, flags) => {
			if (command !== 'tts') return;

			if (!isUserAllowed(user, flags)) {
				console.log(`[BLOCKED] ${user}: "${message}"`);
				return;
			}

			const ttsMessage = message.trim().substring(0, charLimit);
			if (!ttsMessage) return;

			msgQueue.push(ttsMessage);
			processQueue();
			console.log(`[ALLOWED] ${user}: "${ttsMessage}"`);
		};

		audioEl.addEventListener('ended', () => processQueue());
	});
</script>

<svelte:head>
	<title>Stream TTS</title>
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
        background-color: #7c3aed; /* фиолетовый */
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

<audio style="display: none" bind:this={audioEl}>
	<source type="audio/wav" bind:this={audioSrcEl} />
</audio>