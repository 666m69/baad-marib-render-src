import { createFileRoute } from "@tanstack/react-router";
import { proxyHops, withClientIp } from "@/lib/auth/client-ip";
import { auth } from "@/lib/auth/server";

const hops = proxyHops();
const handle = async (request: Request) => auth.handler(await withClientIp(request, hops));

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
