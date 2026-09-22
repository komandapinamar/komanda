import { sql } from "drizzle-orm";
import { db } from "@/db";

const eventId = process.argv[2];

if (!eventId) {
  throw new Error("Usage: tsx scripts/outbox-replay.ts <event-id>");
}

const result = await db.execute(sql`
  update outbox_events
  set dead_letter_at = null,
      available_at = now(),
      attempts = 0,
      claimed_by = null,
      leased_until = null,
      last_error = null,
      published_at = null
  where id = ${eventId}::uuid and dead_letter_at is not null
  returning id
`);

if (result.rows.length !== 1) {
  throw new Error("Event was not found in the dead-letter queue.");
}

process.stdout.write(`Replayed outbox event ${eventId}.\n`);
