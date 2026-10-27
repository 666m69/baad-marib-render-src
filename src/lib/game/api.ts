import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { z } from "zod";
import { schemas } from "./schemas";
import type { GameResult, WorldSnapshot } from "./types";

/** Validate on the server with zod; malformed input ends the request with 400. */
async function valid<S extends z.ZodType>(schema: S, raw: unknown): Promise<z.infer<S>> {
  const { checked } = await import("./input.server");
  return checked(schema, raw);
}

export const getWorld = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<WorldSnapshot> => {
    const { loadWorld } = await import("./engine.server");
    return loadWorld(context.userId);
  });

export const foundTribe = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; sheikh: string; trait: string; lineage?: string }) => input)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.foundTribe, raw);
    const { foundTribe: found } = await import("./engine.server");
    return found(context.userId, data);
  });

export const upgradeBuilding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((kind: string) => kind)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.kind, raw);
    const { startUpgrade } = await import("./engine.server");
    return startUpgrade(context.userId, data);
  });

export const upgradeField = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((slot: number) => slot)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.slot, raw);
    const { startField } = await import("./engine.server");
    return startField(context.userId, data);
  });

export const startStudy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((kind: string) => kind)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.kind, raw);
    const { startStudy: open } = await import("./engine.server");
    return open(context.userId, data);
  });

export const expandSanctuary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((_: null) => null)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    await valid(schemas.none, raw);
    const { expandSanctuary: expand } = await import("./engine.server");
    return expand(context.userId);
  });

export const extendPeace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((_: null) => null)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    await valid(schemas.none, raw);
    const { extendPeace: extend } = await import("./engine.server");
    return extend(context.userId);
  });

export const relocate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((spot: { x: number; y: number }) => spot)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.spot, raw);
    const { startMove } = await import("./engine.server");
    return startMove(context.userId, data.x, data.y);
  });

export const trainTroops = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind: string; qty: number }) => input)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.train, raw);
    const { train } = await import("./engine.server");
    return train(context.userId, data.kind, data.qty);
  });

export const sendScout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { targetKind: string; targetId: string }) => input)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.scout, raw);
    const { scout } = await import("./engine.server");
    return scout(context.userId, data);
  });

export const sendAttack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { targetKind: string; targetId: string; infantry: number; cavalry: number }) => input)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.attack, raw);
    const { attack } = await import("./engine.server");
    return attack(context.userId, data);
  });

export const hireSaalik = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => id)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.saalik, raw);
    const { hireSaalik: hire } = await import("./engine.server");
    return hire(context.userId, data);
  });

export const claimOath = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((kind: string) => kind)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.kind, raw);
    const { claimOath: claim } = await import("./engine.server");
    return claim(context.userId, data);
  });

export const claimGuide = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((kind: string) => kind)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.kind, raw);
    const { claimGuide: claim } = await import("./engine.server");
    return claim(context.userId, data);
  });

export const barterGoods = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { give: string; take: string; lots: number }) => input)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.barter, raw);
    const { barter } = await import("./engine.server");
    return barter(context.userId, data);
  });

export const claimPasture = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((spot: { x: number; y: number }) => spot)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.spot, raw);
    const { claimPasture: claim } = await import("./engine.server");
    return claim(context.userId, data.x, data.y);
  });

export const releasePasture = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((spot: { x: number; y: number }) => spot)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.spot, raw);
    const { releasePasture: release } = await import("./engine.server");
    return release(context.userId, data.x, data.y);
  });

export const spoilPasture = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { x: number; y: number; infantry: number; cavalry: number }) => input)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    const data = await valid(schemas.spoil, raw);
    const { spoilPasture: spoil } = await import("./engine.server");
    return spoil(context.userId, data.x, data.y, data.infantry, data.cavalry);
  });

export const readReports = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((_: null) => null)
  .handler(async ({ context, data: raw }): Promise<GameResult> => {
    await valid(schemas.none, raw);
    const { markReports } = await import("./engine.server");
    return markReports(context.userId);
  });

export const diwanGate = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { gate } = await import("./diwan.server");
    return gate(context.userId);
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
  .handler(async ({ context, data: raw }) => {
    const data = await valid(schemas.letter, raw);
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
  .handler(async ({ context, data: raw }) => {
    const data = await valid(schemas.reply, raw);
    const { replyLetter: reply } = await import("./diwan.server");
    const error = await reply(context.userId, data.id, data.body);
    return error ? { ok: false as const, error } : { ok: true as const };
  });

