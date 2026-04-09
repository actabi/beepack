# cohere-ai

Zero-dependency wrapper for the [Cohere AI](https://cohere.com/) API. Provides text generation, embeddings, classification, reranking, and chat capabilities.

Wraps: [cohere-ai/cohere-typescript](https://github.com/cohere-ai/cohere-typescript) (170+ stars)

## Setup

Set the `COHERE_API_KEY` environment variable with your API key from <https://dashboard.cohere.com/api-keys>.

```bash
export COHERE_API_KEY="your-api-key"
```

## Functions

### `generate({ prompt, model?, maxTokens?, temperature?, topP?, stopSequences? })`

Generate text completions using Cohere models.

```js
import { generate } from './index.js';

const result = await generate({ prompt: 'Write a haiku about coding' });
console.log(result.text);
```

### `embed({ texts, model?, inputType? })`

Generate vector embeddings for semantic search and similarity.

```js
import { embed } from './index.js';

const result = await embed({ texts: ['Hello world', 'Goodbye world'] });
console.log(result.embeddings.length); // 2
```

### `classify({ inputs, examples, model? })`

Classify text inputs given labeled examples.

```js
import { classify } from './index.js';

const result = await classify({
  inputs: ['I love this product'],
  examples: [
    { text: 'Great quality', label: 'positive' },
    { text: 'Terrible service', label: 'negative' },
  ],
});
console.log(result.classifications[0].prediction);
```

### `rerank({ query, documents, model?, topN? })`

Rerank documents by relevance to a search query.

```js
import { rerank } from './index.js';

const result = await rerank({
  query: 'best programming language',
  documents: ['Python is versatile', 'Rust is fast', 'JavaScript runs everywhere'],
  topN: 2,
});
console.log(result.results);
```

### `chat({ message, model?, chatHistory?, temperature?, preamble? })`

Send a conversational chat message with optional history.

```js
import { chat } from './index.js';

const result = await chat({
  message: 'What is machine learning?',
  preamble: 'You are a helpful AI tutor.',
});
console.log(result.text);
```

## Error Handling

All functions return `null` on failure and log errors to `console.error`. Requests time out after 15 seconds.

## License

MIT
