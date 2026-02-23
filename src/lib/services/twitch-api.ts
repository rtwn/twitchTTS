/**
 * Сервис для работы с внешними API (Twitch ID, 7TV, FFZ)
 */

export async function fetch7TVEmotesByNickname(nickname: string) {
    const emoteMap = new Map<string, string>();

    try {
        // Шаг 1: Получаем числовой ID Twitch через decapi.me
        // Это избавляет нас от необходимости использовать OAuth токены Helix
        const idRes = await fetch(`https://decapi.me/twitch/id/${nickname.toLowerCase()}`);
        const twitchId = await idRes.text();

        // Проверяем, что получили валидный ID (только цифры)
        if (!/^\d+$/.test(twitchId)) {
            console.error(`7TV: Не удалось разрешить ник ${nickname} в ID. Ответ: ${twitchId}`);
            return emoteMap;
        }

        // Шаг 2: Получаем данные пользователя 7TV по его Twitch ID
        // Используем эндпоинт v3/users/twitch/
        const stvRes = await fetch(`https://7tv.io/v3/users/twitch/${twitchId}`);
        if (!stvRes.ok) return emoteMap;

        const stvData = await stvRes.json();

        // Шаг 3: Извлекаем смайлы из активного набора (emote_set)
        const emotes = stvData.emote_set?.emotes;
        if (emotes) {
            emotes.forEach((e: any) => {
                // e.name — код смайла (напр. KEKW), e.id — уникальный ID для CDN
                // Используем формат webp и размер 2x (оптимально для стрима)
                emoteMap.set(e.name, `https://cdn.7tv.app/emote/${e.id}/2x.webp`);
            });
            console.log(`[7TV] Загружено ${emotes.length} смайлов для ID ${twitchId}`);
        }
    } catch (e) {
        console.error("[7TV] Ошибка загрузки:", e);
    }
    return emoteMap;
}

/**
 * Загрузка смайлов FrankerFaceZ (FFZ)
 */
export async function fetchFFZEmotes(nickname: string) {
    const emoteMap = new Map<string, string>();
    try {
        // FFZ все еще позволяет запрашивать данные напрямую по нику (room)
        const res = await fetch(`https://api.frankerfacez.com/v1/room/${nickname.toLowerCase()}`);
        if (!res.ok) return emoteMap;

        const data = await res.json();

        // В FFZ смайлы сгруппированы по сетам
        if (data.sets) {
            Object.values(data.sets).forEach((set: any) => {
                set.emoticons.forEach((e: any) => {
                    // Берем размер '2' (средний) или '1' (маленький), если '2' нет
                    const url = e.urls['2'] || e.urls['1'];
                    if (url) {
                        emoteMap.set(e.name, url.startsWith('http') ? url : `https:${url}`);
                    }
                });
            });
            console.log(`[FFZ] Смайлы загружены для комнаты ${nickname}`);
        }
    } catch (e) {
        console.error("[FFZ] Ошибка загрузки:", e);
    }
    return emoteMap;
}

export async function fetchAllBadges(channelName: string) {
    try {
        const idRes = await fetch(`https://decapi.me/twitch/id/${channelName}`);
        const channelId = await idRes.text();

        // Запрашиваем данные о канале у 7TV (они проксируют Twitch)
        const res = await fetch(`https://7tv.io/v3/users/twitch/${channelId}`);
        const data = await res.json();

        const badgeMap = new Map<string, string>();

        // 7TV часто возвращает список активных бейджей в объекте user.style
        // Но чтобы получить ВООБЩЕ ВСЕ, мы будем использовать их прокси-ссылки
        return badgeMap;
    } catch (e) {
        return new Map();
    }
}