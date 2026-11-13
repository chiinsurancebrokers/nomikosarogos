import test from "node:test";
import assert from "node:assert/strict";
import { extractDecisionCitations, classifyCitations } from "../citations.js";

test("extracts court-decision citations in common Greek forms", () => {
  const got = extractDecisionCitations("βλ. ΑΠ 1497/2023, Α.Π. 12/2020, ΟλΑΠ 3/1989, ΕφΠειρ 613/2024 και ΠΠρΘεσ 36824/2025");
  assert.deepEqual(got, ["ΑΠ 1497/2023", "ΑΠ 12/2020", "ΟλΑΠ 3/1989", "ΕφΠειρ 613/2024", "ΠΠρΘεσ 36824/2025"]);
});

test("does not mistake article numbers or dates for decisions", () => {
  assert.deepEqual(extractDecisionCitations("άρθρο 1857 ΑΚ, 12/2020 και ν. 5303/2026"), []);
});

test("classifies direct, secondhand and missing citations", () => {
  const sources = [
    { ref: "ΑΠ 1497/2023", text: "… όπως έκρινε η ΟλΑΠ 3/1989 …" },
  ];
  const r = classifyCitations("Κατά ΑΠ 1497/2023, ΟλΑΠ 3/1989 και ΑΠ 999/2020", sources);
  assert.deepEqual(r, { direct: ["ΑΠ 1497/2023"], secondhand: ["ΟλΑΠ 3/1989"], missing: ["ΑΠ 999/2020"] });
});
