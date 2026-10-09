import { CODE_PATTERN } from "../shared/game";
import {
  hashCredential,
  record,
  RoomError,
  validateCharacter,
  validateCredential,
  validateNickname,
  validateRole,
} from "./model";
import { errorResponse } from "./room";
export { Room } from "./room";
export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  ROOM_LIMITER: RateLimit;
}
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries({
        ...securityHeaders,
        "Content-Security-Policy": securityHeaders[
          "Content-Security-Policy"
        ].replace(
          "connect-src 'self'",
          `connect-src 'self' ${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`,
        ),
      }))
        headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    }
    try {
      const origin = request.headers.get("Origin");
      if (
        (origin && origin !== url.origin) ||
        (request.headers.get("Upgrade") && origin !== url.origin)
      )
        throw new RoomError("ORIGIN", "Ez a kapcsolat nem engedélyezett.", 403);
      if (url.pathname === "/api/health" && request.method === "GET")
        return Response.json({ ok: true });
      const match = url.pathname.match(
        /^\/api\/rooms\/([A-Z2-9]{7})\/(join|resume|socket)$/,
      );
      if (url.pathname !== "/api/rooms" && !match)
        throw new RoomError("NOT_FOUND", "Ismeretlen kérés.", 404);
      const socket = match?.[2] === "socket";
      if (request.method !== (socket ? "GET" : "POST"))
        throw new RoomError("METHOD", "Nem támogatott kérés.", 405);
      const rate = await env.ROOM_LIMITER.limit({
        key: request.headers.get("CF-Connecting-IP") ?? "development",
      });
      if (!rate.success)
        throw new RoomError(
          "RATE_LIMIT",
          "Túl sok kérés. Várj egy percet, és próbáld újra!",
          429,
        );
      if (match) {
        if (!CODE_PATTERN.test(match[1]))
          throw new RoomError(
            "INVALID_CODE",
            "A szobakód hét betűből és számból áll.",
          );
        const stub = env.ROOMS.get(env.ROOMS.idFromName(match[1]));
        if (socket)
          return await stub.fetch(
            new Request(new URL("/socket", request.url), request),
          );
        const input = await readInput(request, match[2] as "join" | "resume");
        return await stub.fetch(
          new Request(new URL(`/${match[2]}`, request.url), {
            method: "POST",
            body: JSON.stringify(input),
          }),
        );
      }
      const input = await readInput(request, "create");
      // Stable routing makes retries idempotent without a centralized room directory.
      for (let attempt = 0; attempt < 5; attempt++) {
        const hash = await hashCredential(`${input.credential}:${attempt}`);
        const code = Array.from(
          { length: 7 },
          (_, i) =>
            alphabet[
              parseInt(hash.slice(i * 2, i * 2 + 2), 16) % alphabet.length
            ],
        ).join("");
        const response = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(
          new Request(new URL("/create", request.url), {
            method: "POST",
            body: JSON.stringify({ ...input, code }),
          }),
        );
        if (response.status !== 409) return response;
        const error = (await response.clone().json()) as { code: string };
        if (error.code !== "CODE_COLLISION") return response;
      }
      throw new RoomError(
        "COLLISION",
        "Nem sikerült szobakódot foglalni. Próbáld újra!",
        503,
      );
    } catch (error) {
      return errorResponse(error);
    }
  },
} satisfies ExportedHandler<Env>;
async function readInput(
  request: Request,
  purpose: "create" | "join" | "resume",
) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new RoomError("INVALID_INPUT", "JSON-kérés szükséges.", 415);
  if (Number(request.headers.get("Content-Length")) > 4096)
    throw new RoomError("INVALID_INPUT", "Túl nagy kérés.", 413);
  // Read a bounded stream; Content-Length is optional and cannot be trusted.
  const reader = request.body?.getReader();
  if (!reader) throw new RoomError("INVALID_INPUT", "Hiányzó kérés.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 4096) {
      await reader.cancel();
      throw new RoomError("INVALID_INPUT", "Túl nagy kérés.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let input: Record<string, unknown>;
  try {
    input = record(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new RoomError("INVALID_INPUT", "Hibás kérés. Próbáld újra!");
  }
  const role = validateRole(input.role);
  if (purpose === "join" && role !== "player")
    throw new RoomError(
      "PLAYER_ONLY",
      "A meghívóval játékosként csatlakozhatsz.",
      403,
    );
  return {
    role,
    credential: validateCredential(input.credential),
    ...(role === "player" && purpose !== "resume"
      ? {
          nickname: validateNickname(input.nickname),
          character: validateCharacter(input.character),
        }
      : {}),
  };
}
