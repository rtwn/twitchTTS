<script lang="ts">
	const voices = [
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

	let selectedVoice = "Maxim";
	let channel = "";
	let allowMods = false;
	let allowVips = false;
	let allowCustomVoice = false;
	// let ui = false;
	let whiteList = "";
	let blackList = "";

	let toasts: { id: number; msg: string }[] = [];
	let toastIdCounter = 0;
	let buttonClicked = false;
	const MAX_TOASTS = 3;

	function generateLink() {
		if (!channel.trim()) {
			showToastMsg("Please enter your Twitch channel name.");
			return;
		}

		const params = new URLSearchParams({
			channel: channel.trim(),
			voice: selectedVoice,
			mods: allowMods.toString(),
			vips: allowVips.toString(),
			customVoice: allowCustomVoice.toString(),
			// ui: ui.toString(),
			white: whiteList.trim(),
			black: blackList.trim()
		});

		const link = `${window.location.origin}/tts?${params.toString()}`;

		navigator.clipboard.writeText(link)
			.then(() => {
				showToastMsg("Link copied to clipboard!");
				animateButton();
			})
			.catch(() => {
				showToastMsg("Failed to copy link.");
			});
	}

	function showToastMsg(msg: string) {
		const id = toastIdCounter++;

		if (toasts.length >= MAX_TOASTS) {
			toasts.shift();
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
			bind:value={channel}
			placeholder="Enter your channel"
		/>
	</div>

	<div class="form-group">
		<label for="voice">Select Voice:</label>
		<select id="voice" bind:value={selectedVoice}>
			{#each voices as v}
				<option value={v}>{v}</option>
			{/each}
		</select>
	</div>

	<div class="form-group">
		<label>
			<input type="checkbox" bind:checked={allowMods} />
			Allow Moderators
		</label>
	</div>

	<div class="form-group">
		<label>
			<input type="checkbox" bind:checked={allowVips} />
			Allow VIPs
		</label>
	</div>

	<div class="form-group">
		<label>
			<input type="checkbox" bind:checked={allowCustomVoice} />
			Allow custom voice per message (!tts -v)
		</label>
	</div>

	<!--
<div class="form-group">
	<label>
		<input type="checkbox" bind:checked={ui} />
		Show Skip TTS Button
	</label>
</div>
-->

	<div class="form-group">
		<label for="white">Whitelist (comma-separated usernames):</label>
		<input
			id="white"
			type="text"
			bind:value={whiteList}
			placeholder="e.g. user1,user2"
		/>
	</div>

	<div class="form-group">
		<label for="black">Blacklist (comma-separated usernames):</label>
		<input
			id="black"
			type="text"
			bind:value={blackList}
			placeholder="e.g. user3,user4"
		/>
	</div>

	<button
		class="generate-btn {buttonClicked ? 'clicked' : ''}"
		on:click={generateLink}
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
    }

    h1 {
        text-align: center;
        margin-bottom: 24px;
    }

    .form-group {
        margin-bottom: 16px;
    }

    label {
        display: block;
        margin-bottom: 4px;
        font-weight: 600;
    }

    input[type="text"],
    select {
        width: 100%;
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #ccc;
        font-size: 14px;
        box-sizing: border-box;
    }

    input[type="checkbox"] {
        margin-right: 8px;
    }

    .generate-btn {
        padding: 10px 20px;
        font-size: 14px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        color: white;
        background-color: #7c3aed;
        margin-top: 8px;
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