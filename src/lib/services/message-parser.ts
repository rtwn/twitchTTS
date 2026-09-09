/**
 * Разбор текста чат-сообщения на фрагменты текст/эмоут.
 *
 * Вынесено из Chat.svelte в отдельный модуль: это чистая логика без DOM и
 * сети, раньше она была замешана в компонент как одна из многих его забот
 * (наравне с оркестрацией сетевых запросов, троттлингом рендера и т.д.),
 * что затрудняло чтение и тестирование именно этой части.
 */

import type { GifInfo } from './twitch-irc';

export type Fragment =
    | { type: 'text'; val: string; mentionColor?: string }
    | { type: 'emote'; urls: string[]; bttvTransform?: string; bttvCursed?: boolean }
    | { type: 'gif'; url: string };

export interface SevenTVEmoteEntry {
    url: string;
    zeroWidth: boolean;
}

// BetterTTV Global Effects — текстовые префиксы перед кодом эмоута
// (обязательно с пробелом после, напр. "w! Kappa"). Полный список подтверждён
// напрямую по исходникам BetterTTV (src/modules/chat/index.js): w! — wide,
// h!/v! — flip по горизонтали/вертикали, z! — zero-space, c! — cursed,
// l!/r! — rotate left/right. У реального BTTV есть ещё p!/s! (party/shake) —
// не добавлены сознательно, т.к. это уже полноценные анимации, а не просто
// transform/filter, и без референса того, как именно они выглядят у BTTV,
// легко реализовать неверно.
type BttvMod = 'wide' | 'flipH' | 'flipV' | 'zeroSpace' | 'cursed' | 'rotateLeft' | 'rotateRight';

const BTTV_MODIFIERS: Record<string, BttvMod> = {
    'w!': 'wide',
    'h!': 'flipH',
    'v!': 'flipV',
    'z!': 'zeroSpace',
    'c!': 'cursed',
    'l!': 'rotateLeft',
    'r!': 'rotateRight'
};

function bttvTransformFor(mods: Set<BttvMod>): string | undefined {
    const parts: string[] = [];
    const scaleX = (mods.has('wide') ? 1.6 : 1) * (mods.has('flipH') ? -1 : 1);
    const scaleY = mods.has('flipV') ? -1 : 1;
    if (scaleX !== 1 || scaleY !== 1) parts.push(`scale(${scaleX}, ${scaleY})`);
    if (mods.has('rotateLeft')) parts.push('rotate(-20deg)');
    if (mods.has('rotateRight')) parts.push('rotate(20deg)');
    return parts.length ? parts.join(' ') : undefined;
}

/**
 * Порядок приоритета: нативные твич-эмоуты и GIF (по индексам из тегов IRC,
 * это единственно надёжный способ, т.к. текст мог содержать похожие слова) →
 * 7TV → FFZ. Плюс упоминания (@ник / ник) подсвечиваются цветом
 * упомянутого, если он уже писал в чат.
 *
 * Zero-width 7TV эмоуты (оверлеи вроде рожек/шапок) не создают новый
 * фрагмент, а докладываются в `urls` последнего СОДЕРЖАТЕЛЬНОГО (не пустой
 * пробел) эмоут-фрагмента — так несколько оверлеев подряд корректно
 * стопкой садятся на один и тот же обычный смайл, а не рисуются рядом как
 * отдельные картинки. Пробел между двумя словами-эмоутами в тексте всегда
 * попадает в результат как отдельный текстовый фрагмент — если бы стек
 * ориентировался на самый последний фрагмент без разбора его типа, эта
 * проверка попадала бы именно на пробел, а не на смайл перед ним, и
 * стаканье не срабатывало бы вообще никогда.
 */
export function parseMessage(
    text: string,
    twitchEmotes: Record<string, string[]> | undefined,
    gifs: GifInfo[] | undefined,
    emoteMap: Map<string, SevenTVEmoteEntry>,
    channelEmoteMap: Map<string, string>,
    userColorMap: Map<string, string>
): Fragment[] {
    const nodes: { kind: 'emote' | 'gif'; val: string; start: number; end: number }[] = [];
    if (twitchEmotes) {
        Object.entries(twitchEmotes).forEach(([id, positions]) => {
            positions.forEach((range) => {
                const [start, end] = range.split('-').map(Number);
                nodes.push({
                    kind: 'emote',
                    val: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`,
                    start,
                    end
                });
            });
        });
    }
    // GIF-ссылку Twitch отдаёт уже готовой (см. GifInfo.gifUrl) — используем
    // её как есть, ничего своего не достраиваем.
    if (gifs) {
        gifs.forEach((g) => {
            nodes.push({ kind: 'gif', val: g.gifUrl, start: g.start, end: g.end });
        });
    }
    nodes.sort((a, b) => a.start - b.start);

    const result: Fragment[] = [];
    let cur = 0;
    let lastMeaningful: Fragment | null = null;

    const pushEmote = (url: string, zeroWidth: boolean, mods?: Set<BttvMod>) => {
        const transform = mods ? bttvTransformFor(mods) : undefined;
        const cursed = mods?.has('cursed') || undefined;

        if (zeroWidth && lastMeaningful && lastMeaningful.type === 'emote') {
            lastMeaningful.urls.push(url);
            // Модификаторы применяются к последнему добавленному слою стопки —
            // это осознанное упрощение: BTTV/7TV нигде не документируют, как
            // должна вести себя стопка модификатор+zero-width+обычный эмоут
            // одновременно, случай достаточно редкий, чтобы не переусложнять.
            if (transform) lastMeaningful.bttvTransform = transform;
            if (cursed) lastMeaningful.bttvCursed = cursed;
            return;
        }
        const frag: Fragment = { type: 'emote', urls: [url], bttvTransform: transform, bttvCursed: cursed };
        result.push(frag);
        lastMeaningful = frag;
    };

    const pushGif = (url: string) => {
        const frag: Fragment = { type: 'gif', url };
        result.push(frag);
        lastMeaningful = frag;
    };

    const processText = (str: string) => {
        // BetterTTV Global Effects — "w! Kappa" и т.п. Модификатор идёт
        // ОТДЕЛЬНЫМ словом перед эмоутом (с пробелом между ними, это
        // обязательное условие самого BTTV). Копим их, пока не увидим
        // следующее содержательное слово: если это известный эмоут —
        // применяем накопленные модификаторы к нему; если нет — значит
        // это был не модификатор, а обычный текст (например кто-то
        // реально написал "w! и что дальше" не имея в виду никакой
        // эмоут) — тогда возвращаем накопленные токены обратно как
        // обычные текстовые фрагменты.
        let pendingMods = new Set<BttvMod>();
        let pendingWords: string[] = [];

        const flushPendingAsText = () => {
            pendingWords.forEach((w) => {
                const frag: Fragment = { type: 'text', val: w };
                result.push(frag);
                lastMeaningful = frag;
            });
            pendingMods = new Set();
            pendingWords = [];
        };

        str.split(/(\s+)/).forEach((word) => {
            const clean = word.trim();
            if (!clean) { if (word) result.push({ type: 'text', val: word }); return; }

            const mod = BTTV_MODIFIERS[clean.toLowerCase()];
            if (mod) {
                pendingMods.add(mod);
                pendingWords.push(word);
                return;
            }

            const stv = emoteMap.get(clean);
            if (stv) {
                pushEmote(stv.url, stv.zeroWidth || pendingMods.has('zeroSpace'), pendingMods);
                pendingMods = new Set(); pendingWords = [];
                return;
            }

            const ffz = channelEmoteMap.get(clean);
            if (ffz) {
                pushEmote(ffz, pendingMods.has('zeroSpace'), pendingMods);
                pendingMods = new Set(); pendingWords = [];
                return;
            }

            // Дальше — не эмоут, значит накопленные токены модификаторов (если
            // были) на самом деле просто текст, возвращаем их как есть.
            if (pendingWords.length > 0) flushPendingAsText();

            // Упоминание: "@ник" или просто "ник", если это известный по
            // чату логин (без учёта регистра и хвостовой пунктуации вроде
            // запятой/двоеточия). Твичевые логины — это [a-zA-Z0-9_].
            const mentionMatch = /^(@?)([a-zA-Z0-9_]{2,25})([.,!?:;)]*)$/.exec(clean);
            if (mentionMatch) {
                const mentionColor = userColorMap.get(mentionMatch[2].toLowerCase());
                if (mentionColor) {
                    const frag: Fragment = { type: 'text', val: word, mentionColor };
                    result.push(frag);
                    lastMeaningful = frag;
                    return;
                }
            }

            const frag: Fragment = { type: 'text', val: word };
            result.push(frag);
            lastMeaningful = frag;
        });

        // Модификатор мог оказаться последним словом в куске текста без
        // эмоута после — тоже возвращаем его как обычный текст.
        if (pendingWords.length > 0) flushPendingAsText();
    };

    nodes.forEach((n) => {
        if (n.start > cur) processText(text.substring(cur, n.start));
        if (n.kind === 'gif') pushGif(n.val);
        else pushEmote(n.val, false);
        cur = n.end + 1;
    });
    if (cur < text.length) processText(text.substring(cur));
    return result;
}