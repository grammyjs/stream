import {
    assert,
    assertEquals,
    assertMatch,
    assertRejects,
    describe,
    it,
} from "./deps.test.ts";
import { Message, MessageEntity, RawApi } from "../src/deps.deno.ts";
import { MessageDraftPiece, streamApi } from "../src/stream.ts";

interface RawApiStub {
    drafts: Parameters<RawApi["sendMessageDraft"]>[0][];
    messages: Parameters<RawApi["sendMessage"]>[0][];

    resolveDraft(final?: "final"): void;
    resolveMessage(final?: "final"): void;

    stub: RawApi;
}

function stubRawApi(options: {
    blockDraft?: boolean;
    blockMessage?: boolean;
    draftError?: Error;
    messageError?: Error;
} = {}): RawApiStub {
    const {
        blockDraft = false,
        blockMessage = false,
        draftError,
        messageError,
    } = options;

    let draftLock = Promise.withResolvers<void>();
    let messageLock = Promise.withResolvers<void>();

    const stub: RawApiStub = {
        drafts: [],
        messages: [],

        resolveDraft(final?: "final") {
            draftLock.resolve();
            if (final !== "final") {
                draftLock = Promise.withResolvers();
            }
        },
        resolveMessage(final?: "final") {
            messageLock.resolve();
            if (final !== "final") {
                messageLock = Promise.withResolvers();
            }
        },

        stub: {
            async sendMessageDraft(params) {
                if (draftError) throw draftError;
                if (blockDraft) await draftLock.promise;
                stub.drafts.push(structuredClone(params));
                return true;
            },
            async sendMessage(params) {
                if (messageError) throw messageError;
                if (blockMessage) await messageLock.promise;
                const message_id = stub.messages.length;
                stub.messages.push(structuredClone(params));
                return { message_id } as Message.TextMessage;
            },
        } as RawApi,
    };
    return stub;
}

describe("streamApi", () => {
    it("works on empty streams", async () => {
        const { drafts, messages, stub } = stubRawApi();
        const plugin = streamApi(stub);
        await plugin.streamMessage(0, 0, []);
        assertEquals(drafts.length, 0);
        assertEquals(messages.length, 0);
    });

    it("handles a single chunk without entities", async () => {
        const { drafts, messages, stub } = stubRawApi();
        const plugin = streamApi(stub);
        await plugin.streamMessage(0, 0, ["Hello, world!"]);
        assertEquals(drafts.length, 1);
        assertEquals(messages.length, 1);
        assertEquals(messages[0].text, "Hello, world!");
        assertEquals(messages[0].entities, []);
    });

    it("handles a single chunk with entities", async () => {
        const { drafts, messages, stub } = stubRawApi();
        const plugin = streamApi(stub);
        const entities: MessageEntity[] = [
            { type: "bold", offset: 0, length: 5 },
            { type: "italic", offset: 7, length: 5 },
        ];
        await plugin.streamMessage(0, 0, [{
            text: "Hello, world!",
            entities,
        }]);
        assertEquals(drafts.length, 1);
        assertEquals(messages.length, 1);
        assertEquals(messages[0].text, "Hello, world!");
        assertEquals(messages[0].entities, entities);
    });

    it("handles many chunks that span over 4096 characters", async () => {
        async function runTest(data: Iterable<string> | AsyncIterable<string>) {
            const { drafts, messages, stub } = stubRawApi();
            const plugin = streamApi(stub);

            const firstDraftId = 42;
            await plugin.streamMessage(0, firstDraftId, data);
            // sync iterators and sync API calls should have a 1:1 match
            assertEquals(drafts.length, 100);
            // all calls should look like this
            assertEquals(drafts[0], {
                chat_id: 0,
                draft_id: firstDraftId,
                text: "a".repeat(100),
                entities: [],
            });
            // confirm remaining calls
            for (const draft of drafts) {
                assertEquals(draft.chat_id, 0);
                assertMatch(draft.text, /a+/);
                assertEquals(draft.entities, []);
            }
            assertEquals(drafts[0].draft_id, firstDraftId);
            assertEquals(drafts[1].draft_id, firstDraftId);
            assertEquals(drafts[39].draft_id, firstDraftId);
            assertEquals(drafts[40].draft_id, firstDraftId + 1);
            assertEquals(drafts[41].draft_id, firstDraftId + 1);
            assertEquals(drafts[79].draft_id, firstDraftId + 1);
            assertEquals(drafts[80].draft_id, firstDraftId + 2);
            assertEquals(drafts[81].draft_id, firstDraftId + 2);
            assertEquals(drafts[99].draft_id, firstDraftId + 2);
            // only three messages should have been sent
            assertEquals(messages.length, 3);
            assertEquals(messages[0].text.length, 4000); // 40 chunks * 100 chars
            assertEquals(messages[1].text.length, 4000); // 40 chunks * 100 chars
            assertEquals(messages[2].text.length, 2000); // 20 chunks * 100 chars
        }

        // Create chunks totaling more than 2*4096 characters (3 messages)
        const chunks: string[] = [];
        for (let i = 0; i < 100; i++) {
            chunks.push("a".repeat(100)); // 10_000 total characters
        }
        // 1. Instant version (sync iterator from array)
        await runTest(chunks);
        // 2. Slow version (async iterator with tiny delays)
        async function* genChunks() {
            for (const chunk of chunks) {
                await new Promise((r) => setTimeout(r, 0)); // delay by one macrotask
                yield chunk;
            }
        }
        await runTest(genChunks());
    });

    it("handles many chunks with entities", async () => {
        const { drafts, messages, stub } = stubRawApi();
        const plugin = streamApi(stub);
        const chunks: MessageDraftPiece[] = [];
        // First chunk with entity
        chunks.push({
            text: "a".repeat(3000),
            entities: [{ type: "bold", offset: 0, length: 3000 }],
        });
        // Second chunk (same message)
        chunks.push({
            text: "b".repeat(1000),
            entities: [{ type: "italic", offset: 3000, length: 1000 }],
        });
        // Third chunk (second message, adjusted offsets)
        chunks.push({
            text: "c".repeat(200),
            entities: [{ type: "code", offset: 4000, length: 200 }],
        });

        await plugin.streamMessage(0, 0, chunks);
        assertEquals(drafts.length, 3); // One draft per chunk
        assertEquals(drafts[0], {
            chat_id: 0,
            draft_id: 0,
            text: "a".repeat(3000),
            entities: [{ type: "bold", offset: 0, length: 3000 }],
        });
        assertEquals(drafts[1], {
            chat_id: 0,
            draft_id: 0,
            text: "a".repeat(3000) + "b".repeat(1000),
            entities: [
                { type: "bold", offset: 0, length: 3000 },
                { type: "italic", offset: 3000, length: 1000 },
            ],
        });
        assertEquals(drafts[2], {
            chat_id: 0,
            draft_id: 1,
            text: "c".repeat(200),
            entities: [{ type: "code", offset: 0, length: 200 }], // offset adjusted
        });
        assertEquals(messages.length, 2); // Accumulated into two messages
        assertEquals(messages[0], {
            chat_id: 0,
            text: "a".repeat(3000) + "b".repeat(1000), // First two chunks
            entities: [
                { type: "bold", offset: 0, length: 3000 },
                { type: "italic", offset: 3000, length: 1000 },
            ],
        });
        assertEquals(messages[1], {
            chat_id: 0,
            text: "c".repeat(200), // Third chunk
            entities: [{ type: "code", offset: 0, length: 200 }],
        });
    });

    it("handles many chunks with custom draft_id values and entities", async () => {
        const { drafts, messages, stub } = stubRawApi();
        const plugin = streamApi(stub);
        const chunks: MessageDraftPiece[] = [
            {
                draft_id: 2,
                text: "one",
                entities: [{ type: "bold", offset: 0, length: 3 }],
            },
            {
                draft_id: 3,
                text: "second",
                entities: [{ type: "italic", offset: 3, length: 6 }],
            },
            {
                draft_id: -7,
                text: "thrice",
                entities: [{ type: "code", offset: 9, length: 6 }],
            },
        ];
        await plugin.streamMessage(0, 100, chunks);
        assertEquals(drafts.length, 3);
        assertEquals(drafts[0], {
            chat_id: 0,
            draft_id: 102,
            text: "one",
            entities: [{ type: "bold", offset: 0, length: 3 }],
        });
        assertEquals(drafts[1], {
            chat_id: 0,
            draft_id: 103,
            text: "second",
            entities: [{ type: "italic", offset: 0, length: 6 }],
        });
        assertEquals(drafts[2], {
            chat_id: 0,
            draft_id: 93,
            text: "thrice",
            entities: [{ type: "code", offset: 0, length: 6 }],
        });
        assertEquals(messages.length, 3);
        assertEquals(messages[0], {
            chat_id: 0,
            text: "one",
            entities: [{ type: "bold", offset: 0, length: 3 }],
        });
        assertEquals(messages[1], {
            chat_id: 0,
            text: "second",
            entities: [{ type: "italic", offset: 0, length: 6 }],
        });
        assertEquals(messages[2], {
            chat_id: 0,
            text: "thrice",
            entities: [{ type: "code", offset: 0, length: 6 }],
        });
    });

    it("handles fast chunk generation with slow message sending", async () => {
        const { drafts, messages, stub, resolveMessage } = stubRawApi({
            blockMessage: true,
        });
        const plugin = streamApi(stub);

        function* stream() {
            for (let i = 0; i < 100; i++) {
                yield "a".repeat(100);
                if (i === 50 || i === 90) {
                    resolveMessage();
                }
            }
            resolveMessage("final");
        }
        await plugin.streamMessage(0, 0, stream());
        // send 40 drafts per intermediate resolve,
        // and skip others due to slow message sending
        assertEquals(drafts.length, 80);
        for (let i = 0; i < 80; i++) {
            assert(drafts[i].text.length % 100 === 0);
        }
        assertEquals(messages.length, 3);
        assertEquals(messages[0].text.length, 4000);
        assertEquals(messages[1].text.length, 4000);
        assertEquals(messages[2].text.length, 2000);
    });

    it("handles fast chunk generation with slow draft sending", async () => {
        const { drafts, messages, stub, resolveDraft } = stubRawApi({
            blockDraft: true,
        });
        const plugin = streamApi(stub);

        async function* stream() {
            for (let i = 0; i < 100; i++) {
                yield "a".repeat(100);
                if (i === 50 || i === 90) {
                    resolveDraft();
                }
            }
            resolveDraft("final");
        }
        await plugin.streamMessage(0, 0, stream());
        // send 4 drafts for the following chunks: first, 51st, 91st, last (there are 40 iterations per message)
        assertEquals(drafts.length, 4);
        assertEquals(drafts[0], {
            chat_id: 0,
            draft_id: 0, // first message
            text: "a".repeat(100), // i = 1, first draft is sent immediately
            entities: [],
        });
        assertEquals(drafts[1], {
            chat_id: 0,
            draft_id: 1, // second message
            text: "a".repeat(11 * 100), // i = 51, ten chunks of second message sent before
            entities: [],
        });
        assertEquals(drafts[2], {
            chat_id: 0,
            draft_id: 2, // third message
            text: "a".repeat(11 * 100), // i = 91, ten chunks of third message sent before
            entities: [],
        });
        assertEquals(drafts[3], {
            chat_id: 0,
            draft_id: 2, // third message again
            text: "a".repeat(20 * 100), // i = 100, called after the last chunk was collected ("final")
            entities: [],
        });
        assertEquals(messages.length, 3);
        assertEquals(messages[0].text.length, 4000);
        assertEquals(messages[1].text.length, 4000);
        assertEquals(messages[2].text.length, 2000);
    });

    it("handles fast chunk generation with slow message and draft sending", async () => {
        const { drafts, messages, stub, resolveDraft, resolveMessage } =
            stubRawApi({
                blockDraft: true,
                blockMessage: true,
            });
        const plugin = streamApi(stub);

        async function* stream() {
            for (let i = 0; i < 100; i++) {
                yield "a".repeat(100);
            }
            resolveDraft("final");
            resolveMessage("final");
        }
        await plugin.streamMessage(0, 0, stream());

        // only called once, all other calls are skipped
        assertEquals(drafts.length, 1);
        assertEquals(drafts[0], {
            chat_id: 0,
            draft_id: 0,
            text: "a".repeat(100), // only the first chunk
            entities: [],
        });
        assertEquals(messages.length, 3);
        assertEquals(messages[0].text.length, 4000);
        assertEquals(messages[1].text.length, 4000);
        assertEquals(messages[2].text.length, 2000);
    });

    it("handles empty chunks", async () => {
        const { drafts, messages, stub } = stubRawApi();
        const plugin = streamApi(stub);

        const chunks = ["Hello", "", "World", "", ""];
        await plugin.streamMessage(0, 0, chunks);

        assertEquals(drafts.length, chunks.length);
        assertEquals(drafts[0].text, "Hello");
        assertEquals(drafts[1].text, "Hello");
        assertEquals(drafts[2].text, "HelloWorld");
        assertEquals(drafts[3].text, "HelloWorld");
        assertEquals(drafts[4].text, "HelloWorld");
        assertEquals(messages.length, 1);
        assertEquals(messages[0].text, "HelloWorld");
    });

    it("handles errors from sendMessageDraft", async () => {
        const error = new Error("Draft sending failed");
        const { stub } = stubRawApi({ draftError: error });
        const plugin = streamApi(stub);

        const chunks = [
            { draft_id: 0, text: "A" },
            { draft_id: 1, text: "B" },
        ];

        await assertRejects(
            async () => await plugin.streamMessage(0, 0, chunks),
            Error,
            "Draft sending failed",
        );
    });

    it("handles errors from sendMessage", async () => {
        const error = new Error("Message sending failed");
        const { stub } = stubRawApi({ messageError: error });
        const plugin = streamApi(stub);

        const chunks = ["Hello", "World"];

        await assertRejects(
            async () => await plugin.streamMessage(0, 0, chunks),
            Error,
            "Message sending failed",
        );
    });

    it("handles errors from async stream iterator", async () => {
        const { stub } = stubRawApi();
        const plugin = streamApi(stub);

        async function* errorStream(): AsyncGenerator<MessageDraftPiece> {
            yield { draft_id: 0, text: "First" };
            yield { draft_id: 1, text: "Second" };
            throw new Error("Delayed stream error");
        }

        await assertRejects(
            async () => await plugin.streamMessage(0, 0, errorStream()),
            Error,
            "Delayed stream error",
        );
    });
});
