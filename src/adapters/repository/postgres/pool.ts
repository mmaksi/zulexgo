import { Pool } from "pg"
import { tlsFor } from "./tls"

export function createPool(connectionString: string, ca?: string): Pool {
  const pool = new Pool({ connectionString, ssl: tlsFor(connectionString, ca), allowExitOnIdle: true })
  // An idle connection dropped by the pooler must not crash the process; the next query reconnects.
  pool.on("error", (error) => console.error(`Postgres connection lost: ${error.message}`))
  return pool
}
