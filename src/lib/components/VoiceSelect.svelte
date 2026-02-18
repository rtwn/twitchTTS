<script lang="ts">
    import { STREAMLABS_VOICES } from '$lib/constants/voices';
    export let selected: string;
</script>

<div class="form-group">
    <label for="voice">Default Voice</label>
    <select id="voice" bind:value={selected}>
        {#each STREAMLABS_VOICES as group}
            <optgroup label={group.lang}>
                {#each group.voices as v}
                    <option value={v.value}>{v.label}</option>
                {/each}
            </optgroup>
        {/each}
    </select>
</div>

<style>
    .form-group { margin-bottom: 16px; }
    label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 0.9rem; color: #4b5563; }
    select {
        width: 100%;
        padding: 10px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 1rem;
        background-color: white;
        cursor: pointer;
    }
    select:focus {
        outline: none;
        border-color: #7c3aed;
        ring: 2px #ddd6fe;
    }
</style>