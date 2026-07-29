/**
 * Разбор текста чат-сообщения на фрагменты текст/эмоут.
 *
 * Вынесено из Chat.svelte в отдельный модуль: это чистая логика без DOM и
 * сети, раньше она была замешана в компонент как одна из многих его забот
 * (наравне с оркестрацией сетевых запросов, троттлингом рендера и т.д.),
 * что затрудняло чтение и тестирование именно этой части.
 */

export type Fragment =
    | { type: 'text'; val: string; mentionColor?: string }
    | { type: 'emote'; urls: string[] };

export interface SevenTVEmoteEntry {
    url: string;
    zeroWidth: boolean;
}

/**
 * Порядок приоритета: нативные твич-эмоуты (по индексам из тегов IRC, это
 * единственно надёжный способ, т.к. текст мог содержать похожие слова) →
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
    emoteMap: Map<string, SevenTVEmoteEntry>,
    channelEmoteMap: Map<string, string>,
    userColorMap: Map<string, string>
): Fragment[] {
    const nodes: { type: 'emote'; val: string; start: number; end: number }[] = [];
    if (twitchEmotes) {
        Object.entries(twitchEmotes).forEach(([id, positions]) => {
            positions.forEach((range) => {
                const [start, end] = range.split('-').map(Number);
                nodes.push({
                    type: 'emote',
                    val: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`,
                    start,
                    end
                });
            });
        });
    }
    nodes.sort((a, b) => a.start - b.start);

    const result: Fragment[] = [];
    let cur = 0;
    let lastMeaningful: Fragment | null = null;

    const pushEmote = (url: string, zeroWidth: boolean) => {
        if (zeroWidth && lastMeaningful && lastMeaningful.type === 'emote') {
            lastMeaningful.urls.push(url);
            return;
        }
        const frag: Fragment = { type: 'emote', urls: [url] };
        result.push(frag);
        lastMeaningful = frag;
    };

    const processText = (str: string) => {
        str.split(/(\s+)/).forEach((word) => {
            const clean = word.trim();
            if (!clean) { if (word) result.push({ type: 'text', val: word }); return; }

            const stv = emoteMap.get(clean);
            if (stv) { pushEmote(stv.url, stv.zeroWidth); return; }

            const ffz = channelEmoteMap.get(clean);
            if (ffz) { pushEmote(ffz, false); return; }

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
    };

    nodes.forEach((n) => {
        if (n.start > cur) processText(text.substring(cur, n.start));
        pushEmote(n.val, false);
        cur = n.end + 1;
    });
    if (cur < text.length) processText(text.substring(cur));
    return result;
}
