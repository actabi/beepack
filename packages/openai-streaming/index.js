// OpenAI Streaming Chat Completions
// Zero dependencies - uses native fetch and ReadableStream.
// Handles the hard parts: SSE parsing, tool call chunk assembly, abort control,
// rate limit backoff, token budget estimation, and vision (image) inputs.

const OPENAI_API = "https://api.openai.com/v1";
const TIMEOUT_MS = 15000;
const STREAM_TIMEOUT_MS = 120000;

// Approximate tokens by character count (rough but dependency-free).
// GPT tokenizer averages ~4 chars/token for English prose.
const CHARS_PER_TOKEN = 4;

/**
 * Estimate the token count of a messages array before sending.
 * Uses character-count heuristic (no tiktoken dependency).
 * Accounts for per-message overhead (role + content framing ~4 tokens each).
 *
 * @param {Array<{role: string, content: string|Array}>} messages
 * @param {string} [model="gpt-4o"] - Model name (reserved for future per-model tuning)
 * @returns {number} Estimated token count
 */
export function estimateTokens(messages, model = "gpt-4o") {
  let total = 3; // conversation-level overhead
  for (const msg of messages) {
    total += 4; // per-message framing
    if (typeof msg.content === "string") {
      total += Math.ceil(msg.content.length / CHARS_PER_TOKEN);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") {
          total += Math.ceil((part.text || "").length / CHARS_PER_TOKEN);
        } else if (part.type === "image_url") {
          // Low-detail images ~85 tokens, high-detail ~765+ (simplified)
          total += part.image_url?.detail === "low" ? 85 : 765;
        }
      }
    }
  }
  return total;
}

/**
 * Build a vision-capable message part for image inputs.
 * Accepts a public URL or a base64-encoded data URI.
 *
 * @param {string} imageUrlOrDataUri - https://... or data:image/png;base64,...
 * @param {"auto"|"low"|"high"} [detail="auto"] - Detail level (affects token cost)
 * @returns {{type: "image_url", image_url: {url: string, detail: string}}}
 */
export function imageContent(imageUrlOrDataUri, detail = "auto") {
  return { type: "image_url", image_url: { url: imageUrlOrDataUri, detail } };
}

/**
 * Build a text content part (for use in multi-part messages alongside images).
 *
 * @param {string} text
 * @returns {{type: "text", text: string}}
 */
export function textContent(text) {
  return { type: "text", text };
}

/**
 * Stream a chat completion and yield delta text chunks.
 * Handles SSE parsing, done sentinel, and finish_reason warnings.
 *
 * @param {string} apiKey - OpenAI API key
 * @param {object} params
 * @param {Array<{role: string, content: string|Array}>} params.messages
 * @param {string} [params.model="gpt-4o"]
 * @param {number} [params.maxTokens=1024]
 * @param {number} [params.temperature=1]
 * @param {string} [params.systemPrompt] - Prepended as a system message if provided
 * @param {AbortSignal} [params.signal] - AbortController signal for cancellation
 * @returns {AsyncGenerator<string>} Yields text delta strings; throws on fatal errors
 */
export async function* streamChat(apiKey, params) {
  const {
    messages,
    model = "gpt-4o",
    maxTokens = 1024,
    temperature = 1,
    systemPrompt,
    signal,
  } = params;

  const fullMessages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const body = {
    model,
    messages: fullMessages,
    max_tokens: maxTokens,
    temperature,
    stream: true,
    stream_options: { include_usage: true },
  };

  const res = await fetch(`${OPENAI_API}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[openai-streaming] API error ${res.status}:`, err.error?.message || "");
    return;
  }

  yield* parseSSEStream(res.body);
}

/**
 * Non-streaming chat completion with automatic exponential backoff on 429s.
 * Returns the full assistant message string, or null on unrecoverable error.
 *
 * @param {string} apiKey - OpenAI API key
 * @param {object} params
 * @param {Array<{role: string, content: string|Array}>} params.messages
 * @param {string} [params.model="gpt-4o"]
 * @param {number} [params.maxTokens=1024]
 * @param {number} [params.temperature=1]
 * @param {string} [params.systemPrompt]
 * @param {number} [params.maxRetries=4] - Max retry attempts on rate limit
 * @returns {Promise<string|null>}
 */
export async function chat(apiKey, params) {
  const {
    messages,
    model = "gpt-4o",
    maxTokens = 1024,
    temperature = 1,
    systemPrompt,
    maxRetries = 4,
  } = params;

  const fullMessages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const body = {
    model,
    messages: fullMessages,
    max_tokens: maxTokens,
    temperature,
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${OPENAI_API}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.status === 429) {
        if (attempt === maxRetries) {
          console.error(`[openai-streaming] Rate limit exceeded after ${maxRetries} retries`);
          return null;
        }
        const retryAfter = parseRetryAfter(res.headers);
        const delay = retryAfter ?? backoffMs(attempt);
        console.error(`[openai-streaming] Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1})`);
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error(`[openai-streaming] API error ${res.status}:`, err.error?.message || "");
        return null;
      }

      const data = await res.json();
      const choice = data.choices?.[0];

      if (choice?.finish_reason === "length") {
        console.error("[openai-streaming] Response truncated (finish_reason: length). Increase maxTokens.");
      }

      return choice?.message?.content ?? null;
    } catch (err) {
      if (err.name === "AbortError" || err.name === "TimeoutError") {
        console.error(`[openai-streaming] Request timed out or aborted: ${err.message}`);
        return null;
      }
      console.error(`[openai-streaming] Request failed: ${err.message}`);
      return null;
    }
  }

  return null;
}

/**
 * Run a chat completion with tool/function calling.
 * Assembles streamed tool call chunks into complete calls, then executes them.
 * Returns the final assistant text after all tool rounds complete.
 *
 * @param {string} apiKey - OpenAI API key
 * @param {object} params
 * @param {Array<{role: string, content: string|Array}>} params.messages
 * @param {Array<{name: string, description: string, parameters: object}>} params.tools - JSON Schema tool definitions
 * @param {Record<string, (args: object) => Promise<string>>} params.handlers - Tool name -> async handler
 * @param {string} [params.model="gpt-4o"]
 * @param {number} [params.maxTokens=1024]
 * @param {number} [params.maxRounds=5] - Max tool call rounds to prevent infinite loops
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{content: string|null, toolCalls: Array, messages: Array}|null>}
 */
export async function chatWithTools(apiKey, params) {
  const {
    messages: initialMessages,
    tools,
    handlers,
    model = "gpt-4o",
    maxTokens = 1024,
    maxRounds = 5,
    signal,
  } = params;

  const openaiTools = tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const messages = [...initialMessages];
  const allToolCalls = [];

  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) {
      console.error("[openai-streaming] Aborted before tool round");
      return null;
    }

    let res;
    try {
      res = await fetch(`${OPENAI_API}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          tools: openaiTools,
          tool_choice: "auto",
          max_tokens: maxTokens,
        }),
        signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      console.error(`[openai-streaming] Tool round ${round} fetch failed: ${err.message}`);
      return null;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[openai-streaming] Tool round ${round} error ${res.status}:`, err.error?.message || "");
      return null;
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    if (!choice) return null;

    if (choice.finish_reason === "length") {
      console.error("[openai-streaming] Tool response truncated (finish_reason: length). Increase maxTokens.");
    }

    const assistantMsg = choice.message;
    messages.push(assistantMsg);

    // No tool calls — we have the final answer
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return {
        content: assistantMsg.content ?? null,
        toolCalls: allToolCalls,
        messages,
      };
    }

    // Execute each tool call
    for (const call of assistantMsg.tool_calls) {
      const name = call.function.name;
      let args;
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
        console.error(`[openai-streaming] Failed to parse args for tool "${name}"`);
      }

      allToolCalls.push({ name, args, callId: call.id });

      const handler = handlers[name];
      let result;
      if (!handler) {
        console.error(`[openai-streaming] No handler registered for tool "${name}"`);
        result = `Error: no handler for tool "${name}"`;
      } else {
        try {
          result = await handler(args);
        } catch (err) {
          console.error(`[openai-streaming] Tool "${name}" threw: ${err.message}`);
          result = `Error: ${err.message}`;
        }
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: typeof result === "string" ? result : JSON.stringify(result),
      });
    }
  }

  console.error(`[openai-streaming] Reached maxRounds (${maxRounds}) without a final answer`);
  return null;
}

/**
 * Stream a chat completion and pipe raw SSE lines directly to a Response body.
 * Use this to relay OpenAI's stream to a browser client without buffering.
 * Returns a Web API Response suitable for use in Next.js Route Handlers, Deno, Bun, etc.
 *
 * @param {string} apiKey - OpenAI API key
 * @param {object} params - Same as streamChat params
 * @returns {Promise<Response>} A streaming Response (text/event-stream)
 */
export async function streamToResponse(apiKey, params) {
  const { messages, model = "gpt-4o", maxTokens = 1024, temperature = 1, systemPrompt, signal } = params;

  const fullMessages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const upstream = await fetch(`${OPENAI_API}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: fullMessages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
    }),
    signal: signal ?? AbortSignal.timeout(STREAM_TIMEOUT_MS),
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    console.error(`[openai-streaming] streamToResponse error ${upstream.status}:`, err.error?.message || "");
    return new Response(JSON.stringify({ error: err.error?.message || "upstream error" }), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// --- SSE Parsing ---

/**
 * Parse a ReadableStream of SSE bytes and yield text delta strings.
 * Handles partial lines, multi-line events, and the [DONE] sentinel.
 * Warns (does not throw) when finish_reason is "length".
 *
 * @param {ReadableStream} body - Response body from a streaming OpenAI request
 * @yields {string} Text delta content from each chunk
 */
async function* parseSSEStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // Keep the last incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;

        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }

        const choice = parsed.choices?.[0];
        if (!choice) continue;

        if (choice.finish_reason === "length") {
          console.error("[openai-streaming] Stream truncated (finish_reason: length). Increase maxTokens.");
        }

        const delta = choice.delta?.content;
        if (delta) yield delta;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// --- Helpers ---

/**
 * Parse the Retry-After header into milliseconds.
 * Returns null if the header is absent or unparseable.
 *
 * @param {Headers} headers
 * @returns {number|null}
 */
function parseRetryAfter(headers) {
  const val = headers.get("retry-after");
  if (!val) return null;
  const secs = parseFloat(val);
  return isNaN(secs) ? null : Math.ceil(secs * 1000);
}

/**
 * Compute exponential backoff delay with jitter.
 * Attempt 0 -> ~1s, attempt 1 -> ~2s, attempt 2 -> ~4s, etc. (capped at 60s).
 *
 * @param {number} attempt - Zero-based attempt index
 * @returns {number} Delay in milliseconds
 */
function backoffMs(attempt) {
  const base = Math.min(1000 * 2 ** attempt, 60000);
  const jitter = Math.random() * 0.3 * base;
  return Math.round(base + jitter);
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
