# cloudflare-workers-ai

Text generation (streaming), embeddings, Whisper speech-to-text, Stable Diffusion image generation, DistilBERT sentiment classification, BART summarization, and M2M100 translation — all via the Cloudflare Workers AI REST API. Zero dependencies — uses native `fetch` only.

Handles the hard parts: SSE streaming passthrough, binary PNG response handling, per-model timeout tuning, octet-stream audio uploads, and consistent null-on-error returns across every model type.

## Setup

```bash
CF_ACCOUNT_ID=your-cloudflare-account-id   # Found in the Cloudflare dashboard sidebar
CF_AI_TOKEN=your-cloudflare-api-token      # Create at https://dash.cloudflare.com/profile/api-tokens
```

## Usage

### Core Runner (`cfAiRun`)

POST inputs to any Cloudflare Workers AI model by name. Returns the parsed `result` field for standard JSON responses, or the raw `Response` object when `stream: true` so you can consume SSE frames directly.

```js
import { cfAiRun } from "./index.js";

// Non-streaming — returns parsed result object
const result = await cfAiRun(
  process.env.CF_ACCOUNT_ID,
  process.env.CF_AI_TOKEN,
  "@cf/meta/llama-3.1-8b-instruct",
  { messages: [{ role: "user", content: "What is 2 + 2?" }], max_tokens: 64 }
);
console.log(result.response); // "4"

// Streaming — returns raw Response; read body as SSE
const res = await cfAiRun(
  process.env.CF_ACCOUNT_ID,
  process.env.CF_AI_TOKEN,
  "@cf/meta/llama-3.1-8b-instruct",
  { messages: [{ role: "user", content: "Tell me a joke." }], max_tokens: 256 },
  { stream: true }
);

const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(decoder.decode(value));
}
```

### Text Generation (`generateText`)

Generate text using Llama 3.1 8B Instruct with the OpenAI-compatible chat messages interface. Supports optional streaming.

```js
import { generateText } from "./index.js";

// Non-streaming
const result = await generateText(
  process.env.CF_ACCOUNT_ID,
  process.env.CF_AI_TOKEN,
  [
    { role: "system", content: "You are a concise assistant." },
    { role: "user", content: "Explain black holes in two sentences." },
  ],
  { max_tokens: 128, temperature: 0.7 }
);
console.log(result.response); // "Black holes are regions of spacetime..."

// Streaming — returns raw Response; consume SSE frames (data: {"response":"..."}\n\n)
const streamRes = await generateText(
  process.env.CF_ACCOUNT_ID,
  process.env.CF_AI_TOKEN,
  [{ role: "user", content: "Write a haiku about the sea." }],
  { stream: true }
);

const reader = streamRes.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // Each chunk is a Server-Sent Event: parse the JSON after "data: "
  const lines = decoder.decode(value).split("\n").filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const payload = JSON.parse(line.slice(6));
      process.stdout.write(payload.response ?? "");
    }
  }
}
```

### Text Embeddings (`embedText`)

Generate 768-dimensional dense vector embeddings using BGE-base-en-v1.5. Suitable for semantic search, clustering, and RAG pipelines. Batch up to 100 strings per call.

```js
import { embedText } from "./index.js";

const result = await embedText(
  process.env.CF_ACCOUNT_ID,
  process.env.CF_AI_TOKEN,
  ["The quick brown fox", "A fast auburn canine"]
);

// result.data: [{ embedding: number[] }, { embedding: number[] }]
// result.shape: [2, 768]
const [vec1, vec2] = result.data.map((d) => d.embedding);

// Cosine similarity
function cosine(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return dot / (norm(a) * norm(b));
}

console.log(cosine(vec1, vec2)); // ~0.97 — very similar sentences
```

### Speech-to-Text (`transcribeAudio`)

Transcribe audio files using OpenAI Whisper. Accepts raw audio bytes as `Buffer` or `Uint8Array`. Supports MP3, MP4, WAV, FLAC, and OGG. Returns per-word timestamps when available.

```js
import { transcribeAudio } from "./index.js";
import { readFileSync } from "fs";

const audioBuffer = readFileSync("./interview.mp3");

const result = await transcribeAudio(
  process.env.CF_ACCOUNT_ID,
  process.env.CF_AI_TOKEN,
  audioBuffer
);

console.log(result.text);       // "Welcome to the show, today we're talking about..."
console.log(result.word_count); // 42

// Per-word timestamps (when available from the API)
if (result.words) {
  for (const { word, start, end } of result.words) {
    console.log(`${start.toFixed(2)}s – ${end.toFixed(2)}s: ${word}`);
  }
}
```

### Image Generation (`generateImage`)

Generate images from text prompts using Stable Diffusion XL Base 1.0. Returns raw PNG bytes as an `ArrayBuffer` — write to disk or encode as a base64 data URI.

```js
import { generateImage } from "./index.js";
import { writeFileSync } from "fs";

const imageBuffer = await generateImage(
  process.env.CF_ACCOUNT_ID,
  process.env.CF_AI_TOKEN,
  "A serene mountain lake at golden hour, photorealistic",
  {
    num_steps: 30,          // default 20; more steps = higher quality, slower
    guidance: 8.0,          // default 7.5; higher = closer to prompt
    negative_prompt: "blurry, watermark, low quality",
  }
);

// Write to disk
writeFileSync("output.png", Buffer.from(imageBuffer));

// Or serve as a data URI
const dataUri = `data:image/png;base64,${Buffer.from(imageBuffer).toString("base64")}`;
```

### Text Classification (`classifyText`)

Classify text sentiment using DistilBERT fine-tuned on SST-2. Returns labels sorted by confidence score descending, so the first element is always the predicted class.

```js
import { classifyText } from "./index.js";

const labels = await classifyText(
  process.env.CF_ACCOUNT_ID,
  process.env.CF_AI_TOKEN,
  "This product completely exceeded my expectations!"
);

// [{ label: "POSITIVE", score: 0.9998 }, { label: "NEGATIVE", score: 0.0002 }]
console.log(labels[0].label); // "POSITIVE"
console.log(labels[0].score); // 0.9998

// Threshold-based decision
const isPositive = labels[0].label === "POSITIVE" && labels[0].score > 0.9;
```

### Summarization (`summarize`)

Summarize documents using BART-large-CNN abstractive summarization. Best suited for news articles and factual content. Input is capped at approximately 1024 tokens by the model.

```js
import { summarize } from "./index.js";

const article = `Scientists at CERN have announced a major breakthrough in particle physics.
The team, led by Dr. Elena Vasquez, detected evidence of a previously theoretical particle
during experiments conducted over the past three years. The discovery could reshape our
understanding of the Standard Model and open new avenues for research into dark matter...`;

const result = await summarize(
  process.env.CF_ACCOUNT_ID,
  process.env.CF_AI_TOKEN,
  article,
  { max_length: 256 } // default 1024
);

console.log(result.summary); // "CERN scientists have detected evidence of a theoretical particle..."
```

### Translation (`translateText`)

Translate text between 100+ languages using M2M100-1.2B. Supports direct language-pair translation without requiring English as an intermediate step.

```js
import { translateText } from "./index.js";

// English to Japanese
const result = await translateText(
  process.env.CF_ACCOUNT_ID,
  process.env.CF_AI_TOKEN,
  "The future belongs to those who believe in the beauty of their dreams.",
  "en",
  "ja"
);
console.log(result.translated_text); // "未来は自分の夢の美しさを信じる人々のものです。"

// French to Spanish (no English intermediate needed)
const result2 = await translateText(
  process.env.CF_ACCOUNT_ID,
  process.env.CF_AI_TOKEN,
  "Bonjour, comment allez-vous aujourd'hui?",
  "fr",
  "es"
);
console.log(result2.translated_text); // "Hola, ¿cómo está usted hoy?"

// Common language codes: en, fr, de, es, zh, ar, ru, ja, ko, pt, hi, it
```

## Edge Cases Handled

- **API error responses** — non-2xx HTTP responses are caught, the error message from `errors[0].message` is logged, and `null` is returned instead of throwing
- **`success: false` from the API** — even 200 OK responses can carry `success: false`; this is detected and treated as an error with a descriptive log
- **Empty input guards** — `embedText`, `transcribeAudio`, `generateImage`, `classifyText`, `summarize`, and `translateText` all validate their required inputs and return `null` immediately with a clear error message if inputs are missing or wrong-typed
- **Binary image responses** — `generateImage` reads the response body as `ArrayBuffer` directly rather than attempting JSON parsing, since the SDXL endpoint returns raw PNG bytes
- **Audio upload content type** — `transcribeAudio` sends `application/octet-stream` instead of `application/json`, bypassing the shared `jsonHeaders` helper which would cause a rejection from the Whisper endpoint
- **Per-model timeouts** — streaming requests use a 120s timeout; standard requests use 15s; slow operations (Whisper transcription, image generation) use a dedicated 60s timeout via `AbortSignal.timeout`
- **Streaming passthrough** — `generateText` and `cfAiRun` with `stream: true` return the raw `Response` object without buffering, preserving time-to-first-token for relay to clients
- **Missing result fields** — all result shapes use `?? ""` or `?? []` fallbacks so callers always receive a consistent type rather than `undefined`
- **Translation field aliasing** — the M2M100 endpoint may return either `translated_text` or `translation`; both are handled with a fallback chain
- **Summarization field aliasing** — BART may return either `summary` or `generated_text`; both are handled with a fallback chain
- **Network and abort errors** — all `fetch` calls are wrapped in try/catch; any thrown error (including `AbortError` and `TimeoutError`) is logged and converted to a `null` return
