import { db } from "../infra/db/client";
import { DrizzleArtefactRepository } from "../infra/db/artefact-repository.drizzle";
import { FilesystemPayloadStore } from "../infra/storage/payload-store";
import { env } from "./env";

// Composition root for the domain-port adapters. Constructed once and shared by
// every route module (BFF API + slug serving) so they operate on the same
// Drizzle repository and filesystem payload store.
export const artefactRepository = new DrizzleArtefactRepository(db);
export const payloadStore = new FilesystemPayloadStore(
  env.ARTEFACTOR_PAYLOAD_DIR,
);
