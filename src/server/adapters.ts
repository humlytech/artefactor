import { db } from "../infra/db/client";
import { DrizzleArtefactRepository } from "../infra/db/artefact-repository.drizzle";
import { DrizzleDataRepository } from "../infra/db/data-repository.drizzle";
import { DrizzleUserDirectory } from "../infra/db/user-directory.drizzle";
import { FilesystemPayloadStore } from "../infra/storage/payload-store";
import { env } from "./env";

// Composition root for the domain-port adapters. Constructed once and shared by
// every route module (BFF API + slug serving) so they operate on the same
// Drizzle repositories and filesystem payload store.
export const artefactRepository = new DrizzleArtefactRepository(db);
export const dataRepository = new DrizzleDataRepository(db);
export const payloadStore = new FilesystemPayloadStore(
  env.ARTEFACTOR_PAYLOAD_DIR,
);
// S12 — host data-context switcher: resolve author ids → name/email for the
// picker label (reads the BetterAuth user table).
export const userDirectory = new DrizzleUserDirectory(db);
