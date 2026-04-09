// OpenAI Assistants API Client
// Zero dependencies - uses native fetch with the OpenAI REST API v1.
// Covers assistant lifecycle, thread/message/run management, SSE streaming,
// tool output submission, and file uploads via multipart/form-data.

const TIMEOUT_MS = 15000;
const BASE_URL = 'https://api.openai.com';

// --- Helpers ---

/**
 * Build standard OpenAI request headers for Assistants API v2.
 * @param {string} apiKey - OpenAI API key (sk-...)
 * @returns {object} Headers object
 */
function buildHeaders(apiKey) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'assistants=v2',
  };
}

/**
 * Execute a fetch request with timeout and unified error handling.
 * Returns null on any error rather than throwing.
 * @param {string} tag - Log prefix for error messages
 * @param {string} url - Full URL to fetch
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<object|null>}
 */
async function apiFetch(tag, url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(
        `[openai-assistants] ${tag} error ${res.status}: ${err?.error?.message || JSON.stringify(err)}`
      );
      return null;
    }

    return res.json();
  } catch (err) {
    console.error(`[openai-assistants] ${tag} failed: ${err.message}`);
    return null;
  }
}

// --- Assistants ---

/**
 * Create a new OpenAI Assistant with the given configuration.
 * Assistants can use tools like code_interpreter, file_search, and function calling.
 *
 * @param {string} apiKey - OpenAI API key
 * @param {object} params - Assistant configuration
 * @param {string} params.model - Model ID, e.g. "gpt-4o" or "gpt-4-turbo"
 * @param {string} [params.name] - Display name for the assistant
 * @param {string} [params.instructions] - System prompt / persona instructions
 * @param {string} [params.description] - Short description of the assistant's purpose
 * @param {Array<object>} [params.tools=[]] - Tool definitions, e.g. [{type:"file_search"}]
 * @param {object} [params.tool_resources] - Resources attached to tools (e.g. vector store IDs)
 * @param {object} [params.metadata={}] - Key-value metadata (max 16 keys, 512-char values)
 * @param {number} [params.temperature] - Sampling temperature (0-2)
 * @param {number} [params.top_p] - Nucleus sampling parameter
 * @returns {Promise<object|null>} Created assistant object or null on error
 */
export async function createAssistant(apiKey, params) {
  const {
    model,
    name,
    instructions,
    description,
    tools = [],
    tool_resources,
    metadata = {},
    temperature,
    top_p,
  } = params;

  if (!model) {
    console.error('[openai-assistants] createAssistant: model is required');
    return null;
  }

  const body = { model, tools, metadata };
  if (name) body.name = name;
  if (instructions) body.instructions = instructions;
  if (description) body.description = description;
  if (tool_resources) body.tool_resources = tool_resources;
  if (temperature !== undefined) body.temperature = temperature;
  if (top_p !== undefined) body.top_p = top_p;

  return apiFetch('createAssistant', `${BASE_URL}/v1/assistants`, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

/**
 * Retrieve an existing assistant by its ID.
 *
 * @param {string} apiKey - OpenAI API key
 * @param {string} assistantId - Assistant ID (asst_...)
 * @returns {Promise<object|null>} Assistant object or null on error
 */
export async function getAssistant(apiKey, assistantId) {
  if (!assistantId) {
    console.error('[openai-assistants] getAssistant: assistantId is required');
    return null;
  }
  return apiFetch('getAssistant', `${BASE_URL}/v1/assistants/${assistantId}`, {
    method: 'GET',
    headers: buildHeaders(apiKey),
  });
}

// --- Threads ---

/**
 * Create a new conversation thread, optionally seeding it with initial messages.
 * Threads hold the conversation history for an assistant run.
 *
 * @param {string} apiKey - OpenAI API key
 * @param {Array<object>} [messages=[]] - Optional initial messages to add to the thread.
 *   Each message: {role: 'user'|'assistant', content: string|Array}
 * @param {object} [metadata={}] - Key-value metadata attached to the thread
 * @returns {Promise<object|null>} Thread object {id, object, created_at, metadata} or null on error
 */
export async function createThread(apiKey, messages = [], metadata = {}) {
  const body = { metadata };
  if (messages.length > 0) body.messages = messages;

  return apiFetch('createThread', `${BASE_URL}/v1/threads`, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

// --- Messages ---

/**
 * Add a message to an existing thread.
 * Call this before creating a run to provide user input.
 *
 * @param {string} apiKey - OpenAI API key
 * @param {string} threadId - Thread ID (thread_...)
 * @param {string|Array} content - Message content string or array of content parts
 * @param {string} [role='user'] - Message role: 'user' or 'assistant'
 * @param {Array<object>} [attachments=[]] - File attachments: [{file_id, tools:[{type}]}]
 * @param {object} [metadata={}] - Key-value metadata for this message
 * @returns {Promise<object|null>} Message object or null on error
 */
export async function addMessage(apiKey, threadId, content, role = 'user', attachments = [], metadata = {}) {
  if (!threadId) {
    console.error('[openai-assistants] addMessage: threadId is required');
    return null;
  }
  if (!content) {
    console.error('[openai-assistants] addMessage: content is required');
    return null;
  }

  const body = { role, content, metadata };
  if (attachments.length > 0) body.attachments = attachments;

  return apiFetch('addMessage', `${BASE_URL}/v1/threads/${threadId}/messages`, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

/**
 * List messages in a thread, with optional pagination and ordering.
 * Messages are returned in reverse-chronological order by default (newest first).
 *
 * @param {string} apiKey - OpenAI API key
 * @param {string} threadId - Thread ID (thread_...)
 * @param {object} [options={}] - Pagination and ordering options
 * @param {number} [options.limit=20] - Number of messages to retrieve (1-100)
 * @param {string} [options.order='desc'] - Sort order: 'asc' or 'desc'
 * @param {string} [options.after] - Cursor: return messages after this message ID
 * @param {string} [options.before] - Cursor: return messages before this message ID
 * @param {string} [options.run_id] - Filter messages created by a specific run
 * @returns {Promise<{data: Array<object>, has_more: boolean, first_id: string, last_id: string}|null>}
 */
export async function listMessages(apiKey, threadId, options = {}) {
  if (!threadId) {
    console.error('[openai-assistants] listMessages: threadId is required');
    return null;
  }

  const { limit = 20, order = 'desc', after, before, run_id } = options;
  const params = new URLSearchParams({ limit: String(limit), order });
  if (after) params.set('after', after);
  if (before) params.set('before', before);
  if (run_id) params.set('run_id', run_id);

  return apiFetch(
    'listMessages',
    `${BASE_URL}/v1/threads/${threadId}/messages?${params}`,
    { method: 'GET', headers: buildHeaders(apiKey) }
  );
}

// --- Runs ---

/**
 * Create a run that executes an assistant on a thread.
 * Poll the run status using pollRun() until it reaches a terminal state.
 *
 * @param {string} apiKey - OpenAI API key
 * @param {string} threadId - Thread ID (thread_...)
 * @param {string} assistantId - Assistant ID (asst_...)
 * @param {object} [options={}] - Run configuration overrides
 * @param {string} [options.instructions] - Override the assistant's system instructions for this run
 * @param {string} [options.model] - Override the assistant's model for this run
 * @param {Array<object>} [options.tools] - Override tools available for this run
 * @param {number} [options.max_prompt_tokens] - Maximum tokens in the prompt context
 * @param {number} [options.max_completion_tokens] - Maximum tokens the model can generate
 * @param {number} [options.temperature] - Sampling temperature override
 * @param {object} [options.metadata={}] - Key-value metadata for this run
 * @returns {Promise<object|null>} Run object {id, status, thread_id, assistant_id, ...} or null on error
 */
export async function createRun(apiKey, threadId, assistantId, options = {}) {
  if (!threadId) {
    console.error('[openai-assistants] createRun: threadId is required');
    return null;
  }
  if (!assistantId) {
    console.error('[openai-assistants] createRun: assistantId is required');
    return null;
  }

  const {
    instructions,
    model,
    tools,
    max_prompt_tokens,
    max_completion_tokens,
    temperature,
    metadata = {},
  } = options;

  const body = { assistant_id: assistantId, metadata };
  if (instructions) body.instructions = instructions;
  if (model) body.model = model;
  if (tools) body.tools = tools;
  if (max_prompt_tokens !== undefined) body.max_prompt_tokens = max_prompt_tokens;
  if (max_completion_tokens !== undefined) body.max_completion_tokens = max_completion_tokens;
  if (temperature !== undefined) body.temperature = temperature;

  return apiFetch('createRun', `${BASE_URL}/v1/threads/${threadId}/runs`, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

/**
 * Poll a run until it reaches a terminal state, then return the run and messages.
 * Terminal states: completed, failed, cancelled, expired, requires_action.
 * On requires_action the run is returned early so the caller can submitToolOutputs().
 *
 * @param {string} apiKey - OpenAI API key
 * @param {string} threadId - Thread ID (thread_...)
 * @param {string} runId - Run ID (run_...)
 * @param {object} [options={}] - Polling configuration
 * @param {number} [options.intervalMs=1000] - Milliseconds between poll attempts
 * @param {number} [options.maxAttempts=60] - Maximum number of poll attempts before giving up
 * @returns {Promise<{run: object, messages: Array<object>|null}|null>}
 *   On completed: {run, messages} where messages is the thread message list.
 *   On requires_action: {run, messages: null} so caller can handle tool calls.
 *   Returns null on fetch error or if maxAttempts exceeded.
 */
export async function pollRun(apiKey, threadId, runId, options = {}) {
  const { intervalMs = 1000, maxAttempts = 60 } = options;

  const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'expired', 'requires_action']);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    const run = await apiFetch(
      'pollRun',
      `${BASE_URL}/v1/threads/${threadId}/runs/${runId}`,
      { method: 'GET', headers: buildHeaders(apiKey) }
    );

    if (!run) return null;

    if (TERMINAL.has(run.status)) {
      if (run.status === 'completed') {
        const messages = await listMessages(apiKey, threadId, { limit: 100, order: 'asc' });
        return { run, messages: messages?.data ?? null };
      }
      // failed, cancelled, expired, requires_action
      if (run.status === 'failed') {
        console.error(
          `[openai-assistants] pollRun: run ${runId} failed - ${run.last_error?.message || 'unknown error'}`
        );
      }
      return { run, messages: null };
    }
  }

  console.error(`[openai-assistants] pollRun: exceeded maxAttempts (${maxAttempts}) for run ${runId}`);
  return null;
}

/**
 * Create a run with server-sent event streaming enabled.
 * Yields parsed SSE event objects as they arrive from the API.
 * Each yielded object has {event: string, data: object}.
 *
 * Notable events: thread.run.created, thread.run.queued, thread.run.in_progress,
 * thread.message.delta, thread.run.completed, thread.run.requires_action,
 * thread.run.failed, thread.run.step.completed
 *
 * @param {string} apiKey - OpenAI API key
 * @param {string} threadId - Thread ID (thread_...)
 * @param {string} assistantId - Assistant ID (asst_...)
 * @param {object} [options={}] - Run configuration (same as createRun options)
 * @yields {{event: string, data: object}} Parsed SSE event objects
 * @returns {AsyncGenerator<{event: string, data: object}>}
 */
export async function* streamRun(apiKey, threadId, assistantId, options = {}) {
  if (!threadId || !assistantId) {
    console.error('[openai-assistants] streamRun: threadId and assistantId are required');
    return;
  }

  const {
    instructions,
    model,
    tools,
    max_prompt_tokens,
    max_completion_tokens,
    temperature,
    metadata = {},
  } = options;

  const body = { assistant_id: assistantId, stream: true, metadata };
  if (instructions) body.instructions = instructions;
  if (model) body.model = model;
  if (tools) body.tools = tools;
  if (max_prompt_tokens !== undefined) body.max_prompt_tokens = max_prompt_tokens;
  if (max_completion_tokens !== undefined) body.max_completion_tokens = max_completion_tokens;
  if (temperature !== undefined) body.temperature = temperature;

  let res;
  try {
    res = await fetch(`${BASE_URL}/v1/threads/${threadId}/runs`, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS * 8), // streaming runs take longer
    });
  } catch (err) {
    console.error(`[openai-assistants] streamRun fetch failed: ${err.message}`);
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(
      `[openai-assistants] streamRun error ${res.status}: ${err?.error?.message || JSON.stringify(err)}`
    );
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          // blank line = end of event; reset event name
          currentEvent = '';
          continue;
        }

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim();
          continue;
        }

        if (trimmed.startsWith('data:')) {
          const raw = trimmed.slice(5).trim();
          if (raw === '[DONE]') return;

          try {
            const data = JSON.parse(raw);
            yield { event: currentEvent || data.object || 'message', data };
          } catch {
            // non-JSON data line; skip
          }
        }
      }
    }
  } catch (err) {
    console.error(`[openai-assistants] streamRun reader error: ${err.message}`);
  } finally {
    reader.cancel().catch(() => {});
  }
}

// --- Tool Outputs ---

/**
 * Submit tool call outputs for a run that is in the requires_action state.
 * After submission the run resumes; continue polling with pollRun() or re-stream.
 *
 * @param {string} apiKey - OpenAI API key
 * @param {string} threadId - Thread ID (thread_...)
 * @param {string} runId - Run ID (run_...) in requires_action state
 * @param {Array<{tool_call_id: string, output: string}>} toolOutputs - Results for each tool call.
 *   tool_call_id matches the id field in required_action.submit_tool_outputs.tool_calls.
 *   output must be a string (JSON-serialize objects before passing).
 * @returns {Promise<object|null>} Updated run object or null on error
 */
export async function submitToolOutputs(apiKey, threadId, runId, toolOutputs) {
  if (!threadId || !runId) {
    console.error('[openai-assistants] submitToolOutputs: threadId and runId are required');
    return null;
  }
  if (!Array.isArray(toolOutputs) || toolOutputs.length === 0) {
    console.error('[openai-assistants] submitToolOutputs: toolOutputs must be a non-empty array');
    return null;
  }

  return apiFetch(
    'submitToolOutputs',
    `${BASE_URL}/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`,
    {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ tool_outputs: toolOutputs }),
    }
  );
}

// --- Files ---

/**
 * Upload a file to OpenAI for use with Assistants (file_search, code_interpreter).
 * Constructs multipart/form-data manually without FormData for broad Node.js compatibility.
 *
 * @param {string} apiKey - OpenAI API key
 * @param {Buffer|Uint8Array} fileBuffer - File contents as a buffer
 * @param {string} filename - Filename including extension, e.g. "report.pdf"
 * @param {string} [purpose='assistants'] - Upload purpose: 'assistants' or 'vision'
 * @returns {Promise<{id: string, object: string, filename: string, purpose: string, bytes: number}|null>}
 *   File object with id (file-...) to attach to assistants/messages, or null on error
 */
export async function uploadFile(apiKey, fileBuffer, filename, purpose = 'assistants') {
  if (!fileBuffer || !filename) {
    console.error('[openai-assistants] uploadFile: fileBuffer and filename are required');
    return null;
  }

  const boundary = `----BeeBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;

  // Build multipart body manually: purpose field + file field
  const purposePart = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="purpose"',
    '',
    purpose,
  ].join('\r\n');

  const filePart = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    'Content-Type: application/octet-stream',
    '',
  ].join('\r\n');

  const closing = `\r\n--${boundary}--`;

  // Encode all text parts to Uint8Array, then concatenate with the binary buffer
  const enc = new TextEncoder();
  const p1 = enc.encode(purposePart + '\r\n\r\n');
  const p2 = enc.encode('\r\n' + filePart);
  const p3 = enc.encode('\r\n');
  const fileBytes = fileBuffer instanceof Uint8Array ? fileBuffer : new Uint8Array(fileBuffer);
  const p4 = enc.encode(closing);

  const totalLength = p1.byteLength + p2.byteLength + p3.byteLength + fileBytes.byteLength + p4.byteLength;
  const bodyBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of [p1, p2, p3, fileBytes, p4]) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const res = await fetch(`${BASE_URL}/v1/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyBytes,
      signal: AbortSignal.timeout(TIMEOUT_MS * 4), // uploads may be slow
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(
        `[openai-assistants] uploadFile error ${res.status}: ${err?.error?.message || JSON.stringify(err)}`
      );
      return null;
    }

    return res.json();
  } catch (err) {
    console.error(`[openai-assistants] uploadFile failed: ${err.message}`);
    return null;
  }
}

/**
 * Delete a previously uploaded file by its file ID.
 * Deleting a file that is still attached to an assistant will fail; detach it first.
 *
 * @param {string} apiKey - OpenAI API key
 * @param {string} fileId - File ID (file-...)
 * @returns {Promise<{id: string, object: string, deleted: boolean}|null>} Deletion confirmation or null on error
 */
export async function deleteFile(apiKey, fileId) {
  if (!fileId) {
    console.error('[openai-assistants] deleteFile: fileId is required');
    return null;
  }
  return apiFetch('deleteFile', `${BASE_URL}/v1/files/${fileId}`, {
    method: 'DELETE',
    headers: buildHeaders(apiKey),
  });
}
