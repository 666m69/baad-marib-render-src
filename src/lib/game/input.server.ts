import { setResponseStatus } from "@tanstack/react-start/server";
import type { z } from "zod";
import { checkInput } from "./schemas";

/** Server-side input check for server functions: bad input answers 400. */
export function checked<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  return checkInput(schema, raw, (status) => setResponseStatus(status));
}
