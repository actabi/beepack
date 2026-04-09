// SQL Query Builder - Zero dependencies, fluent API.

/**
 * Create a query builder instance.
 * @param {string} table
 * @returns {object} Chainable query builder
 */
export function query(table) {
  let _select = ["*"], _where = [], _orderBy = [], _limit = null, _offset = null;
  let _joins = [], _groupBy = [], _having = [];
  const _params = [];
  let _type = "select", _insertData = null, _updateData = null, _returning = null;

  function addParam(value) { _params.push(value); return "$" + _params.length; }

  const builder = {
    select(...cols) { _select = cols.length ? cols : ["*"]; return builder; },
    where(col, op, val) {
      if (val === undefined) { val = op; op = "="; }
      _where.push(col + " " + op + " " + addParam(val)); return builder;
    },
    whereIn(col, vals) {
      _where.push(col + " IN (" + vals.map(v => addParam(v)).join(", ") + ")"); return builder;
    },
    whereNull(col) { _where.push(col + " IS NULL"); return builder; },
    whereNotNull(col) { _where.push(col + " IS NOT NULL"); return builder; },
    join(t, c1, op, c2) { _joins.push("JOIN " + t + " ON " + c1 + " " + op + " " + c2); return builder; },
    leftJoin(t, c1, op, c2) { _joins.push("LEFT JOIN " + t + " ON " + c1 + " " + op + " " + c2); return builder; },
    orderBy(col, dir = "ASC") { _orderBy.push(col + " " + dir.toUpperCase()); return builder; },
    groupBy(...cols) { _groupBy = cols; return builder; },
    having(col, op, val) { _having.push(col + " " + op + " " + addParam(val)); return builder; },
    limit(n) { _limit = n; return builder; },
    offset(n) { _offset = n; return builder; },
    returning(...cols) { _returning = cols; return builder; },
    insert(data) { _type = "insert"; _insertData = data; return builder; },
    update(data) { _type = "update"; _updateData = data; return builder; },
    delete() { _type = "delete"; return builder; },
    toSQL() {
      let sql = "";
      if (_type === "select") {
        sql = "SELECT " + _select.join(", ") + " FROM " + table;
      } else if (_type === "insert") {
        const cols = Object.keys(_insertData);
        sql = "INSERT INTO " + table + " (" + cols.join(", ") + ") VALUES (" + cols.map(c => addParam(_insertData[c])).join(", ") + ")";
      } else if (_type === "update") {
        sql = "UPDATE " + table + " SET " + Object.entries(_updateData).map(([k, v]) => k + " = " + addParam(v)).join(", ");
      } else if (_type === "delete") {
        sql = "DELETE FROM " + table;
      }
      if (_joins.length) sql += " " + _joins.join(" ");
      if (_where.length) sql += " WHERE " + _where.join(" AND ");
      if (_groupBy.length) sql += " GROUP BY " + _groupBy.join(", ");
      if (_having.length) sql += " HAVING " + _having.join(" AND ");
      if (_orderBy.length) sql += " ORDER BY " + _orderBy.join(", ");
      if (_limit !== null) sql += " LIMIT " + _limit;
      if (_offset !== null) sql += " OFFSET " + _offset;
      if (_returning) sql += " RETURNING " + _returning.join(", ");
      return { sql, params: _params };
    },
    build() { return builder.toSQL(); },
  };
  return builder;
}

/**
 * Build a CREATE TABLE statement.
 * @param {string} table
 * @param {object} columns - {name: "type constraints", ...}
 * @returns {string}
 */
export function createTable(table, columns) {
  const cols = Object.entries(columns).map(([name, def]) => "  " + name + " " + def);
  return "CREATE TABLE IF NOT EXISTS " + table + " (\n" + cols.join(",\n") + "\n)";
}