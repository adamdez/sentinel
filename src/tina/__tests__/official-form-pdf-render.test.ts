import { describe, expect, it } from "vitest";
import { getTinaOfficialFormPythonCandidates } from "@/tina/lib/official-form-pdf-render";

describe("getTinaOfficialFormPythonCandidates", () => {
  it("prefers the explicit override first", () => {
    const candidates = getTinaOfficialFormPythonCandidates("win32", "C:/Python312/python.exe");

    expect(candidates[0]).toEqual({
      command: "C:/Python312/python.exe",
      argsPrefix: [],
    });
  });

  it("includes a Windows py fallback", () => {
    const candidates = getTinaOfficialFormPythonCandidates("win32");

    expect(candidates).toEqual(
      expect.arrayContaining([{ command: "py", argsPrefix: ["-3"] }])
    );
  });

  it("does not duplicate candidates when the override matches python", () => {
    const candidates = getTinaOfficialFormPythonCandidates("linux", "python");

    expect(candidates.filter((candidate) => candidate.command === "python")).toHaveLength(1);
  });
});
