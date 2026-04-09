// @ts-check

const BASE_URL = 'https://api.cohere.ai/v1';

/**
 * Returns authorization headers for Cohere API requests.
 * @returns {{ Authorization: string; 'Content-Type': string }}
 */
function headers() {
  const key = process.env.COHERE_API_KEY;
  if (!key) throw new Error('COHERE_API_KEY environment variable is not set');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Makes a POST request to the Cohere API.
 * @param {string} path - API endpoint path
 * @param {Record<string, unknown>} body - Request body
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function post(path, body) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Cohere API error ${res.status}: ${text}`);
      return null;
    }
    return /** @type {Record<string, unknown>} */ (await res.json());
  } catch (err) {
    console.error('Cohere request failed:', err.message);
    return null;
  }
}

/**
 * Generate text using Cohere's generation endpoint.
 * @param {object} options
 * @param {string} options.prompt - The prompt to generate text from
 * @param {string} [options.model='command'] - Model to use
 * @param {number} [options.maxTokens=300] - Maximum number of tokens to generate
 * @param {number} [options.temperature=0.7] - Sampling temperature (0-5)
 * @param {number} [options.topP=1] - Nucleus sampling parameter
 * @param {string[]} [options.stopSequences] - Stop sequences
 * @returns {Promise<{ text: string; likelihood: number | null } | null>}
 */
export async function generate({
  prompt,
  model = 'command',
  maxTokens = 300,
  temperature = 0.7,
  topP = 1,
  stopSequences,
}) {
  const body = {
    prompt,
    model,
    max_tokens: maxTokens,
    temperature,
    p: topP,
  };
  if (stopSequences) body.stop_sequences = stopSequences;

  const data = await post('/generate', body);
  if (!data || !Array.isArray(data.generations) || data.generations.length === 0) return null;

  const gen = data.generations[0];
  return {
    text: gen.text ?? '',
    likelihood: gen.likelihood ?? null,
  };
}

/**
 * Generate embeddings for a list of texts.
 * @param {object} options
 * @param {string[]} options.texts - Texts to embed
 * @param {string} [options.model='embed-english-v3.0'] - Embedding model
 * @param {string} [options.inputType='search_document'] - Input type hint
 * @returns {Promise<{ embeddings: number[][]; meta: Record<string, unknown> } | null>}
 */
export async function embed({
  texts,
  model = 'embed-english-v3.0',
  inputType = 'search_document',
}) {
  const data = await post('/embed', {
    texts,
    model,
    input_type: inputType,
  });
  if (!data || !Array.isArray(data.embeddings)) return null;

  return {
    embeddings: data.embeddings,
    meta: /** @type {Record<string, unknown>} */ (data.meta ?? {}),
  };
}

/**
 * Classify text inputs using labeled examples.
 * @param {object} options
 * @param {string[]} options.inputs - Texts to classify
 * @param {{ text: string; label: string }[]} options.examples - Labeled examples
 * @param {string} [options.model='embed-english-v3.0'] - Model to use
 * @returns {Promise<{ classifications: { input: string; prediction: string; confidence: number }[] } | null>}
 */
export async function classify({ inputs, examples, model = 'embed-english-v3.0' }) {
  const data = await post('/classify', {
    inputs,
    examples,
    model,
  });
  if (!data || !Array.isArray(data.classifications)) return null;

  return {
    classifications: data.classifications.map((c) => ({
      input: c.input ?? '',
      prediction: c.prediction ?? '',
      confidence: c.confidence ?? 0,
    })),
  };
}

/**
 * Rerank documents by relevance to a query.
 * @param {object} options
 * @param {string} options.query - The search query
 * @param {string[]} options.documents - Documents to rerank
 * @param {string} [options.model='rerank-english-v3.0'] - Rerank model
 * @param {number} [options.topN] - Number of top results to return
 * @returns {Promise<{ results: { index: number; relevanceScore: number }[] } | null>}
 */
export async function rerank({ query, documents, model = 'rerank-english-v3.0', topN }) {
  const body = { query, documents, model };
  if (topN != null) body.top_n = topN;

  const data = await post('/rerank', body);
  if (!data || !Array.isArray(data.results)) return null;

  return {
    results: data.results.map((r) => ({
      index: r.index,
      relevanceScore: r.relevance_score ?? 0,
    })),
  };
}

/**
 * Send a chat message to Cohere's chat endpoint.
 * @param {object} options
 * @param {string} options.message - The user's message
 * @param {string} [options.model='command'] - Model to use
 * @param {{ role: string; message: string }[]} [options.chatHistory] - Previous conversation turns
 * @param {number} [options.temperature=0.7] - Sampling temperature
 * @param {string} [options.preamble] - System preamble / instruction
 * @returns {Promise<{ text: string; chatHistory: { role: string; message: string }[] } | null>}
 */
export async function chat({
  message,
  model = 'command',
  chatHistory,
  temperature = 0.7,
  preamble,
}) {
  const body = {
    message,
    model,
    temperature,
  };
  if (chatHistory) body.chat_history = chatHistory;
  if (preamble) body.preamble = preamble;

  const data = await post('/chat', body);
  if (!data) return null;

  return {
    text: /** @type {string} */ (data.text ?? ''),
    chatHistory: /** @type {{ role: string; message: string }[]} */ (data.chat_history ?? []),
  };
}
