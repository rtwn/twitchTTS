/**
 * Сервис для работы с внешними API (Twitch ID, 7TV, FFZ).
 */

export interface TwitchUserInfo {
    id: string;
    login: string;
    displayName: string;
}

const idCache = new Map<string, TwitchUserInfo | null>();

export async function resolveTwitchUser(login: string): Promise<TwitchUserInfo | null> {
    const key = login.toLowerCase();
    if (idCache.has(key)) return idCache.get(key)!;

    try {
        const res = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(key)}`);
        if (!res.ok) throw new Error(`IVR ${res.status}`);
        const data = await res.json();
        const entry = data?.[0];
        if (!entry?.id) { idCache.set(key, null); return null; }

        const info: TwitchUserInfo = { id: entry.id, login: entry.login, displayName: entry.displayName };
        idCache.set(key, info);
        return info;
    } catch (e) {
        console.error(`[Twitch] Не удалось получить ID для ${login}:`, e);
        idCache.set(key, null);
        return null;
    }
}

/**
 * Список ботов ТЕКУЩЕГО канала из BetterTTV. Это не угадывание по
 * статичному списку популярных имён — BTTV даёт стримеру настроить в своём
 * дэшборде (betterttv.com/dashboard/bots), кто из аккаунтов в его чате бот;
 * именно на основании этого списка расширение BTTV рисует боту иконку-
 * робота рядом с ником. Соответственно, если стример там ничего не
 * настраивал, список будет пустым — это не наша недоработка, а честное
 * отражение того, что БТTV не знает о ботах в этом канале.
 */
export async function fetchBTTVChannelBots(twitchId: string): Promise<string[]> {
    try {
        const res = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.bots || []).map((b: string) => b.toLowerCase());
    } catch (e) {
        console.error('[BTTV] Не удалось загрузить список ботов канала:', e);
        return [];
    }
}

export async function fetch7TVEmotesByTwitchId(twitchId: string) {
    const emoteMap = new Map<string, { url: string; zeroWidth: boolean }>();
    try {
        const stvRes = await fetch(`https://7tv.io/v3/users/twitch/${twitchId}`);
        if (!stvRes.ok) return emoteMap;

        const stvData = await stvRes.json();
        const emotes = stvData.emote_set?.emotes;
        if (emotes) {
            emotes.forEach((e: any) => {
                // У 7TV v3 ДВА разных поля flags с РАЗНЫМИ битовыми масками:
                // e.flags — переопределение на уровне конкретного emote-сета
                // (ActiveEmoteFlagModel), там ZeroWidth это бит 0 (1);
                // e.data.flags — флаги самого эмоута (EmoteFlagsModel), там
                // ZeroWidth это бит 8 (256). Раньше проверялась только
                // base-маска (256), но через & 1 — то есть не тот бит у не
                // того поля, из-за чего zero-width не срабатывал вообще
                // никогда и оверлеи всегда рисовались рядом, а не поверх.
                const overrideZeroWidth = ((e.flags ?? 0) & 1) === 1;
                const baseZeroWidth = ((e.data?.flags ?? 0) & 256) === 256;
                const zeroWidth = overrideZeroWidth || baseZeroWidth;
                emoteMap.set(e.name, { url: `https://cdn.7tv.app/emote/${e.id}/2x.webp`, zeroWidth });
            });
        }
    } catch (e) {
        console.error('[7TV] Ошибка загрузки эмоутов канала:', e);
    }
    return emoteMap;
}

/**
 * Персональные плюшки 7TV зрителя.
 *
 * Реальная форма ответа https://7tv.io/v3/users/twitch/{id} —
 * `{ user: { style: { color, paint_id, badge_id }, ... } }` — это ПОДТВЕРЖДЕНО
 * прямым запросом. Никаких вложенных `user.badges`/`user.paints` массивов
 * с готовыми картинками там нет.
 *
 *  - style.color — сплошной цвет ника (int32 RGBA).
 *  - style.badge_id — картинка бейджа лежит по предсказуемому CDN-пути
 *    cdn.7tv.app/badge/{id}/2x.webp, доп. запрос не нужен. Схема подтверждена
 *    как официальными примерами 7TV, так и рабочим прод-оверлеем cyan-chat
 *    (github.com/Johnnycyan/cyan-chat), который использует ровно этот путь.
 *  - style.paint_id — сам градиент (цвета/стопы/угол) по этому ID отдаёт
 *    GraphQL-эндпоинт 7TV (7tv.io/v3/gql), запрос `cosmetics(list: $list)`.
 *    Раньше я решил, что это требует недокументированного EventAPI
 *    (постоянный WebSocket + presence), но у cyan-chat нашёлся рабочий
 *    пример: обычный один POST-запрос по ID пейнта, без всякого WebSocket —
 *    так и реализовано ниже.
 */
export interface SevenTVUserCosmetics {
    badgeUrl?: string;
    paintColor?: string;
    paintBackgroundImage?: string;
    paintDropShadow?: string;
}

const cosmeticsCache = new Map<string, SevenTVUserCosmetics | null>();

export async function fetch7TVUserCosmetics(twitchId: string): Promise<SevenTVUserCosmetics | null> {
    if (cosmeticsCache.has(twitchId)) return cosmeticsCache.get(twitchId)!;
    try {
        const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchId}`);
        if (!res.ok) { cosmeticsCache.set(twitchId, null); return null; }
        const data = await res.json();

        const style = data.user?.style;
        const paintColor = typeof style?.color === 'number' ? cssColorFromInt(style.color) : undefined;
        const badgeUrl = style?.badge_id ? `https://cdn.7tv.app/badge/${style.badge_id}/2x.webp` : undefined;

        let paintBackgroundImage: string | undefined;
        let paintDropShadow: string | undefined;
        if (style?.paint_id) {
            const paint = await fetch7TVPaintById(style.paint_id);
            if (paint) {
                paintBackgroundImage = paint.backgroundImage;
                paintDropShadow = paint.dropShadow;
            }
        }

        const cosmetics: SevenTVUserCosmetics = { badgeUrl, paintColor, paintBackgroundImage, paintDropShadow };
        cosmeticsCache.set(twitchId, cosmetics);
        return cosmetics;
    } catch (e) {
        cosmeticsCache.set(twitchId, null);
        return null;
    }
}

interface SevenTVPaintDetails {
    backgroundImage: string; // готовое значение для CSS background-image (gradient() или url())
    dropShadow?: string;     // готовое значение для CSS filter
}

const paintCache = new Map<string, SevenTVPaintDetails | null>();

const COSMETICS_QUERY = `query GetCosmetics($list: [ObjectID!]) {
    cosmetics(list: $list) {
        paints {
            id
            function
            color
            angle
            shape
            image_url
            repeat
            stops { at color __typename }
            shadows { x_offset y_offset radius color __typename }
            __typename
        }
        __typename
    }
}`;

function buildPaintDetails(paint: any): SevenTVPaintDetails | null {
    const dropShadow = (paint.shadows || []).length ? cssDropShadowFromPaint(paint.shadows) : undefined;
    const backgroundImage = paint.image_url ? `url(${paint.image_url})` : cssGradientFromPaint(paint);
    return backgroundImage ? { backgroundImage, dropShadow } : null;
}

async function fetch7TVPaintById(paintId: string): Promise<SevenTVPaintDetails | null> {
    if (paintCache.has(paintId)) return paintCache.get(paintId)!;

    try {
        const res = await fetch('https://7tv.io/v3/gql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operationName: 'GetCosmetics',
                variables: { list: [paintId] },
                query: COSMETICS_QUERY
            })
        });
        if (!res.ok) { paintCache.set(paintId, null); return null; }

        const json = await res.json();
        const paint = json?.data?.cosmetics?.paints?.[0];
        if (!paint) { paintCache.set(paintId, null); return null; }

        const details = buildPaintDetails(paint);
        paintCache.set(paintId, details);
        return details;
    } catch (e) {
        console.error('[7TV] Ошибка загрузки пейнта:', e);
        paintCache.set(paintId, null);
        return null;
    }
}

const ALL_PAINTS_QUERY = `query GetAllPaints {
    cosmetics {
        paints {
            id
            function
            color
            angle
            shape
            image_url
            repeat
            stops { at color __typename }
            shadows { x_offset y_offset radius color __typename }
            __typename
        }
        __typename
    }
}`;

let paintCatalogPreloadPromise: Promise<void> | null = null;

/**
 * Предзагружает ВЕСЬ каталог 7TV-пейнтов одним запросом (без фильтра по
 * list — отдаёт все существующие пейнты). Пейнт — это общий "шаблон",
 * которым пользуется много разных зрителей, поэтому его выгоднее один раз
 * загрузить целиком при старте виджета, чем ждать отдельный запрос на
 * КАЖДОГО нового зрителя с градиентным ником (та самая задержка ~0.5с).
 * После предзагрузки fetch7TVPaintById() находит пейнт уже в кэше и не
 * делает сетевой запрос вообще.
 *
 * Вызывается не блокируя рендер чата (fire-and-forget из onMount) — если
 * первое сообщение с пейнтом придёт раньше, чем каталог догрузится,
 * fetch7TVPaintById() просто сходит в сеть сам, как раньше.
 */
export function preloadSevenTVPaintCatalog(): Promise<void> {
    if (!paintCatalogPreloadPromise) {
        paintCatalogPreloadPromise = (async () => {
            try {
                const res = await fetch('https://7tv.io/v3/gql', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ operationName: 'GetAllPaints', query: ALL_PAINTS_QUERY })
                });
                if (!res.ok) return;

                const json = await res.json();
                const paints = json?.data?.cosmetics?.paints || [];
                paints.forEach((paint: any) => {
                    // Не затираем то, что уже могло прийти точечным запросом раньше
                    if (paintCache.has(paint.id)) return;
                    paintCache.set(paint.id, buildPaintDetails(paint));
                });
            } catch (e) {
                console.error('[7TV] Ошибка предзагрузки каталога пейнтов:', e);
            }
        })();
    }
    return paintCatalogPreloadPromise;
}

function cssGradientFromPaint(paint: any): string | undefined {
    const stops = (paint.stops || [])
        .slice()
        .sort((a: any, b: any) => a.at - b.at)
        .map((s: any) => `${cssColorFromInt(s.color)} ${(s.at * 100).toFixed(1)}%`)
        .join(', ');
    if (!stops) return undefined;

    const repeatPrefix = paint.repeat ? 'repeating-' : '';
    if (paint.function === 'RADIAL_GRADIENT') {
        return `${repeatPrefix}radial-gradient(${paint.shape || 'ellipse'}, ${stops})`;
    }
    // LINEAR_GRADIENT — дефолт, как и договорились с cyan-chat/Chatterino7
    return `${repeatPrefix}linear-gradient(${paint.angle ?? 0}deg, ${stops})`;
}

function cssDropShadowFromPaint(shadows: any[]): string {
    return shadows
        .map((s) => `drop-shadow(${s.x_offset}px ${s.y_offset}px ${s.radius}px ${cssColorFromInt(s.color)})`)
        .join(' ');
}

function cssColorFromInt(value: number): string {
    // 7TV хранит цвет как 32-битное RGBA-число
    const r = (value >> 24) & 0xff;
    const g = (value >> 16) & 0xff;
    const b = (value >> 8) & 0xff;
    const a = (value & 0xff) / 255;
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

/**
 * Загрузка смайлов FrankerFaceZ (FFZ)
 */
export async function fetchFFZEmotes(nickname: string) {
    const emoteMap = new Map<string, string>();
    try {
        const res = await fetch(`https://api.frankerfacez.com/v1/room/${nickname.toLowerCase()}`);
        if (!res.ok) return emoteMap;

        const data = await res.json();
        if (data.sets) {
            Object.values(data.sets).forEach((set: any) => {
                set.emoticons.forEach((e: any) => {
                    const url = e.urls['2'] || e.urls['1'];
                    if (url) emoteMap.set(e.name, url.startsWith('http') ? url : `https:${url}`);
                });
            });
        }
    } catch (e) {
        console.error('[FFZ] Ошибка загрузки:', e);
    }
    return emoteMap;
}

function normalizeFFZUrl(url: string | undefined | null): string | undefined {
    if (!url) return undefined;
    return url.startsWith('http') ? url : `https:${url}`;
}

let ffzBadgeDictionaryPromise: Promise<Map<number, { url: string; name: string }>> | null = null;

// Общий на весь сайт словарь всех FFZ-бейджей (id -> картинка+имя), грузим один раз.
// Имя нужно, чтобы находить официальный бейдж "bot" по названию, а не по
// захардкоженному числовому id (у FFZ он равен 2, но искать по имени надёжнее).
async function getFFZBadgeDictionary(): Promise<Map<number, { url: string; name: string }>> {
    if (!ffzBadgeDictionaryPromise) {
        ffzBadgeDictionaryPromise = (async () => {
            const dict = new Map<number, { url: string; name: string }>();
            try {
                const res = await fetch('https://api.frankerfacez.com/v1/badges');
                if (!res.ok) return dict;
                const data = await res.json();
                (data.badges || []).forEach((b: any) => {
                    const url = normalizeFFZUrl(b.urls?.['2'] || b.urls?.['1'] || b.image);
                    if (url) dict.set(b.id, { url, name: b.name || '' });
                });
            } catch (e) {
                console.error('[FFZ] Ошибка загрузки словаря бейджей:', e);
            }
            return dict;
        })();
    }
    return ffzBadgeDictionaryPromise;
}

/**
 * Бейджи FFZ, назначенные стримером конкретным зрителям в своём канале
 * (кастомные боты и т.п.), плюс кастомный модераторский/VIP-бейдж канала.
 * Источник — https://api.frankerfacez.com/v1/room/{channel}, поле
 * `user_badge_ids` (badge_id -> [twitch-логины]).
 *
 * Среди стандартных FFZ-бейджей есть официальный "bot" (id=2, "replaces":
 * "moderator" — FFZ показывает его вместо модераторского для тех, кого
 * стример явно пометил ботом через FFZ). Это тот же самый источник данных,
 * что мы и так уже читаем ради отображения бейджей — просто дополнительно
 * достаём из него множество логинов с этим конкретным бейджем.
 */
export interface FFZBadges {
    moderatorBadgeUrl?: string;
    vipBadgeUrl?: string;
    userBadges: Map<string, string[]>;
    botUsers: Set<string>;
}

export async function fetchFFZBadges(nickname: string): Promise<FFZBadges> {
    const result: FFZBadges = { userBadges: new Map(), botUsers: new Set() };
    try {
        const [roomRes, badgeDict] = await Promise.all([
            fetch(`https://api.frankerfacez.com/v1/room/${nickname.toLowerCase()}`),
            getFFZBadgeDictionary()
        ]);
        if (!roomRes.ok) return result;
        const data = await roomRes.json();
        const room = data.room;
        if (!room) return result;

        result.moderatorBadgeUrl = normalizeFFZUrl(room.moderator_badge);
        result.vipBadgeUrl = normalizeFFZUrl(room.vip_badge?.['2'] || room.vip_badge?.['1']);

        const userBadgeIds: Record<string, string[]> = room.user_badge_ids || {};
        Object.entries(userBadgeIds).forEach(([badgeId, usernames]) => {
            const badge = badgeDict.get(Number(badgeId));
            if (!badge) return;
            usernames.forEach((login) => {
                const key = login.toLowerCase();
                const list = result.userBadges.get(key) || [];
                list.push(badge.url);
                result.userBadges.set(key, list);
                if (badge.name === 'bot') result.botUsers.add(key);
            });
        });
    } catch (e) {
        console.error('[FFZ] Ошибка загрузки бейджей канала:', e);
    }
    return result;
}

/**
 * ЛИЧНЫЙ глобальный FFZ-бейдж зрителя (Supporter/Developer/Bot и т.п.) —
 * это НЕ то же самое, что кастомные бейджи канала выше. Такой бейдж
 * привязан к самому аккаунту зрителя на FFZ, а не к конкретному каналу,
 * и отдаётся через /v1/user/{login}, а не через /v1/room/{channel}.
 * Раньше этот источник вообще не запрашивался, поэтому Supporter не
 * показывался никогда, вне зависимости от канала.
 */
const ffzPersonalBadgeCache = new Map<string, { urls: string[]; isBot: boolean }>();

export async function fetchFFZPersonalBadges(login: string): Promise<{ urls: string[]; isBot: boolean }> {
    const key = login.toLowerCase();
    if (ffzPersonalBadgeCache.has(key)) return ffzPersonalBadgeCache.get(key)!;

    try {
        const [res, dict] = await Promise.all([
            fetch(`https://api.frankerfacez.com/v1/user/${key}`),
            getFFZBadgeDictionary()
        ]);
        if (!res.ok) { const empty = { urls: [], isBot: false }; ffzPersonalBadgeCache.set(key, empty); return empty; }
        const data = await res.json();
        const badgeIds: number[] = data.user?.badges || [];
        const badges = badgeIds.map((id) => dict.get(id)).filter((b): b is { url: string; name: string } => !!b);
        const result = { urls: badges.map((b) => b.url), isBot: badges.some((b) => b.name === 'bot') };
        ffzPersonalBadgeCache.set(key, result);
        return result;
    } catch (e) {
        const empty = { urls: [], isBot: false };
        ffzPersonalBadgeCache.set(key, empty);
        return empty;
    }
}

/**
 * Верифицированные бейджи ChatterinoHomies (chatterinohomies.com) — ещё
 * один независимый источник плюшек, как 7TV/FFZ. API отдаёт только
 * `fileId` на конкретного зрителя (/api/v2/badges/{twitchId}), сама
 * картинка достаётся по тому же CDN-паттерну, что виден в примере
 * bulk-списка (`cdn.chatterinohomies.com/badges/{id}/{size}.webp`) —
 * 36.webp соответствует размеру "image2" из документации.
 */
const homiesBadgeCache = new Map<string, string | undefined>();

export async function fetchHomiesBadge(twitchId: string): Promise<string | undefined> {
    if (homiesBadgeCache.has(twitchId)) return homiesBadgeCache.get(twitchId);
    try {
        const res = await fetch(`https://chatterinohomies.com/api/v2/badges/${twitchId}`);
        if (!res.ok) { homiesBadgeCache.set(twitchId, undefined); return undefined; }
        const data = await res.json();
        const entry = data?.data?.[0];
        const url = entry?.fileId ? `https://cdn.chatterinohomies.com/badges/${entry.fileId}/36.webp` : undefined;
        homiesBadgeCache.set(twitchId, url);
        return url;
    } catch (e) {
        console.error('[Homies] Ошибка загрузки бейджа:', e);
        homiesBadgeCache.set(twitchId, undefined);
        return undefined;
    }
}
