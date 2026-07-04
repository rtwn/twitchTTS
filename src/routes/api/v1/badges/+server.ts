import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * Раньше Client ID и Access Token лежали в PUBLIC_* env (Chat.svelte) —
 * то есть буквально в HTML/JS, который видит браузер, а access token
 * ещё и протухает и никогда не обновлялся. Из-за этого бейджи Twitch
 * тихо переставали грузиться со временем после деплоя.
 *
 * Здесь используется App Access Token (client_credentials) — он не привязан
 * к пользователю, не требует ручного обновления и не должен попадать
 * в браузер, поэтому запрашивается только на сервере.
 */

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAppAccessToken(): Promise<string | null> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
        return cachedToken.token;
    }

    const clientId = env.TWITCH_CLIENT_ID;
    const clientSecret = env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const res = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials'
        })
    });
    if (!res.ok) return null;

    const data = await res.json();
    cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return cachedToken.token;
}

export async function GET({ url }) {
    const broadcasterId = url.searchParams.get('broadcasterId');
    if (!broadcasterId) throw error(400, 'broadcasterId is required');

    const clientId = env.TWITCH_CLIENT_ID;
    const token = await getAppAccessToken();
    if (!clientId || !token) {
        // Без Client ID/Secret просто отдаём пустой словарь —
        // Chat.svelte откатится на дефолтные CDN-ссылки бейджей.
        return json({ badges: {} });
    }

    const headers = { 'Client-ID': clientId, Authorization: `Bearer ${token}` };

    try {
        const [gB, cB] = await Promise.all([
            fetch('https://api.twitch.tv/helix/chat/badges/global', { headers }),
            fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}`, { headers })
        ]);
        const gData = await gB.json();
        const cData = await cB.json();

        const badges: Record<string, string> = {};
        const collect = (res: any) => res?.data?.forEach((b: any) =>
            b.versions.forEach((v: any) => { badges[`${b.set_id}:${v.id}`] = v.image_url_4x; })
        );
        collect(gData);
        collect(cData);

        return json({ badges });
    } catch (e) {
        return json({ badges: {} });
    }
}
