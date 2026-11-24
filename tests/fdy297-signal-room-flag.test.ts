import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResolver } from "@/lib/config/resolver";
import { SIGNAL_ROOM_SETTING_SPECS, signalRoomLive } from "@/lib/signal-room/flags";

// FDY-297: NEXT_PUBLIC_SIGNAL_ROOM_LIVE read as data (app SR, key signal_room_live), env as the fallback.
const URL = "https://ycadmmngkdhvpcsrcuaq.supabase.co";
const row = (value: unknown, source = "setting") =>
  ({ app_code: "SR", scope: "default", key: "signal_room_live", value, source, is_default: source === "default" });
const resolverWith = (rows: unknown, ok = true) =>
  createResolver({ url: URL, key: "test-key", client: async () => ({ ok, json: async () => rows }) });

const saved = process.env.NEXT_PUBLIC_SIGNAL_ROOM_LIVE;
beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_SIGNAL_ROOM_LIVE;
  else process.env.NEXT_PUBLIC_SIGNAL_ROOM_LIVE = saved;
  vi.restoreAllMocks();
});

describe("FDY-297 Signal Room live flag", () => {
  it("is the SR setting signal_room_live", () => {
    expect(SIGNAL_ROOM_SETTING_SPECS.live.key).toBe("signal_room_live");
  });

  it("uses the console value", async () => {
    process.env.NEXT_PUBLIC_SIGNAL_ROOM_LIVE = "false";
    expect(await signalRoomLive(resolverWith([row(true)]))).toBe(true);
    process.env.NEXT_PUBLIC_SIGNAL_ROOM_LIVE = "true";
    expect(await signalRoomLive(resolverWith([row(false)]))).toBe(false);
  });

  it("falls back to the env value when the read fails", async () => {
    process.env.NEXT_PUBLIC_SIGNAL_ROOM_LIVE = "false";
    expect(await signalRoomLive(resolverWith([], false))).toBe(false);
    process.env.NEXT_PUBLIC_SIGNAL_ROOM_LIVE = "true";
    expect(await signalRoomLive(resolverWith([], false))).toBe(true);
  });

  it("defers a definition default to env, and stays OFF when env is unset", async () => {
    delete process.env.NEXT_PUBLIC_SIGNAL_ROOM_LIVE;
    expect(await signalRoomLive(resolverWith([row(true, "default")]))).toBe(false);
    expect(await signalRoomLive(resolverWith([row("true")]))).toBe(false); // wrong type → env
  });
});
