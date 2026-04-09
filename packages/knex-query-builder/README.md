# SQL Query Builder

Zero-dependency fluent SQL query builder. Parameterized queries for PostgreSQL, MySQL, and SQLite.

## Prerequisites

- Node.js >= 18

## Usage

### Select

```js
import { query } from './index.js';
const { sql, params } = query("users")
  .select("id", "name").where("age", ">", 18)
  .orderBy("name").limit(10).toSQL();
```

### Insert

```js
const { sql, params } = query("users")
  .insert({ name: "Alice", email: "alice@example.com" })
  .returning("id").toSQL();
```

### Join

```js
const { sql, params } = query("orders")
  .select("orders.id", "users.name")
  .join("users", "users.id", "=", "orders.user_id")
  .where("orders.total", ">", 100).toSQL();
```

## Source

Inspired by [knex](https://github.com/knex/knex) (20k+ stars).