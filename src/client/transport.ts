import type {
  Action,
  PublicRoom,
  ServerMessage,
  Session,
} from "../shared/game";
export type Connection =
  "connecting" | "online" | "reconnecting" | "offline" | "expired" | "replaced";
export interface Callbacks {
  state: (room: PublicRoom, playerId: string) => void;
  connection: (state: Connection) => void;
  error: (message: string) => void;
}
export class RoomConnection {
  private ws: WebSocket | null = null;
  private stopped = false;
  private retries = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private handshake?: ReturnType<typeof setTimeout>;
  private lastMessage = 0;
  private pending = new Map<
    string,
    {
      resolve: () => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private session: Session,
    private callbacks: Callbacks,
  ) {}
  start() {
    this.connect();
    window.addEventListener("online", this.resume);
    document.addEventListener("visibilitychange", this.resume);
  }
  private resume = () => {
    if (document.visibilityState !== "visible" || this.stopped) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (Date.now() - this.lastMessage > 60_000) this.ws.close();
      else this.ws.send(JSON.stringify({ type: "ping" }));
    } else {
      clearTimeout(this.retryTimer);
      this.connect();
    }
  };
  private connect() {
    if (
      this.stopped ||
      this.ws?.readyState === WebSocket.CONNECTING ||
      this.ws?.readyState === WebSocket.OPEN
    )
      return;
    this.callbacks.connection(this.retries ? "reconnecting" : "connecting");
    const url = new URL(
      `/api/rooms/${this.session.code}/socket`,
      location.href,
    );
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = (this.ws = new WebSocket(url));
    this.handshake = setTimeout(() => ws.close(), 12_000);
    ws.onopen = () => {
      if (this.stopped) {
        ws.close();
        return;
      }
      ws.send(
        JSON.stringify({
          type: "authenticate",
          credential: this.session.credential,
        }),
      );
    };
    ws.onmessage = (event) => {
      if (this.stopped) return;
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        this.callbacks.error("Hibás üzenet érkezett. Újra csatlakozunk.");
        ws.close();
        return;
      }
      this.lastMessage = Date.now();
      if (message.type === "state") {
        clearTimeout(this.handshake);
        this.retries = 0;
        this.callbacks.connection("online");
        this.callbacks.state(message.room, message.playerId);
        if (!this.heartbeat)
          this.heartbeat = setInterval(() => {
            if (Date.now() - this.lastMessage > 55_000) {
              ws.close();
              return;
            }
            if (ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: "ping" }));
          }, 20_000);
      } else if (message.type === "ack") this.finish(message.requestId);
      else if (message.type === "error") {
        if (message.requestId) this.finish(message.requestId, message.message);
        else this.callbacks.error(message.message);
      }
    };
    ws.onclose = (event) => {
      clearTimeout(this.handshake);
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
      for (const id of this.pending.keys())
        this.finish(
          id,
          "A kapcsolat megszakadt. Ellenőrizd az újraszinkronizált állapotot!",
        );
      if (this.stopped) return;
      if (event.code === 4002 || event.code === 4003 || event.code === 4004) {
        this.stopped = true;
        this.callbacks.connection(event.code === 4002 ? "replaced" : "expired");
        this.callbacks.error(
          event.reason || "A belépésed lejárt. Csatlakozz újra!",
        );
        return;
      }
      this.callbacks.connection(navigator.onLine ? "reconnecting" : "offline");
      this.retries++;
      // An HTTP 404 cannot upgrade; check once so missing rooms do not retry forever.
      if (this.retries === 3) {
        void fetch(`/api/rooms/${this.session.code}/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nickname: "Újracsatlakozó",
            character: "paca",
            credential: this.session.credential,
          }),
        })
          .then(async (r) => {
            if (r.status === 404 || r.status === 401) {
              this.stopped = true;
              clearTimeout(this.retryTimer);
              this.callbacks.connection("expired");
              this.callbacks.error(
                ((await r.json()) as { error: string }).error,
              );
            }
          })
          .catch(() => {
            /* network recovery continues */
          });
      }
      this.retryTimer = setTimeout(
        () => this.connect(),
        Math.min(10_000, 700 * 2 ** Math.min(this.retries, 4)) +
          Math.random() * 300,
      );
    };
    ws.onerror = () => {
      /* onclose reports and retries network failures */
    };
  }
  send(action: Action): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN || !this.lastMessage)
      return Promise.reject(new Error("Várd meg, amíg újra kapcsolódunk!"));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.finish(
            requestId,
            "Nem érkezett visszajelzés. Ellenőrizd a kapcsolatot és a szoba állapotát!",
          ),
        8000,
      );
      this.pending.set(requestId, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ ...action, requestId }));
    });
  }
  private finish(id: string, message?: string) {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    if (message) p.reject(new Error(message));
    else p.resolve();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.handshake);
    clearInterval(this.heartbeat);
    window.removeEventListener("online", this.resume);
    document.removeEventListener("visibilitychange", this.resume);
    this.ws?.close(1000);
    for (const id of this.pending.keys())
      this.finish(id, "A kapcsolat lezárult.");
  }
}
const PREFIX = "eszveszto:room:";
export function newCredential(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export function saveSession(session: Session): boolean {
  try {
    localStorage.setItem(PREFIX + session.code, JSON.stringify(session));
    localStorage.setItem("eszveszto:last", session.code);
    return true;
  } catch {
    return false;
  }
}
export function readSession(code?: string): Session | null {
  try {
    const key = code ?? localStorage.getItem("eszveszto:last");
    if (!key) return null;
    const session = JSON.parse(
      localStorage.getItem(PREFIX + key) ?? "null",
    ) as Session | null;
    return session &&
      /^[A-HJ-NP-Z2-9]{7}$/.test(session.code) &&
      /^[A-Za-z0-9_-]{43}$/.test(session.credential)
      ? session
      : null;
  } catch {
    return null;
  }
}
export function forgetSession(code: string) {
  try {
    localStorage.removeItem(PREFIX + code);
    if (localStorage.getItem("eszveszto:last") === code)
      localStorage.removeItem("eszveszto:last");
  } catch {
    /* storage can be unavailable */
  }
}
