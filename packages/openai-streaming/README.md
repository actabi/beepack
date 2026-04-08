# openai-streaming

Streaming chat completions, tool/function calling, vision (image) inputs, abort control, and exponential backoff on rate limits. Zero dependencies — uses native `fetch` and `ReadableStream`.

Handles the hard parts: SSE chunk parsing, tool call assembly across rounds, finish_reason warnings, rate limit retry with Retry-After header respect, and token budget estimation before you send.

## Setup

```bash
OPENAI_API_KEY=sk-...
```

## Usage

### Streaming Chat

Yields text delta strings as they arrive. Pipe them wherever you need — WebSocket, SSE response, stdout.

```js
import { streamChat } from "./index.js";

const controller = new AbortController();

for await (const delta of streamChat(process.env.OPENAI_API_KEY, {
  model: "gpt-4o",
  messages: [{ role: "user", content: "Explain SSE in one paragraph." }],
  maxTokens: 256,
  signal: controller.signal,
})) {
  process.stdout.write(delta);
}

// Cancel mid-stream from anywhere:
// controller.abort();
```

### Non-Streaming Chat (with Rate Limit Backoff)

Waits for the full response. Automatically retries on 429 with exponential backoff, respecting the `Retry-After` header when present.

```js
import { chat } from "./index.js";

const reply = await chat(process.env.OPENAI_API_KEY, {
  model: "gpt-4o",
  messages: [{ role: "user", content: "What is 2 + 2?" }],
  systemPrompt: "You are a terse assistant.",
  maxTokens: 64,
  maxRetries: 4, // default
});

console.log(reply); // "4"
```

### Tool / Function Calling

Define tools with JSON Schema parameters. Provide handler functions — the library calls them, feeds results back, and returns the final answer after all rounds complete.

```js
import { chatWithTools } from "./index.js";

const result = await chatWithTools(process.env.OPENAI_API_KEY, {
  model: "gpt-4o",
  messages: [{ role: "user", content: "What's the weather in Paris and Tokyo?" }],
  tools: [
    {
      name: "get_weather",
      description: "Get current weather for a city",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
          units: { type: "string", enum: ["celsius", "fahrenheit"], default: "celsius" },
        },
        required: ["city"],
      },
    },
  ],
  handlers: {
    async get_weather({ city, units = "celsius" }) {
      // Call your real weather API here
      return JSON.stringify({ city, temp: 18, condition: "cloudy", units });
    },
  },
  maxRounds: 5,
});

console.log(result.content);   // Final answer text
console.log(result.toolCalls); // [{ name, args, callId }, ...]
console.log(result.messages);  // Full conversation history including tool turns
```

### Vision (Image Input)

Pass images alongside text in multi-part messages. Works with public URLs or base64 data URIs.

```js
import { chat, imageContent, textContent } from "./index.js";

const reply = await chat(process.env.OPENAI_API_KEY, {
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content: [
        textContent("What's in this image?"),
        imageContent("https://example.com/photo.jpg", "high"),
      ],
    },
  ],
  maxTokens: 512,
});

// Local file as base64:
import { readFileSync } from "fs";
const b64 = readFileSync("./diagram.png").toString("base64");
const visionMsg = imageContent(`data:image/png;base64,${b64}`, "low");
```

### Token Budget Estimation

Estimate prompt size before sending to avoid surprises. Uses a character-count heuristic (~4 chars/token); no tiktoken needed.

```js
import { estimateTokens } from "./index.js";

const messages = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Write me a haiku about clouds." },
];

const estimated = estimateTokens(messages);
const MODEL_CONTEXT = 128000;
const maxTokens = 1024;

if (estimated + maxTokens > MODEL_CONTEXT) {
  console.warn(`Prompt too large: ~${estimated} tokens estimated`);
} else {
  console.log(`~${estimated} tokens — proceeding`);
}
```

### Relay OpenAI Stream to Browser (SSE Passthrough)

Forward the OpenAI stream directly to your client without buffering. Returns a `Response` object compatible with Next.js Route Handlers, Deno, Bun, and any WinterCG-compatible runtime.

```js
// app/api/chat/route.js (Next.js App Router)
import { streamToResponse } from "./index.js";

export async function POST(req) {
  const { messages } = await req.json();

  return streamToResponse(process.env.OPENAI_API_KEY, {
    model: "gpt-4o",
    messages,
    maxTokens: 512,
  });
}
```

On the client, consume with the EventSource API or `fetch` + a stream reader:

```js
const res = await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({ messages: [{ role: "user", content: "Hello!" }] }),
  headers: { "Content-Type": "application/json" },
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(decoder.decode(value));
}
```

### Abort Controller Integration

Pass a shared `AbortSignal` to cancel in-flight requests — works for streaming, non-streaming, and tool calls.

```js
import { streamChat, chatWithTools } from "./index.js";

const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

for await (const delta of streamChat(process.env.OPENAI_API_KEY, {
  messages: [{ role: "user", content: "Write me a novel." }],
  maxTokens: 4096,
  signal: controller.signal,
})) {
  process.stdout.write(delta);
}
```

## Edge Cases Handled

- **Truncated responses** — warns via `console.error` when `finish_reason` is `"length"`, so you know to increase `maxTokens`
- **Rate limits** — exponential backoff with jitter (1s, 2s, 4s, ... capped at 60s); respects `Retry-After` header from the API
- **Tool call chunk assembly** — `chatWithTools` uses non-streaming requests so tool call JSON is never split across chunks and is always safe to parse
- **Missing tool handlers** — logs a clear error and returns an error string as the tool result rather than crashing the round
- **Argument parse failures** — malformed JSON in function arguments is caught and falls back to `{}` with a log
- **Stream passthrough** — `streamToResponse` pipes bytes directly without buffering, so time-to-first-token is unchanged
- **AbortError / TimeoutError** — caught explicitly and returns `null` cleanly rather than propagating
- **Vision token cost** — `estimateTokens` accounts for image detail level (low ~85 tokens, high ~765 tokens) per OpenAI's pricing model
