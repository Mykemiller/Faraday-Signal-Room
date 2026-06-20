import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readSignalRoomMeter } from "@/lib/signal-room/meter";

const root = path.resolve(__dirname, "..");

// Strips // line comments and /* */ block comments so the literal scan only
// inspects executable code.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("config-driven meter (FAR-46, §5.4)", () => {
  it("reads the meter from product_meters at runtime", () => {
    const src = readFileSync(path.join(root, "lib/signal-room/meter.ts"), "utf8");
    expect(src).toContain("product_meters");
    expect(src).toContain("product_key");
  });

  it("does NOT hardcode the meter value (10) in the meter read path", () => {
    const files = ["lib/signal-room/meter.ts", "app/api/signal-room/activate/route.ts"];
    for (const f of files) {
      const code = stripComments(readFileSync(path.join(root, f), "utf8"));
      // No standalone numeric literal 10 in executable code (the value lives in the DB).
      expect(code).not.toMatch(/\b10\b/);
    }
  });

  it("meter helper resolves cost and public-visibility from the DB row", async () => {
    const fakeSupabase = {
      from() {
        return this;
      },
      select() {
        return this;
      },
      eq() {
        return this;
      },
      async single() {
        return { data: { product_key: "signal_room", tokens_cost: 10, status: "draft" }, error: null };
      },
    } as unknown as Parameters<typeof readSignalRoomMeter>[0];

    const meter = await readSignalRoomMeter(fakeSupabase);
    expect(meter.tokensCost).toBe(10); // value comes from the (mocked) DB, not code
    expect(meter.isPublic).toBe(false); // draft => not shown publicly
  });
});
