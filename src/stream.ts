import {
    type ApiMethods,
    type Context,
    type Message,
    type MessageEntity,
    type MiddlewareFn,
    type RawApi,
} from "./deps.deno.ts";

/**
 * A draft piece is an object that describes a chunk of a message draft. It can
 * be either a plain string, or an object holding text and entities.
 *
 * Optionally, a draft identifier can be included. It determines the draft that
 * this piece will be a part of of. In most cases, this option can be skipped in
 * order to let the plugin pick the draft identifiers automatically.
 */
export type MessageDraftPiece =
    | string
    | {
        /** An optional draft identifier for this chunk */
        draft_id?: number;
        /** The actual text of the chunk */
        text: string;
        /** An optional set of entities for the text */
        entities?: MessageEntity[];
    };

/** Context flavor that is needed to install the stream plugin. */
export type StreamFlavor<C extends Context> = C & StreamContextExtension;

/**
 * Container for things by which the context type is augmented. This interface
 * should likely never be used directly. Instead, take a look at the
 * corresponding context flavor called {@link StreamFlavor}.
 */
export interface StreamContextExtension {
    api: {
        /**
         * Use this method to stream an iterator of message pieces to a private
         * chat. This is a convenience method built on top of `sendMessage` and
         * `sendMessageDraft`. Returns an array of sent message objects.
         *
         * The message pieces of the `Iterable` or `AsyncIterable` can either be
         * simple strings or objects with text and an array of entities (as
         * defined by {@link MessageDraftPiece}). Note that all entities should
         * have offsets relative to the start of the entire data stream (not
         * relative to the chunk/draft they are contained in).
         *
         * This method automatically sends several drafts if the data is too
         * long. More specifically, if the data exceeds 4096 characters, the
         * first chunk that crosses this threshold will receive an incremented
         * `draft_id` value. An offset that gets added to all draft identifiers
         * can be set via the parameter `draft_id_offset`. Note that individual
         * chunks are never split up, so they must each be at most 4096
         * characters long.
         *
         * Each draft is sent as a separate message as soon as the draft is
         * complete. For instance, the following sequence of API calls will be
         * observed for six chunks of text with 1000 characters each:
         *
         * 1. `sendMessageDraft`
         * 2. `sendMessageDraft`
         * 3. `sendMessageDraft`
         * 4. `sendMessageDraft`
         * 5. `sendMessage`
         * 6. `sendMessageDraft`
         * 7. `sendMessageDraft`
         * 8. `sendMessage`
         *
         * If you need more control over which draft identifiers are used (and
         * by extension, how messages get split up), you can include custom
         * `draft_id` values in the objects of the data stream. These values are
         * always going to be used as-is, and messages will never be split
         * between two chunks if they both have the same draft identifier. If
         * you want to start a new draft/message, you only need to yield a new
         * draft identifier once. All subsequent chunks will automatically
         * obtain the same identifier (until the message length limit is hit
         * which increments the value, or until a new draft identifier is
         * specified by the data stream).
         *
         * This method consumes the given iterator as fast as possible and
         * updates the message draft as often as possible. If reading the next
         * chunk of data is faster than the message draft can be updated, then
         * some calls to `sendMessageDraft` are skipped. This integrates well
         * with [the auto-retry plugin](https://grammy.dev/plugins/auto-retry)
         * which converts rate limits into slower API calls. Make sure to
         * install it before installing this plugin. In contrast, `sendMessage`
         * calls are never skipped, so no data is lost in the process.
         *
         * @param chat_id Unique identifier for the target private chat
         * @param draft_id_offset Unique identifier of the first message draft
         * @param stream An iterator of message pieces with optional draft identifiers
         * @param otherMessageDraft Optional remaining parameters for `sendMessageDraft` calls
         * @param otherMessage Optional remaining parameters for `sendMessage` calls
         * @param signal Optional `AbortSignal` to cancel the request
         */
        streamMessage(
            chat_id: number,
            draft_id_offset: number,
            stream:
                | Iterable<MessageDraftPiece>
                | AsyncIterable<MessageDraftPiece>,
            otherMessageDraft?: Omit<
                Parameters<ApiMethods["sendMessageDraft"]>[0],
                "chat_id" | "draft_id" | "text"
            >,
            otherMessage?: Omit<
                Parameters<ApiMethods["sendMessage"]>[0],
                "chat_id" | "text"
            >,
            signal?: AbortSignal,
        ): Promise<Message.TextMessage[]>;
        /**
         * Use this method to stream an iterator of rich markdown message pieces
         * to a private chat. Returns a rich message object.
         *
         * This is a convenience method built on top of `sendRichMessage` and
         * `sendRichMessageDraft`. The former method is called once given
         * iterator completes, and the latter method is called many times while
         * consuming the iterator and accumulating the strings.
         *
         * This method consumes the given iterator as fast as possible and
         * updates the message draft as often as possible. If reading the next
         * chunk of data is faster than the message draft can be updated, then
         * some calls to `sendRichMessageDraft` are skipped. This integrates
         * well with [the auto-retry
         * plugin](https://grammy.dev/plugins/auto-retry) which converts rate
         * limits into slower API calls. Make sure to install it before
         * installing this plugin.
         *
         * @param chat_id Unique identifier for the target private chat
         * @param draft_id Unique identifier of the message draft
         * @param stream An iterator of message pieces with optional draft identifiers
         * @param otherRichMessageDraft Optional remaining parameters for `sendRichMessageDraft` calls
         * @param otherRichMessage Optional remaining parameters for `sendRichMessage` calls
         * @param baseInputRichMessage Optional remaining fields of `rich_message` in all API calls
         * @param signal Optional `AbortSignal` to cancel the request
         */
        streamMarkdown(
            chat_id: number,
            draft_id: number,
            stream:
                | Iterable<string>
                | AsyncIterable<string>,
            otherRichMessageDraft?: Omit<
                Parameters<ApiMethods["sendRichMessageDraft"]>[0],
                "chat_id" | "draft_id" | "rich_message"
            >,
            otherRichMessage?: Omit<
                Parameters<ApiMethods["sendRichMessage"]>[0],
                "chat_id" | "rich_message"
            >,
            baseInputRichMessage?: Omit<InputRichMessage, "markdown" | "html">,
            signal?: AbortSignal,
        ): Promise<Message.RichMessage>;
        /**
         * Use this method to stream an iterator of rich markdown message pieces
         * to a private chat. Returns a rich message object.
         *
         * This is a convenience method built on top of `sendRichMessage` and
         * `sendRichMessageDraft`. The former method is called once given
         * iterator completes, and the latter method is called many times while
         * consuming the iterator and accumulating the strings.
         *
         * This method consumes the given iterator as fast as possible and
         * updates the message draft as often as possible. If reading the next
         * chunk of data is faster than the message draft can be updated, then
         * some calls to `sendRichMessageDraft` are skipped. This integrates
         * well with [the auto-retry
         * plugin](https://grammy.dev/plugins/auto-retry) which converts rate
         * limits into slower API calls. Make sure to install it before
         * installing this plugin.
         *
         * @param chat_id Unique identifier for the target private chat
         * @param draft_id Unique identifier of the message draft
         * @param stream An iterator of message pieces with optional draft identifiers
         * @param otherRichMessageDraft Optional remaining parameters for `sendRichMessageDraft` calls
         * @param otherRichMessage Optional remaining parameters for `sendRichMessage` calls
         * @param baseInputRichMessage Optional remaining fields of `rich_message` in all API calls
         * @param signal Optional `AbortSignal` to cancel the request
         */
        streamHtml(
            chat_id: number,
            draft_id: number,
            stream:
                | Iterable<string>
                | AsyncIterable<string>,
            otherRichMessageDraft?: Omit<
                Parameters<ApiMethods["sendRichMessageDraft"]>[0],
                "chat_id" | "draft_id" | "rich_message"
            >,
            otherRichMessage?: Omit<
                Parameters<ApiMethods["sendRichMessage"]>[0],
                "chat_id" | "rich_message"
            >,
            baseInputRichMessage?: Omit<InputRichMessage, "markdown" | "html">,
            signal?: AbortSignal,
        ): Promise<Message.RichMessage>;
    };
    /**
     * Use this method to stream an iterator of message pieces to the current
     * private chat. This is a convenience method built on top of `sendMessage`
     * and `sendMessageDraft`. Returns an array of sent message objects.
     *
     * The message pieces of the `Iterable` or `AsyncIterable` can either be
     * simple strings or objects with text and an array of entities (as defined
     * by {@link MessageDraftPiece}). Note that all entities should have offsets
     * relative to the start of the entire data stream (not relative to the
     * chunk/draft they are contained in).
     *
     * This method automatically sends several drafts if the data is too long.
     * More specifically, if the data exceeds 4096 characters, the first chunk
     * that crosses this threshold will receive an incremented `draft_id` value.
     * Note that individual chunks are never split up, so they must each be at
     * most 4096 characters long.
     *
     * An offset that gets added to each draft identifier is determined by the
     * current `update_id`. More specifically, this offset is `update_id << 8`,
     * leaving 256 message parts or about 1 MB of ASCII characters before draft
     * identifiers begin to clash. However, if you want to call this method
     * several times from the same handler and/or middleware pass, then you
     * should make sure that both calls happen sequentially. Otherwise, clashes
     * between draft identifiers can happen across the concurrent calls.
     * Alternatively, you can adjust the way the draft identifier offset is
     * picked by setting {@link StreamOptions.defaultDraftIdOffset} in the
     * plugin options.
     *
     * Each draft is sent as a separate message as soon as the draft is
     * complete. For instance, the following sequence of API calls will be
     * observed for six chunks of text with 1000 characters each:
     *
     * 1. `sendMessageDraft`
     * 2. `sendMessageDraft`
     * 3. `sendMessageDraft`
     * 4. `sendMessageDraft`
     * 5. `sendMessage`
     * 6. `sendMessageDraft`
     * 7. `sendMessageDraft`
     * 8. `sendMessage`
     *
     * If you need more control over which draft identifiers are used (and by
     * extension, how messages get split up), you can include custom `draft_id`
     * values in the objects of the data stream. These values are always going
     * to be used as-is, and messages will never be split between two chunks if
     * they both have the same draft identifier. If you want to start a new
     * draft/message, you only need to yield a new draft identifier once. All
     * subsequent chunks will automatically obtain the same identifier (until
     * the message length limit is hit which increments the value, or until a
     * new draft identifier is specified by the data stream).
     *
     * This method consumes the given iterator as fast as possible and updates
     * the message draft as often as possible. If reading the next chunk of data
     * is faster than the message draft can be updated, then some calls to
     * `sendMessageDraft` are skipped. This integrates well with [the auto-retry
     * plugin](https://grammy.dev/plugins/auto-retry) which converts rate limits
     * into slower API calls. Make sure to install it before installing this
     * plugin. In contrast, `sendMessage` calls are never skipped, so no data is
     * lost in the process.
     *
     * @param stream An iterable of string chunks that make up the total message
     * @param otherMessageDraft Optional remaining parameters for `sendMessageDraft`
     * @param otherMessage Optional remaining parameters for `sendMessage`
     * @param signal Optional `AbortSignal` to cancel the request
     */
    replyWithStream(
        stream: Iterable<MessageDraftPiece> | AsyncIterable<MessageDraftPiece>,
        otherMessageDraft?: Omit<
            Parameters<ApiMethods["sendMessageDraft"]>[0],
            "chat_id" | "draft_id" | "text"
        >,
        otherMessage?: Omit<
            Parameters<ApiMethods["sendMessage"]>[0],
            "chat_id" | "text"
        >,
        signal?: AbortSignal,
    ): Promise<Message.TextMessage[]>;
    /**
     * Use this method to stream an iterator of rich markdown message pieces to
     * a private chat. Returns a rich message object.
     *
     * This is a convenience method built on top of `sendRichMessage` and
     * `sendRichMessageDraft`. The former method is called once given iterator
     * completes, and the latter method is called many times while consuming the
     * iterator and accumulating the strings.
     *
     * The draft identifier is set to the current `update_id`. Hence, if you
     * want to call this method several times from the same handler and/or
     * middleware pass, then you should make sure that both calls happen
     * sequentially. Otherwise, clashes between draft identifiers can happen
     * across the concurrent calls. Alternatively, you can pass a custom
     * `draft_id` value to the options object for `sendRichMessageDraft` (second
     * parameter).
     *
     * This method consumes the given iterator as fast as possible and updates
     * the message draft as often as possible. If reading the next chunk of data
     * is faster than the message draft can be updated, then some calls to
     * `sendRichMessageDraft` are skipped. This integrates well with [the
     * auto-retry plugin](https://grammy.dev/plugins/auto-retry) which converts
     * rate limits into slower API calls. Make sure to install it before
     * installing this plugin.
     *
     * @param stream An iterator of message pieces with optional draft identifiers
     * @param otherRichMessageDraft Optional remaining parameters for `sendRichMessageDraft` calls
     * @param otherRichMessage Optional remaining parameters for `sendRichMessage` calls
     * @param baseInputRichMessage Optional remaining fields of `rich_message` in all API calls
     * @param signal Optional `AbortSignal` to cancel the request
     */
    replyWithMarkdownStream(
        stream: Iterable<string> | AsyncIterable<string>,
        otherRichMessageDraft?: Omit<
            Parameters<ApiMethods["sendRichMessageDraft"]>[0],
            "chat_id" | "rich_message"
        >,
        otherRichMessage?: Omit<
            Parameters<ApiMethods["sendRichMessage"]>[0],
            "chat_id" | "rich_message"
        >,
        baseInputRichMessage: Omit<InputRichMessage, "markdown" | "html">,
        signal?: AbortSignal,
    ): Promise<Message.RichMessage>;
    /**
     * Use this method to stream an iterator of rich HTML message pieces to a
     * private chat. Returns a rich message object.
     *
     * This is a convenience method built on top of `sendRichMessage` and
     * `sendRichMessageDraft`. The former method is called once given iterator
     * completes, and the latter method is called many times while consuming the
     * iterator and accumulating the strings.
     *
     * The draft identifier is set to the current `update_id`. Hence, if you
     * want to call this method several times from the same handler and/or
     * middleware pass, then you should make sure that both calls happen
     * sequentially. Otherwise, clashes between draft identifiers can happen
     * across the concurrent calls. Alternatively, you can pass a custom
     * `draft_id` value to the options object for `sendRichMessageDraft` (second
     * parameter).
     *
     * This method consumes the given iterator as fast as possible and updates
     * the message draft as often as possible. If reading the next chunk of data
     * is faster than the message draft can be updated, then some calls to
     * `sendRichMessageDraft` are skipped. This integrates well with [the
     * auto-retry plugin](https://grammy.dev/plugins/auto-retry) which converts
     * rate limits into slower API calls. Make sure to install it before
     * installing this plugin.
     *
     * @param stream An iterator of message pieces with optional draft identifiers
     * @param otherRichMessageDraft Optional remaining parameters for `sendRichMessageDraft` calls
     * @param otherRichMessage Optional remaining parameters for `sendRichMessage` calls
     * @param baseInputRichMessage Optional remaining fields of `rich_message` in all API calls
     * @param signal Optional `AbortSignal` to cancel the request
     */
    replyWithHtmlStream(
        stream: Iterable<string> | AsyncIterable<string>,
        otherRichMessageDraft?: Omit<
            Parameters<ApiMethods["sendRichMessageDraft"]>[0],
            "chat_id" | "rich_message"
        >,
        otherRichMessage?: Omit<
            Parameters<ApiMethods["sendRichMessage"]>[0],
            "chat_id" | "rich_message"
        >,
        baseInputRichMessage: Omit<InputRichMessage, "markdown" | "html">,
        signal?: AbortSignal,
    ): Promise<Message.RichMessage>;
}

/** Collection of options for the stream plugin */
export interface StreamOptions<C extends Context> {
    /**
     * Determines the default offset of draft identifiers for
     * `ctx.replyWithStream` calls. For more information on draft identifier
     * offsets, confer {@link StreamContextExtension.replyWithStream}.
     *
     * Note that this option has no effect on rich message sending via
     * {@link StreamContextExtension.replyWithMarkdownStream} or
     * {@link StreamContextExtension.replyWithHtmlStream}, as both methods let
     * you specify the draft identifier directly.
     */
    defaultDraftIdOffset?(ctx: C): number;
}

/**
 * Main plugin middleware. Install this on your bot to use this plugin.
 *
 * This middleware will register two things:
 *
 * 1. `ctx.replyWithStream`: stream a message to the current chat
 * 2. `ctx.api.streamMessage`: stream a message to any chat
 *
 * Consider installing the [auto-retry](https://grammy.dev/plugins/auto-retry) _before_ this plugin. This
 * will make sure that streaming messages does not crash due to rate limits.
 *
 * @param options Optional options object for this plugin
 */
export function stream<C extends Context>(
    options: StreamOptions<C> = {},
): MiddlewareFn<StreamFlavor<C>> {
    const {
        defaultDraftIdOffset = (ctx) => 256 * ctx.update.update_id,
    } = options;
    return async (ctx, next) => {
        const {
            streamMessage: streamMessageApi,
            streamMarkdown: streamMarkdownApi,
            streamHtml: streamHtmlApi,
        } = streamApi(ctx.api.raw);

        ctx.api.streamMessage = streamMessageApi;
        ctx.api.streamMarkdown = streamMarkdownApi;
        ctx.api.streamHtml = streamHtmlApi;
        ctx.api.streamMessage = streamMessageApi;
        ctx.replyWithStream = async function streamMessage(
            stream,
            otherMessageDraft,
            otherMessage,
            signal,
        ) {
            const chatId = ctx.chatId;
            if (chatId === undefined) {
                throw new Error(
                    "This update does not belong to a chat, so you cannot call 'streamMessage'",
                );
            }
            const msg = ctx.msg;
            const messageThreadId = msg?.is_topic_message
                ? { message_thread_id: msg.message_thread_id }
                : {};
            return await streamMessageApi(
                chatId,
                defaultDraftIdOffset(ctx),
                stream,
                { ...messageThreadId, ...otherMessageDraft },
                { ...messageThreadId, ...otherMessage },
                signal,
            );
        };
        ctx.replyWithMarkdownStream = async function streamMarkdown(
            stream,
            otherRichMessageDraft,
            otherRichMessage,
            baseInputRichMessage,
            signal,
        ) {
            const chatId = ctx.chatId;
            if (chatId === undefined) {
                throw new Error(
                    "This update does not belong to a chat, so you cannot call 'streamMarkdown'",
                );
            }
            const msg = ctx.msg;
            const messageThreadId = msg?.is_topic_message
                ? { message_thread_id: msg.message_thread_id }
                : {};
            return await streamMarkdownApi(
                chatId,
                ctx.update.update_id,
                stream,
                { ...messageThreadId, ...otherRichMessageDraft },
                { ...messageThreadId, ...otherRichMessage },
                baseInputRichMessage,
                signal,
            );
        };
        ctx.replyWithHtmlStream = async function streamHtml(
            stream,
            otherRichMessageDraft,
            otherRichMessage,
            baseInputRichMessage,
            signal,
        ) {
            const chatId = ctx.chatId;
            if (chatId === undefined) {
                throw new Error(
                    "This update does not belong to a chat, so you cannot call 'streamHtml'",
                );
            }
            const msg = ctx.msg;
            const messageThreadId = msg?.is_topic_message
                ? { message_thread_id: msg.message_thread_id }
                : {};
            return await streamHtmlApi(
                chatId,
                ctx.update.update_id,
                stream,
                { ...messageThreadId, ...otherRichMessageDraft },
                { ...messageThreadId, ...otherRichMessage },
                baseInputRichMessage,
                signal,
            );
        };

        await next();
    };
}

/**
 * For a given {@link RawApi} instance, creates a function that can stream
 * messages.
 *
 * This is used internally by {@link stream} and you usually do not have to
 * worry about it. However, if you construct your own `Api` instance and you
 * with to use it for streaming messages, then this function lets you do so
 * based on the underlying `.raw` object.
 *
 * @param rawApi Defines how to call `sendMessageDraft` and `sendMessage`
 */
export function streamApi(
    rawApi: RawApi,
): StreamContextExtension["api"] {
    return {
        streamMessage: async function streamMessage(
            chat_id,
            draft_id_offset,
            stream,
            otherMessageDraft,
            otherMessage,
            signal,
        ) {
            return await streamPlainMessage(
                chat_id,
                draft_id_offset,
                stream,
                otherMessageDraft,
                otherMessage,
                signal,
            );
        },
        streamMarkdown: async function streamMarkdown(
            chat_id,
            draft_id,
            stream,
            otherRichMessageDraft,
            otherRichMessage,
            baseInputRichMessage,
            signal,
        ) {
            return await streamRichMessage(
                chat_id,
                draft_id,
                stream,
                otherRichMessageDraft,
                otherRichMessage,
                (markdown) => ({ ...baseInputRichMessage, markdown }),
                signal,
            );
        },
        streamHtml: async function streamHtml(
            chat_id,
            draft_id,
            stream,
            otherRichMessageDraft,
            otherRichMessage,
            baseInputRichMessage,
            signal,
        ) {
            return await streamRichMessage(
                chat_id,
                draft_id,
                stream,
                otherRichMessageDraft,
                otherRichMessage,
                (html) => ({ ...baseInputRichMessage, html }),
                signal,
            );
        },
    };

    /**
     * Helper function for rich message streaming.
     *
     * Very simple: start a pull and a push loop. The pull loop updates a draft
     * string as fast as possible, and notifies the pull loop via a lock. The
     * pull loop updates the draft which whatever the latest string is, and
     * sends a message on exit (stream exhausted).
     */
    async function streamRichMessage(
        chat_id: number,
        draft_id: number,
        stream:
            | Iterable<string>
            | AsyncIterable<string>,
        otherRichMessageDraft: Omit<
            Parameters<ApiMethods["sendRichMessageDraft"]>[0],
            "chat_id" | "draft_id" | "rich_message"
        >,
        otherRichMessage: Omit<
            Parameters<ApiMethods["sendRichMessage"]>[0],
            "chat_id" | "rich_message"
        >,
        buildInputRichMessage: (markdownOrHtml: string) => InputRichMessage,
        signal: AbortSignal | undefined,
    ) {
        let latest: string | undefined = undefined; // present if a new draft is available

        let lock: PromiseWithResolvers<void> | undefined = undefined; // notify about new data
        let running = true; // cancel pulling upon error
        let exhausted = false; // signal completion of stream

        async function pull() {
            let accumulator: string | undefined = undefined;
            for await (const draft of stream) {
                if (!running || signal?.aborted) break;
                if (accumulator === undefined) {
                    // first chunk
                    accumulator = draft;
                } else {
                    accumulator += draft;
                }
                latest = accumulator; // make available to push loop
                if (lock !== undefined) {
                    lock.resolve();
                    lock = undefined;
                }
            }
            exhausted = true;
            if (lock !== undefined) {
                lock.resolve();
                lock = undefined;
            }
        }

        async function push() {
            try {
                while (!exhausted) {
                    if (latest !== undefined) {
                        const draft = latest;
                        latest = undefined;
                        await rawApi.sendRichMessageDraft({
                            chat_id,
                            draft_id,
                            rich_message: buildInputRichMessage(draft),
                            ...otherRichMessageDraft,
                        }, signal);
                        continue;
                    }

                    // no draft to update, wait for data
                    lock = Promise.withResolvers();
                    await lock.promise;
                }
            } finally {
                running = false;
            }
            return await rawApi.sendRichMessage({
                chat_id,
                draft_id,
                rich_message: buildInputRichMessage(latest),
                ...otherRichMessage,
            }, signal);
        }
        const [, message] = await Promise.all([pull(), push()]);
        return message;
    }

    /**
     * Helper function for chunked plain message streaming.
     *
     * More elaborate than rich message streaming because we support sending
     * several messages. Same structure as above, but also enumerates draft
     * identifiers and keeps a buffer of outgoing messages yet to be sent.
     */
    async function streamPlainMessage(
        chat_id: number,
        draft_id_offset: number,
        stream:
            | Iterable<MessageDraftPiece>
            | AsyncIterable<MessageDraftPiece>,
        otherMessageDraft?: Omit<
            Parameters<ApiMethods["sendMessageDraft"]>[0],
            "chat_id" | "draft_id" | "text"
        >,
        otherMessage?: Omit<
            Parameters<ApiMethods["sendMessage"]>[0],
            "chat_id" | "text"
        >,
        signal?: AbortSignal,
    ) {
        type Draft = { id: number; text: string; entities: MessageEntity[] };

        async function* enumerateDrafts(): AsyncGenerator<Draft> {
            let currentDraftId = 0;
            let currentByteCount = 0;
            let currentNegativeEntityOffset = 0;
            for await (const chunk of stream) {
                const { draft_id, text, entities = [] } =
                    typeof chunk === "string" ? { text: chunk } : chunk;

                const lastDraftId = currentDraftId;
                const addedLength = text.length;
                if (draft_id !== undefined) {
                    currentDraftId = draft_id;
                } else if (currentByteCount + addedLength > 4096) {
                    currentDraftId++;
                }
                if (lastDraftId === currentDraftId) {
                    currentByteCount += addedLength;
                } else {
                    currentNegativeEntityOffset += currentByteCount;
                    currentByteCount = addedLength;
                }

                yield {
                    id: draft_id_offset + currentDraftId,
                    text,
                    entities: entities.map((e) => ({
                        ...e,
                        offset: e.offset - currentNegativeEntityOffset,
                    })),
                };
            }
        }

        let latest: Draft | undefined = undefined; // present if a new draft is available
        const complete: Draft[] = []; // buffer of outgoing messages

        let lock: PromiseWithResolvers<void> | undefined = undefined; // notify about new data
        let running = true; // cancel pulling upon error
        let exhausted = false; // signal completion of stream
        async function pull() {
            let accumulator: Draft | undefined;
            for await (const draft of enumerateDrafts()) {
                if (!running || signal?.aborted) break;
                if (accumulator === undefined) {
                    // first chunk
                    accumulator = draft;
                } else if (accumulator.id === draft.id) {
                    // same draft_id as last chunk
                    accumulator.text += draft.text;
                    accumulator.entities.push(...draft.entities);
                } else {
                    // different draft_id than last chunk
                    complete.push(accumulator);
                    accumulator = draft;
                }
                latest = accumulator;
                if (lock !== undefined) {
                    lock.resolve();
                    lock = undefined;
                }
            }
            if (accumulator !== undefined) {
                complete.push(accumulator);
            }
            exhausted = true;
            if (lock !== undefined) {
                lock.resolve();
                lock = undefined;
            }
        }

        const messages: Message.TextMessage[] = [];
        async function push() {
            try {
                while (!exhausted || complete.length > 0) {
                    let draft: Draft | undefined;

                    // send complete messages
                    draft = complete.shift();
                    if (draft !== undefined) {
                        const message = await rawApi.sendMessage({
                            chat_id,
                            text: draft.text,
                            entities: draft.entities,
                            ...otherMessage,
                        }, signal);
                        messages.push(message);
                        continue;
                    }

                    // no messages to send, update latest draft
                    draft = latest;
                    if (draft !== undefined) {
                        latest = undefined;
                        await rawApi.sendMessageDraft({
                            chat_id,
                            draft_id: draft.id,
                            text: draft.text,
                            entities: draft.entities,
                            ...otherMessageDraft,
                        }, signal);
                        continue;
                    }

                    // no messages to send, no draft to update, wait for data
                    lock = Promise.withResolvers();
                    await lock.promise;
                }
            } finally {
                running = false;
            }
        }
        await Promise.all([pull(), push()]);
        return messages;
    }
}
