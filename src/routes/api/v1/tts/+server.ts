import { error, json } from '@sveltejs/kit';
import { ALL_STREAMLABS_VOICES } from '$lib/constants/voices';

export async function POST({ request }) {
    try {
        const { voice, text } = await request.json();

        if (!text || text.trim().length === 0) {
            throw error(400, 'Message text is required');
        }

        const isValidVoice = ALL_STREAMLABS_VOICES.some((v) => v.value === voice);
        const selectedVoice = isValidVoice ? voice : 'Brian';

        const response = await fetch('https://streamlabs.com/polly/speak', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Referer': 'https://streamlabs.com/'
            },
            body: JSON.stringify({
                voice: selectedVoice,
                text: text.trim()
            })
        });

        if (!response.ok) throw error(500, 'TTS provider unavailable');

        const data = await response.json();

        if (data.success && data.speak_url) {
            return json({ success: true, url: data.speak_url });
        }

        throw error(500, 'TTS generation failed');
    } catch (err: any) {
        if (err.status) throw err;
        throw error(500, 'Internal Server Error');
    }
}