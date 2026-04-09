# MongoDB REST Client

Zero-dependency MongoDB client using the Atlas Data API. Mongoose-inspired interface for CRUD and aggregation.

## Prerequisites

- Node.js >= 18
- MongoDB Atlas with Data API enabled

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_DATA_API_URL` | Atlas Data API endpoint |
| `MONGODB_DATA_API_KEY` | API key |

## Usage

### Setup

```js
import { createMongoClient } from './index.js';
const db = createMongoClient({
  url: process.env.MONGODB_DATA_API_URL,
  apiKey: process.env.MONGODB_DATA_API_KEY,
  dataSource: "Cluster0", database: "myapp"
});
```

### CRUD

```js
const users = db.collection("users");
await users.insertOne({ name: "Alice", email: "alice@example.com" });
const user = await users.findOne({ email: "alice@example.com" });
await users.updateOne({ email: "alice@example.com" }, { "$set": { role: "admin" } });
```

### Aggregation

```js
const results = await users.aggregate([
  { "$match": { role: "admin" } },
  { "$group": { _id: "$department", count: { "$sum": 1 } } }
]);
```

## Source

Based on [Automattic/mongoose](https://github.com/Automattic/mongoose) by **Automattic** — 27,469+ stars on GitHub.