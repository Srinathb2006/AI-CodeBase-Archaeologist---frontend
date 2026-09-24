import { apiRequest } from "./apiClient";

export async function getDatabaseSchema(repositoryId, refresh = false) {
  const queryParam = repositoryId ? `repositoryId=${encodeURIComponent(repositoryId)}&` : "";
  return await apiRequest(`/api/database/schema?${queryParam}refresh=${refresh}`);
}

export async function executeDatabaseQuery(repositoryId, sql) {
  return await apiRequest("/api/database/query", {
    method: "POST",
    body: JSON.stringify({ repositoryId, sql }),
    headers: { "Content-Type": "application/json" }
  });
}

export async function explainDatabaseQuery(repositoryId, sql) {
  return await apiRequest("/api/database/explain", {
    method: "POST",
    body: JSON.stringify({ repositoryId, sql }),
    headers: { "Content-Type": "application/json" }
  });
}

export async function previewDatabaseTable(repositoryId, tableName, page = 0, size = 50) {
  const queryParam = repositoryId ? `repositoryId=${encodeURIComponent(repositoryId)}&` : "";
  return await apiRequest(`/api/database/preview/${encodeURIComponent(tableName)}?${queryParam}page=${page}&size=${size}`);
}

export async function explainSchemaEntityAi(entityJson) {
  return await apiRequest("/api/database/ai/explain", {
    method: "POST",
    body: JSON.stringify({ entityJson: JSON.stringify(entityJson) }),
    headers: { "Content-Type": "application/json" }
  });
}

function toSnakeCase(str = "") {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function splitSqlDefinitions(body = "") {
  const defs = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      defs.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) defs.push(current);
  return defs;
}

function mapJavaTypeToSql(javaType = "") {
  const lower = javaType.toLowerCase();
  if (lower.includes("long")) return "BIGINT";
  if (lower.includes("int")) return "INTEGER";
  if (lower.includes("string")) return "VARCHAR(255)";
  if (lower.includes("boolean")) return "BOOLEAN";
  if (lower.includes("date") || lower.includes("time") || lower.includes("instant")) return "TIMESTAMP";
  if (lower.includes("double") || lower.includes("float")) return "NUMERIC";
  if (lower.includes("uuid")) return "UUID";
  return javaType || "VARCHAR(255)";
}

/**
 * Derives database schema purely from repository evidence (SQL, JPA, Prisma, Python models).
 * Never returns hardcoded or application-default tables.
 */
export function extractDatabaseSchemaFromRepo(repo) {
  const fileContents = repo?.fileContents || {};
  const tablesById = new Map();
  const viewsById = new Map();
  const foreignKeys = [];
  const sequences = [];
  const enums = [];

  const files = Object.entries(fileContents);

  // 1. SQL Parser (.sql)
  for (const [path, content] of files) {
    if (!path.toLowerCase().endsWith(".sql") || typeof content !== "string") continue;

    const cleanContent = content
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`]?([a-zA-Z0-9_]+)["`]?\.)?["`]?([a-zA-Z0-9_]+)["`]?\s*\(([\s\S]*?)\);/gi;
    let match;
    while ((match = createTableRegex.exec(cleanContent))) {
      const schema = match[1] || "public";
      const tableName = match[2];
      const body = match[3];
      const tableId = `${schema}.${tableName}`;

      const columns = [];
      const constraints = [];
      const indexes = [];

      const defs = splitSqlDefinitions(body);

      defs.forEach((def) => {
        const trimmed = def.trim();
        if (!trimmed) return;

        const fkMatch = /(?:CONSTRAINT\s+["`]?([a-zA-Z0-9_]+)["`]?\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:["`]?([a-zA-Z0-9_]+)["`]?\.)?["`]?([a-zA-Z0-9_]+)["`]?\s*\(([^)]+)\)/i.exec(trimmed);
        if (fkMatch) {
          const fkName = fkMatch[1] || `fk_${tableName}_${fkMatch[4]}`;
          const localCol = fkMatch[2].replace(/["`]/g, "").trim();
          const targetSchema = fkMatch[3] || schema;
          const targetTable = fkMatch[4].replace(/["`]/g, "").trim();
          const targetCol = fkMatch[5].replace(/["`]/g, "").trim();

          foreignKeys.push({
            name: fkName,
            table: tableId,
            tableSchema: schema,
            column: localCol,
            foreignTable: `${targetSchema}.${targetTable}`,
            foreignTableSchema: targetSchema,
            foreignColumn: targetCol,
          });
          return;
        }

        const pkMatch = /PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(trimmed);
        if (pkMatch) {
          const pkCols = pkMatch[1].split(",").map((c) => c.replace(/["`]/g, "").trim().toLowerCase());
          columns.forEach((col) => {
            if (pkCols.includes(col.name.toLowerCase())) {
              col.isPrimary = true;
              col.isNullable = false;
            }
          });
          return;
        }

        const colMatch = /^["`]?([a-zA-Z0-9_]+)["`]?\s+([a-zA-Z0-9_]+(?:\s*\([^)]+\))?)([\s\S]*)$/i.exec(trimmed);
        if (colMatch) {
          const colName = colMatch[1];
          const colType = colMatch[2];
          const rest = colMatch[3] || "";

          const isPrimary = /\bPRIMARY\s+KEY\b/i.test(rest);
          const isUnique = /\bUNIQUE\b/i.test(rest);
          const isNullable = !/\bNOT\s+NULL\b/i.test(rest) && !isPrimary;
          const defaultMatch = /\bDEFAULT\s+([^,;]+)/i.exec(rest);
          const defaultValue = defaultMatch ? defaultMatch[1].trim() : null;

          const inlineFkMatch = /\bREFERENCES\s+(?:["`]?([a-zA-Z0-9_]+)["`]?\.)?["`]?([a-zA-Z0-9_]+)["`]?\s*\(([^)]+)\)/i.exec(rest);
          if (inlineFkMatch) {
            const targetSchema = inlineFkMatch[1] || schema;
            const targetTable = inlineFkMatch[2].replace(/["`]/g, "").trim();
            const targetCol = inlineFkMatch[3].replace(/["`]/g, "").trim();

            foreignKeys.push({
              name: `fk_${tableName}_${colName}`,
              table: tableId,
              tableSchema: schema,
              column: colName,
              foreignTable: `${targetSchema}.${targetTable}`,
              foreignTableSchema: targetSchema,
              foreignColumn: targetCol,
            });
          }

          columns.push({
            name: colName,
            type: colType,
            defaultValue,
            ordinalPosition: columns.length + 1,
            isNullable,
            isPrimary,
            isUnique,
            isForeignKey: !!inlineFkMatch,
          });
        }
      });

      tablesById.set(tableId, {
        id: tableId,
        schema,
        name: tableName,
        rowCount: 0,
        columns,
        indexes,
        constraints,
      });
    }

    const createViewRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:["`]?([a-zA-Z0-9_]+)["`]?\.)?["`]?([a-zA-Z0-9_]+)["`]?\s+AS\s+([\s\S]*?);/gi;
    let viewMatch;
    while ((viewMatch = createViewRegex.exec(cleanContent))) {
      const schema = viewMatch[1] || "public";
      const viewName = viewMatch[2];
      const viewId = `${schema}.${viewName}`;
      viewsById.set(viewId, {
        id: viewId,
        schema,
        name: viewName,
        columns: [],
      });
    }
  }

  // 2. Java JPA / Hibernate Parser (.java, .kt)
  for (const [path, content] of files) {
    if ((!path.endsWith(".java") && !path.endsWith(".kt")) || typeof content !== "string") continue;
    if (!/@(?:Entity|Table)\b/.test(content)) continue;

    const tableMatch = /@Table\s*\([^)]*name\s*=\s*["']([^"']+)["']/i.exec(content);
    const classMatch = /(?:public\s+)?(?:final\s+)?class\s+([A-Za-z0-9_]+)/.exec(content);
    if (!classMatch) continue;

    const className = classMatch[1];
    const tableName = tableMatch ? tableMatch[1] : toSnakeCase(className);
    const schema = "public";
    const tableId = `${schema}.${tableName}`;

    const columns = [];
    const fieldRegex = /(?:@[\w.]+(?:\([^)]*\))?\s+)*(?:private|protected|public)?\s+([A-Za-z0-9_<>[\]]+)\s+([A-Za-z0-9_]+)\s*;/g;
    let fieldMatch;

    while ((fieldMatch = fieldRegex.exec(content))) {
      const annotations = fieldMatch[0];
      const javaType = fieldMatch[1];
      const fieldName = fieldMatch[2];

      if (/@Transient\b/.test(annotations)) continue;

      const colNameMatch = /@Column\s*\([^)]*name\s*=\s*["']([^"']+)["']/i.exec(annotations);
      const colName = colNameMatch ? colNameMatch[1] : toSnakeCase(fieldName);

      const isPrimary = /@Id\b/.test(annotations);
      const isNullable = !isPrimary && !/@NotNull\b|nullable\s*=\s*false/i.test(annotations);
      const isUnique = /unique\s*=\s*true/i.test(annotations);

      const isManyToOne = /@ManyToOne\b|@OneToOne\b/.test(annotations);
      const joinColMatch = /@JoinColumn\s*\([^)]*name\s*=\s*["']([^"']+)["']/i.exec(annotations);
      if (isManyToOne) {
        const foreignTable = toSnakeCase(javaType);
        const fkColName = joinColMatch ? joinColMatch[1] : `${colName}_id`;
        foreignKeys.push({
          name: `fk_${tableName}_${fkColName}`,
          table: tableId,
          tableSchema: schema,
          column: fkColName,
          foreignTable: `${schema}.${foreignTable}`,
          foreignTableSchema: schema,
          foreignColumn: "id",
        });
      }

      columns.push({
        name: colName,
        type: mapJavaTypeToSql(javaType),
        defaultValue: null,
        ordinalPosition: columns.length + 1,
        isNullable,
        isPrimary,
        isUnique,
        isForeignKey: isManyToOne,
      });
    }

    if (columns.length > 0) {
      tablesById.set(tableId, {
        id: tableId,
        schema,
        name: tableName,
        rowCount: 0,
        columns,
        indexes: [],
        constraints: [],
      });
    }
  }

  // 3. Prisma Parser (schema.prisma)
  for (const [path, content] of files) {
    if (!path.endsWith(".prisma") || typeof content !== "string") continue;

    const modelRegex = /model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/g;
    let modelMatch;
    while ((modelMatch = modelRegex.exec(content))) {
      const modelName = modelMatch[1];
      const body = modelMatch[2];
      const tableName = toSnakeCase(modelName);
      const schema = "public";
      const tableId = `${schema}.${tableName}`;

      const columns = [];
      const lines = body.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;

        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          const fieldName = parts[0];
          const fieldType = parts[1];

          const relationMatch = /@relation\([^)]*fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]/i.exec(trimmed);
          if (relationMatch) {
            const localCol = relationMatch[1].trim();
            const targetCol = relationMatch[2].trim();
            const targetTable = toSnakeCase(fieldType.replace("?", ""));
            foreignKeys.push({
              name: `fk_${tableName}_${localCol}`,
              table: tableId,
              tableSchema: schema,
              column: localCol,
              foreignTable: `${schema}.${targetTable}`,
              foreignTableSchema: schema,
              foreignColumn: targetCol,
            });
            continue;
          }

          if (
            /^[A-Z]/.test(fieldType) &&
            !["String", "Int", "Boolean", "DateTime", "Float", "Decimal", "Json", "BigInt", "Bytes"].includes(
              fieldType.replace("?", "").replace("[]", "")
            )
          ) {
            continue;
          }

          columns.push({
            name: fieldName,
            type: fieldType,
            defaultValue: null,
            ordinalPosition: columns.length + 1,
            isNullable: fieldType.endsWith("?"),
            isPrimary: trimmed.includes("@id"),
            isUnique: trimmed.includes("@unique"),
            isForeignKey: false,
          });
        }
      }

      if (columns.length > 0) {
        tablesById.set(tableId, {
          id: tableId,
          schema,
          name: tableName,
          rowCount: 0,
          columns,
          indexes: [],
          constraints: [],
        });
      }
    }
  }

  // 4. Python Models Parser (Django / SQLAlchemy)
  for (const [path, content] of files) {
    if (!path.endsWith(".py") || typeof content !== "string") continue;
    if (!content.includes("models.Model") && !content.includes("__tablename__") && !content.includes("declarative_base")) continue;

    const classRegex = /class\s+([A-Za-z0-9_]+)\s*\((?:[^)]+)\)\s*:([\s\S]*?)(?=\nclass\s+|$)/g;
    let classMatch;
    while ((classMatch = classRegex.exec(content))) {
      const className = classMatch[1];
      const body = classMatch[2];

      const tableMatch = /__tablename__\s*=\s*["']([^"']+)["']/.exec(body);
      const tableName = tableMatch ? tableMatch[1] : toSnakeCase(className);
      const schema = "public";
      const tableId = `${schema}.${tableName}`;

      const columns = [];
      const lines = body.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        const fieldMatch = /^([a-zA-Z0-9_]+)\s*=\s*(?:models\.|Column\()([A-Za-z0-9_]+)(?:\(([\s\S]*?)\))?/.exec(trimmed);
        if (fieldMatch) {
          const fieldName = fieldMatch[1];
          const fieldType = fieldMatch[2];
          const args = fieldMatch[3] || "";

          const isPrimary = /primary_key\s*=\s*True/i.test(args);
          const isUnique = /unique\s*=\s*True/i.test(args);
          const isNullable = /null\s*=\s*True/i.test(args);

          const fkMatch = /(?:ForeignKey|models\.ForeignKey)\s*\(\s*["']?([a-zA-Z0-9_]+)["']?/i.exec(args);
          if (fkMatch || fieldType === "ForeignKey") {
            const target = fkMatch ? fkMatch[1] : "target";
            foreignKeys.push({
              name: `fk_${tableName}_${fieldName}`,
              table: tableId,
              tableSchema: schema,
              column: fieldName,
              foreignTable: `${schema}.${toSnakeCase(target)}`,
              foreignTableSchema: schema,
              foreignColumn: "id",
            });
          }

          columns.push({
            name: fieldName,
            type: fieldType,
            defaultValue: null,
            ordinalPosition: columns.length + 1,
            isNullable,
            isPrimary,
            isUnique,
            isForeignKey: !!fkMatch,
          });
        }
      }

      if (columns.length > 0) {
        tablesById.set(tableId, {
          id: tableId,
          schema,
          name: tableName,
          rowCount: 0,
          columns,
          indexes: [],
          constraints: [],
        });
      }
    }
  }

  return {
    tables: Array.from(tablesById.values()),
    views: Array.from(viewsById.values()),
    foreignKeys,
    sequences,
    enums,
  };
}
