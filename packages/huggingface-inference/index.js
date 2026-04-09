// huggingface-inference – zero-dependency Hugging Face Inference API wrapper
// SPDX-License-Identifier: MIT

const DEFAULT_TIMEOUT = 15000;
const API_BASE = 'https://api-inference.huggingface.co/models';

/**
 * Resolve the Hugging Face token from opts or environment.
 * @param {object} opts - Options object.
 * @returns {string} The bearer token.
 */
function getToken(opts) {
  const token = opts.token || process.env.HUGGINGFACE_TOKEN;
  if (!token) throw new Error('HUGGINGFACE_TOKEN is required');
  return token;
}

/**
 * Internal POST helper for inference requests.
 * @param {string} model - Model ID on Hugging Face Hub.
 * @param {object|string} payload - Request payload.
 * @param {object} opts - Auth and config options.
 * @returns {Promise<any|null>} Parsed response or null.
 */
async function infer(model, payload, opts) {
  const token = getToken(opts);
  const url = `${API_BASE}/${model}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (opts.waitForModel) {
    headers['x-wait-for-model'] = 'true';
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(opts.timeout || DEFAULT_TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`HuggingFace API error ${res.status}: ${text}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('HuggingFace request failed:', err.message);
    return null;
  }
}

/**
 * Generate text using a language model.
 * @param {string} model - Model ID (e.g. "gpt2", "mistralai/Mistral-7B-v0.1").
 * @param {string} inputs - Input prompt text.
 * @param {object} [parameters] - Generation parameters (max_new_tokens, temperature, top_p, etc.).
 * @param {object} [opts] - Optional overrides (token, waitForModel, timeout).
 * @returns {Promise<Array<{generated_text: string}>|null>} Generated text array or null.
 */
export async function textGeneration(model, inputs, parameters = {}, opts = {}) {
  if (!model || !inputs) throw new Error('model and inputs are required');
  const payload = { inputs };
  if (Object.keys(parameters).length > 0) {
    payload.parameters = parameters;
  }
  return infer(model, payload, opts);
}

/**
 * Classify text into categories.
 * @param {string} model - Model ID (e.g. "distilbert-base-uncased-finetuned-sst-2-english").
 * @param {string} inputs - Text to classify.
 * @param {object} [opts] - Optional overrides (token, waitForModel, timeout).
 * @returns {Promise<Array<Array<{label: string, score: number}>>|null>} Classification results or null.
 */
export async function textClassification(model, inputs, opts = {}) {
  if (!model || !inputs) throw new Error('model and inputs are required');
  return infer(model, { inputs }, opts);
}

/**
 * Classify an image by URL or base64 data.
 * @param {string} model - Model ID (e.g. "google/vit-base-patch16-224").
 * @param {string} imageUrl - URL of the image to classify.
 * @param {object} [opts] - Optional overrides (token, waitForModel, timeout).
 * @returns {Promise<Array<{label: string, score: number}>|null>} Classification results or null.
 */
export async function imageClassification(model, imageUrl, opts = {}) {
  if (!model || !imageUrl) throw new Error('model and imageUrl are required');
  const token = getToken(opts);

  try {
    // Fetch the image and send raw bytes
    const imgRes = await fetch(imageUrl, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });
    if (!imgRes.ok) {
      console.error(`Failed to fetch image: ${imgRes.status}`);
      return null;
    }
    const imgBuffer = await imgRes.arrayBuffer();

    const res = await fetch(`${API_BASE}/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        ...(opts.waitForModel ? { 'x-wait-for-model': 'true' } : {}),
      },
      body: imgBuffer,
      signal: AbortSignal.timeout(opts.timeout || DEFAULT_TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`HuggingFace API error ${res.status}: ${text}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('HuggingFace image classification failed:', err.message);
    return null;
  }
}

/**
 * Extract feature embeddings from text.
 * @param {string} model - Model ID (e.g. "sentence-transformers/all-MiniLM-L6-v2").
 * @param {string|string[]} inputs - Text or array of texts to embed.
 * @param {object} [opts] - Optional overrides (token, waitForModel, timeout).
 * @returns {Promise<number[][]|null>} Embedding vectors or null.
 */
export async function featureExtraction(model, inputs, opts = {}) {
  if (!model || !inputs) throw new Error('model and inputs are required');
  return infer(model, { inputs }, opts);
}

/**
 * Summarize a text passage.
 * @param {string} model - Model ID (e.g. "facebook/bart-large-cnn").
 * @param {string} inputs - Text to summarize.
 * @param {object} [parameters] - Summarization parameters (max_length, min_length, etc.).
 * @param {object} [opts] - Optional overrides (token, waitForModel, timeout).
 * @returns {Promise<Array<{summary_text: string}>|null>} Summary results or null.
 */
export async function summarization(model, inputs, parameters = {}, opts = {}) {
  if (!model || !inputs) throw new Error('model and inputs are required');
  const payload = { inputs };
  if (Object.keys(parameters).length > 0) {
    payload.parameters = parameters;
  }
  return infer(model, payload, opts);
}
