// groq-ai — zero-dependency Groq AI inference wrapper (OpenAI-compatible)
// SPDX-License-Identifier: MIT

const BASE_URL = "https://api.groq.com/openai/v1";

/**
 * Build authorization headers for Groq API requests.
 * @param {string} [apiKey] - Groq API key (falls back to env).
 * @returns {{ Authorization: string, "Content-Type": string }}
 */
function headers(apiKey) {
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is required");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Send a chat completion request to Groq.
 * @param {object} options - Completion parameters.
 * @param {Array<{role: string, content: string}>} options.messages - Chat messages.
 * @param {string} [options.model] - Model ID (default "llama3-70b-8192").
 * @param {number} [options.temperature] - Sampling temperature (0-2).
 * @param {number} [options.maxTokens] - Maximum tokens to generate.
 * @param {number} [options.topP] - Top-p nucleus sampling.
 * @param {string} [options.stop] - Stop sequence(s).
 * @param {number} [options.frequencyPenalty] - Frequency penalty (-2 to 2).
 * @param {number} [options.presencePenalty] - Presence penalty (-2 to 2).
 * @param {string} [options.apiKey] - API key override.
 * @returns {Promise<object|null>} Chat completion response or null on failure.
 */
export async function chatCompletion(options = {}) {
  try {
    const {
      messages,
      model = "llama3-70b-8192",
      temperature,
      maxTokens,
      topP,
      stop,
      frequencyPenalty,
      presencePenalty,
      apiKey,
    } = options;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error("Groq chatCompletion: messages array is required");
      return null;
    }

    const body = { model, messages, stream: false };
    if (temperature !== undefined) body.temperature = temperature;
    if (maxTokens !== undefined) body.max_tokens = maxTokens;
    if (topP !== undefined) body.top_p = topP;
    if (stop !== undefined) body.stop = stop;
    if (frequencyPenalty !== undefined) body.frequency_penalty = frequencyPenalty;
    if (presencePenalty !== undefined) body.presence_penalty = presencePenalty;

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Groq chatCompletion error ${res.status}: ${err}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("Groq chatCompletion failed:", err.message);
    return null;
  }
}

/**
 * Stream a chat completion from Groq as an async generator.
 * Yields individual server-sent event data objects. The final chunk
 * contains `choices[0].finish_reason`.
 * @param {object} options - Same parameters as chatCompletion.
 * @param {Array<{role: string, content: string}>} options.messages - Chat messages.
 * @param {string} [options.model] - Model ID (default "llama3-70b-8192").
 * @param {number} [options.temperature] - Sampling temperature.
 * @param {number} [options.maxTokens] - Maximum tokens to generate.
 * @param {string} [options.apiKey] - API key override.
 * @yields {object} Streamed chat completion chunks.
 */
export async function* streamChatCompletion(options = {}) {
  const {
    messages,
    model = "llama3-70b-8192",
    temperature,
    maxTokens,
    topP,
    apiKey,
  } = options;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new Error("Groq streamChatCompletion: messages array is required");
  }

  const body = { model, messages, stream: true };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;
  if (topP !== undefined) body.top_p = topP;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq stream error ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          yield JSON.parse(data);
        } catch {
          // skip malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * List available models on Groq.
 * @param {object} [options] - Optional parameters.
 * @param {string} [options.apiKey] - API key override.
 * @returns {Promise<object|null>} Models list or null on failure.
 */
export async function listModels(options = {}) {
  try {
    const res = await fetch(`${BASE_URL}/models`, {
      method: "GET",
      headers: headers(options.apiKey),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Groq listModels error ${res.status}: ${err}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("Groq listModels failed:", err.message);
    return null;
  }
}
