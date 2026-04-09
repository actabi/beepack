# deepgram-speech

Zero-dependency wrapper for the [Deepgram](https://deepgram.com/) speech-to-text API.
Wraps [deepgram/deepgram-js-sdk](https://github.com/deepgram/deepgram-js-sdk) (256 stars).

## Install

Copy `index.js` into your project or install via beepack:

```bash
beepack add deepgram-speech
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DEEPGRAM_API_KEY` | Yes | Your Deepgram API key |

## Usage

### Transcribe audio from a URL

```js
import { transcribeUrl } from "./index.js";

const result = await transcribeUrl("https://example.com/audio.wav", {
  model: "nova-2",
  punctuate: true,
  language: "en",
});

console.log(result.results.channels[0].alternatives[0].transcript);
```

### Transcribe audio from a buffer

```js
import { readFile } from "node:fs/promises";
import { transcribeBuffer } from "./index.js";

const audio = await readFile("recording.wav");
const result = await transcribeBuffer(audio, {
  mimetype: "audio/wav",
  model: "nova-2",
});

console.log(result.results.channels[0].alternatives[0].transcript);
```

### List available models

```js
import { listModels } from "./index.js";

const models = await listModels();
console.log(models);
```

### Get usage statistics

```js
import { getUsage } from "./index.js";

const usage = await getUsage({
  projectId: "your-project-id",
  startDate: "2025-01-01T00:00:00Z",
  endDate: "2025-01-31T23:59:59Z",
});
console.log(usage);
```

## API

### `transcribeUrl(url, options?)`
Transcribe audio from a public URL. Returns the Deepgram response object or `null` on failure.

### `transcribeBuffer(buffer, options?)`
Transcribe raw audio data (Uint8Array/ArrayBuffer). Returns the Deepgram response object or `null`.

### `listModels(options?)`
List available Deepgram transcription models.

### `getUsage(options?)`
Retrieve usage statistics for a given project. Requires `projectId` in options.

## License

MIT
