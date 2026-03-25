import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "sentinel",
  eventKey: process.env.INNGEST_EVENT_KEY || process.env.sentinel_INNGEST_EVENT_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY || process.env.sentinel_INNGEST_SIGNING_KEY,
});
