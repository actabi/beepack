# replicate-ai

Zero-dependency wrapper for the [Replicate](https://github.com/replicate/replicate-javascript) AI model inference API. Run machine learning models, check prediction status, and browse the model catalog using native `fetch`.

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `REPLICATE_API_TOKEN` | API token from your Replicate account | Yes |

## Exported Functions

### `runModel(modelVersion, input, wait?)`

Run a model and optionally wait for the result. The `modelVersion` must be in `"owner/model:version"` format.

```js
import { runModel } from './index.js';
const result = await runModel(
  'stability-ai/sdxl:abc123...',
  { prompt: 'a photo of an astronaut riding a horse' }
);
console.log(result.output); // URL to generated image
```

Pass `wait: false` to return immediately with the prediction object (useful for long-running models).

### `getModel(owner, name)`

Retrieve metadata about a model.

```js
import { getModel } from './index.js';
const model = await getModel('stability-ai', 'sdxl');
console.log(model.description);
```

### `getPrediction(predictionId)`

Check the status and output of a prediction.

```js
import { getPrediction } from './index.js';
const pred = await getPrediction('abc123');
console.log(pred.status, pred.output);
```

### `listModels(options?)`

List publicly available models. Supports cursor-based pagination.

```js
import { listModels } from './index.js';
const page = await listModels();
page.results.forEach(m => console.log(m.owner, m.name));
// Fetch next page
const next = await listModels({ cursor: page.next });
```

## Notes

- All fetch calls use `AbortSignal.timeout(15000)` (15 s).
- `runModel` polls every 2 s with a default timeout of 120 s.
- Returns `null` on network failures; throws on invalid arguments.
