import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static check: the squad admin surface must stay behind adminProcedure.
 * A regression here would let any logged-in user approve squads or run live steps.
 */
const ADMIN_ONLY: Array<{ file: string; procs: string[] }> = [
  { file: "adminProcedures.ts", procs: ["listForAdmin", "getForAdmin", "approve", "reject", "getStepsAdmin", "setStepOutputType"] },
  { file: "stepProcedures.ts", procs: ["runStepLive"] },
];

function procedureBase(src: string, name: string): string | null {
  const m = new RegExp(`^\\s{2}${name}:\\s*(\\w+)`, "m").exec(src);
  return m ? m[1] : null;
}

describe("squadTemplate admin procedures", () => {
  for (const { file, procs } of ADMIN_ONLY) {
    const src = readFileSync(join(__dirname, file), "utf8");
    for (const name of procs) {
      it(`${file}: ${name} uses adminProcedure`, () => {
        expect(procedureBase(src, name)).toBe("adminProcedure");
      });
    }
  }

  it("no admin-named procedure in squadTemplate/ is built on a weaker base", () => {
    for (const file of ["adminProcedures.ts", "stepProcedures.ts", "catalogProcedures.ts"]) {
      const src = readFileSync(join(__dirname, file), "utf8");
      for (const m of src.matchAll(/^\s{2}(\w*(?:Admin|approve|reject|Live)\w*):\s*(\w+)/gm)) {
        expect({ file, name: m[1], base: m[2] }).toEqual({ file, name: m[1], base: "adminProcedure" });
      }
    }
  });
});
