/**
 * Отправляет текст на сервер для получения URL аудиофайла
 */
export async function fetchTTSAudio(text: string, voice: string): Promise<string | null> {
    try {
        const res = await fetch('/api/v1/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice })
        });

        if (!res.ok) return null;

        const data = await res.json();
        return data.url || null;
    } catch (err) {
        console.error("TTS API Error:", err);
        return null;
    }
}