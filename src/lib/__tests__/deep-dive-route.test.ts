import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDialerClient: vi.fn(),
  getDialerUser: vi.fn(),
}));

vi.mock("@/lib/dialer/db", () => ({
  createDialerClient: mocks.createDialerClient,
  getDialerUser: mocks.getDialerUser,
}));

type TableRow = Record<string, unknown>;

function createQuery(rows: TableRow[]) {
  const filters: Array<(row: TableRow) => boolean> = [];
  let orderedRows = [...rows];

  const chain = {
    select() {
      return chain;
    },
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return chain;
    },
    ilike(column: string, value: string) {
      const needle = value.replace(/%/g, "").toLowerCase();
      filters.push((row) => String(row[column] ?? "").toLowerCase().includes(needle));
      return chain;
    },
    not(column: string, operator: string, value: string) {
      if (operator === "in") {
        const disallowed = value
          .replace(/[()"]/g, "")
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        filters.push((row) => !disallowed.includes(String(row[column] ?? "")));
      }
      return chain;
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(row[column]));
      return chain;
    },
    order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
      const ascending = options?.ascending !== false;
      orderedRows = [...orderedRows].sort((a, b) => {
        const left = a[column];
        const right = b[column];
        if (left == null && right == null) return 0;
        if (left == null) return options?.nullsFirst ? -1 : 1;
        if (right == null) return options?.nullsFirst ? 1 : -1;
        const leftValue = String(left);
        const rightValue = String(right);
        return ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
      });
      return chain;
    },
    limit(count: number) {
      orderedRows = orderedRows.slice(0, count);
      return chain;
    },
    then(resolve: (value: { data: TableRow[]; error: null }) => unknown) {
      const data = orderedRows.filter((row) => filters.every((filter) => filter(row)));
      return Promise.resolve(resolve({ data, error: null }));
    },
  };

  return chain;
}

function createRouteClient(dataset: {
  leads: TableRow[];
  events: TableRow[];
  dossiers: TableRow[];
  prepFrames: TableRow[];
  tasks: TableRow[];
}) {
  return {
    client: {
      from(table: string) {
        switch (table) {
          case "leads":
            return createQuery(dataset.leads);
          case "dialer_events":
            return createQuery(dataset.events);
          case "dossiers":
            return createQuery(dataset.dossiers);
          case "outbound_prep_frames":
            return createQuery(dataset.prepFrames);
          case "tasks":
            return createQuery(dataset.tasks);
          default:
            throw new Error(`Unexpected table ${table}`);
        }
      },
    },
  };
}

describe("GET /api/dialer/v1/deep-dive", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.getDialerUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns staged research gaps and open research tasks for the operator's deep-dive files", async () => {
    const routeClient = createRouteClient({
      leads: [
        {
          id: "lead-1",
          status: "lead",
          assigned_to: "user-1",
          next_action: "Deep Dive",
          next_action_due_at: "2026-04-11T16:30:00.000Z",
          last_contact_at: null,
          total_calls: 2,
          notes: null,
          created_at: "2026-04-10T10:00:00.000Z",
          properties: {
            address: "6511 N Jefferson St",
            city: "Spokane",
            state: "WA",
            zip: "99208",
            county: "Spokane",
            owner_name: "Guy Bates",
            owner_phone: "(509) 555-1111",
          },
        },
        {
          id: "lead-2",
          status: "lead",
          assigned_to: "user-2",
          next_action: "Deep Dive",
          next_action_due_at: "2026-04-11T16:30:00.000Z",
          last_contact_at: null,
          total_calls: 1,
          notes: null,
          created_at: "2026-04-10T10:00:00.000Z",
          properties: null,
        },
      ],
      events: [
        {
          lead_id: "lead-1",
          created_at: "2026-04-10T12:00:00.000Z",
          event_type: "queue.deep_dive",
          metadata: { reason: "Need probate authority." },
        },
      ],
      dossiers: [
        {
          lead_id: "lead-1",
          status: "staged",
          created_at: "2026-04-10T13:00:00.000Z",
          likely_decision_maker: "Janet Bates",
          raw_ai_output: {
            research_run: {
              run_quality: "fallback",
              quality_reason: "Official records found; public breadcrumbs still thin.",
              research_gaps: ["Verify petitioner mailing address"],
              staged_at: "2026-04-10T13:00:00.000Z",
              people_intel: {
                next_of_kin: [{ name: "Janet Bates", confidence: 0.86 }],
              },
            },
          },
        },
      ],
      prepFrames: [
        {
          lead_id: "lead-1",
          review_status: "ready",
          created_at: "2026-04-10T13:30:00.000Z",
        },
      ],
      tasks: [
        {
          id: "task-1",
          lead_id: "lead-1",
          title: "Research - Verify petitioner mailing address",
          assigned_to: "user-1",
          due_at: "2026-04-11T09:00:00.000Z",
          task_type: "research",
          source_type: "deep_search_gap",
          source_key: "lead-1:verify_petitioner_mailing_address",
          status: "pending",
          created_at: "2026-04-10T13:05:00.000Z",
        },
        {
          id: "task-2",
          lead_id: "lead-1",
          title: "Call back seller",
          assigned_to: "user-1",
          due_at: "2026-04-11T09:00:00.000Z",
          task_type: "follow_up",
          source_type: "lead_follow_up",
          source_key: "lead-1:primary_call",
          status: "pending",
          created_at: "2026-04-10T13:10:00.000Z",
        },
      ],
    });
    mocks.createDialerClient.mockReturnValue(routeClient.client);

    const { GET } = await import("@/app/api/dialer/v1/deep-dive/route");
    const response = await GET(new Request("http://localhost/api/dialer/v1/deep-dive", {
      headers: {
        authorization: "Bearer token",
      },
    }) as never);

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      id: "lead-1",
      parked_reason: "Need probate authority.",
      research_quality: "fallback",
      research_gap_count: 1,
      research_gaps: ["Verify petitioner mailing address"],
      likely_decision_maker: "Janet Bates",
      latest_prep_status: "ready",
      open_research_task_count: 1,
    });
    expect(payload.items[0].open_research_tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        source_type: "deep_search_gap",
        source_key: "lead-1:verify_petitioner_mailing_address",
      }),
    ]);
  });
});
