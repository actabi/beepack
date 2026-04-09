# openai-assistants

Create and manage OpenAI Assistants, threads, messages, and runs with SSE streaming, tool call handling, and file uploads. Zero dependencies — uses native `fetch` and the OpenAI REST API v1.

Handles the hard parts: multipart/form-data construction without FormData for broad Node.js compatibility, SSE chunk parsing across partial reads, early return on `requires_action` so tool outputs can be submitted before polling resumes, and a 15 s timeout on all non-streaming calls (2 min for streams, 1 min for uploads).

## Setup

```bash
OPENAI_API_KEY=sk-...
```

## Usage

### Create an Assistant

```js
import { createAssistant } from "./index.js";

const assistant = await createAssistant(process.env.OPENAI_API_KEY, {
  model: "gpt-4o",
  name: "Support Bot",
  instructions: "You are a helpful customer support agent. Be concise and friendly.",
  tools: [{ type: "file_search" }],
  temperature: 0.7,
});
// { id: "asst_abc123", object: "assistant", name: "Support Bot", ... }
```

### Retrieve an Existing Assistant

```js
import { getAssistant } from "./index.js";

const assistant = await getAssistant(process.env.OPENAI_API_KEY, "asst_abc123");
// { id: "asst_abc123", model: "gpt-4o", instructions: "...", ... }
```

### Create a Thread

Threads hold conversation history. Seed them with initial messages or start empty.

```js
import { createThread } from "./index.js";

// Empty thread
const thread = await createThread(process.env.OPENAI_API_KEY);

// Thread with initial context
const seeded = await createThread(
  process.env.OPENAI_API_KEY,
  [{ role: "user", content: "I need help with my invoice #4421." }],
  { customer_id: "cust_99" }
);
// { id: "thread_xyz789", object: "thread", created_at: 1712345678, metadata: { customer_id: "cust_99" } }
```

### Add a Message to a Thread

Call this before creating a run to inject new user input.

```js
import { addMessage } from "./index.js";

const message = await addMessage(
  process.env.OPENAI_API_KEY,
  "thread_xyz789",
  "Can you summarize the attached PDF?",
  "user",
  [{ file_id: "file-abc123", tools: [{ type: "file_search" }] }]
);
// { id: "msg_...", role: "user", content: [...], thread_id: "thread_xyz789", ... }
```

### List Messages in a Thread

Returns messages in descending order by default (newest first). Use `order: "asc"` to read chronologically.

```js
import { listMessages } from "./index.js";

const result = await listMessages(process.env.OPENAI_API_KEY, "thread_xyz789", {
  limit: 50,
  order: "asc",
});

for (const msg of result.data) {
  const text = msg.content.find((c) => c.type === "text")?.text?.value ?? "";
  console.log(`[${msg.role}] ${text}`);
}

// Paginate with cursors
const nextPage = await listMessages(process.env.OPENAI_API_KEY, "thread_xyz789", {
  limit: 20,
  after: result.last_id,
});
```

### Create a Run and Poll for Completion

Create a run to execute the assistant on the thread, then poll until a terminal state is reached.

```js
import { createRun, pollRun } from "./index.js";

const run = await createRun(
  process.env.OPENAI_API_KEY,
  "thread_xyz789",
  "asst_abc123",
  { max_completion_tokens: 1024 }
);

const result = await pollRun(process.env.OPENAI_API_KEY, "thread_xyz789", run.id, {
  intervalMs: 1500,
  maxAttempts: 40,
});

if (result?.run.status === "completed") {
  for (const msg of result.messages) {
    const text = msg.content.find((c) => c.type === "text")?.text?.value ?? "";
    console.log(`[${msg.role}] ${text}`);
  }
}
```

### Stream a Run (SSE)

Receive assistant output token-by-token as it is generated. Each yielded object carries the raw SSE event name and parsed data.

```js
import { createThread, addMessage, streamRun } from "./index.js";

const thread = await createThread(process.env.OPENAI_API_KEY);
await addMessage(process.env.OPENAI_API_KEY, thread.id, "Write a haiku about fog.");

for await (const { event, data } of streamRun(
  process.env.OPENAI_API_KEY,
  thread.id,
  "asst_abc123"
)) {
  if (event === "thread.message.delta") {
    const delta = data.delta?.content?.[0]?.text?.value ?? "";
    process.stdout.write(delta);
  }
  if (event === "thread.run.completed") {
    console.log("\nDone. Usage:", data.usage);
  }
}
```

### Submit Tool Outputs

When a run reaches `requires_action`, call your tools and submit results before polling resumes.

```js
import { createRun, pollRun, submitToolOutputs } from "./index.js";

const run = await createRun(process.env.OPENAI_API_KEY, "thread_xyz789", "asst_abc123");
let result = await pollRun(process.env.OPENAI_API_KEY, "thread_xyz789", run.id);

while (result?.run.status === "requires_action") {
  const toolCalls = result.run.required_action.submit_tool_outputs.tool_calls;

  const toolOutputs = await Promise.all(
    toolCalls.map(async (call) => {
      let output = "{}";
      if (call.function.name === "get_inventory") {
        const args = JSON.parse(call.function.arguments);
        output = JSON.stringify({ sku: args.sku, qty: 42 });
      }
      return { tool_call_id: call.id, output };
    })
  );

  await submitToolOutputs(
    process.env.OPENAI_API_KEY,
    "thread_xyz789",
    result.run.id,
    toolOutputs
  );

  result = await pollRun(process.env.OPENAI_API_KEY, "thread_xyz789", result.run.id);
}

console.log("Final status:", result?.run.status);
```

### Upload a File

Upload a PDF, text file, or any supported format for use with `file_search` or `code_interpreter`.

```js
import { uploadFile } from "./index.js";
import { readFileSync } from "fs";

const buffer = readFileSync("./report.pdf");
const file = await uploadFile(process.env.OPENAI_API_KEY, buffer, "report.pdf");
// { id: "file-abc123", object: "file", filename: "report.pdf", bytes: 204800, purpose: "assistants" }

// Use the returned file ID when creating an assistant or adding a message attachment:
// tools: [{ type: "file_search" }], tool_resources: { file_search: { vector_store_ids: [...] } }
```

### Delete a File

Clean up files that are no longer needed. Detach the file from any assistants before deleting.

```js
import { deleteFile } from "./index.js";

const result = await deleteFile(process.env.OPENAI_API_KEY, "file-abc123");
// { id: "file-abc123", object: "file", deleted: true }
```

## Edge Cases Handled

- **`requires_action` early return** — `pollRun` returns immediately when the run reaches `requires_action` with `messages: null`, so the caller can submit tool outputs without waiting for the full poll timeout
- **Run failure logging** — when a run reaches the `failed` state, `pollRun` logs `last_error.message` before returning so the root cause is visible without inspecting the raw object
- **Poll exhaustion** — if `maxAttempts` is exceeded without a terminal state, `pollRun` returns `null` and logs the run ID; callers can treat `null` as a timeout
- **Multipart/form-data without FormData** — `uploadFile` builds the binary multipart body manually using `TextEncoder` and typed array concatenation, making it compatible with Node.js environments where the global `FormData` may not support `Buffer` inputs
- **Streaming timeout headroom** — `streamRun` uses an 8× extended timeout (120 s) compared to non-streaming calls; uploads use 4× (60 s), preventing premature aborts on large files or long-running runs
- **SSE `[DONE]` sentinel** — the stream reader exits cleanly when it encounters the `data: [DONE]` line; partial lines left in the buffer between chunks are carried forward and not dropped
- **Non-JSON SSE lines** — any `data:` line that is not valid JSON is silently skipped rather than crashing the generator
- **All functions return null on error** — network failures, HTTP error responses, and missing required arguments all produce `null` with a `console.error` log; nothing throws
