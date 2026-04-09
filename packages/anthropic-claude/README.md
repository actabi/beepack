# anthropic-claude

Call Claude models with streaming, tool use, extended thinking, vision, prompt caching, and batch processing. Zero dependencies — uses native `fetch`.

Handles the hard parts: accumulating tool_use block JSON across stream deltas, terminating multi-turn tool loops on `stop_reason: "tool_use"`, placing `cache_control` breakpoints correctly, and parsing JSONL batch results.

## Setup

```bash
ANTHROPIC_API_KEY=sk-ant-...  # Get yours at https://console.anthropic.com
```

## Usage

### Streaming Messages

Stream a response and receive text deltas as they arrive.

```js
import { streamMessage } from "./index.js";

const result = await streamMessage(process.env.ANTHROPIC_API_KEY, {
  model: "claude-opus-4-5",
  messages: [{ role: "user", content: "Explain quantum entanglement briefly." }],
  system: "You are a concise science communicator.",
  maxTokens: 512,
  onDelta: (chunk) => process.stdout.write(chunk),
});
// { text: "...", stopReason: "end_turn", usage: { input_tokens: 42, output_tokens: 120 } }
```

### Tool Use (Function Calling)

Define tools and let Claude call them in a multi-turn loop until it produces a final answer.

```js
import { runToolLoop } from "./index.js";

const tools = [
  {
    name: "get_weather",
    description: "Get the current weather for a city.",
    input_schema: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name" },
      },
      required: ["city"],
    },
  },
];

const result = await runToolLoop(process.env.ANTHROPIC_API_KEY, {
  model: "claude-opus-4-5",
  messages: [{ role: "user", content: "What's the weather in Tokyo and Paris?" }],
  tools,
  maxTokens: 1024,
  onToolCall: async (name, input) => {
    if (name === "get_weather") {
      // Call your real weather API here
      return JSON.stringify({ city: input.city, temp: "22°C", condition: "Clear" });
    }
  },
});
// { text: "Tokyo is 22°C and clear. Paris is ...", messages: [...], iterations: 3 }
```

### Extended Thinking

Enable Claude's internal reasoning before it produces an answer. Useful for complex math, logic, or multi-step planning.

```js
import { thinkingMessage } from "./index.js";

const result = await thinkingMessage(process.env.ANTHROPIC_API_KEY, {
  model: "claude-opus-4-5",
  messages: [{ role: "user", content: "Solve: if 3x + 7 = 22, what is x?" }],
  budgetTokens: 5000,   // tokens reserved for internal reasoning
  maxTokens: 16000,     // must be greater than budgetTokens
});
// { text: "x = 5", thinking: "3x = 15, so x = 5", usage: { ... } }
```

### Vision

Analyze images by URL or base64-encoded data.

```js
import { visionMessage } from "./index.js";
import { readFileSync } from "fs";

// From a URL
const result = await visionMessage(process.env.ANTHROPIC_API_KEY, {
  model: "claude-opus-4-5",
  prompt: "What is shown in these images?",
  images: [
    { type: "url", url: "https://example.com/chart.png" },
  ],
});

// From a local file (base64)
const data = readFileSync("diagram.png").toString("base64");
const result2 = await visionMessage(process.env.ANTHROPIC_API_KEY, {
  model: "claude-opus-4-5",
  prompt: "Describe the architecture shown in this diagram.",
  images: [{ type: "base64", data, mediaType: "image/png" }],
});
// { text: "The diagram shows ...", usage: { ... } }
```

### Prompt Caching

Cache a large system prompt to reduce latency and cost on repeated calls. The `cache_control` breakpoint is placed on the last block to be cached.

```js
import { sendWithCaching } from "./index.js";

const largeSystemPrompt = `You are an expert legal assistant with deep knowledge of...
  [thousands of tokens of reference material]`;

// First call: creates the cache entry (slightly higher cost)
const first = await sendWithCaching(process.env.ANTHROPIC_API_KEY, {
  model: "claude-opus-4-5",
  system: largeSystemPrompt,
  messages: [{ role: "user", content: "Summarize clause 12." }],
  maxTokens: 512,
});
// { text: "...", cacheStats: { cacheCreationTokens: 4200, cacheReadTokens: 0 } }

// Subsequent calls: reads from cache (lower cost, lower latency)
const second = await sendWithCaching(process.env.ANTHROPIC_API_KEY, {
  model: "claude-opus-4-5",
  system: largeSystemPrompt,
  messages: [{ role: "user", content: "What does clause 18 say?" }],
  maxTokens: 512,
});
// { text: "...", cacheStats: { cacheCreationTokens: 0, cacheReadTokens: 4200 } }
```

### Batch API

Submit many requests at once for asynchronous processing at 50% reduced cost.

```js
import { submitBatch, getBatchStatus, getBatchResults } from "./index.js";

// Submit
const batch = await submitBatch(process.env.ANTHROPIC_API_KEY, [
  {
    customId: "req-1",
    model: "claude-haiku-4-5",
    messages: [{ role: "user", content: "Translate 'Hello' to French." }],
    maxTokens: 64,
  },
  {
    customId: "req-2",
    model: "claude-haiku-4-5",
    messages: [{ role: "user", content: "Translate 'Goodbye' to Spanish." }],
    maxTokens: 64,
  },
]);
// { batchId: "msgbatch_abc123", status: "in_progress", requestCounts: { processing: 2, ... } }

// Poll until complete (batches finish within 24 hours)
const status = await getBatchStatus(process.env.ANTHROPIC_API_KEY, batch.batchId);
// { batchId: "...", status: "ended", requestCounts: { succeeded: 2, errored: 0, ... } }

// Download results (only once status is "ended")
const results = await getBatchResults(process.env.ANTHROPIC_API_KEY, batch.batchId);
// [
//   { customId: "req-1", type: "succeeded", message: { content: [{ text: "Bonjour" }], ... } },
//   { customId: "req-2", type: "succeeded", message: { content: [{ text: "Adiós" }], ... } },
// ]
```

## Edge Cases Handled

- **Tool_use delta accumulation** — `input_json_delta` events contain partial JSON strings that must be concatenated per block index before parsing; doing this wrong produces silent truncation or parse errors
- **Tool loop termination** — the loop exits on any `stop_reason` other than `"tool_use"` (e.g. `"end_turn"`, `"max_tokens"`), preventing infinite loops
- **Cache_control placement** — `cache_control` is applied to the last block in the system array; content before that point is cached automatically
- **Thinking + max_tokens** — `max_tokens` must exceed `budget_tokens`; the function defaults to a safe headroom
- **Batch not ready** — `getBatchResults` checks status first and returns null with a clear error if the batch has not yet ended
- **Stream timeouts** — streaming uses a 120s timeout; non-streaming uses 15s; batch operations use 30s
- **Network failures** — all functions return null instead of throwing, with errors logged via `console.error`
