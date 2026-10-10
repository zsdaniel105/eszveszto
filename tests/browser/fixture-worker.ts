// This entry point is bundled only by the Playwright Wrangler configuration.
// It fixes offers, not actions, answers, clocks or scores. The production entry
// point never imports it and has no fixture endpoint.
import worker, { type Env } from "../../src/server/index";
import { Room as ProductionRoom } from "../../src/server/room";
import { publicRoom, type StoredRoom } from "../../src/server/model";
import { ABILITIES, isAbilityId } from "../../src/shared/sabotage";
export class Room extends ProductionRoom {
  constructor(
    private testContext: DurableObjectState,
    env: Env,
  ) {
    super(testContext, env);
  }
  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== "/fixture-offers")
      return super.fetch(request);
    return this.testContext.blockConcurrencyWhile(async () => {
      const room = await this.testContext.storage.get<StoredRoom>("room");
      if (
        !room ||
        room.phase !== "sabotage-selection" ||
        Object.keys(room.quiz!.sabotage!.choices).length
      )
        return new Response("Fixture requires untouched selection", {
          status: 409,
        });
      const players = room.players;
      room.quiz!.sabotage!.offers[players[0].id] = [
        "freeze",
        "ink",
        "roulette",
      ];
      room.quiz!.sabotage!.offers[players[1].id] = [
        "slime",
        "shuffle",
        "upside-down",
      ];
      const input = await request.json().catch(() => null) as { abilities?: unknown[] } | null;
      if (Array.isArray(input?.abilities) && input.abilities.length <= players.length) {
        for (const [i, ability] of input.abilities.entries()) {
          if (!isAbilityId(ability)) return new Response("Invalid fixture ability", { status: 400 });
          room.quiz!.sabotage!.offers[players[i].id] = [ability, ...ABILITIES.map((a) => a.id).filter((id) => id !== ability).slice(0, 2)];
        }
      }
      room.revision++;
      // Test-only access to the restored cache keeps storage and the actual
      // production action implementation in agreement; no behavior is mocked.
      (this as unknown as { room: StoredRoom }).room = room;
      await this.testContext.storage.put("room", room);
      for (const ws of this.testContext.getWebSockets()) {
        const { playerId, displayId } = ws.deserializeAttachment() as {
          playerId: string | null;
          displayId?: string | null;
        };
        const identity = displayId
          ? { role: "display" as const, id: displayId }
          : playerId
            ? { role: "player" as const, id: playerId }
            : null;
        if (identity && ws.readyState === WebSocket.OPEN)
          ws.send(
            JSON.stringify({
              type: "state",
              room: publicRoom(room, identity),
              playerId: playerId ?? "",
              identityId: identity.id,
              role: identity.role,
              serverTime: Date.now(),
            }),
          );
      }
      return Response.json({ ok: true });
    });
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const match = new URL(request.url).pathname.match(
      /^\/__fixture\/([A-Z2-9]{7})$/,
    );
    if (match && request.method === "POST")
      return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(
        new Request("https://test-only/fixture-offers", { method: "POST", body: await request.text() }),
      );
    return worker.fetch(request, env);
  },
};
