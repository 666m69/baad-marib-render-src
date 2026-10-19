import { createFileRoute } from "@tanstack/react-router";
import { withClientIp } from "@/lib/auth/client-ip";
import { auth } from "@/lib/auth/server";

const hops = Number(process.env.TRUST_PROXY_HOPS ?? 1) || 1;
const handle = async (request: Request) => auth.handler(await withClientIp(request, hops));

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
