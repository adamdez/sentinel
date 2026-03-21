import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "sentinel",
  // eventKey is read from INNGEST_EVENT_KEY env var automatically
});
