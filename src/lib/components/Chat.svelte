<script lang="ts">
    import { onMount, onDestroy, afterUpdate } from 'svelte';
    import {
        fetch7TVEmotesByTwitchId,
        fetch7TVUserCosmetics,
        fetchFFZEmotes,
        fetchFFZBadges,
        fetchFFZPersonalBadges,
        fetchBTTVChannelBots,
        fetchHomiesBadge,
        preloadSevenTVPaintCatalog,
        resolveTwitchUser,
        clearPersonalCosmeticsCache
    } from '$lib/services/twitch-api';
    import type { ChatMessage } from '$lib/services/twitch-irc';
    import { parseMessage, type Fragment, type SevenTVEmoteEntry } from '$lib/services/message-parser';
    import { buildPreviewEmoteMaps, PREVIEW_MESSAGES } from '$lib/services/chat-preview-data';
    import { page } from '$app/state';

    export let channel: string;
    // Статус реального WebSocket-подключения к Twitch IRC — приходит из
    // widget/+page.svelte (там живёт TwitchIRC). Индикатор загрузки должен
    // висеть, пока не готовы ОБА источника: и бейджи/эмоуты канала, и сам
    // сокет чата — иначе он пропадал бы раньше, чем реально появятся
    // сообщения.
    export let ircConnected = true;

    const urlParams = page.url.searchParams;

    // Персональные плюшки (7TV-цвет/бейдж, личный FFZ-бейдж) можно выключить
    // через ?personalCosmetics=false, если не нужны доп. запросы на чатера.
    const personalCosmeticsEnabled = urlParams.get('personalCosmetics') !== 'false';
    // Через сколько сообщение исчезает само по себе (0 — не исчезает,
    // только вытесняется новыми, как раньше).
    const messageLifetimeMs = parseInt(urlParams.get('messageLifetime') || '0');

    // Независимые тумблеры отображения — сеть/расчёт всё равно идут (кроме
    // случая personalCosmeticsEnabled=false выше), эти флаги решают только,
    // показывать ли уже готовый результат.
    // Раньше был один общий showBadges на все источники разом. Теперь у
    // каждого источника бейджей — свой независимый тумблер (например,
    // можно выключить только бейджи FFZ, оставив Twitch/7TV/Homies).
    const showBadgesTwitch = urlParams.get('showBadgesTwitch') !== 'false';
    const showBadgesFFZ = urlParams.get('showBadgesFFZ') !== 'false';
    const showBadgesSevenTV = urlParams.get('showBadgesSevenTV') !== 'false';
    const showBadgesHomies = urlParams.get('showBadgesHomies') !== 'false';
    const showStvColors = urlParams.get('showStvColors') !== 'false';
    const showHighlighted = urlParams.get('showHighlighted') !== 'false';
    const showFirstTimeChatter = urlParams.get('showFirstTimeChatter') !== 'false';
    // GIF-сообщения (Twitch × Giphy). Выключено — просто не подставляем
    // картинку, текст сообщения при этом останется человекочитаемым
    // фолбэком вида "[Sesame Street GIF by Respective]" — это ровно то же
    // самое поведение, которое сам Twitch показывает клиентам без
    // поддержки GIF, так что выключение тут ничего не ломает.
    const showGifs = urlParams.get('showGifs') !== 'false';

    // Скрытие команд (!tts, !skip и т.п.) из ВИЗУАЛЬНОГО чата — сама
    // обработка команд для TTS живёт отдельно в widget/+page.svelte и тут
    // никак не затрагивается, это только про то, что видно на оверлее.
    const hideCommands = urlParams.get('hideCommands') === 'true';
    const commandPrefixes = (urlParams.get('commandPrefixes') || '!,#,=,-')
        .split(',').map((p) => p.trim()).filter(Boolean);

    // Автоопределение ботов канала — без ручного вписывания ников. Источник —
    // BetterTTV: стример сам настраивает список ботов своего канала в своём
    // дэшборде (betterttv.com/dashboard/bots), и именно на основании этого
    // BTTV рисует им иконку-робота в чате. Мы читаем тот же список, а не
    // держим свой статичный набор "самых популярных" ботов — если стример
    // не настраивал его в BTTV, список будет пустым, и это честно отражает
    // то, что сам BTTV тоже не может определить ботов такого канала.
    const hideBots = urlParams.get('hideBots') !== 'false';
    let channelBots = new Set<string>();

    // Превью-режим для страницы настроек: рендерит несколько демо-сообщений
    // без единого сетевого запроса или подключения к Twitch — используется,
    // чтобы честно показать РЕАЛЬНЫЙ компонент чата (тот же код, тот же CSS)
    // в превью настроек, а не отдельную, легко рассинхронизирующуюся копию.
    const previewMode = urlParams.get('preview') === 'true';

    let chatConfig = {
        fontSize: urlParams.get('fontSize') || '32px',
        emoteMaxHeight: urlParams.get('emoteMaxHeight') || '42px',
        fontWeight: urlParams.get('fontWeight') || '800',
        outlineSize: urlParams.get('outlineSize') || '4px',
        spacing: urlParams.get('spacing') || '8px',
        fontFamily: urlParams.get('font') || 'sans-serif'
    };

    type UIMessage = {
        id: string;
        username: string; // login, нужен для докладки бейджей после resolve
        userId: string; // из тега IRC — чтобы !refresh не резолвил ID заново через IVR
        user: string;
        color: string;
        // Настоящий твичевский (или дефолтный по хэшу ника) цвет — используется
        // для двоеточия после ника и для подсветки упоминаний этого человека
        // в чужих сообщениях. Не путать с `color` — тот может быть переопределён
        // 7TV-пейнтом specifично для отображения САМОГО ника.
        twitchColor: string;
        paintBackgroundImage?: string;
        paintDropShadow?: string;
        fragments: Fragment[];
        // Разделены специально: channelBadgeUrls ставится один раз в
        // addMessage и больше не меняется, а personalBadgeUrls полностью
        // ПЕРЕЗАПИСЫВАЕТСЯ при каждом вызове enrichWithPersonalCosmetics —
        // это и делает !refresh безопасным для повторного вызова: если бы
        // они лежали в одном массиве и просто дописывались, повторный
        // прогон (после !refresh) задваивал бы уже показанные бейджи.
        channelBadgeUrls: string[];
        personalBadgeUrls: string[];
        isHighlighted: boolean;
        isFirstMessage: boolean;
        skipAnimation: boolean;
    };

    let messages: UIMessage[] = [];
    let chatContainerEl: HTMLDivElement;
    let isLoadingData = true; // пока грузятся бейджи/эмоуты канала
    // !refresh (эмоуты/бейджи) и !reload (весь чат) — отдельные статусы,
    // показываются той же плашкой, что и статус первичной загрузки.
    let isRefreshingEmotes = false;
    let isReloadingChat = false;
    $: showLoadingStatus = !previewMode && (isLoadingData || !ircConnected || isRefreshingEmotes || isReloadingChat);
    $: statusText = !ircConnected
        ? 'Подключение к чату…'
        : isReloadingChat
            ? 'Перезагрузка чата…'
            : isRefreshingEmotes
                ? 'Обновление эмоутов и бейджей…'
                : 'Загрузка бейджей и эмоутов…';
    let emoteMap = new Map<string, SevenTVEmoteEntry>();
    let channelEmoteMap = new Map<string, string>();
    let badgeDictionary: Record<string, string> = {};
    let ffzModBadge: string | undefined;
    let ffzVipBadge: string | undefined;
    let ffzChannelUserBadges = new Map<string, string[]>();

    // Цвета зрителей, которые уже писали в чат (login -> цвет). Используется
    // для подсветки упоминаний (@ник и просто ник) их собственным цветом.
    // Обновляется по мере поступления сообщений — упоминания людей, которые
    // ещё не написали ни разу в этой сессии, подсветить нечем, это ожидаемо.
    //
    // ВАЖНО: тут всегда лежит именно твичевский (или дефолтный по хэшу ника)
    // цвет, никогда 7TV. Раньше сюда же дописывался 7TV-цвет упомянутого
    // человека — но 7TV-пейнт часто вообще не сплошной цвет, а градиент,
    // и тогда 7TV-цвета попросту нет, а карта продолжала хранить старое
    // значение (синтетический дефолтный цвет по хэшу ника, если у человека
    // не задан твичевский цвет) — снаружи это выглядело как "какой-то
    // третий, ни твичевский, ни 7tv цвет" у упоминания. Раз 7TV-пейнт всё
    // равно нельзя корректно передать одним сплошным цветом упоминания,
    // проще и предсказуемее всегда использовать твичевский/дефолтный цвет
    // и для двоеточия, и для упоминаний — тогда они всегда совпадают друг
    // с другом и с тем, что было бы у ника без всякого 7TV.
    let userColorMap = new Map<string, string>();

    // Стандартная палитра Twitch для зрителей, которые никогда не выбирали
    // себе цвет ника — тег `color` в IRC у них пустой. Раньше такие ники
    // просто становились белыми; так делают "настоящие" клиенты (сам Twitch,
    // Chatterino и т.д.) — выбирают стабильный цвет из этого набора по нику,
    // чтобы разные зрители визуально не сливались в один белый.
    const DEFAULT_NAME_COLORS = [
        '#FF0000', '#0000FF', '#00FF00', '#B22222', '#FF7F50',
        '#9ACD32', '#FF4500', '#2E8B57', '#DAA520', '#D2691E',
        '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F'
    ];

    function defaultColorForUser(username: string): string {
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
        }
        return DEFAULT_NAME_COLORS[hash % DEFAULT_NAME_COLORS.length];
    }

    function handleImageError(event: Event) {
        const img = event.currentTarget as HTMLImageElement;
        if (img) img.style.display = 'none';
    }

    async function loadBadges(broadcasterId: string) {
        try {
            const res = await fetch(`/api/v1/badges?broadcasterId=${broadcasterId}`);
            if (!res.ok) return;
            const data = await res.json();
            badgeDictionary = data.badges || {};
        } catch (e) {
            console.error('Не удалось загрузить бейджи Twitch:', e);
        }
    }

    async function loadChannelExtras(twitchId: string, login: string) {
        const [ffzEmotes, stv, ffzBadges, bttvBots] = await Promise.all([
            fetchFFZEmotes(login).catch(() => new Map<string, string>()),
            fetch7TVEmotesByTwitchId(twitchId).catch(() => new Map()),
            fetchFFZBadges(login).catch(() => ({ userBadges: new Map(), botUsers: new Set() } as import('$lib/services/twitch-api').FFZBadges)),
            fetchBTTVChannelBots(twitchId).catch(() => [] as string[])
        ]);
        channelEmoteMap = ffzEmotes;
        emoteMap = stv;
        ffzModBadge = ffzBadges.moderatorBadgeUrl;
        ffzVipBadge = ffzBadges.vipBadgeUrl;
        ffzChannelUserBadges = ffzBadges.userBadges;
        // Три независимых источника "это бот": свой канальный бейдж FFZ
        // (bot, id=2 — стример явно назначает через FFZ), список ботов
        // канала из BTTV (стример настраивает в betterttv.com/dashboard/
        // bots) и официальный Twitch Chat Bot badge (проверяется прямо в
        // addMessage по тегу badges — тем ботам, что уже перешли на новый
        // Send Chat Message API, отдельный запрос не нужен).
        channelBots = new Set([...bttvBots, ...ffzBadges.botUsers]);
    }

    /**
     * Разбирает текст сообщения на фрагменты текст/эмоут — сама логика
     * теперь в $lib/services/message-parser.ts (чистая функция без
     * привязки к DOM/сети, легко тестируется в изоляции), здесь только
     * прокидываем актуальное состояние компонента.
     */
    function parseMessageForChat(text: string, twitchEmotes: Record<string, string[]> | undefined, gifs: import('$lib/services/twitch-irc').GifInfo[] | undefined): Fragment[] {
        return parseMessage(text, twitchEmotes, showGifs ? gifs : undefined, emoteMap, channelEmoteMap, userColorMap);
    }

    function badgeUrlFor(name: string, version: string): string {
        return badgeDictionary[`${name}:${version}`] || `https://static-cdn.jtvnw.net/badges/v1/${name}/${version}/2`;
    }

    /**
     * Обводка для градиентных 7TV-ников. Обычный text-shadow здесь не
     * подходит (см. комментарий у .username-paint в блоке стилей ниже) —
     * используем filter: drop-shadow, который корректно обтекает
     * прозрачную заливку. Собирается в JS, а не в CSS, потому что filter
     * в inline-style полностью замещает filter из класса, а не складывается
     * с ним — если бы обводка жила в классе, а тень пейнта в inline-style,
     * тень пейнта просто стёрла бы обводку.
     */
    function usernameOutlineFilter(paintDropShadow: string | undefined): string {
        const outline = 'drop-shadow(1px 1px 1.5px rgba(0,0,0,1)) drop-shadow(0 0 2px rgba(0,0,0,1))';
        return paintDropShadow ? `${outline} ${paintDropShadow}` : outline;
    }

    /**
     * Кастомные бейджи FFZ, назначенные стримером конкретным зрителям своего
     * канала (боты и т.п.), плюс кастомный мод/VIP-бейдж канала.
     */
    function collectFFZChannelBadges(msg: ChatMessage): string[] {
        if (!showBadgesFFZ) return [];
        const urls: string[] = [];
        if (msg.isMod && ffzModBadge) urls.push(ffzModBadge);
        if (msg.isVip && ffzVipBadge) urls.push(ffzVipBadge);
        const personal = ffzChannelUserBadges.get(msg.username);
        if (personal) urls.push(...personal);
        return urls;
    }

    /**
     * При очень активном чате анимация появления каждой отдельной строки
     * (transform+opacity на каждое сообщение) — это лишняя работа для
     * браузера/GPU ровно тогда, когда сообщений и так больше всего.
     * Простой счётчик "сколько сообщений за последнюю секунду" — если
     * порог превышен, новые сообщения появляются без анимации, пока поток
     * не успокоится.
     */
    let recentMessageTimestamps: number[] = [];
    const HIGH_FREQUENCY_THRESHOLD = 8; // сообщений в секунду

    function isChatCurrentlyBusy(): boolean {
        const now = Date.now();
        recentMessageTimestamps.push(now);
        recentMessageTimestamps = recentMessageTimestamps.filter((t) => now - t < 1000);
        return recentMessageTimestamps.length > HIGH_FREQUENCY_THRESHOLD;
    }

    export function addMessage(msg: ChatMessage) {
        if (messages.some((m) => m.id === msg.id)) return;
        // Официальный Twitch "Chat Bot" badge (появился в 2025, set_id
        // "bot-badge") — приходит прямо в теге badges вместе со всеми
        // остальными, отдельный запрос не нужен. Пока что его получают
        // только боты, перешедшие на новый Send Chat Message API — большая
        // часть старых популярных ботов (Nightbot и т.п.) им ещё не
        // помечена, поэтому это дополняет, а не заменяет BTTV/FFZ-списки.
        const isNativeBot = msg.badges.some((b) => b.name === 'bot-badge');
        if (hideBots && (isNativeBot || channelBots.has(msg.username))) return;
        if (hideCommands && commandPrefixes.some((p) => msg.text.startsWith(p))) return;

        const twitchColor = msg.color || defaultColorForUser(msg.username);
        userColorMap.set(msg.username, twitchColor);
        // Отдельная переменная, а не вызов прямо внутри литерала ниже —
        // isChatCurrentlyBusy() мутирует recentMessageTimestamps, и такой
        // побочный эффект легко потерять из виду среди полей объекта.
        const skipAnimation = isChatCurrentlyBusy();

        const uiMsg: UIMessage = {
            id: msg.id,
            username: msg.username,
            userId: msg.userId,
            user: msg.displayName,
            color: twitchColor,
            twitchColor,
            fragments: parseMessageForChat(msg.text, msg.emotes, msg.gifs),
            channelBadgeUrls: [
                ...(showBadgesTwitch ? msg.badges.map((b) => badgeUrlFor(b.name, b.version)) : []),
                ...collectFFZChannelBadges(msg)
            ],
            personalBadgeUrls: [],
            isHighlighted: msg.isHighlighted,
            isFirstMessage: msg.isFirstMessage,
            skipAnimation
        };

        // Жёсткий потолок — просто страховка на патологический случай (очень
        // высокий канвас + мелкий шрифт + очень частый чат). В обычной
        // работе старые сообщения убирает pruneOffscreenMessages() ниже —
        // по факту ухода за пределы видимой области, а не по фиксированному
        // числу.
        messages = [...messages, uiMsg].slice(-150);

        if (messageLifetimeMs > 0) {
            setTimeout(() => { messages = messages.filter((m) => m.id !== uiMsg.id); }, messageLifetimeMs);
        }

        if (personalCosmeticsEnabled && !previewMode) void enrichWithPersonalCosmetics(msg.username, msg.userId, uiMsg.id);
    }

    /**
     * Личные плюшки зрителя, не завязанные на конкретный канал:
     * цвет/бейдж 7TV и персональный (не канальный) бейдж FFZ вроде Supporter.
     * Резолвятся асинхронно и докладываются в уже отрисованное сообщение,
     * т.к. ждать их перед показом сообщения не хочется — это лишняя задержка
     * в живом чате.
     *
     * userId уже приходит прямо в теге IRC-сообщения (user-id) — раньше тут
     * был отдельный поход в api.ivr.fi, чтобы узнать тот же самый ID по
     * логину. Один из двух round-trip'ов, из-за которых была задержка
     * ~0.5с на каждого НОВОГО зрителя, теперь просто не нужен.
     */
    async function enrichWithPersonalCosmetics(username: string, userId: string, msgId: string) {
        try {
            const resolvedId = userId || (await resolveTwitchUser(username))?.id;

            const [stvCosmetics, ffzPersonal, homiesBadge] = await Promise.all([
                resolvedId ? fetch7TVUserCosmetics(resolvedId) : Promise.resolve(null),
                fetchFFZPersonalBadges(username).catch(() => ({ urls: [], isBot: false })),
                (resolvedId && showBadgesHomies) ? fetchHomiesBadge(resolvedId).catch(() => undefined) : Promise.resolve(undefined)
            ]);

            // Личный (не канальный) FFZ-бейдж bot узнаётся только сейчас,
            // асинхронно — раньше момента показа сообщения это никак не
            // проверить. Раз пользователь всё-таки оказался ботом, а
            // скрытие ботов включено — просто убираем уже отрисованное
            // сообщение, а не оставляем его висеть с чужим бейджем.
            if (hideBots && ffzPersonal.isBot) {
                messages = messages.filter((m) => m.id !== msgId);
                return;
            }

            const finalColor = showStvColors ? stvCosmetics?.paintColor : undefined;
            const personalBadgeUrls = [
                ...(showBadgesSevenTV && stvCosmetics?.badgeUrl ? [stvCosmetics.badgeUrl] : []),
                ...(showBadgesFFZ ? ffzPersonal.urls : []),
                ...(showBadgesHomies && homiesBadge ? [homiesBadge] : [])
            ];

            // Раньше тут был ранний return, если у зрителя не нашлось вообще
            // ничего персонального — но эта функция теперь может вызываться
            // ПОВТОРНО для уже отрисованного сообщения (см. !refresh), а
            // значит должна уметь и СНЯТЬ то, что было раньше, если зритель,
            // скажем, убрал себе цвет/бейдж на 7TV. Раньше здесь ещё был
            // `finalColor || m.color` — это тоже задваивало старое значение
            // навечно, если после обновления цвета не стало: используем
            // честный twitchColor как базу, а не то, что могло остаться от
            // предыдущего прогона.
            messages = messages.map((m) => {
                if (m.id !== msgId) return m;
                return {
                    ...m,
                    color: finalColor || m.twitchColor,
                    paintBackgroundImage: showStvColors ? stvCosmetics?.paintBackgroundImage : undefined,
                    paintDropShadow: showStvColors ? stvCosmetics?.paintDropShadow : undefined,
                    personalBadgeUrls
                };
            });
        } catch { /* косметика необязательна, тихо игнорируем */ }
    }

    export function clearUser(username: string) {
        messages = messages.filter((m) => m.username.toLowerCase() !== username.toLowerCase());
    }

    /** CLEARMSG — модератор удалил одно конкретное сообщение по id (не таймаут/бан всего пользователя). */
    export function clearMessage(id: string) {
        messages = messages.filter((m) => m.id !== id);
    }

    export function clearAllMessages() {
        messages = [];
    }

    /**
     * Оверлей растёт снизу вверх (.chat-wrapper прибит к bottom), новый
     * контейнер не имеет фиксированной высоты — со временем старые
     * сообщения уходят выше верхней границы окна/канваса OBS и становятся
     * невидимыми, но их DOM-узлы (с картинками эмоутов/бейджей) никуда не
     * деваются и продолжают висеть в памяти и участвовать в layout/paint.
     * При долгой сессии в активном чате это накапливается.
     *
     * Раз в кадр проверяем самые старые строки по порядку сверху вниз —
     * как только находим первую, чей нижний край всё ещё виден (bottom > 0),
     * дальше можно не проверять: сообщения идут по порядку сверху вниз,
     * значит всё, что дальше, тем более видно.
     *
     * Важный момент про OBS: Browser Source рендерится в размере, который
     * задан в его НАСТРОЙКАХ (ширина/высота источника), а не в размере,
     * который получается после обрезки (crop) самого элемента источника на
     * сцене — обрезка происходит уже ПОСЛЕ рендера, как отдельная операция
     * компоновки сцены, и странице/JS о ней ничего не известно. Обрезка
     * может только показать МЕНЬШЕ, чем есть в самом рендере, но никогда
     * больше — то есть если сообщение невидимо в полном рендере (за
     * пределами window.innerHeight), оно гарантированно невидимо и после
     * любой обрезки в OBS. Поэтому эта проверка безопасна независимо от
     * того, как именно стример обрезал источник в сцене.
     */
    let pruneScheduled = false;

    function pruneOffscreenMessages() {
        if (!chatContainerEl || messages.length < 10) return;
        const rows = chatContainerEl.querySelectorAll<HTMLElement>('.message-row');
        let cutCount = 0;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].getBoundingClientRect().bottom <= 0) cutCount = i + 1;
            else break;
        }
        if (cutCount > 0) messages = messages.slice(cutCount);
    }

    afterUpdate(() => {
        if (previewMode || pruneScheduled) return;
        pruneScheduled = true;
        requestAnimationFrame(() => {
            pruneScheduled = false;
            pruneOffscreenMessages();
        });
    });

    // Если стример прямо во время стрима поменяет размер Browser Source в
    // OBS, актуализировать список "что уже за пределами экрана" стоит сразу,
    // а не дожидаться следующего сообщения в чате (следующего afterUpdate).
    function handleWindowResize() {
        if (pruneScheduled) return;
        pruneScheduled = true;
        requestAnimationFrame(() => {
            pruneScheduled = false;
            pruneOffscreenMessages();
        });
    }

    onDestroy(() => {
        if (typeof window !== 'undefined') window.removeEventListener('resize', handleWindowResize);
    });

    /** Несколько демо-сообщений для превью настроек — см. `previewMode` выше. */
    function loadPreviewMessages() {
        const { emoteMap: previewEmotes, channelEmoteMap: previewFfzEmotes } = buildPreviewEmoteMaps();
        emoteMap = previewEmotes;
        channelEmoteMap = previewFfzEmotes;

        let i = 0;
        const feed = () => {
            if (i >= PREVIEW_MESSAGES.length) return;
            addMessage(PREVIEW_MESSAGES[i]);
            i++;
            setTimeout(feed, 500);
        };
        feed();
    }

    let resolvedChannelUser: { id: string; login: string } | null = null;

    onMount(async () => {
        if (previewMode) {
            isLoadingData = false;
            loadPreviewMessages();
            return;
        }

        window.addEventListener('resize', handleWindowResize);

        // Не блокирует остальной onMount и рендер — просто прогревает кэш
        // пейнтов к моменту, когда придёт первое сообщение с градиентом.
        preloadSevenTVPaintCatalog();

        try {
            const user = await resolveTwitchUser(channel);
            if (!user) return;
            resolvedChannelUser = user;
            await Promise.all([
                loadBadges(user.id),
                loadChannelExtras(user.id, user.login)
            ]);
        } catch (e) {
            console.error('Chat mount error:', e);
        } finally {
            // Снимаем индикатор в любом случае — даже если часть запросов
            // не удалась, зависший навсегда статус "Загрузка..." хуже, чем
            // чат без пары бейджей/эмоутов.
            isLoadingData = false;
        }
    });

    /**
     * !refresh — перезагружает бейджи/эмоуты канала (FFZ/7TV/BTTV/Homies-
     * словарь) И персональные плюшки зрителей (7TV-цвет/бейдж, личный FFZ-
     * бейдж, Homies-бейдж) уже показанных сообщений — не трогая саму
     * историю сообщений и не разрывая IRC-соединение.
     *
     * Раньше сбрасывались только канальные данные — персональные кэши
     * конкретных зрителей (модуль twitch-api.ts) продолжали жить до
     * перезагрузки страницы, поэтому если зритель обновил себе бейдж/цвет
     * на 7TV прямо во время стрима, !refresh это никак не подхватывал и
     * помогал только F5.
     */
    export async function refreshEmotes() {
        if (!resolvedChannelUser || previewMode) return;
        isRefreshingEmotes = true;
        try {
            clearPersonalCosmeticsCache();
            await Promise.all([
                loadBadges(resolvedChannelUser.id),
                loadChannelExtras(resolvedChannelUser.id, resolvedChannelUser.login)
            ]);
            if (personalCosmeticsEnabled) {
                // Снимок ID сообщений на момент вызова — если за время
                // запросов список успел обновиться, лишнее просто отфильтруется
                // проверкой m.id !== msgId внутри enrichWithPersonalCosmetics.
                messages.forEach((m) => void enrichWithPersonalCosmetics(m.username, m.userId, m.id));
            }
        } finally {
            isRefreshingEmotes = false;
        }
    }

    /**
     * !reload — то же самое, что !refresh, плюс полностью очищает историю
     * сообщений оверлея (переподключение самого IRC-сокета делает
     * widget/+page.svelte, т.к. сам сокет живёт там, а не в Chat.svelte).
     * Персональные кэши тоже сбрасываются — будущие сообщения после
     * перезагрузки получат свежие 7TV/FFZ/Homies-плюшки, а не то, что
     * было закэшировано до вызова.
     */
    export async function reloadChat() {
        if (!resolvedChannelUser || previewMode) return;
        isReloadingChat = true;
        messages = [];
        try {
            clearPersonalCosmeticsCache();
            await Promise.all([
                loadBadges(resolvedChannelUser.id),
                loadChannelExtras(resolvedChannelUser.id, resolvedChannelUser.login)
            ]);
        } finally {
            isReloadingChat = false;
        }
    }
</script>

<div class="chat-wrapper"
     style="
      --chat-fs: {chatConfig.fontSize};
      --chat-es: {chatConfig.emoteMaxHeight};
      --chat-fw: {chatConfig.fontWeight};
      --chat-os: {chatConfig.outlineSize};
      --chat-sp: {chatConfig.spacing};
      --chat-font: '{chatConfig.fontFamily}';
     ">
    {#if showLoadingStatus}
        <div class="chat-status">{statusText}</div>
    {/if}
    <div class="chat-container" bind:this={chatContainerEl}>
        {#each messages as m (m.id)}
            <div class="message-row"
                 class:highlighted={showHighlighted && m.isHighlighted}
                 class:first-time={showFirstTimeChatter && m.isFirstMessage && !(showHighlighted && m.isHighlighted)}
                 class:no-anim={m.skipAnimation}
            >
                {#if m.channelBadgeUrls.length > 0 || m.personalBadgeUrls.length > 0}
                    <span class="badges">
                        {#each [...m.channelBadgeUrls, ...m.personalBadgeUrls] as url}
                            <img src={url} class="badge" on:error={handleImageError} loading="lazy" alt="" />
                        {/each}
                    </span>
                {/if}

                {#if showStvColors && m.paintBackgroundImage}
                    <span
                        class="username username-paint"
                        style="background-image: {m.paintBackgroundImage}; filter: {usernameOutlineFilter(m.paintDropShadow)}"
                    >{m.user}</span>
                {:else}
                    <span class="username" style="color: {m.color}">{m.user}</span>
                {/if}
                <span class="colon" style="color: {m.twitchColor}">:</span>

                {#each m.fragments as f}
                    {#if f.type === 'text'}
                        {#if f.mentionColor}
                            <span class="chat-text mention" style="color: {f.mentionColor}">{f.val}</span>
                        {:else}
                            <span class="chat-text">{f.val}</span>
                        {/if}
                    {:else if f.type === 'gif'}
                        <img src={f.url} class="chat-gif" on:error={handleImageError} loading="lazy" alt="GIF" />
                    {:else if f.urls.length > 1}
                        <span class="emote-stack">
                            {#each f.urls as url}
                                <img src={url} class="emote" on:error={handleImageError} loading="lazy" alt="" />
                            {/each}
                        </span>
                    {:else}
                        <img src={f.urls[0]} class="emote" on:error={handleImageError} loading="lazy" alt="" />
                    {/if}
                {/each}
            </div>
        {/each}
    </div>
</div>

<style>
    .chat-wrapper {
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        pointer-events: none;
        font-family: var(--chat-font), sans-serif;
    }

    .message-row {
        margin-bottom: var(--chat-sp);
        animation: slideIn 0.3s ease-out forwards;
        line-height: 1.2;
        display: block;
        word-wrap: break-word;
        overflow-wrap: break-word;
        border-radius: 6px;
        padding: 2px 6px;
    }

    .message-row.highlighted {
        background: rgba(145, 71, 255, 0.28);
        border-left: 4px solid #9147ff;
    }

    .message-row.first-time {
        background: rgba(160, 41, 160, 0.4);
        border-left: 4px solid #ff75e6 !important;
    }

    /* При активном чате (см. isChatCurrentlyBusy в скрипте) новые сообщения
       появляются без transform/opacity-анимации — меньше лишней работы для
       layout/GPU ровно тогда, когда сообщений и так больше всего. */
    .message-row.no-anim {
        animation: none;
    }

    .chat-status {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10;
        display: inline-block;
        white-space: nowrap;
        color: #f5f5f5;
        background: rgba(0, 0, 0, 0.65);
        font-size: 22px;
        font-weight: 600;
        padding: 12px 24px;
        border-radius: 10px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    }

    .username, .chat-text, .colon {
        font-size: var(--chat-fs);
        font-weight: var(--chat-fw);
        color: white;
        vertical-align: middle;
        text-shadow:
                calc(var(--chat-os) / 4) calc(var(--chat-os) / 4) var(--chat-os) rgba(0,0,0,1),
                0px 0px calc(var(--chat-os) * 1.2) rgba(0,0,0,1);
    }

    .username {
        font-weight: 800;
    }

    /* Двоеточие после ника всегда обычного цвета — раньше было внутри
       того же <span>, что и ник, и красилось в его цвет/градиент вместе
       с ним. Теперь это отдельный элемент вне цветного span. */
    .colon {
        margin-right: 4px;
    }

    .username-paint {
        background-clip: text;
        -webkit-background-clip: text;
        background-size: cover;
        background-repeat: no-repeat;
        color: transparent;
        -webkit-text-fill-color: transparent;
        /*
         * text-shadow рисует чёрную копию формы глифа позади текста — она
         * не знает, что заливка текста прозрачная, и это чёрное пятно
         * почти полностью перекрывает градиент изнутри буквы (это и было
         * на скриншоте: ник залит чёрным, градиент виден только по краям).
         * filter: drop-shadow() строит тень по итоговым видимым пикселям
         * элемента, поэтому корректно обводит именно градиент. Обводка
         * задаётся через filter в template (usernameOutlineFilter), тут
         * её дублировать не нужно.
         */
        text-shadow: none;
    }

    .chat-text {
        white-space: pre-wrap;
    }

    .mention {
        font-weight: 800;
    }

    .badges {
        display: inline;
    }

    .badge {
        height: var(--chat-fs);
        width: auto;
        margin-right: 4px;
        vertical-align: middle;
        filter: drop-shadow(1px 1px 1px black);
    }

    .emote {
        max-height: var(--chat-es) !important;
        height: auto !important;
        width: auto !important;
        vertical-align: middle;
        margin: 0 2px;
        filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));
    }

    /*
     * Стопка нескольких картинок в одной "ячейке" (обычный смайл + один
     * или несколько zero-width оверлеев 7TV поверх него). grid укладывает
     * все img в одну и ту же область (grid-area: 1/1), поэтому они рисуются
     * друг на друге, а не рядом.
     *
     * Базовый смайл и оверлей почти никогда не совпадают по естественным
     * пропорциям (ширина у них разная даже при одинаковой var(--chat-es)
     * высоте) — ячейка грида подстраивается под САМУЮ большую картинку, а
     * без явного центрирования браузер прижимает более мелкие картинки к
     * левому/верхнему краю этой ячейки, а не к её середине. justify-items/
     * align-items: center здесь чинят именно это — все картинки в стопке
     * центрируются относительно самой большой, будь то оверлей или обычный
     * смайл.
     */
    .emote-stack {
        position: relative;
        display: inline-grid;
        justify-items: center;
        align-items: center;
        vertical-align: middle;
        margin: 0 2px;
    }

    .emote-stack .emote {
        grid-area: 1 / 1;
        justify-self: center;
        align-self: center;
        margin: 0;
    }

    /*
     * GIF-сообщения (Twitch + Giphy, тег `gifs` в PRIVMSG) заметно крупнее
     * обычного смайла — это отдельный вид контента ("стикер"), а не мелкая
     * инлайновая иконка вплетённая в текст. display:block переносит его на
     * свою строку — GIF-сообщение и так всегда занимает собой всё сообщение
     * целиком (сам текст — это просто человекочитаемый фолбэк вида "[Sesame
     * Street GIF by Respective]" для старых клиентов, не показываем его,
     * т.к. вместо него теперь есть настоящая картинка).
     */
    .chat-gif {
        display: inline-block;
        max-height: clamp(120px, calc(var(--chat-es) * 2.5), 220px);
        width: auto;
        margin: 4px 0;
        align-self: flex-end;
        border-radius: 6px;
        filter: drop-shadow(1px 1px 3px rgba(0,0,0,0.6));
    }

    @keyframes slideIn {
        from { opacity: 0; transform: translateX(-10px); }
        to { opacity: 1; transform: translateX(0); }
    }
</style>