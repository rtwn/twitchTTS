<script lang="ts">
    export let selected: string;
    export let fonts: { name: string; family: string }[];

    let open = false;
    let rootEl: HTMLDivElement;

    $: current = fonts.find((f) => f.name === selected) ?? fonts[0];

    function choose(name: string) {
        selected = name;
        open = false;
    }

    function handleWindowClick(e: MouseEvent) {
        if (open && rootEl && !rootEl.contains(e.target as Node)) open = false;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') open = false;
    }
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleKeydown} />

<div class="form-group">
    <label for="font-select-trigger">Font Family</label>
    <div class="font-select" bind:this={rootEl}>
        <button
            id="font-select-trigger"
            type="button"
            class="font-select-trigger"
            on:click={() => (open = !open)}
            style="font-family: {current?.family};"
        >
            <span>{current?.name}</span>
            <svg class="chevron" class:open width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        </button>

        {#if open}
            <div class="font-select-menu" role="listbox">
                {#each fonts as font}
                    <button
                        type="button"
                        class="font-option"
                        class:active={font.name === selected}
                        style="font-family: {font.family};"
                        on:click={() => choose(font.name)}
                    >
                        {font.name}
                    </button>
                {/each}
            </div>
        {/if}
    </div>
</div>

<style>
    .form-group { margin-bottom: 16px; }
    label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.9rem; color: #374151; }

    .font-select {
        position: relative;
    }

    .font-select-trigger {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 1rem;
        background-color: white;
        cursor: pointer;
        color: #111827;
        text-align: left;
    }

    .font-select-trigger:hover, .font-select-trigger:focus {
        outline: none;
        border-color: #7c3aed;
    }

    .chevron {
        flex-shrink: 0;
        color: #7c3aed;
        transition: transform 0.15s ease;
    }

    .chevron.open {
        transform: rotate(180deg);
    }

    .font-select-menu {
        position: absolute;
        z-index: 20;
        top: calc(100% + 6px);
        left: 0;
        right: 0;
        max-height: 260px;
        overflow-y: auto;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        padding: 6px;
    }

    .font-option {
        display: block;
        width: 100%;
        text-align: left;
        padding: 9px 10px;
        border: none;
        background: none;
        border-radius: 6px;
        font-size: 1.05rem;
        color: #111827;
        cursor: pointer;
    }

    .font-option:hover {
        background: #f3f4f6;
    }

    .font-option.active {
        background: #ede9fe;
        color: #7c3aed;
        font-weight: 600;
    }
</style>
