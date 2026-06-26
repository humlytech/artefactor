import { inArray } from "drizzle-orm";
import type { db as Db } from "./client";
import { user } from "./schema";
import type {
  UserDirectory,
  UserIdentity,
} from "../../server/data/user-directory";

type Database = typeof Db;

// Drizzle adapter for the BFF UserDirectory port — reads display identity from
// the BetterAuth `user` table to label the S12 data-context switcher.
export class DrizzleUserDirectory implements UserDirectory {
  constructor(private readonly db: Database) {}

  async lookup(ids: string[]): Promise<Map<string, UserIdentity>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(inArray(user.id, ids));
    return new Map(rows.map((r) => [r.id, { name: r.name, email: r.email }]));
  }
}
