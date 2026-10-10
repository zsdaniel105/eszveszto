// Registry and balancing are shared; offers, attacks and schedules are server-owned.
export const ABILITIES = [
  {
    id: "slime",
    name: "Takonybomba",
    icon: "🟢",
    color: "#d2eac5",
    description: "Takony a válaszokon! Töröld le gyors ujjmozdulatokkal!",
  },
  {
    id: "freeze",
    name: "Fagyasztás",
    icon: "❄️",
    color: "#c6e8f3",
    description: "Látod a válaszokat, de befagytak! Törd fel 6–7 koppintással!",
  },
  {
    id: "shuffle",
    name: "Káosz",
    icon: "🔀",
    color: "#dcd5fa",
    description: "A válaszok egy-két gyors helycserével összekeverednek.",
  },
  {
    id: "upside-down",
    name: "Feje tetejére!",
    icon: "🙃",
    color: "#f6e4a4",
    description: "A válaszszövegek rövid időre fejre állnak.",
  },
  {
    id: "ink",
    name: "Tintapaca",
    icon: "🖋️",
    color: "#ded9ec",
    description: "Tinta takarja a szavakat! Tartsd lenyomva a foltokat!",
  },
  {
    id: "roulette",
    name: "Válaszrulett",
    icon: "🎰",
    color: "#f4cbdc",
    description: "A válaszok két másodpercig körbejárnak, majd megállnak.",
  },
] as const;
export type AbilityId = (typeof ABILITIES)[number]["id"];
export const abilityById = (id: AbilityId) =>
  ABILITIES.find((a) => a.id === id)!;
export const isAbilityId = (value: unknown): value is AbilityId =>
  typeof value === "string" && ABILITIES.some((a) => a.id === value);
export const SABOTAGE_BALANCE = {
  selectionMs: 10_000,
  revealMs: 1500,
  maxLockMs: 2500,
  iceTapSpacingMs: 80,
  freezeMs: [2200, 2500],
  shuffleAtMs: [650, 1250],
  shuffleSettleMs: 200,
  rouletteMs: 2000,
  rouletteStepMs: 400,
  upsideMs: 3000,
  upsideExtraMs: 500,
  maxUpsideMs: 4000,
  // Legacy patch layout is retained for already-resolved v1 effects only.
  overlayMs: 4500,
  maxPatchesPerType: 3,
  patchWidthPercent: 20,
  slimeHeightPercent: 18,
  inkHeightPercent: 16,
  slimeMs: 3000,
  inkMs: 4000,
  inkHoldMs: 350,
  maxInkGroups: 4,
  maxObstructionFraction: 0.25,
} as const;
export const LEGACY_FREEZE_MS = [1200, 1600, 1800, 2000] as const;
export type SabotageChoice =
  | { type: "attack"; abilityId: AbilityId; targetId: string }
  | { type: "skip"; reason: "explicit" | "timeout" };
export interface AttackRecord {
  attackerId: string;
  targetId: string;
  abilityId: AbilityId;
  outcome: "applied" | "target-left";
}
export interface PresentationFrame {
  at: number;
  order: number[];
}
export interface PlayerEffects {
  // Optional additive fields: already-resolved v1 effects retain their rules.
  overlayVersion?: 2;
  slimeUntil?: number;
  inkUntil?: number;
  slimeLobes?: number;
  slimeSteps?: number;
  counts: Record<AbilityId, number>;
  freezeUntil: number;
  answerUnlockAt: number;
  motionUnlockAt: number;
  iceRequiredTaps: number;
  frames: PresentationFrame[];
  upsideFrom: number;
  upsideUntil: number;
  overlaysFrom: number;
  overlaysUntil: number;
  slimePatches: number;
  inkPatches: number;
}
export interface PublicSabotage {
  offers: AbilityId[];
  myChoice: SabotageChoice | null;
  submittedPlayerIds: string[];
  targets: {
    id: string;
    nickname: string;
    character: import("./game").CharacterId;
    connected: boolean;
  }[];
  incoming: AttackRecord[];
  outgoing: AttackRecord | null;
  effects: PlayerEffects | null;
  resolved: boolean;
}
// Pure presentation projection: canonical indexes never change identity.
export function presentationAt(
  effects: PlayerEffects | null,
  now: number,
  optionCount: number,
  ice?: import("./game").PublicIce | null,
) {
  let order = Array.from({ length: optionCount }, (_, i) => i);
  let frameIndex = 0;
  if (effects)
    for (const frame of effects.frames) {
      if (now < frame.at) break;
      order = frame.order;
      frameIndex++;
    }
  return {
    order,
    frameIndex,
    locked:
      !!effects &&
      ((now < effects.freezeUntil && !ice?.broken) ||
        now < effects.motionUnlockAt),
    frozen: !!effects && now < effects.freezeUntil && !ice?.broken,
    upsideDown:
      !!effects && now >= effects.upsideFrom && now < effects.upsideUntil,
    overlays:
      !!effects && now >= effects.overlaysFrom && now < effects.overlaysUntil,
  };
}
