// Cloudflare Workers AI Client
// Zero dependencies — uses native fetch only.
// Supports text generation (streaming), embeddings, Whisper speech-to-text,
// Stable Diffusion image generation, DistilBERT text classification,
// BART summarization, and M2M100 translation.

const TIMEOUT_MS = 15000;
const STREAM_TIMEOUT_MS = 120000;

/**
 * Build the Cloudflare Workers AI REST endpoint URL for a given model.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} model - Full model name, e.g. "@cf/meta/llama-3.1-8b-instruct"
 * @returns {string} Full URL
 */
function buildUrl(accountId, model) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

/**
 * Build standard JSON request headers using the API token.
 *
 * @param {string} token - Cloudflare API token
 * @returns {Record<string, string>}
 */
function jsonHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

/**
 * Core function to POST inputs to any Cloudflare Workers AI model.
 * When stream=true, returns the raw Response object so the caller can consume
 * the SSE body (data: {...}\n\n lines) via response.body ReadableStream.
 * When stream=false (default), returns the parsed JSON `result` field or null.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string} model - Full model identifier (e.g. "@cf/meta/llama-3.1-8b-instruct")
 * @param {object} inputs - Model-specific input payload (will be JSON-encoded)
 * @param {object} [options={}] - Additional options
 * @param {boolean} [options.stream=false] - If true, return raw Response for SSE streaming
 * @returns {Promise<object|Response|null>} Parsed result object, raw Response (stream=true), or null on error
 */
export async function cfAiRun(accountId, token, model, inputs, options = {}) {
  const { stream = false } = options;
  const url = buildUrl(accountId, model);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({ ...inputs, stream: stream || undefined }),
      signal: AbortSignal.timeout(stream ? STREAM_TIMEOUT_MS : TIMEOUT_MS),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error(
        `[cloudflare-workers-ai] API error ${res.status} for model ${model}:`,
        errBody.errors?.[0]?.message || errBody.error || "Unknown error"
      );
      return null;
    }

    if (stream) {
      // Return raw response — caller reads response.body as ReadableStream
      return res;
    }

    const data = await res.json();
    if (!data.success) {
      console.error(
        `[cloudflare-workers-ai] Model ${model} returned success=false:`,
        data.errors?.[0]?.message || "Unknown error"
      );
      return null;
    }
    return data.result;
  } catch (err) {
    console.error(`[cloudflare-workers-ai] Request to ${model} failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Text generation
// ---------------------------------------------------------------------------

/**
 * Generate text using Llama 3.1 8B Instruct via the chat messages interface.
 * Supports streaming — when options.stream=true the raw Response is returned so
 * the caller can iterate SSE frames (data: {"response":"..."}\n\n) from response.body.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {Array<{role: "system"|"user"|"assistant", content: string}>} messages
 *   Conversation history in OpenAI-compatible chat format.
 * @param {object} [options={}]
 * @param {number} [options.max_tokens=512] - Maximum tokens to generate
 * @param {number} [options.temperature] - Sampling temperature (0–2)
 * @param {boolean} [options.stream=false] - If true, return raw Response for SSE consumption
 * @returns {Promise<{response: string}|Response|null>}
 *   {response: string} for non-streaming, raw Response for streaming, or null on error
 */
export async function generateText(accountId, token, messages, options = {}) {
  const { max_tokens = 512, temperature, stream = false } = options;
  const inputs = { messages, max_tokens };
  if (temperature != null) inputs.temperature = temperature;

  const result = await cfAiRun(accountId, token, "@cf/meta/llama-3.1-8b-instruct", inputs, { stream });
  if (stream) return result; // raw Response
  if (!result) return null;
  return { response: result.response ?? "" };
}

// ---------------------------------------------------------------------------
// Text embeddings
// ---------------------------------------------------------------------------

/**
 * Generate dense vector embeddings for an array of text strings using BGE-base-en.
 * The BGE model produces 768-dimensional embeddings suitable for semantic search,
 * clustering, and retrieval-augmented generation (RAG) pipelines.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string[]} texts - Array of strings to embed (batch up to 100 items)
 * @returns {Promise<{data: Array<{embedding: number[]}>, shape: [number, number]}|null>}
 *   data: one embedding object per input text; shape: [n, dims] where dims=768
 */
export async function embedText(accountId, token, texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    console.error("[cloudflare-workers-ai] embedText: texts must be a non-empty array");
    return null;
  }

  const result = await cfAiRun(accountId, token, "@cf/baai/bge-base-en-v1.5", { text: texts });
  if (!result) return null;

  return {
    data: result.data ?? [],
    shape: result.shape ?? [texts.length, 768],
  };
}

// ---------------------------------------------------------------------------
// Speech-to-text (Whisper)
// ---------------------------------------------------------------------------

/**
 * Transcribe audio to text using OpenAI Whisper hosted on Cloudflare Workers AI.
 * Accepts raw audio bytes (Buffer or Uint8Array) and sends them as
 * application/octet-stream. Supports MP3, MP4, WAV, FLAC, and OGG formats.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {Buffer|Uint8Array} audioBuffer - Raw audio file bytes
 * @returns {Promise<{text: string, word_count: number, words?: Array<{word: string, start: number, end: number}>}|null>}
 *   text: full transcription; words: per-word timestamps when available
 */
export async function transcribeAudio(accountId, token, audioBuffer) {
  if (!audioBuffer || audioBuffer.length === 0) {
    console.error("[cloudflare-workers-ai] transcribeAudio: audioBuffer must be non-empty");
    return null;
  }

  const url = buildUrl(accountId, "@cf/openai/whisper");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: audioBuffer,
      signal: AbortSignal.timeout(60000), // transcription can be slow
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error(
        `[cloudflare-workers-ai] Whisper error ${res.status}:`,
        errBody.errors?.[0]?.message || "Unknown error"
      );
      return null;
    }

    const data = await res.json();
    if (!data.success) {
      console.error("[cloudflare-workers-ai] Whisper returned success=false");
      return null;
    }

    const result = data.result;
    return {
      text: result.text ?? "",
      word_count: result.word_count ?? (result.text ?? "").split(/\s+/).filter(Boolean).length,
      words: result.words ?? undefined,
    };
  } catch (err) {
    console.error(`[cloudflare-workers-ai] Whisper request failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------

/**
 * Generate an image from a text prompt using Stable Diffusion XL Base 1.0.
 * The API response body is raw binary PNG data, not JSON.
 * Returns the image as an ArrayBuffer which callers can write to disk or
 * convert to a base64 data URI.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string} prompt - Text description of the desired image
 * @param {object} [options={}]
 * @param {number} [options.num_steps=20] - Diffusion steps (more = higher quality, slower)
 * @param {number} [options.guidance=7.5] - Classifier-free guidance scale
 * @param {string} [options.negative_prompt] - Things to exclude from the image
 * @returns {Promise<ArrayBuffer|null>} Raw PNG bytes as ArrayBuffer, or null on error
 */
export async function generateImage(accountId, token, prompt, options = {}) {
  if (!prompt || typeof prompt !== "string") {
    console.error("[cloudflare-workers-ai] generateImage: prompt must be a non-empty string");
    return null;
  }

  const { num_steps = 20, guidance = 7.5, negative_prompt } = options;
  const inputs = { prompt, num_steps, guidance };
  if (negative_prompt) inputs.negative_prompt = negative_prompt;

  const url = buildUrl(accountId, "@cf/stabilityai/stable-diffusion-xl-base-1.0");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify(inputs),
      signal: AbortSignal.timeout(60000), // image generation can be slow
    });

    if (!res.ok) {
      // Try to read error as text since response may not be JSON
      const errText = await res.text().catch(() => "");
      console.error(`[cloudflare-workers-ai] Image gen error ${res.status}:`, errText.slice(0, 200));
      return null;
    }

    // Response body is raw PNG binary — read as ArrayBuffer directly
    return await res.arrayBuffer();
  } catch (err) {
    console.error(`[cloudflare-workers-ai] Image generation failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Text classification
// ---------------------------------------------------------------------------

/**
 * Classify text sentiment using DistilBERT fine-tuned on SST-2.
 * Returns a ranked list of labels with confidence scores.
 * Suitable for binary positive/negative sentiment classification tasks.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string} text - The text to classify
 * @param {object} [options={}] - Reserved for future model options
 * @returns {Promise<Array<{label: "POSITIVE"|"NEGATIVE", score: number}>|null>}
 *   Sorted by score descending; first element is the predicted class
 */
export async function classifyText(accountId, token, text, options = {}) {
  if (!text || typeof text !== "string") {
    console.error("[cloudflare-workers-ai] classifyText: text must be a non-empty string");
    return null;
  }

  const result = await cfAiRun(accountId, token, "@cf/huggingface/distilbert-sst-2-int8", { text });
  if (!result) return null;

  // Result is an array of [{label, score}] — sort by score desc for convenience
  const labels = Array.isArray(result) ? result : [result];
  return labels.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Summarization
// ---------------------------------------------------------------------------

/**
 * Summarize a long document using BART-large-CNN, a state-of-the-art
 * abstractive summarization model. Best suited for news articles and
 * factual content up to ~1024 tokens of input.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string} text - The document text to summarize
 * @param {object} [options={}]
 * @param {number} [options.max_length=1024] - Maximum tokens in the generated summary
 * @returns {Promise<{summary: string}|null>}
 */
export async function summarize(accountId, token, text, options = {}) {
  if (!text || typeof text !== "string") {
    console.error("[cloudflare-workers-ai] summarize: text must be a non-empty string");
    return null;
  }

  const { max_length = 1024 } = options;
  const result = await cfAiRun(accountId, token, "@cf/facebook/bart-large-cnn", {
    input_text: text,
    max_length,
  });
  if (!result) return null;

  return { summary: result.summary ?? result.generated_text ?? "" };
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

/**
 * Translate text between languages using M2M100-1.2B, a multilingual
 * many-to-many translation model that supports 100+ language pairs without
 * requiring English as an intermediate language.
 *
 * Common language codes: en, fr, de, es, zh, ar, ru, ja, ko, pt, hi, it
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string} text - Source text to translate
 * @param {string} sourceLang - BCP-47 source language code (e.g. "en", "fr", "de")
 * @param {string} targetLang - BCP-47 target language code (e.g. "es", "zh", "ja")
 * @returns {Promise<{translated_text: string}|null>}
 */
export async function translateText(accountId, token, text, sourceLang, targetLang) {
  if (!text || typeof text !== "string") {
    console.error("[cloudflare-workers-ai] translateText: text must be a non-empty string");
    return null;
  }
  if (!sourceLang || !targetLang) {
    console.error("[cloudflare-workers-ai] translateText: sourceLang and targetLang are required");
    return null;
  }

  const result = await cfAiRun(accountId, token, "@cf/meta/m2m100-1.2b", {
    text,
    source_lang: sourceLang,
    target_lang: targetLang,
  });
  if (!result) return null;

  return { translated_text: result.translated_text ?? result.translation ?? "" };
}
