import { GameView } from "./GameView";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CHARACTERS,
  CODE_PATTERN,
  DIFFICULTIES,
  characterById,
  type Action,
  type CharacterId,
  type PublicRoom,
  type Session,
} from "../shared/game";
import {
  forgetSession,
  newCredential,
  readSession,
  RoomConnection,
  saveSession,
  type Connection,
} from "./transport";

type View = "home" | "create" | "join" | "room";
function initialView(): { view: View; code: string; session: Session | null } {
  const code =
    location.pathname.match(/^\/join\/([^/]+)\/?$/)?.[1].toUpperCase() ?? "";
  const session = code ? readSession(code) : null;
  return { view: session ? "room" : code ? "join" : "home", code, session };
}
function Burst({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 80" aria-hidden="true">
      <path
        fill="currentColor"
        d="M36 0h8l2 25 19-17 6 6-17 20 26 2v8l-26 2 17 19-6 6-19-17-2 26h-8l-2-26-20 17-6-6 17-19L0 44v-8l25-2L8 14l6-6 20 17z"
      />
    </svg>
  );
}
function Arrow() {
  return (
    <svg className="arrow-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18 18 6M6 6h12v12"
      />
    </svg>
  );
}
function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`logo ${small ? "small" : ""}`} aria-label="Észvesztő">
      ész<span>vesztő</span>
      <Burst className="brand-burst" />
    </div>
  );
}
function Notice({
  children,
  kind = "error",
}: {
  children: React.ReactNode;
  kind?: "error" | "info";
}) {
  return (
    <div
      className={`notice ${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
function CharacterPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: CharacterId;
  onChange: (id: CharacterId) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="character-field" disabled={disabled}>
      <legend>Ki leszel ma?</legend>
      <div className="character-grid">
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`character-card ${value === c.id ? "selected" : ""}`}
            aria-pressed={value === c.id}
            onClick={() => onChange(c.id)}
            style={{ "--character-color": c.color } as CSSProperties}
          >
            <span className="character-icon" aria-hidden="true">
              {c.icon}
            </span>
            <span>{c.name}</span>
            {value === c.id && (
              <span className="selected-mark" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="character-motto">
        {characterById(value).motto}{" "}
        <span>Csak a stílus számít – nincs extra képesség.</span>
      </p>
    </fieldset>
  );
}
export function App() {
  const [route, setRoute] = useState(initialView);
  const [storageWarning, setStorageWarning] = useState(false);
  function navigate(view: View, code = "", session: Session | null = null) {
    history.pushState(null, "", code ? `/join/${code}` : "/");
    setRoute({ view, code, session });
  }
  useEffect(() => {
    const pop = () => setRoute(initialView());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function entered(session: Session) {
    setStorageWarning(!saveSession(session));
    navigate("room", session.code, session);
  }
  return (
    <div className={`app ${route.view === "home" ? "home-app" : ""}`}>
      <header className="topbar">
        <button
          className="brand-button"
          aria-label="Észvesztő főmenü"
          onClick={() => navigate("home")}
        >
          <Logo small />
        </button>
        <span className="top-label">TUDÁS. TRÉFA. KÁOSZ.</span>
        <span className="edition">MÁSODIK FELVONÁS</span>
      </header>
      {route.view === "home" ? (
        <Home onNavigate={navigate} />
      ) : route.view === "room" && route.session ? (
        <RoomView
          key={route.session.code}
          session={route.session}
          storageWarning={storageWarning}
          onExit={() => {
            forgetSession(route.session!.code);
            navigate("home");
          }}
          onRejoin={() => {
            forgetSession(route.code);
            navigate("join", route.code);
          }}
        />
      ) : (
        <Entry
          mode={route.view === "create" ? "create" : "join"}
          initialCode={route.code}
          onBack={() => navigate("home")}
          onEnter={entered}
        />
      )}
      <footer>
        2–8 barát · Egy szoba · Rengeteg káosz{" "}
        <span>Észvesztő © {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
function Home({
  onNavigate,
}: {
  onNavigate: (view: View, code?: string, session?: Session | null) => void;
}) {
  const last = readSession();
  return (
    <main className="home-layout">
      <section className="hero">
        <div className="eyebrow">
          <span /> A BARÁTI KÁOSZ ITT KEZDŐDIK
        </div>
        <Logo />
        <h1>
          Egy kis tudás.
          <br />
          Egy nagy adag <em>káosz.</em>
        </h1>
        <p className="intro">
          Hívd a barátokat, válassz egy figurát, és készüljetek az észvesztésre.
          A legjobb partihoz csak ti hiányoztok.
        </p>
        <div className="home-actions">
          <button className="primary" onClick={() => onNavigate("create")}>
            Játék létrehozása <Arrow />
          </button>
          <button className="secondary" onClick={() => onNavigate("join")}>
            Csatlakozás <span aria-hidden="true">→</span>
          </button>
        </div>
        {last && (
          <button
            className="text-button resume"
            onClick={() => onNavigate("room", last.code, last)}
          >
            Vissza a szobámba · {last.code}
          </button>
        )}
        <div className="hero-meta">
          <span>✦ Ingyenes parti</span>
          <span>✓ Nem kell regisztráció</span>
        </div>
      </section>
      <section
        className="party-poster"
        aria-label="Ismerd meg a parti figuráit"
      >
        <div className="poster-label">A CSAPAT? KISSÉ SZÉTSZÓRT.</div>
        <div className="poster-cast">
          {[CHARACTERS[0], CHARACTERS[3], CHARACTERS[5], CHARACTERS[4]].map(
            (c, i) => (
              <div
                key={c.id}
                className={`cast cast-${i}`}
                style={{ "--character-color": c.color } as CSSProperties}
              >
                <span aria-hidden="true">{c.icon}</span>
                <b>{c.name}</b>
              </div>
            ),
          )}
          <Burst className="party-star" />
        </div>
        <div className="poster-note">
          <b>
            Komolyan venni?
            <br />
            Nem kötelező.
          </b>
          <span>
            8 figura.
            <br />
            Végtelen személyiség.
          </span>
        </div>
      </section>
      <section className="how-strip" aria-label="Így indul a parti">
        <div>
          <b>01</b>
          <span>
            <strong>Nyiss egy szobát!</strong>Te leszel a házigazda.
          </span>
        </div>
        <div>
          <b>02</b>
          <span>
            <strong>Küldd körbe a linket!</strong>A barátaid egyből beléphetnek.
          </span>
        </div>
        <div>
          <b>03</b>
          <span>
            <strong>Jöhet az egész csapat!</strong>Jelezzétek, ha készen álltok.
          </span>
        </div>
      </section>
      <p className="milestone-note">
        Szavazzatok témára, válaszoljatok, és fordítsatok a dupla pontos
        döntőben! A szabotázs a következő felvonásban érkezik.
      </p>
    </main>
  );
}
function Entry({
  mode,
  initialCode,
  onBack,
  onEnter,
}: {
  mode: "create" | "join";
  initialCode: string;
  onBack: () => void;
  onEnter: (session: Session) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [character, setCharacter] = useState<CharacterId>("maffiamacska");
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const credential = useRef(newCredential());
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const normalizedCode = code.trim().toUpperCase();
    if (mode === "join" && !CODE_PATTERN.test(normalizedCode)) {
      setError("A szobakód hét betűből és számból áll. Ellenőrizd a meghívót!");
      return;
    }
    const existing = mode === "join" ? readSession(normalizedCode) : null;
    if (existing) {
      onEnter(existing);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        mode === "create" ? "/api/rooms" : `/api/rooms/${normalizedCode}/join`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nickname,
            character,
            credential: credential.current,
          }),
          signal: AbortSignal.timeout(12_000),
        },
      );
      const data = (await response.json()) as { code?: string; error?: string };
      if (!response.ok || !data.code)
        throw new Error(data.error ?? "A belépés nem sikerült. Próbáld újra!");
      onEnter({ code: data.code, credential: credential.current });
    } catch (e) {
      setError(
        e instanceof Error &&
          e.name !== "TypeError" &&
          e.name !== "TimeoutError"
          ? e.message
          : "Nem érjük el a szobát. Ellenőrizd a kapcsolatot, és próbáld újra!",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="entry-layout">
      <section className="entry-aside">
        <button className="text-button" onClick={onBack}>
          ← Vissza a főmenübe
        </button>
        <div className="eyebrow">
          {mode === "create" ? "TE HÍVOD ÖSSZE A CSAPATOT" : "VÁR A CSAPAT"}
        </div>
        <h1>
          {mode === "create" ? (
            <>
              A jó parti
              <br />
              veled kezdődik.
            </>
          ) : (
            <>
              Van még
              <br />
              egy helyed.
            </>
          )}
        </h1>
        <p>
          {mode === "create"
            ? "Hozd létre a privát szobát, aztán küldd el a meghívót a barátaidnak."
            : "Írd be a meghívóban kapott kódot, és máris a közös előszobában vagytok."}
        </p>
        <div className="aside-sticker" aria-hidden="true">
          <Burst />
          <span>
            NAGY TUDÁS?
            <br />
            NAGY SZEMÉLYISÉG!
          </span>
        </div>
      </section>
      <form className="entry-card" onSubmit={submit}>
        <div className="card-heading">
          <span className="step-chip">
            {mode === "create" ? "ÚJ PARTI" : "BESZÁLLÁS"}
          </span>
          <h2>{mode === "create" ? "Játék létrehozása" : "Csatlakozás"}</h2>
        </div>
        {error && <Notice>{error}</Notice>}
        <label className="input-label" htmlFor="nickname">
          Beceneved
          <input
            id="nickname"
            name="nickname"
            autoComplete="nickname"
            value={nickname}
            minLength={2}
            maxLength={20}
            required
            disabled={busy}
            placeholder="Ahogy a többiek ismernek"
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>
        {mode === "join" && (
          <label className="input-label" htmlFor="code">
            Szobakód
            <input
              id="code"
              name="code"
              className="code-input"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/\s/g, ""))
              }
              maxLength={7}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              required
              disabled={busy}
              placeholder="Pl. K7PX3WA"
            />
          </label>
        )}
        <CharacterPicker
          value={character}
          onChange={setCharacter}
          disabled={busy}
        />
        <button className="primary wide" disabled={busy}>
          {busy
            ? "Egy pillanat…"
            : mode === "create"
              ? "Szoba létrehozása"
              : "Belépek a szobába"}{" "}
          <span aria-hidden="true">→</span>
        </button>
        <p className="form-note">
          Nincs fiók, nincs macera. Csak te és a csapat.
        </p>
      </form>
    </main>
  );
}
const CONNECTION_LABELS: Record<Connection, string> = {
  connecting: "Kapcsolódás…",
  online: "Élő kapcsolat",
  reconnecting: "Újracsatlakozás…",
  offline: "Nincs internetkapcsolat",
  expired: "A belépés lejárt",
  replaced: "Másik ablakban megnyitva",
};
function RoomView({
  session,
  storageWarning,
  onExit,
  onRejoin,
}: {
  session: Session;
  storageWarning: boolean;
  onExit: () => void;
  onRejoin: () => void;
}) {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [playerId, setPlayerId] = useState("");
  const [connection, setConnection] = useState<Connection>("connecting");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const client = useRef<RoomConnection | null>(null);
  useEffect(() => {
    const transport = new RoomConnection(session, {
      state: (state, id) => {
        setRoom(state);
        setPlayerId(id);
      },
      clock: setClockOffset,
      connection: setConnection,
      error: setError,
    });
    client.current = transport;
    transport.start();
    return () => transport.stop();
  }, [session]);
  async function act(
    action: Action | { type: "ready"; value: boolean } | { type: "start" },
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const request: Action =
        action.type === "ready" || action.type === "start"
          ? { ...action, settingsRevision: room?.settingsRevision ?? 0 }
          : action;
      await client.current?.send(request);
      if (action.type === "leave") onExit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "A művelet nem sikerült.");
    } finally {
      setBusy(false);
    }
  }
  const link = `${location.origin}/join/${session.code}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setManualCopy(true);
    }
  }
  const me = room?.players.find((p) => p.id === playerId);
  const isHost = room?.hostId === playerId;
  const online = connection === "online";
  const disabled = busy || !online;
  const startReason =
    !room || room.players.length < 2
      ? "Hívj meg legalább még egy játékost!"
      : room.players.some((p) => !p.connected)
        ? "Várjuk, hogy mindenki újra kapcsolódjon."
        : room.players.some((p) => !p.ready)
          ? "Még nem mindenki áll készen."
          : "Mindenki kész. Indulhat a közös parti!";
  const canStart =
    room &&
    room.players.length >= 2 &&
    room.players.every((p) => p.ready && p.connected);
  if (connection === "expired" || connection === "replaced")
    return (
      <main className="connection-card">
        <span className="large-icon" aria-hidden="true">
          ↻
        </span>
        <h1>{CONNECTION_LABELS[connection]}</h1>
        <Notice>{error}</Notice>
        <p>
          {connection === "replaced"
            ? "Folytasd a játékot a másik ablakban, vagy vedd vissza itt a kapcsolatot."
            : "Ha a szoba még él, új becenévvel visszaléphetsz."}
        </p>
        <button
          className="primary"
          onClick={
            connection === "replaced" ? () => location.reload() : onRejoin
          }
        >
          {connection === "replaced" ? "Itt folytatom" : "Új belépés"}
        </button>
        <button className="text-button" onClick={onExit}>
          Vissza a főmenübe
        </button>
      </main>
    );
  if (room?.game)
    return (
      <GameView
        room={room}
        playerId={playerId}
        clockOffset={clockOffset}
        online={online}
        connectionLabel={CONNECTION_LABELS[connection]}
        busy={busy}
        error={error}
        storageWarning={storageWarning}
        onAction={act}
      />
    );
  return (
    <main className="room-layout">
      <section className="room-main">
        <div className="room-title">
          <div>
            <div className="eyebrow">PRIVÁT ELŐSZOBA</div>
            <h1>Mindenki itt van?</h1>
          </div>
          <span
            className={`connection ${online ? "online" : ""}`}
            role="status"
          >
            <i />
            {CONNECTION_LABELS[connection]}
          </span>
        </div>
        {error && <Notice>{error}</Notice>}
        {room?.notice && <Notice kind="info">{room.notice}</Notice>}
        {storageWarning && (
          <Notice kind="info">
            A böngésző nem engedi a mentést. Frissítés után új belépésre lehet
            szükség.
          </Notice>
        )}
        {!online && (
          <Notice kind="info">
            Várjuk a kapcsolatot. A szoba állapotát automatikusan frissítjük;
            addig a műveletek szünetelnek.
          </Notice>
        )}
        <div className="invite-bar">
          <div>
            <span>SZOBAKÓD</span>
            <strong>{session.code}</strong>
          </div>
          <button className="secondary" onClick={copy}>
            {copied ? "✓ Link másolva" : "Meghívó másolása"} <Arrow />
          </button>
        </div>
        {manualCopy && (
          <label className="input-label">
            Másold ki ezt a meghívót
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <span className="form-note">
              A böngésző nem engedélyezte az automatikus másolást.
            </span>
          </label>
        )}
        {!room ? (
          <div className="loading-card" role="status">
            Szoba betöltése…
          </div>
        ) : (
          <>
            <div className="players-heading">
              <h2>
                A csapat <span>{room.players.length}/8</span>
              </h2>
              <span>
                {room.players.filter((p) => p.ready && p.connected).length} kész
              </span>
            </div>
            <ul className="players">
              {room.players.map((p) => {
                const c = characterById(p.character);
                return (
                  <li key={p.id} className={!p.connected ? "disconnected" : ""}>
                    <span
                      className="avatar"
                      style={{ background: c.color }}
                      aria-hidden="true"
                    >
                      {c.icon}
                    </span>
                    <div className="player-name">
                      <strong>
                        {p.nickname} {p.id === playerId && <small>(te)</small>}
                      </strong>
                      <span>
                        {c.name}
                        {p.id === room.hostId && (
                          <b className="host-tag">Házigazda</b>
                        )}
                      </span>
                    </div>
                    <span
                      className={`ready-pill ${p.ready && p.connected ? "ready" : ""}`}
                    >
                      {!p.connected
                        ? "Visszavárjuk"
                        : p.ready
                          ? "✓ Kész"
                          : "Készülődik"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {room.phase === "lobby" && room.players.length < 2 && (
              <div className="empty-player">
                <span aria-hidden="true">＋</span>
                <p>
                  A legjobb ellenfelek a barátaid.
                  <br />
                  <b>Küldd el nekik a meghívót!</b>
                </p>
              </div>
            )}
            {room.phase === "lobby" && me && (
              <div className="my-controls">
                <button
                  className="secondary"
                  disabled={disabled}
                  aria-expanded={editingCharacter}
                  onClick={() => setEditingCharacter((v) => !v)}
                >
                  Karaktercsere
                </button>
                <button
                  className={me.ready ? "secondary is-ready" : "primary"}
                  disabled={disabled}
                  onClick={() => void act({ type: "ready", value: !me.ready })}
                >
                  {busy
                    ? "Egy pillanat…"
                    : me.ready
                      ? "✓ Készen állok · Mégsem"
                      : "Készen állok!"}{" "}
                </button>
              </div>
            )}
            {editingCharacter && room.phase === "lobby" && me && (
              <CharacterPicker
                value={me.character}
                disabled={disabled}
                onChange={(id) => {
                  setEditingCharacter(false);
                  void act({ type: "character", value: id });
                }}
              />
            )}
          </>
        )}
        <button
          className="text-button leave"
          disabled={disabled}
          onClick={() => void act({ type: "leave" })}
        >
          Kilépés a szobából
        </button>
      </section>
      <aside className="room-settings">
        <span className="step-chip">A PARTI RECEPTJE</span>
        <h2>Játékbeállítások</h2>
        <p>
          {isHost
            ? "Te vagy a házigazda. Állítsd össze a partit!"
            : "A házigazda állítja össze a partit."}
        </p>
        <fieldset disabled={!isHost || disabled || room?.phase !== "lobby"}>
          <legend>Kérdések száma</legend>
          <div className="segmented">
            {([6, 12, 18] as const).map((n) => (
              <button
                type="button"
                key={n}
                aria-pressed={room?.settings.questionCount === n}
                onClick={() =>
                  room &&
                  void act({
                    type: "settings",
                    value: { ...room.settings, questionCount: n },
                  })
                }
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={!isHost || disabled || room?.phase !== "lobby"}>
          <legend>Nehézség</legend>
          <div className="difficulty-options">
            {(Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[]).map(
              (d) => (
                <button
                  type="button"
                  key={d}
                  aria-pressed={room?.settings.difficulty === d}
                  onClick={() =>
                    room &&
                    void act({
                      type: "settings",
                      value: { ...room.settings, difficulty: d },
                    })
                  }
                >
                  <span>{DIFFICULTIES[d]}</span>
                  <span aria-hidden="true">
                    {d === "easy" ? "◉○○" : d === "normal" ? "◉◉○" : "◉◉◉"}
                  </span>
                </button>
              ),
            )}
          </div>
        </fieldset>
        <div className="fixed-rules">
          <span>✦ Szabotázs a következő felvonásban</span>
          <span>✦ Kategóriák alapból bekapcsolva</span>
          <span>✦ Privát szoba, csak meghívóval</span>
        </div>
        {room?.phase === "lobby" && (
          <>
            <p className="start-reason" id="start-reason">
              {startReason}
            </p>
            {isHost ? (
              <button
                className="primary wide"
                disabled={disabled || !canStart}
                aria-describedby="start-reason"
                onClick={() => void act({ type: "start" })}
              >
                Indulhat a játék! <span aria-hidden="true">→</span>
              </button>
            ) : (
              <div className="waiting-host" role="status">
                A házigazda indítja a játékot.
              </div>
            )}
            <p className="settings-note">
              Beállítás- vagy karaktercsere után újra jelezd, hogy kész vagy.
            </p>
          </>
        )}
        <p className="settings-note">
          Kapcsolatvesztéskor az előszobában 90 másodpercig őrizzük a helyed.
          Játék közben a pontjaid megmaradnak. A szoba 2 óra tétlenség után
          lejár.
        </p>
      </aside>
    </main>
  );
}
