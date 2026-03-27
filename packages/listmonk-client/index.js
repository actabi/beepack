/**
 * Listmonk REST API client.
 * Pure ESM, native fetch, zero dependencies.
 */

export class ListmonkClient {
  #baseUrl;
  #authHeader;

  /**
   * @param {object} config
   * @param {string} config.url       - Listmonk instance URL (e.g. "https://mail.example.com")
   * @param {string} config.user      - API / admin username
   * @param {string} config.password  - API / admin password
   */
  constructor({ url, user, password }) {
    this.#baseUrl = url.replace(/\/+$/, "");
    this.#authHeader =
      "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
  }

  // ---------- Low-level fetch ----------

  async #request(method, path, body) {
    const res = await fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.#authHeader,
        "Content-Type": "application/json",
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Listmonk API ${method} ${path} - ${res.status}: ${text.slice(0, 300)}`
      );
    }

    if (res.status === 204) return undefined;

    const json = await res.json();
    return json.data ?? json;
  }

  // ---------- Health ----------

  async healthCheck() {
    try {
      const res = await fetch(`${this.#baseUrl}/api/health`, {
        headers: { Authorization: this.#authHeader },
      });
      if (res.ok) {
        const body = await res.json();
        return { ok: true, version: body.data?.version };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }

  // ---------- Subscribers ----------

  /**
   * Create or update a subscriber.
   * @param {string} email
   * @param {string} name
   * @param {object} [attribs]
   * @param {number[]} [listIds]
   */
  async upsertSubscriber(email, name, attribs, listIds) {
    return this.#request("POST", "/api/subscribers", {
      email,
      name,
      status: "enabled",
      attribs: attribs ?? {},
      lists: listIds ?? [],
      preconfirm_subscriptions: true,
    });
  }

  /**
   * List subscribers with optional search query.
   * @param {number} [page=1]
   * @param {number} [perPage=50]
   * @param {string} [query]
   * @returns {Promise<{results: object[], total: number}>}
   */
  async getSubscribers(page = 1, perPage = 50, query) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (query) params.set("query", query);
    return this.#request("GET", `/api/subscribers?${params}`);
  }

  /**
   * Add subscribers to one or more lists.
   * @param {number[]} subscriberIds
   * @param {number[]} listIds
   */
  async addSubscribersToList(subscriberIds, listIds) {
    await this.#request("PUT", "/api/subscribers/lists", {
      ids: subscriberIds,
      action: "add",
      target_list_ids: listIds,
      status: "confirmed",
    });
  }

  // ---------- Transactional email ----------

  /**
   * Send a transactional email with raw HTML body.
   * @param {string} subscriberEmail
   * @param {string} subject
   * @param {string} bodyHtml
   * @param {number} [templateId=5]
   */
  async sendTransactionalRaw(subscriberEmail, subject, bodyHtml, templateId = 5) {
    return this.#request("POST", "/api/tx", {
      subscriber_email: subscriberEmail,
      template_id: templateId,
      subject,
      content_type: "html",
      data: { body: bodyHtml },
      messenger: "email",
    });
  }

  // ---------- Campaigns ----------

  /**
   * List campaigns (newest first).
   * @param {number} [page=1]
   * @param {number} [perPage=20]
   */
  async getCampaigns(page = 1, perPage = 20) {
    return this.#request(
      "GET",
      `/api/campaigns?page=${page}&per_page=${perPage}&order_by=created_at&order=desc`
    );
  }

  /**
   * Get a single campaign by ID.
   * @param {number} id
   */
  async getCampaign(id) {
    return this.#request("GET", `/api/campaigns/${id}`);
  }

  /**
   * Create a new campaign.
   * @param {object} opts
   * @param {string} opts.name
   * @param {string} opts.subject
   * @param {string} opts.body
   * @param {number[]} opts.listIds
   * @param {"html"|"richtext"|"markdown"|"plain"} [opts.contentType="html"]
   * @param {number} [opts.templateId]
   * @param {string} [opts.sendAt]       - ISO date string for scheduling
   * @param {string[]} [opts.tags]
   */
  async createCampaign(opts) {
    return this.#request("POST", "/api/campaigns", {
      name: opts.name,
      subject: opts.subject,
      body: opts.body,
      content_type: opts.contentType ?? "html",
      lists: opts.listIds,
      template_id: opts.templateId,
      send_at: opts.sendAt,
      tags: opts.tags ?? [],
      type: "regular",
    });
  }

  /**
   * Update campaign status (start, pause, cancel, schedule).
   * @param {number} id
   * @param {"running"|"paused"|"cancelled"|"scheduled"} status
   */
  async updateCampaignStatus(id, status) {
    return this.#request("PUT", `/api/campaigns/${id}/status`, { status });
  }

  // ---------- Lists ----------

  /** Get all mailing lists (up to 100). */
  async getLists() {
    return this.#request("GET", "/api/lists?per_page=100");
  }

  /**
   * Create a mailing list.
   * @param {string} name
   * @param {"public"|"private"} [type="private"]
   * @param {"single"|"double"} [optin="single"]
   */
  async createList(name, type = "private", optin = "single") {
    return this.#request("POST", "/api/lists", { name, type, optin });
  }

  // ---------- Templates ----------

  /** Get all templates. */
  async getTemplates() {
    return this.#request("GET", "/api/templates");
  }
}

/**
 * Create a ListmonkClient from environment variables.
 * Expects LISTMONK_URL, LISTMONK_USER, LISTMONK_PASSWORD.
 */
export function createListmonkClientFromEnv() {
  return new ListmonkClient({
    url: process.env.LISTMONK_URL ?? "http://localhost:9000",
    user: process.env.LISTMONK_USER ?? "admin",
    password: process.env.LISTMONK_PASSWORD ?? "listmonk",
  });
}
