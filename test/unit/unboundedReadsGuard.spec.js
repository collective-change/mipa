import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  GUARD_KIND,
  KNOWN_FIXED_INSTANCES,
  UNBOUNDED_READ_EXCEPTIONS,
  scanSourceForUnboundedReads,
  scanWorkspaceForUnboundedReads,
  validateExceptionList,
  measureOrgFirestoreReadCost,
  findMatchingException,
  normalizeCode
} from "@/utils/unboundedReadsGuard";

describe("MIPA-45: Unbounded Firestore Read Guard & Read Cost Measurement", () => {
  it("declares the guard mechanism explicitly", () => {
    expect(GUARD_KIND).toBe("static-source-and-query-scanner-vitest");
  });

  it("scans the workspace and passes with zero unapproved unbounded collection reads", () => {
    const report = scanWorkspaceForUnboundedReads(process.cwd());

    expect(report.scannedFiles).toBeGreaterThan(20);
    expect(report.totalCheckedReads).toBeGreaterThan(10);
    expect(report.violations, report.violations.map((v) => v.message).join("\n")).toEqual([]);
  });

  it("verifies all three historical instances (MIPA-10, MIPA-23, MIPA-38) pass on their default bounded paths", () => {
    expect(KNOWN_FIXED_INSTANCES.map((i) => i.id)).toEqual(["MIPA-10", "MIPA-23", "MIPA-38"]);

    // 1. MIPA-10: store-actions.js passes completely with zero exceptions needed
    const actionsSource = fs.readFileSync(path.resolve(process.cwd(), "src/store/store-actions.js"), "utf8");
    const actionsScan = scanSourceForUnboundedReads(actionsSource, "src/store/store-actions.js");
    expect(actionsScan.violations).toEqual([]);
    expect(actionsScan.approvedExceptionsHit).toEqual([]);
    expect(actionsScan.checkedReads).toBeGreaterThanOrEqual(2);

    // 2. MIPA-23: store-model.js default bindNodes branch passes; explicit Load-All branch is dated/explained
    const modelSource = fs.readFileSync(path.resolve(process.cwd(), "src/store/store-model.js"), "utf8");
    const modelScan = scanSourceForUnboundedReads(modelSource, "src/store/store-model.js");
    expect(modelScan.violations).toEqual([]);
    expect(modelScan.approvedExceptionsHit.some((e) => e.id === "MIPA-23-LOAD-ALL" && e.line === 334)).toBe(true);

    // 3. MIPA-38: PageModelDossier.vue default fetchNodes branch passes; explicit Load-All branch is dated/explained
    const dossierSource = fs.readFileSync(path.resolve(process.cwd(), "src/pages/PageModelDossier.vue"), "utf8");
    const dossierScan = scanSourceForUnboundedReads(dossierSource, "src/pages/PageModelDossier.vue");
    expect(dossierScan.violations).toEqual([]);
    expect(dossierScan.approvedExceptionsHit.some((e) => e.id === "MIPA-38-LOAD-ALL" && e.line === 743)).toBe(true);
  });

  it("ensures every registered exception has a valid reason, ISO date, and existing file/line", () => {
    const check = validateExceptionList(UNBOUNDED_READ_EXCEPTIONS, process.cwd());
    expect(check.valid, check.errors.join("\n")).toBe(true);

    const invalidCheck = validateExceptionList(
      [
        {
          id: "BAD-EX",
          file: "src/store/store-actions.js",
          line: 10,
          date: "invalid-date",
          reason: "too short"
        }
      ],
      process.cwd()
    );
    expect(invalidCheck.valid).toBe(false);
    expect(invalidCheck.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("positive control 1: fails and names exact file and line for an unbounded getDocs collection read", () => {
    const syntheticPage = [
      "<template><div /></template>",
      "<script>",
      "import { collection, getDocs } from 'firebase/firestore';",
      "import { firebaseDb } from '@/boot/firebase';",
      "export default {",
      "  methods: {",
      "    async loadEverything(modelId) {",
      "      // comment line",
      "      const colRef = collection(firebaseDb, 'models', modelId, 'nodes');",
      "      const a = 1;",
      "      const b = a + 1;",
      "      const snap = await getDocs(colRef);",
      "      return snap.docs;",
      "    }",
      "  }",
      "};",
      "</script>"
    ].join("\n");

    const res = scanSourceForUnboundedReads(syntheticPage, "src/pages/SyntheticPage.vue", []);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].file).toBe("src/pages/SyntheticPage.vue");
    expect(res.violations[0].line).toBe(12);
    expect(res.violations[0].message).toContain("src/pages/SyntheticPage.vue:12");
  });

  it("positive control 2: fails and names exact file and line for an unbounded bindFirestoreRef query", () => {
    const syntheticStore = [
      "import { collection, query, where } from 'firebase/firestore';",
      "import { firebaseDb } from '@/boot/firebase';",
      "import { firestoreAction } from './firestore-bind';",
      "export default {",
      "  actions: {",
      "    bindAll: firestoreAction(({ bindFirestoreRef }, orgId) => {",
      "      const q = query(collection(firebaseDb, 'actions'), where('orgId', '==', orgId));",
      "      return bindFirestoreRef('actions', q);",
      "    })",
      "  }",
      "};"
    ].join("\n");

    const res = scanSourceForUnboundedReads(syntheticStore, "src/store/store-synthetic.js", []);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].file).toBe("src/store/store-synthetic.js");
    expect(res.violations[0].line).toBe(8);
    expect(res.violations[0].message).toContain("src/store/store-synthetic.js:8");
  });

  it("positive control 3: fails and names exact file and line for an unbounded Admin SDK collection read", () => {
    const syntheticFunction = [
      "import { onCall } from 'firebase-functions/v2/https';",
      "import { getFirestore } from 'firebase-admin/firestore';",
      "export const listPublicItems = onCall(async (req) => {",
      "  const orgId = String(req.data?.orgId || '');",
      "  const db = getFirestore();",
      "  if (!orgId) {",
      "    return { items: [] };",
      "  }",
      "  const header = db.collection('orgs').doc(orgId).get();",
      "  void header;",
      "  // Next query reads the whole actions collection for the org with no limit:",
      "  const ok = orgId.length > 0;",
      "  if (!ok) return { items: [] };",
      "  const allDocs = [];",
      "  const snap = await db.collection('actions').where('orgId', '==', orgId).get();",
      "  snap.forEach((d) => allDocs.push(d.data()));",
      "  return { items: allDocs };",
      "});"
    ].join("\n");

    const res = scanSourceForUnboundedReads(syntheticFunction, "functions/src/syntheticPublic.ts", []);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].file).toBe("functions/src/syntheticPublic.ts");
    expect(res.violations[0].line).toBe(15);
    expect(res.violations[0].message).toContain("functions/src/syntheticPublic.ts:15");
  });

  it("ignores commented-out reads, single-doc reads, and cursor-windowed reads", () => {
    const cleanSource = [
      "import { collection, doc, query, where, startAfter, limit, getDocs, onSnapshot } from 'firebase/firestore';",
      "// const snap = await getDocs(collection(firebaseDb, 'actions'));",
      "/* bindFirestoreRef('all', collection(firebaseDb, 'orgs')); */",
      "export async function run(db, id, cursor) {",
      "  onSnapshot(doc(db, 'orgs', id), () => {});",
      "  const windowed = query(collection(db, 'actions'), where('orgId', '==', id), startAfter(cursor), limit(25));",
      "  return getDocs(windowed);",
      "}"
    ].join("\n");

    const res = scanSourceForUnboundedReads(cleanSource, "src/store/store-clean.js", []);
    expect(res.violations).toEqual([]);
  });

  it("reports measured Firestore read cost per active organisation for average and large-scale orgs", () => {
    const costReport = measureOrgFirestoreReadCost();

    expect(costReport.telemetryDate).toBe("2026-11-18");
    expect(costReport.defaultBound).toBe(50);

    // Production mipa-2 average (17.25 factors, 3 actions)
    expect(costReport.productionAverage.bounded.readsPerMemberSession).toBe(35.25);
    expect(costReport.productionAverage.bounded.readsPerDossierView).toBe(22.25);
    expect(costReport.productionAverage.bounded.monthlyReads).toBe(4637.5);
    expect(costReport.productionAverage.bounded.monthlyCostUsd).toBeCloseTo(0.002783, 5);

    // Large scale org (500 factors, 400 actions, 100 workspace sessions + 500 dossier views)
    expect(costReport.largeScaleOrg.unbounded.readsPerMemberSession).toBe(913);
    expect(costReport.largeScaleOrg.bounded.readsPerMemberSession).toBe(115);
    expect(costReport.largeScaleOrg.unbounded.monthlyReads).toBe(541800);
    expect(costReport.largeScaleOrg.bounded.monthlyReads).toBe(237500);
    expect(costReport.largeScaleOrg.savings.monthlyReadsSaved).toBe(304300);
    expect(costReport.largeScaleOrg.savings.reductionPct).toBeCloseTo(56.16, 1);
  });

  describe("todo254: Anchor-based exception matching and line-shift tolerance", () => {
    it("an edit that shifts an exempted read's line (e.g. inserting two filler lines above it) does not break the guard", () => {
      const original = fs.readFileSync(path.resolve(process.cwd(), "functions/src/notifications/weeklyDigest.ts"), "utf8");
      const lines = original.split(/\r?\n/);
      // Insert two filler lines above line 512 (e.g. at line 500)
      lines.splice(499, 0, "// todo254: filler line 1", "// todo254: filler line 2");
      const shiftedSource = lines.join("\n");

      const scan = scanSourceForUnboundedReads(shiftedSource, "functions/src/notifications/weeklyDigest.ts");
      expect(scan.violations).toEqual([]);
      // The exempted read was shifted from line 512 to 514, and is matched cleanly via its anchor
      expect(scan.approvedExceptionsHit.some((e) => e.id === "WEEKLY-DIGEST-FETCH-MOCK-FALLBACK" && e.line === 514)).toBe(true);
    });

    it("a genuinely new unbounded read at a previously-exempted line still fails (negative control)", () => {
      const original = fs.readFileSync(path.resolve(process.cwd(), "functions/src/notifications/weeklyDigest.ts"), "utf8");
      const lines = original.split(/\r?\n/);
      // At line 512 (0-based 511), replace the exempted read with an unauthorized unbounded read
      lines[511] = "      const snap = await db.collection('unauthorizedNewUnboundedCollection').get();";
      const tamperedSource = lines.join("\n");

      const scan = scanSourceForUnboundedReads(tamperedSource, "functions/src/notifications/weeklyDigest.ts");
      expect(scan.violations.length).toBeGreaterThanOrEqual(1);
      const violation = scan.violations.find((v) => v.line === 512);
      expect(violation).toBeDefined();
      expect(violation.message).toContain("unauthorizedNewUnboundedCollection");
    });

    it("findMatchingException resolves by anchor across proximity window and ignores non-matching code", () => {
      const mockExceptions = [
        {
          id: "EX-1",
          file: "src/store/test-store.js",
          line: 20,
          anchor: 'collection(firebaseDb, "actions")',
          date: "2026-11-24",
          reason: "Approved exception for testing anchor matching logic."
        }
      ];

      // Match with shifted line within proximity window (line 25 in a 30-line file)
      const validLines = Array(30).fill("// filler");
      validLines[24] = 'const q = collection(firebaseDb, "actions");';
      const match = findMatchingException(mockExceptions, "src/store/test-store.js", 25, {
        rawLines: validLines
      });
      expect(match).not.toBeNull();
      expect(match?.id).toBe("EX-1");

      // Mismatch when anchor is absent even if line is identical (line 20)
      const mismatchLines = Array(30).fill("// filler");
      mismatchLines[19] = "const q = collection(firebaseDb, 'completelyDifferentCollection');";
      const mismatch = findMatchingException(mockExceptions, "src/store/test-store.js", 20, {
        rawLines: mismatchLines
      });
      expect(mismatch).toBeNull();

      // Mismatch when exception has already been claimed in the same file
      const claimedSet = new Set(["EX-1"]);
      const alreadyClaimed = findMatchingException(mockExceptions, "src/store/test-store.js", 25, {
        rawLines: validLines,
        claimedIds: claimedSet
      });
      expect(alreadyClaimed).toBeNull();
    });

    it("normalizeCode handles whitespace, newlines, and punctuation variations", () => {
      expect(normalizeCode("  foo(  bar ,  baz  ) ")).toBe("foo(bar,baz)");
      expect(normalizeCode("a\n  ? b\n  : c")).toBe("a?b:c");
    });
  });
});
