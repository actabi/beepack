// deepgram-speech — zero-dependency Deepgram speech-to-text wrapper
// SPDX-License-Identifier: MIT

const BASE_URL = "https://api.deepgram.com/v1";

/**
 * Build common headers for Deepgram API requests.
 * @param {string} [apiKey] - Deepgram API key (falls back to env).
 * @returns {{ Authorization: string }}
 */
function headers(apiKey) {
  const key = apiKey || process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY is required");
  return { Authorization: `Token ${key}` };
}

/**
 * Transcribe audio from a publicly-accessible URL.
 * @param {string} url - Public URL of the audio file.
 * @param {object} [options] - Optional parameters.
 * @param {string} [options.model] - Deepgram model to use (e.g. "nova-2").
 * @param {string} [options.language] - Language code (e.g. "en").
 * @param {boolean} [options.punctuate] - Enable punctuation.
 * @param {boolean} [options.diarize] - Enable speaker diarization.
 * @param {boolean} [options.smartFormat] - Enable smart formatting.
 * @param {string} [options.apiKey] - Deepgram API key override.
 * @returns {Promise<object|null>} Transcription result or null on failure.
 */
export async function transcribeUrl(url, options = {}) {
  try {
    const { model, language, punctuate, diarize, smartFormat, apiKey } = options;
    const params = new URLSearchParams();
    if (model) params.set("model", model);
    if (language) params.set("language", language);
    if (punctuate !== undefined) params.set("punctuate", String(punctuate));
    if (diarize !== undefined) params.set("diarize", String(diarize));
    if (smartFormat !== undefined) params.set("smart_format", String(smartFormat));

    const qs = params.toString();
    const endpoint = `${BASE_URL}/listen${qs ? `?${qs}` : ""}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...headers(apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Deepgram transcribeUrl error ${res.status}: ${err}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("Deepgram transcribeUrl failed:", err.message);
    return null;
  }
}

/**
 * Transcribe audio from a raw buffer (Uint8Array or ArrayBuffer).
 * @param {Uint8Array|ArrayBuffer} buffer - Raw audio data.
 * @param {object} [options] - Optional parameters.
 * @param {string} [options.mimetype] - Audio MIME type (default "audio/wav").
 * @param {string} [options.model] - Deepgram model to use.
 * @param {string} [options.language] - Language code.
 * @param {boolean} [options.punctuate] - Enable punctuation.
 * @param {boolean} [options.diarize] - Enable speaker diarization.
 * @param {string} [options.apiKey] - Deepgram API key override.
 * @returns {Promise<object|null>} Transcription result or null on failure.
 */
export async function transcribeBuffer(buffer, options = {}) {
  try {
    const { mimetype = "audio/wav", model, language, punctuate, diarize, apiKey } = options;
    const params = new URLSearchParams();
    if (model) params.set("model", model);
    if (language) params.set("language", language);
    if (punctuate !== undefined) params.set("punctuate", String(punctuate));
    if (diarize !== undefined) params.set("diarize", String(diarize));

    const qs = params.toString();
    const endpoint = `${BASE_URL}/listen${qs ? `?${qs}` : ""}`;

    const body = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...headers(apiKey),
        "Content-Type": mimetype,
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Deepgram transcribeBuffer error ${res.status}: ${err}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("Deepgram transcribeBuffer failed:", err.message);
    return null;
  }
}

/**
 * List available Deepgram models.
 * @param {object} [options] - Optional parameters.
 * @param {string} [options.apiKey] - Deepgram API key override.
 * @returns {Promise<object|null>} Models listing or null on failure.
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
      console.error(`Deepgram listModels error ${res.status}: ${err}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("Deepgram listModels failed:", err.message);
    return null;
  }
}

/**
 * Get usage statistics for your Deepgram project.
 * @param {object} [options] - Optional parameters.
 * @param {string} [options.projectId] - Deepgram project ID (required).
 * @param {string} [options.startDate] - Start date in ISO 8601 format.
 * @param {string} [options.endDate] - End date in ISO 8601 format.
 * @param {string} [options.apiKey] - Deepgram API key override.
 * @returns {Promise<object|null>} Usage data or null on failure.
 */
export async function getUsage(options = {}) {
  try {
    const { projectId, startDate, endDate, apiKey } = options;
    if (!projectId) {
      console.error("Deepgram getUsage: projectId is required");
      return null;
    }

    const params = new URLSearchParams();
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);

    const qs = params.toString();
    const endpoint = `https://api.deepgram.com/v1/projects/${encodeURIComponent(projectId)}/usage${qs ? `?${qs}` : ""}`;

    const res = await fetch(endpoint, {
      method: "GET",
      headers: headers(apiKey),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Deepgram getUsage error ${res.status}: ${err}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("Deepgram getUsage failed:", err.message);
    return null;
  }
}
