<script lang="ts">
    export let selected: string;
    export let fonts: { name: string; family: string }[];

    let open = false;
    let rootEl: HTMLDivElement;
    let triggerEl: HTMLButtonElement;
    let optionEls: HTMLButtonElement[] = [];
    // Индекс подсвеченного (не обязательно ещё выбранного) варианта при
    // навигации стрелками — обычный <select> умеет это бесплатно, кастомный
    // дропдаун — только если явно реализовать самому.
    let activeIndex = 0;

    $: current = fonts.find((f) => f.name === selected) ?? fonts[0];

    function openMenu() {
        open = true;
        activeIndex = Math.max(0, fonts.findIndex((f) => f.name === selected));
    }

    function closeMenu(returnFocus: boolean) {
        open = false;
        if (returnFocus) triggerEl?.focus();
    }

    function choose(name: string, returnFocus: boolean) {
        selected = name;
        closeMenu(returnFocus);
    }

    function handleWindowClick(e: MouseEvent) {
        if (open && rootEl && !rootEl.contains(e.target as Node)) open = false;
    }

    function handleTriggerKeydown(e: KeyboardEvent) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!open) openMenu();
        }
    }

    // Стрелками — по списку, Enter/Space — выбрать, Escape — закрыть и
    // вернуть фокус на саму кнопку-триггер (без этого после закрытия фокус
    // просто терялся, обычному <select> он остаётся на самом себе бесплатно).
    function handleMenuKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeMenu(true);
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, fonts.length - 1);
            optionEls[activeIndex]?.focus();
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            optionEls[activeIndex]?.focus();
            return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            choose(fonts[activeIndex].name, true);
        }
    }
</script>

<svelte:window on:click={handleWindowClick} />

<div class="form-group">
    <label for="font-select-trigger">Font Family</label>
    <div class="font-select" bind:this={rootEl}>
        <button
            id="font-select-trigger"
            bind:this={triggerEl}
            type="button"
            class="font-select-trigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            on:click={() => (open ? closeMenu(false) : openMenu())}
            on:keydown={handleTriggerKeydown}
            style="font-family: {current?.family};"
        >
            <span>{current?.name}</span>
            <svg class="chevron" class:open width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        </button>

        {#if open}
            <div class="font-select-menu" role="listbox" tabindex="-1" on:keydown={handleMenuKeydown}>
                {#each fonts as font, i}
                    <button
                        type="button"
                        bind:this={optionEls[i]}
                        class="font-option"
                        class:active={font.name === selected}
                        role="option"
                        aria-selected={font.name === selected}
                        tabindex={i === activeIndex ? 0 : -1}
                        style="font-family: {font.family};"
                        on:click={() => choose(font.name, true)}
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

    /* Раньше было outline: none без замены — фокус для клавиатурной
       навигации становился менее заметным, чем стандартный контур браузера.
       box-shadow-кольцо здесь как раз такая замена. */
    .font-select-trigger:hover {
        border-color: #7c3aed;
    }
    .font-select-trigger:focus-visible {
        outline: none;
        border-color: #7c3aed;
        box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.35);
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

    .font-option:focus-visible {
        outline: none;
        background: #f3f4f6;
        box-shadow: inset 0 0 0 2px #7c3aed;
    }

    .font-option.active {
        background: #ede9fe;
        color: #7c3aed;
        font-weight: 600;
    }
</style>
