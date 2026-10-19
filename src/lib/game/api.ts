import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { GameResult, WorldSnapshot } from "./types";

export const getWorld = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<WorldSnapshot> => {
    const { loadWorld } = await import("./engine.server");
    return loadWorld(context.userId);
  });

export const foundTribe = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; sheikh: string; trait: string; lineage?: string }) => input)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { foundTribe: found } = await import("./engine.server");
    return found(context.userId, data);
  });

export const upgradeBuilding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((kind: string) => kind)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { startUpgrade } = await import("./engine.server");
    return startUpgrade(context.userId, data);
  });

export const upgradeField = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((slot: number) => slot)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { startField } = await import("./engine.server");
    return startField(context.userId, data);
  });

export const startStudy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((kind: string) => kind)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { startStudy: open } = await import("./engine.server");
    return open(context.userId, data);
  });

export const expandSanctuary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((_: null) => null)
  .handler(async ({ context }): Promise<GameResult> => {
    const { expandSanctuary: expand } = await import("./engine.server");
    return expand(context.userId);
  });

export const extendPeace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((_: null) => null)
  .handler(async ({ context }): Promise<GameResult> => {
    const { extendPeace: extend } = await import("./engine.server");
    return extend(context.userId);
  });

export const relocate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((spot: { x: number; y: number }) => spot)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { startMove } = await import("./engine.server");
    return startMove(context.userId, data.x, data.y);
  });

export const trainTroops = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind: string; qty: number }) => input)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { train } = await import("./engine.server");
    return train(context.userId, data.kind, data.qty);
  });

export const sendScout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { targetKind: string; targetId: string }) => input)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { scout } = await import("./engine.server");
    return scout(context.userId, data);
  });

export const sendAttack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { targetKind: string; targetId: string; infantry: number; cavalry: number }) => input)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { attack } = await import("./engine.server");
    return attack(context.userId, data);
  });

export const hireSaalik = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => id)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { hireSaalik: hire } = await import("./engine.server");
    return hire(context.userId, data);
  });

export const claimOath = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((kind: string) => kind)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { claimOath: claim } = await import("./engine.server");
    return claim(context.userId, data);
  });

export const claimGuide = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((kind: string) => kind)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { claimGuide: claim } = await import("./engine.server");
    return claim(context.userId, data);
  });

export const barterGoods = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { give: string; take: string; lots: number }) => input)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { barter } = await import("./engine.server");
    return barter(context.userId, data);
  });

export const claimPasture = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((spot: { x: number; y: number }) => spot)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { claimPasture: claim } = await import("./engine.server");
    return claim(context.userId, data.x, data.y);
  });

export const releasePasture = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((spot: { x: number; y: number }) => spot)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { releasePasture: release } = await import("./engine.server");
    return release(context.userId, data.x, data.y);
  });

export const spoilPasture = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { x: number; y: number; infantry: number; cavalry: number }) => input)
  .handler(async ({ context, data }): Promise<GameResult> => {
    const { spoilPasture: spoil } = await import("./engine.server");
    return spoil(context.userId, data.x, data.y, data.infantry, data.cavalry);
  });

export const readReports = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((_: null) => null)
  .handler(async ({ context }): Promise<GameResult> => {
    const { markReports } = await import("./engine.server");
    return markReports(context.userId);
  });

export const diwanGate = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { gate } = await import("./diwan.server");
    return gate(context.userId);
  });

export const claimSteward = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((_: null) => null)
  .handler(async ({ context }) => {
    const { claimSteward: claim } = await import("./diwan.server");
    const error = await claim(context.userId);
    return error ? { ok: false as const, error } : { ok: true as const };
  });

export const myLetter = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { myLetter: read } = await import("./diwan.server");
    return read(context.userId);
  });

export const sendLetter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((body: string) => body)
  .handler(async ({ context, data }) => {
    const { sendLetter: send } = await import("./diwan.server");
    const error = await send(context.userId, data);
    return error ? { ok: false as const, error } : { ok: true as const };
  });

export const loadDiwan = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { loadDiwan: load } = await import("./diwan.server");
    return load(context.userId);
  });

export const replyLetter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; body: string }) => input)
  .handler(async ({ context, data }) => {
    const { replyLetter: reply } = await import("./diwan.server");
    const error = await reply(context.userId, data.id, data.body);
    return error ? { ok: false as const, error } : { ok: true as const };
  });

