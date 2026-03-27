# listmonk-client

REST API client for [Listmonk](https://listmonk.app/) - the self-hosted email marketing platform.

Zero dependencies. Pure ESM. Uses native `fetch`.

## Requirements

- Node.js >= 18 (native fetch)
- A running Listmonk instance

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `LISTMONK_URL` | Base URL of the Listmonk instance | `http://localhost:9000` |
| `LISTMONK_USER` | API / admin username | `admin` |
| `LISTMONK_PASSWORD` | API / admin password | `listmonk` |

## Usage

### Quick start with env vars

```js
import { createListmonkClientFromEnv } from "./index.js";

const client = createListmonkClientFromEnv();
const health = await client.healthCheck();
console.log(health); // { ok: true, version: "3.0.0" }
```

### Manual configuration

```js
import { ListmonkClient } from "./index.js";

const client = new ListmonkClient({
  url: "https://mail.example.com",
  user: "admin",
  password: "supersecret",
});
```

### Subscribers

```js
// Create or update a subscriber
const sub = await client.upsertSubscriber(
  "alice@example.com",
  "Alice",
  { plan: "pro" },  // custom attributes
  [1, 3]            // list IDs
);

// Search subscribers
const { results, total } = await client.getSubscribers(1, 50, "alice@example.com");

// Add existing subscribers to lists
await client.addSubscribersToList([sub.id], [2, 4]);
```

### Transactional email

```js
await client.sendTransactionalRaw(
  "alice@example.com",
  "Your invoice is ready",
  "<h1>Invoice #42</h1><p>Amount: $99</p>"
);
```

### Campaigns

```js
// Create a campaign
const campaign = await client.createCampaign({
  name: "March Newsletter",
  subject: "What's new in March",
  body: "<h1>Hello!</h1><p>Here are the updates...</p>",
  listIds: [1],
  tags: ["newsletter", "march"],
});

// Start the campaign
await client.updateCampaignStatus(campaign.id, "running");

// List campaigns
const { results } = await client.getCampaigns(1, 20);

// Get single campaign
const detail = await client.getCampaign(campaign.id);
```

### Lists

```js
// Get all lists
const { results } = await client.getLists();

// Create a new list
const list = await client.createList("VIP Customers", "private", "single");
```

### Templates

```js
const templates = await client.getTemplates();
```

## API reference

| Method | Description |
|---|---|
| `healthCheck()` | Check Listmonk connectivity and version |
| `upsertSubscriber(email, name, attribs?, listIds?)` | Create or update a subscriber |
| `getSubscribers(page?, perPage?, query?)` | List/search subscribers |
| `addSubscribersToList(subscriberIds, listIds)` | Add subscribers to lists |
| `sendTransactionalRaw(email, subject, html, templateId?)` | Send a transactional email |
| `getCampaigns(page?, perPage?)` | List campaigns |
| `getCampaign(id)` | Get a single campaign |
| `createCampaign(opts)` | Create a campaign |
| `updateCampaignStatus(id, status)` | Start/pause/cancel a campaign |
| `getLists()` | Get all mailing lists |
| `createList(name, type?, optin?)` | Create a mailing list |
| `getTemplates()` | Get all templates |
