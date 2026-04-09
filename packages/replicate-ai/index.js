// replicate-ai – zero-dependency Replicate AI API wrapper
// https://github.com/replicate/replicate-javascript

const API_BASE = 'https://api.replicate.com/v1';
const TOKEN = process.env.REPLICATE_API_TOKEN;

/**
 * Build default headers for Replicate API requests.
 * @returns {Record<string, string>}
 */
function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TOKEN}`,
  };
}

/**
 * Internal helper – make a request to the Replicate API.
 * @param {string} path - API path (relative to base)
 * @param {object} [opts] - fetch options
 * @returns {Promise<any|null>}
 */
async function request(path, opts = {}) {
  if (!TOKEN) {
    throw new Error('REPLICATE_API_TOKEN must be set');
  }
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      ...opts,
      headers: { ...headers(), ...opts.headers },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Replicate ${res.status}: ${body}`);
    }
    return await res.json();
  } catch (err) {
    if (err.message?.startsWith('Replicate')) throw err;
    console.error('[replicate-ai]', err.message);
    return null;
  }
}

/**
 * Wait for a prediction to reach a terminal state by polling.
 * @param {string} predictionId - The prediction ID to poll
 * @param {number} [maxWaitMs=120000] - Maximum time to wait in milliseconds
 * @returns {Promise<object|null>} The completed prediction or null on timeout
 */
async function pollPrediction(predictionId, maxWaitMs = 120000) {
  const start = Date.now();
  const interval = 2000;
  while (Date.now() - start < maxWaitMs) {
    const prediction = await request(`/predictions/${predictionId}`);
    if (!prediction) return null;
    if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
      return prediction;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return null;
}

/**
 * Run a model on Replicate and optionally wait for the result.
 * @param {string} modelVersion - Full model version string (e.g. "owner/model:version")
 * @param {object} input - Input parameters for the model
 * @param {boolean} [wait=true] - Whether to poll until the prediction completes
 * @returns {Promise<{id: string, status: string, output: any, input: object}|null>}
 */
export async function runModel(modelVersion, input, wait = true) {
  if (!modelVersion || !input) {
    throw new Error('modelVersion and input are required');
  }
  const [modelPath, version] = modelVersion.split(':');
  if (!modelPath || !version) {
    throw new Error('modelVersion must be in "owner/model:version" format');
  }
  const prediction = await request('/predictions', {
    method: 'POST',
    body: JSON.stringify({ version, input }),
  });
  if (!prediction) return null;
  if (wait) {
    return pollPrediction(prediction.id);
  }
  return prediction;
}

/**
 * Get information about a model.
 * @param {string} owner - Model owner (e.g. "stability-ai")
 * @param {string} name - Model name (e.g. "sdxl")
 * @returns {Promise<{url: string, owner: string, name: string, description: string, latest_version: object}|null>}
 */
export async function getModel(owner, name) {
  if (!owner || !name) {
    throw new Error('owner and name are required');
  }
  return request(`/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
}

/**
 * Get the current state of a prediction.
 * @param {string} predictionId - The prediction ID
 * @returns {Promise<{id: string, status: string, output: any, error: string|null}|null>}
 */
export async function getPrediction(predictionId) {
  if (!predictionId) {
    throw new Error('predictionId is required');
  }
  return request(`/predictions/${encodeURIComponent(predictionId)}`);
}

/**
 * List publicly available models on Replicate.
 * @param {object} [options] - Listing options
 * @param {string} [options.cursor] - Pagination cursor from a previous response
 * @returns {Promise<{results: object[], next: string|null}|null>}
 */
export async function listModels(options = {}) {
  const params = new URLSearchParams();
  if (options.cursor) params.set('cursor', options.cursor);
  const qs = params.toString();
  return request(`/models${qs ? `?${qs}` : ''}`);
}
