<script lang="ts">
    export let msg: string;
</script>

<div class="toast">
    {msg}
</div>

<style>
    .toast {
        background: #1e293b;
        color: #fff;
        padding: 10px 20px;
        border-radius: 20px;
        margin-top: 8px;
        font-size: 0.85rem;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        animation: slideUp 0.3s ease-out forwards;
    }

    @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
</style>