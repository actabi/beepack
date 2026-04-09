// MongoDB Atlas Data API Client - Zero dependencies

/**
 * Create a MongoDB Data API client.
 * @param {object} config
 * @param {string} config.url - Atlas Data API URL
 * @param {string} config.apiKey - API key
 * @param {string} config.dataSource - Cluster name
 * @param {string} config.database - Database name
 */
export function createMongoClient({ url, apiKey, dataSource, database }) {
  const baseUrl = url.replace(/\/$/, "");

  async function action(actionName, body) {
    const res = await fetch(baseUrl + "/action/" + actionName, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({ dataSource, database, ...body }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error("MongoDB " + res.status + ": " + JSON.stringify(data));
    return data;
  }

  return {
    collection(name) {
      return {
        async find(filter = {}, opts = {}) {
          const result = await action("find", {
            collection: name, filter,
            ...(opts.sort ? { sort: opts.sort } : {}),
            ...(opts.limit ? { limit: opts.limit } : {}),
            ...(opts.projection ? { projection: opts.projection } : {}),
          });
          return result.documents;
        },
        async findOne(filter = {}) {
          const result = await action("findOne", { collection: name, filter });
          return result.document;
        },
        async insertOne(document) {
          return action("insertOne", { collection: name, document });
        },
        async insertMany(documents) {
          return action("insertMany", { collection: name, documents });
        },
        async updateOne(filter, update) {
          return action("updateOne", { collection: name, filter, update });
        },
        async updateMany(filter, update) {
          return action("updateMany", { collection: name, filter, update });
        },
        async deleteOne(filter) {
          return action("deleteOne", { collection: name, filter });
        },
        async deleteMany(filter) {
          return action("deleteMany", { collection: name, filter });
        },
        async aggregate(pipeline) {
          return action("aggregate", { collection: name, pipeline });
        },
      };
    },
  };
}