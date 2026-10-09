// This entry point is bundled only by the Playwright Wrangler configuration.
// It fixes offers, not actions, answers, clocks or scores. The production entry
// point never imports it and has no fixture endpoint.
import worker, { type Env } from "../../src/server/index";
import { Room as ProductionRoom } from "../../src/server/room";
import { publicRoom, type StoredRoom } from "../../src/server/model";
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
      room.revision++;
      // Test-only access to the restored cache keeps storage and the actual
      // production action implementation in agreement; no behavior is mocked.
      (this as unknown as { room: StoredRoom }).room = room;
      await this.testContext.storage.put("room", room);
      for (const ws of this.testContext.getWebSockets()) {
        const { playerId } = ws.deserializeAttachment() as {
          playerId: string | null;
        };
        if (playerId && ws.readyState === WebSocket.OPEN)
          ws.send(
            JSON.stringify({
              type: "state",
              room: publicRoom(room, playerId),
              playerId,
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
        "https://test-only/fixture-offers",
      );
    return worker.fetch(request, env);
  },
};
