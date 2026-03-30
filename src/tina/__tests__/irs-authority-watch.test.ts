import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadTinaIrsAuthorityWatchStatus,
  summarizeTinaIrsAuthorityWatchReport,
} from "@/tina/lib/irs-authority-watch";

describe("irs authority watch helpers", () => {
  it("treats a first all-new report as a healthy baseline", () => {
    const status = summarizeTinaIrsAuthorityWatchReport({
      generatedAt: "2026-03-28T22:19:38.079Z",
      results: [
        { ok: true, changeType: "new" },
        { ok: true, changeType: "new" },
      ],
    });

    expect(status.level).toBe("healthy");
    expect(status.newCount).toBe(2);
    expect(status.summary).toContain("first IRS watch baseline");
  });

  it("flags changed sources for review", () => {
    const status = summarizeTinaIrsAuthorityWatchReport({
      generatedAt: "2026-03-28T22:19:38.079Z",
      results: [
        { ok: true, changeType: "changed" },
        { ok: true, changeType: "unchanged" },
      ],
    });

    expect(status.level).toBe("needs_review");
    expect(status.changedCount).toBe(1);
    expect(status.summary).toContain("changed IRS source");
  });

  it("flags failed sources for review", () => {
    const status = summarizeTinaIrsAuthorityWatchReport({
      generatedAt: "2026-03-28T22:19:38.079Z",
      results: [
        { ok: false, changeType: "unchanged" },
        { ok: true, changeType: "unchanged" },
      ],
    });

    expect(status.level).toBe("needs_review");
    expect(status.failedCount).toBe(1);
    expect(status.summary).toContain("could not reach");
  });

  it("reports a missing latest watch file as not run", () => {
    const status = loadTinaIrsAuthorityWatchStatus({
      reportPath: path.join(process.cwd(), "tmp", "missing-tina-irs-watch-latest.json"),
    });

    expect(status.level).toBe("not_run");
    expect(status.summary).toContain("has not run the IRS freshness watch");
  });
});
