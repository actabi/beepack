// Anthropic Claude Client
// Zero dependencies - uses native fetch.
// Covers streaming messages, tool use with multi-turn loops, extended thinking,
// vision (base64 + URL), system prompt caching, and the Batch API.

const ANTHROPIC_API = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
const TIMEOUT_MS = 15000;
const STREAMING_TIMEOUT_MS = 120000;
const BATCH_TIMEOUT_MS = 30000;

/** @param {string} apiKey */
function baseHeaders(apiKey) {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Streaming messages
// ---------------------------------------------------------------------------

/**
 * Send a message and stream the response, accumulating the full text.
 * Handles both plain text deltas and tool_use block deltas correctly.
 *
 * @param {string} apiKey - Anthropic API key (sk-ant-...)
 * @param {object} params
 * @param {string} params.model - Model ID, e.g. "claude-opus-4-5"
 * @param {Array<{role: string, content: string|Array}>} params.messages - Conversation history
 * @param {string} [params.system] - System prompt (plain string; use sendWithCaching for cache_control)
 * @param {number} [params.maxTokens=1024] - Maximum tokens to generate
 * @param {number} [params.temperature] - Sampling temperature (0–1)
 * @param {function(string): void} [params.onDelta] - Called with each text delta as it arrives
 * @returns {Promise<{text: string, stopReason: string, usage: object}|null>}
 */
export async function streamMessage(apiKey, params) {
  const { model, messages, system, maxTokens = 1024, temperature, onDelta } = params;

  const body = { model, messages, max_tokens: maxTokens, stream: true };
  if (system) body.system = system;
  if (temperature != null) body.temperature = temperature;

  try {
    const res = await fetch(`${ANTHROPIC_API}/messages`, {
      method: "POST",
      headers: baseHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(STREAMING_TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[anthropic-claude] API error ${res.status}:`, err.error?.message || "");
      return null;
    }

    return await consumeMessageStream(res.body, onDelta);
  } catch (err) {
    console.error(`[anthropic-claude] Stream failed: ${err.message}`);
    return null;
  }
}

/**
 * Read an SSE stream from the messages endpoint and accumulate the full response.
 * Correctly accumulates tool_use input JSON across multiple input_json_delta events.
 *
 * @param {ReadableStream} body
 * @param {function(string): void} [onDelta]
 * @returns {Promise<{text: string, stopReason: string, usage: object, toolUse: Array|null}>}
 */
async function consumeMessageStream(body, onDelta) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let text = "";
  let stopReason = "";
  let usage = {};
  // Per-block accumulators keyed by block index
  const blocks = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;

      let evt;
      try {
        evt = JSON.parse(raw);
      } catch {
        continue;
      }

      switch (evt.type) {
        case "content_block_start":
          blocks[evt.index] = { type: evt.content_block.type, text: "", inputJson: "" };
          break;

        case "content_block_delta": {
          const blk = blocks[evt.index];
          if (!blk) break;
          if (evt.delta.type === "text_delta") {
            blk.text += evt.delta.text;
            text += evt.delta.text;
            if (onDelta) onDelta(evt.delta.text);
          } else if (evt.delta.type === "input_json_delta") {
            // tool_use input arrives as partial JSON strings — must concatenate
            blk.inputJson += evt.delta.partial_json;
          }
          break;
        }

        case "content_block_stop":
          // Parse accumulated tool_use JSON once the block is complete
          if (blocks[evt.index]?.type === "tool_use" && blocks[evt.index].inputJson) {
            try {
              blocks[evt.index].input = JSON.parse(blocks[evt.index].inputJson);
            } catch {
              blocks[evt.index].input = {};
            }
          }
          break;

        case "message_delta":
          if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
          if (evt.usage) usage = { ...usage, ...evt.usage };
          break;

        case "message_start":
          if (evt.message?.usage) usage = evt.message.usage;
          break;
      }
    }
  }

  const toolUseBlocks = Object.values(blocks).filter((b) => b.type === "tool_use");
  return {
    text,
    stopReason,
    usage,
    toolUse: toolUseBlocks.length > 0 ? toolUseBlocks : null,
  };
}

// ---------------------------------------------------------------------------
// Tool use with multi-turn loop
// ---------------------------------------------------------------------------

/**
 * Run a multi-turn tool use loop until the model stops calling tools.
 * Handles `stop_reason: "tool_use"` termination correctly.
 *
 * @param {string} apiKey - Anthropic API key
 * @param {object} params
 * @param {string} params.model - Model ID
 * @param {Array<{role: string, content: string|Array}>} params.messages - Initial conversation
 * @param {Array<{name: string, description: string, input_schema: object}>} params.tools - Tool definitions
 * @param {string} [params.system] - System prompt
 * @param {number} [params.maxTokens=1024] - Max tokens per turn
 * @param {number} [params.maxIterations=10] - Safety limit on tool loops
 * @param {function(string, object): Promise<string>} params.onToolCall
 *   Called with (toolName, toolInput), must return the result as a string
 * @returns {Promise<{text: string, messages: Array, iterations: number}|null>}
 */
export async function runToolLoop(apiKey, params) {
  const { model, system, maxTokens = 1024, maxIterations = 10, tools, onToolCall } = params;

  const messages = [...params.messages];
  let iterations = 0;
  let finalText = "";

  while (iterations < maxIterations) {
    iterations++;

    const body = { model, messages, tools, max_tokens: maxTokens };
    if (system) body.system = system;

    let res;
    try {
      res = await fetch(`${ANTHROPIC_API}/messages`, {
        method: "POST",
        headers: baseHeaders(apiKey),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      console.error(`[anthropic-claude] Tool loop request failed: ${err.message}`);
      return null;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[anthropic-claude] Tool loop API error ${res.status}:`, err.error?.message || "");
      return null;
    }

    const data = await res.json();
    const assistantContent = data.content;
    messages.push({ role: "assistant", content: assistantContent });

    // Collect any text from this turn
    for (const block of assistantContent) {
      if (block.type === "text") finalText = block.text;
    }

    // If the model is done using tools, exit the loop
    if (data.stop_reason !== "tool_use") break;

    // Execute each tool_use block and collect results
    const toolResults = [];
    for (const block of assistantContent) {
      if (block.type !== "tool_use") continue;
      let result;
      try {
        result = await onToolCall(block.name, block.input);
      } catch (err) {
        console.error(`[anthropic-claude] Tool "${block.name}" threw: ${err.message}`);
        result = `Error: ${err.message}`;
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: String(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { text: finalText, messages, iterations };
}

// ---------------------------------------------------------------------------
// Extended thinking
// ---------------------------------------------------------------------------

/**
 * Send a message with extended thinking enabled.
 * Thinking tokens are billed separately and do not count toward max_tokens.
 *
 * @param {string} apiKey - Anthropic API key
 * @param {object} params
 * @param {string} params.model - Model that supports thinking (e.g. "claude-opus-4-5")
 * @param {Array<{role: string, content: string|Array}>} params.messages
 * @param {string} [params.system] - System prompt
 * @param {number} [params.budgetTokens=10000] - Max tokens for internal reasoning
 * @param {number} [params.maxTokens=4096] - Max output tokens (must exceed budgetTokens)
 * @returns {Promise<{text: string, thinking: string, usage: object}|null>}
 */
export async function thinkingMessage(apiKey, params) {
  const { model, messages, system, budgetTokens = 10000, maxTokens = 16000 } = params;

  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    thinking: { type: "enabled", budget_tokens: budgetTokens },
  };
  if (system) body.system = system;

  try {
    const res = await fetch(`${ANTHROPIC_API}/messages`, {
      method: "POST",
      headers: baseHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(STREAMING_TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[anthropic-claude] Thinking error ${res.status}:`, err.error?.message || "");
      return null;
    }

    const data = await res.json();
    let text = "";
    let thinking = "";
    for (const block of data.content) {
      if (block.type === "thinking") thinking = block.thinking;
      if (block.type === "text") text = block.text;
    }
    return { text, thinking, usage: data.usage };
  } catch (err) {
    console.error(`[anthropic-claude] Thinking request failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Vision
// ---------------------------------------------------------------------------

/**
 * Send a message that includes one or more images.
 * Supports both URL-referenced images and base64-encoded data.
 *
 * @param {string} apiKey - Anthropic API key
 * @param {object} params
 * @param {string} params.model - Model ID
 * @param {string} params.prompt - Text prompt
 * @param {Array<{type: "url"|"base64", url?: string, data?: string, mediaType?: string}>} params.images
 *   For "url": provide { type: "url", url: "https://..." }
 *   For "base64": provide { type: "base64", data: "<base64>", mediaType: "image/png" }
 * @param {string} [params.system] - System prompt
 * @param {number} [params.maxTokens=1024]
 * @returns {Promise<{text: string, usage: object}|null>}
 */
export async function visionMessage(apiKey, params) {
  const { model, prompt, images, system, maxTokens = 1024 } = params;

  const content = [];

  for (const img of images) {
    if (img.type === "url") {
      content.push({ type: "image", source: { type: "url", url: img.url } });
    } else if (img.type === "base64") {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType || "image/jpeg",
          data: img.data,
        },
      });
    }
  }

  content.push({ type: "text", text: prompt });

  const body = { model, messages: [{ role: "user", content }], max_tokens: maxTokens };
  if (system) body.system = system;

  try {
    const res = await fetch(`${ANTHROPIC_API}/messages`, {
      method: "POST",
      headers: baseHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[anthropic-claude] Vision error ${res.status}:`, err.error?.message || "");
      return null;
    }

    const data = await res.json();
    const text = data.content.find((b) => b.type === "text")?.text || "";
    return { text, usage: data.usage };
  } catch (err) {
    console.error(`[anthropic-claude] Vision request failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompt caching
// ---------------------------------------------------------------------------

/**
 * Send a message with cache_control applied to system and/or message content.
 * Cache breakpoints must be placed on the LAST block that should be cached —
 * earlier content is cached automatically up to that point.
 *
 * @param {string} apiKey - Anthropic API key
 * @param {object} params
 * @param {string} params.model - Model ID
 * @param {Array<{role: string, content: string|Array}>} params.messages
 * @param {string} [params.system] - System prompt to cache
 * @param {boolean} [params.cacheSystem=true] - Apply cache_control to system prompt
 * @param {number} [params.maxTokens=1024]
 * @returns {Promise<{text: string, usage: object, cacheStats: object}|null>}
 *   cacheStats contains cache_creation_input_tokens and cache_read_input_tokens
 */
export async function sendWithCaching(apiKey, params) {
  const { model, messages, system, cacheSystem = true, maxTokens = 1024 } = params;

  const body = { model, messages, max_tokens: maxTokens };

  // System prompt with cache_control — place breakpoint on the last block
  if (system) {
    body.system = cacheSystem
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system;
  }

  try {
    const res = await fetch(`${ANTHROPIC_API}/messages`, {
      method: "POST",
      headers: { ...baseHeaders(apiKey), "anthropic-beta": "prompt-caching-2024-07-31" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[anthropic-claude] Caching error ${res.status}:`, err.error?.message || "");
      return null;
    }

    const data = await res.json();
    const text = data.content.find((b) => b.type === "text")?.text || "";
    const cacheStats = {
      cacheCreationTokens: data.usage?.cache_creation_input_tokens ?? 0,
      cacheReadTokens: data.usage?.cache_read_input_tokens ?? 0,
    };
    return { text, usage: data.usage, cacheStats };
  } catch (err) {
    console.error(`[anthropic-claude] Caching request failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch API
// ---------------------------------------------------------------------------

/**
 * Submit a batch of message requests for asynchronous processing.
 * Batches are processed within 24 hours and cost 50% less than synchronous calls.
 *
 * @param {string} apiKey - Anthropic API key
 * @param {Array<{customId: string, model: string, messages: Array, system?: string, maxTokens?: number}>} requests
 * @returns {Promise<{batchId: string, status: string, requestCounts: object}|null>}
 */
export async function submitBatch(apiKey, requests) {
  const body = {
    requests: requests.map((r) => {
      const params = { model: r.model, messages: r.messages, max_tokens: r.maxTokens || 1024 };
      if (r.system) params.system = r.system;
      return { custom_id: r.customId, params };
    }),
  };

  try {
    const res = await fetch(`${ANTHROPIC_API}/messages/batches`, {
      method: "POST",
      headers: baseHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[anthropic-claude] Batch submit error ${res.status}:`, err.error?.message || "");
      return null;
    }

    const data = await res.json();
    return {
      batchId: data.id,
      status: data.processing_status,
      requestCounts: data.request_counts,
    };
  } catch (err) {
    console.error(`[anthropic-claude] Batch submit failed: ${err.message}`);
    return null;
  }
}

/**
 * Poll the status of a previously submitted batch.
 *
 * @param {string} apiKey - Anthropic API key
 * @param {string} batchId - Batch ID returned from submitBatch
 * @returns {Promise<{batchId: string, status: string, requestCounts: object, resultsUrl: string|null}|null>}
 */
export async function getBatchStatus(apiKey, batchId) {
  try {
    const res = await fetch(`${ANTHROPIC_API}/messages/batches/${batchId}`, {
      headers: baseHeaders(apiKey),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[anthropic-claude] Batch status error ${res.status}`);
      return null;
    }

    const data = await res.json();
    return {
      batchId: data.id,
      status: data.processing_status,
      requestCounts: data.request_counts,
      resultsUrl: data.results_url || null,
    };
  } catch (err) {
    console.error(`[anthropic-claude] Batch status failed: ${err.message}`);
    return null;
  }
}

/**
 * Download and parse batch results once the batch has ended.
 * Results are returned in JSONL format; this function parses them into an array.
 *
 * @param {string} apiKey - Anthropic API key
 * @param {string} batchId - Batch ID
 * @returns {Promise<Array<{customId: string, type: string, message?: object, error?: object}>|null>}
 */
export async function getBatchResults(apiKey, batchId) {
  const status = await getBatchStatus(apiKey, batchId);
  if (!status) return null;

  if (status.status !== "ended") {
    console.error(`[anthropic-claude] Batch ${batchId} is not yet complete (status: ${status.status})`);
    return null;
  }

  if (!status.resultsUrl) {
    console.error(`[anthropic-claude] Batch ${batchId} has no results URL`);
    return null;
  }

  try {
    const res = await fetch(status.resultsUrl, {
      headers: baseHeaders(apiKey),
      signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[anthropic-claude] Batch results fetch error ${res.status}`);
      return null;
    }

    const text = await res.text();
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const r = JSON.parse(line);
        return {
          customId: r.custom_id,
          type: r.result.type,
          message: r.result.type === "succeeded" ? r.result.message : undefined,
          error: r.result.type === "errored" ? r.result.error : undefined,
        };
      });
  } catch (err) {
    console.error(`[anthropic-claude] Batch results parse failed: ${err.message}`);
    return null;
  }
}
