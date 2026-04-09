# huggingface-inference

Zero-dependency wrapper for the **Hugging Face Inference API**. Run text generation, classification, image classification, feature extraction, and summarization — all with native `fetch`.

## Environment Variables

| Variable | Description |
|---|---|
| `HUGGINGFACE_TOKEN` | Your Hugging Face API token |

## Installation

```bash
bee add huggingface-inference
```

## Usage

```js
import {
  textGeneration,
  textClassification,
  imageClassification,
  featureExtraction,
  summarization,
} from 'huggingface-inference';

// Generate text
const gen = await textGeneration('gpt2', 'The meaning of life is', {
  max_new_tokens: 50,
  temperature: 0.7,
});

// Classify sentiment
const cls = await textClassification(
  'distilbert-base-uncased-finetuned-sst-2-english',
  'I love this product!'
);

// Classify an image
const img = await imageClassification(
  'google/vit-base-patch16-224',
  'https://example.com/photo.jpg'
);

// Extract embeddings
const embeddings = await featureExtraction(
  'sentence-transformers/all-MiniLM-L6-v2',
  'Hello world'
);

// Summarize text
const summary = await summarization('facebook/bart-large-cnn', longArticle, {
  max_length: 130,
});
```

## API

### `textGeneration(model, inputs, parameters?, opts?)` — Generate text from a prompt.
### `textClassification(model, inputs, opts?)` — Classify text into categories.
### `imageClassification(model, imageUrl, opts?)` — Classify an image by URL.
### `featureExtraction(model, inputs, opts?)` — Extract feature embeddings.
### `summarization(model, inputs, parameters?, opts?)` — Summarize text.

All functions return parsed JSON or `null` on failure. Pass `waitForModel: true` in opts to wait for cold-start models.

## License

MIT
