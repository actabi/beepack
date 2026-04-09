# mongodb-rest-client

Zero-dependency wrapper for the [MongoDB Atlas Data API](https://github.com/mongodb/node-mongodb-native). Perform CRUD operations on MongoDB collections via REST — no native driver or connection pooling required.

## Installation

```bash
bee install mongodb-rest-client
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_DATA_API_KEY` | Atlas Data API key | Yes |
| `MONGODB_DATA_API_URL` | Atlas Data API base URL | Yes |
| `MONGODB_CLUSTER` | Atlas cluster name | Yes |
| `MONGODB_DATABASE` | Default database name | Yes |

## Usage

### Find Documents

```js
import { findOne, find } from 'mongodb-rest-client';

const user = await findOne('users', { email: 'alice@example.com' });

const activeUsers = await find('users', { active: true }, {
  sort: { createdAt: -1 },
  limit: 20,
  projection: { name: 1, email: 1 },
});
```

### Insert Documents

```js
import { insertOne, insertMany } from 'mongodb-rest-client';

const result = await insertOne('users', {
  name: 'Alice',
  email: 'alice@example.com',
  active: true,
});
console.log(result.insertedId);

const batch = await insertMany('events', [
  { type: 'click', page: '/home' },
  { type: 'view', page: '/about' },
]);
```

### Update and Delete

```js
import { updateOne, deleteOne } from 'mongodb-rest-client';

await updateOne('users', { _id: '123' }, { $set: { active: false } });
await deleteOne('sessions', { token: 'expired-token' });
```

### Upsert

```js
import { updateOne } from 'mongodb-rest-client';

await updateOne(
  'settings',
  { userId: '123' },
  { $set: { theme: 'dark' } },
  { upsert: true }
);
```

## API Reference

### `findOne(collection, filter?, projection?, opts?)`
Find a single document. Returns the document or `null`.

### `find(collection, filter?, options?, opts?)`
Find multiple documents. Options: `projection`, `sort`, `limit`, `skip`. Returns an array or `null`.

### `insertOne(collection, document, opts?)`
Insert one document. Returns `{ insertedId }` or `null`.

### `insertMany(collection, documents, opts?)`
Insert multiple documents. Returns `{ insertedIds }` or `null`.

### `updateOne(collection, filter, update, options?, opts?)`
Update one document. Returns `{ matchedCount, modifiedCount }` or `null`.

### `deleteOne(collection, filter, opts?)`
Delete one document. Returns `{ deletedCount }` or `null`.

## Error Handling

All functions return `null` on failure and log errors to `console.error`. Fetch calls use a 15-second timeout via `AbortSignal.timeout(15000)`.
