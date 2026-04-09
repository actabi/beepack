# groq-ai

Zero-dependency wrapper for the [Groq](https://groq.com/) AI inference API (OpenAI-compatible).
Wraps [groq/groq-typescript](https://github.com/groq/groq-typescript) (248 stars).

## Install

```bash
beepack add groq-ai
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Your Groq API key |

## Usage

### Chat completion

```js
import { chatCompletion } from "./index.js";

const result = await chatCompletion({
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Explain quantum computing in one sentence." },
  ],
  model: "llama3-70b-8192",
  temperature: 0.7,
});

console.log(result.choices[0].message.content);
```

### Streaming chat completion

```js
import { streamChatCompletion } from "./index.js";

for await (const chunk of streamChatCompletion({
  messages: [{ role: "user", content: "Write a haiku about code." }],
  model: "mixtral-8x7b-32768",
})) {
  const delta = chunk.choices?.[0]?.delta?.content;
  if (delta) process.stdout.write(delta);
}
```

### List models

```js
import { listModels } from "./index.js";

const models = await listModels();
for (const m of models.data) {
  console.log(m.id, m.owned_by);
}
```

## Available Models

- `llama3-70b-8192` — Meta Llama 3 70B
- `llama3-8b-8192` — Meta Llama 3 8B
- `mixtral-8x7b-32768` — Mistral Mixtral 8x7B
- `gemma-7b-it` — Google Gemma 7B

## API

### `chatCompletion(options)`
Send a non-streaming chat completion request. Returns the full response or `null` on failure.

### `streamChatCompletion(options)`
Async generator that yields streamed completion chunks. Throws on HTTP errors.

### `listModels(options?)`
List all available models on Groq.

## License

MIT
