import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/Card";
import { Badge } from "../components/Badge";
import { Database, Table, Key, Link as LinkIcon } from "lucide-react";
import { motion } from "motion/react";

const tables = [
  {
    name: "users",
    columns: 8,
    rows: "12.4K",
    relations: ["orders", "sessions"],
    primaryKey: "id",
    foreignKeys: [],
  },
  {
    name: "orders",
    columns: 12,
    rows: "45.2K",
    relations: ["users", "order_items"],
    primaryKey: "id",
    foreignKeys: ["user_id"],
  },
  {
    name: "products",
    columns: 10,
    rows: "3.2K",
    relations: ["order_items", "categories"],
    primaryKey: "id",
    foreignKeys: ["category_id"],
  },
  {
    name: "order_items",
    columns: 6,
    rows: "128K",
    relations: ["orders", "products"],
    primaryKey: "id",
    foreignKeys: ["order_id", "product_id"],
  },
];

const columns = {
  users: [
    { name: "id", type: "INTEGER", nullable: false, primary: true },
    { name: "email", type: "VARCHAR(255)", nullable: false, primary: false },
    { name: "name", type: "VARCHAR(100)", nullable: false, primary: false },
    {
      name: "password_hash",
      type: "VARCHAR(255)",
      nullable: false,
      primary: false,
    },
    { name: "created_at", type: "TIMESTAMP", nullable: false, primary: false },
    { name: "updated_at", type: "TIMESTAMP", nullable: true, primary: false },
  ],
  orders: [
    { name: "id", type: "INTEGER", nullable: false, primary: true },
    { name: "user_id", type: "INTEGER", nullable: false, primary: false },
    { name: "status", type: "VARCHAR(50)", nullable: false, primary: false },
    { name: "total", type: "DECIMAL(10,2)", nullable: false, primary: false },
    { name: "created_at", type: "TIMESTAMP", nullable: false, primary: false },
  ],
  products: [
    { name: "id", type: "INTEGER", nullable: false, primary: true },
    { name: "name", type: "VARCHAR(255)", nullable: false, primary: false },
    { name: "description", type: "TEXT", nullable: true, primary: false },
    { name: "price", type: "DECIMAL(10,2)", nullable: false, primary: false },
    { name: "stock", type: "INTEGER", nullable: false, primary: false },
    { name: "category_id", type: "INTEGER", nullable: false, primary: false },
    { name: "created_at", type: "TIMESTAMP", nullable: false, primary: false },
  ],
  order_items: [
    { name: "id", type: "INTEGER", nullable: false, primary: true },
    { name: "order_id", type: "INTEGER", nullable: false, primary: false },
    { name: "product_id", type: "INTEGER", nullable: false, primary: false },
    { name: "quantity", type: "INTEGER", nullable: false, primary: false },
    { name: "price", type: "DECIMAL(10,2)", nullable: false, primary: false },
    { name: "created_at", type: "TIMESTAMP", nullable: false, primary: false },
  ],
};

export function DatabasePage() {
  const [selectedTable, setSelectedTable] = useState("users");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Database Explorer</h1>
        <p className="text-muted-foreground">
          Visualize database schema, tables, and relationships
        </p>
      </div>

      {/* ER Diagram */}
      <Card>
        <CardHeader>
          <CardTitle>Entity Relationship Diagram</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 relative bg-gradient-to-br from-background via-background to-primary/5 rounded-xl p-8">
            <svg className="absolute inset-0 w-full h-full">
              {/* Connection Lines */}
              <motion.line
                x1="30%"
                y1="30%"
                x2="50%"
                y2="50%"
                stroke="#7C3AED"
                strokeWidth="2"
                strokeDasharray="5,5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1 }}
              />

              <motion.line
                x1="70%"
                y1="30%"
                x2="50%"
                y2="50%"
                stroke="#7C3AED"
                strokeWidth="2"
                strokeDasharray="5,5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: 0.2 }}
              />

              <motion.line
                x1="50%"
                y1="50%"
                x2="50%"
                y2="70%"
                stroke="#7C3AED"
                strokeWidth="2"
                strokeDasharray="5,5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: 0.4 }}
              />
            </svg>

            {/* Table Nodes */}
            {[
              { name: "users", x: 30, y: 30 },
              { name: "products", x: 70, y: 30 },
              { name: "orders", x: 50, y: 50 },
              { name: "order_items", x: 50, y: 70 },
            ].map((table, index) => (
              <motion.div
                key={table.name}
                className="absolute cursor-pointer"
                style={{
                  left: `${table.x}%`,
                  top: `${table.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onClick={() => setSelectedTable(table.name)}
              >
                <Card
                  className={`w-40 hover:border-primary/50 transition-all ${
                    selectedTable === table.name
                      ? "border-primary shadow-xl"
                      : ""
                  }`}
                  glass
                >
                  <CardContent className="pt-4 text-center">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-2">
                      <Table className="w-6 h-6 text-white" />
                    </div>
                    <div className="font-semibold">{table.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {tables.find((t) => t.name === table.name)?.columns}{" "}
                      columns
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Tables List */}
        <Card>
          <CardHeader>
            <CardTitle>Tables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tables.map((table) => (
                <button
                  key={table.name}
                  onClick={() => setSelectedTable(table.name)}
                  className={`w-full p-3 rounded-xl text-left transition-all ${
                    selectedTable === table.name
                      ? "bg-primary/10 border border-primary"
                      : "hover:bg-muted border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Table className="w-4 h-4 text-primary" />
                    <span className="font-medium">{table.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground ml-7">
                    {table.columns} columns • {table.rows} rows
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Table Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                {selectedTable}
              </CardTitle>
              <div className="flex gap-2">
                <Badge variant="info">
                  {tables.find((t) => t.name === selectedTable)?.rows} rows
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Columns */}
              <div>
                <h4 className="font-semibold mb-3">Columns</h4>
                <div className="border border-border rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 text-sm font-medium">
                          Name
                        </th>
                        <th className="text-left p-3 text-sm font-medium">
                          Type
                        </th>
                        <th className="text-left p-3 text-sm font-medium">
                          Nullable
                        </th>
                        <th className="text-left p-3 text-sm font-medium">
                          Key
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(columns[selectedTable] || []).map((column, index) => (
                        <tr key={index} className="border-t border-border">
                          <td className="p-3">
                            <code className="text-sm">{column.name}</code>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {column.type}
                          </td>
                          <td className="p-3 text-sm">
                            {column.nullable ? (
                              <Badge variant="default">NULL</Badge>
                            ) : (
                              <Badge variant="warning">NOT NULL</Badge>
                            )}
                          </td>
                          <td className="p-3">
                            {column.primary && (
                              <Badge variant="info" className="gap-1">
                                <Key className="w-3 h-3" />
                                PRIMARY
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Relationships */}
              <div>
                <h4 className="font-semibold mb-3">Relationships</h4>
                <div className="space-y-2">
                  {tables
                    .find((t) => t.name === selectedTable)
                    ?.relations.map((relation, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 rounded-xl bg-muted/50"
                      >
                        <LinkIcon className="w-4 h-4 text-primary" />
                        <span className="font-mono text-sm">
                          {selectedTable}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-mono text-sm">{relation}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Foreign Keys */}
              {tables.find((t) => t.name === selectedTable)?.foreignKeys
                .length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3">Foreign Keys</h4>
                  <div className="space-y-2">
                    {tables
                      .find((t) => t.name === selectedTable)
                      ?.foreignKeys.map((fk, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-3 rounded-xl bg-muted/50"
                        >
                          <Key className="w-4 h-4 text-accent" />
                          <code className="text-sm">{fk}</code>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
