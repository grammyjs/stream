# grammY stream

Stream long text messages to Telegram.
Make LLM output appear as animated message drafts before sending the message.
Automatically split long text across several messages.

## Quickstart

Run `npm i grammy @grammyjs/stream @grammyjs/auto-retry` and paste the following code:

```ts
import { Bot, type Context } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { stream, type StreamFlavor } from "@grammyjs/stream";

type MyContext = StreamFlavor<Context>;

const bot = new Bot<MyContext>("");

bot.api.config.use(autoRetry());
bot.use(stream());

async function* slowText() {
    // emulate slow text generation
    yield "This i";
    await new Promise((r) => setTimeout(r, 1000));
    yield "s some sl";
    await new Promise((r) => setTimeout(r, 1000));
    yield "owly gene";
    await new Promise((r) => setTimeout(r, 1000));
    yield "rated text";
}

bot.command("stream", async (ctx) => {
    await ctx.replyWithStream(slowText());
});

bot.command("start", (ctx) => ctx.reply("Hi! Send /stream"));
bot.use((ctx) => ctx.reply("What a nice update."));

bot.start();
```

For example, if you use the [AI SDK](https://ai-sdk.dev), your AI setup could look like this:

```ts
import { streamText } from "ai";
import { google } from "@ai-sdk/google";

bot.command("credits", async (ctx) => {
    // Send prompt to LLM:
    const { textStream } = streamText({
        model: google("gemini-2.5-flash"),
        prompt: "How cool are grammY bots?",
    });

    // Automatically stream response with grammY:
    await ctx.replyWithStream(textStream);
});
```
