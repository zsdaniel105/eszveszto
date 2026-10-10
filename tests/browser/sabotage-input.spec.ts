import {
  expect,
  test,
  type Browser,
  type Page,
  type CDPSession,
} from "@playwright/test";
import type { PublicRoom } from "../../src/shared/game";
import { abilityById, type AbilityId } from "../../src/shared/sabotage";
import { QUESTIONS } from "../../src/server/questions";
import { alphaPixels, wipe } from "./interactions";

async function party(
  browser: Browser,
  origin: string,
  tv: boolean,
  count: number,
) {
  const contexts = await Promise.all(
    Array.from({ length: count + (tv ? 1 : 0) }, (_, i) =>
      browser.newContext(
        tv && i === 0
          ? { viewport: { width: 1366, height: 768 } }
          : {
              viewport: { width: 390, height: 740 },
              isMobile: true,
              hasTouch: true,
              deviceScaleFactor: 2,
            },
      ),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const states = new Map<Page, PublicRoom>();
  for (const page of pages)
    page.on("websocket", (ws) =>
      ws.on("framereceived", (e) => {
        const m = JSON.parse(e.payload.toString());
        if (m.type === "state") states.set(page, m.room);
      }),
    );
  const owner = pages[0];
  await owner.goto(origin);
  await owner.getByRole("button", { name: "Játék létrehozása" }).click();
  if (tv)
    await owner
      .getByRole("button", { name: "Kijelzőként", exact: true })
      .click();
  else await owner.getByLabel("Beceneved").fill("Célpont");
  await owner.getByRole("button", { name: "Szoba létrehozása" }).click();
  await expect(owner.getByText("Élő kapcsolat", { exact: true })).toBeVisible();
  const code = states.get(owner)!.code;
  const phones = tv ? pages.slice(1) : pages;
  for (const [i, page] of phones.entries()) {
    if (!tv && i === 0) continue;
    await page.goto(`${origin}/join/${code}`);
    await page
      .getByLabel("Beceneved")
      .fill(i === 0 ? "Célpont" : `Támadó ${i}`);
    await page.locator(".character-card").nth(i).click();
    await page.getByRole("button", { name: "Belépek a szobába" }).click();
    await expect(
      page.getByText("Élő kapcsolat", { exact: true }),
    ).toBeVisible();
  }
  await owner.getByRole("button", { name: "6", exact: true }).click();
  await expect(
    phones.at(-1)!.getByRole("button", { name: "6", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  for (const p of phones)
    await p.getByRole("button", { name: "Készen állok!", exact: true }).click();
  await owner.getByRole("button", { name: "Indulhat a játék!" }).click();
  await expect(
    phones[0].locator('[data-phase="sabotage-selection"]'),
  ).toBeVisible({ timeout: 12000 });
  return { contexts, pages, phones, owner, code, states };
}
async function attacks(
  p: Awaited<ReturnType<typeof party>>,
  abilities: AbilityId[],
) {
  expect(
    (
      await p.owner.request.post(`/__fixture/${p.code}`, {
        data: { abilities: ["slime", ...abilities] },
      })
    ).ok(),
  ).toBe(true);
  await p.phones[0].getByRole("button", { name: "Most nem támadok" }).click();
  for (const [i, id] of abilities.entries()) {
    const page = p.phones[i + 1];
    await page
      .locator(".ability-card")
      .filter({ hasText: abilityById(id).name })
      .click();
    await page.getByRole("button", { name: "Célpont: Célpont" }).click();
  }
  await expect(p.phones[0].locator('[data-phase="question"]')).toBeVisible({
    timeout: 5000,
  });
}
const touchSessions = new WeakMap<Page, CDPSession>();
async function touch(
  page: Page,
  type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
  points: { x: number; y: number }[],
) {
  let c = touchSessions.get(page);
  if (!c) {
    c = await page.context().newCDPSession(page);
    touchSessions.set(page, c);
  }
  await c.send("Input.dispatchTouchEvent", { type, touchPoints: points });
}
async function hold(
  page: Page,
  blot: ReturnType<Page["locator"]>,
  ms: number,
  cancel = false,
) {
  const r = (await blot.boundingBox())!,
    point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await touch(page, "touchStart", [point]);
  await page.waitForTimeout(ms);
  await touch(page, cancel ? "touchCancel" : "touchEnd", []);
}

test("mixed slime, ink and readable six-stage ice use distinct real touch interactions", async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(60000);
  const p = await party(browser, baseURL!, false, 4);
  const target = p.phones[0];
  try {
    await attacks(p, ["slime", "ink", "freeze"]);
    const ice = target.locator(".ice-barrier");
    await expect(ice).toHaveAttribute("aria-label", /0\/6/);
    expect(await ice.locator("small").evaluate((el) => el.getBoundingClientRect().width)).toBe(1);
    await expect(target.locator(".effect-status")).toContainText("Jég: 0/6");
    const background = await ice.evaluate(
      (el) => getComputedStyle(el).backgroundImage,
    );
    expect(background).toContain("0.094"); // Frost is translucent; answer text remains underneath.
    await target.screenshot({ path: info.outputPath("ice-readable.png") });
    for (let n = 1; n <= 6; n++) {
      await ice.tap();
      await expect(ice).toHaveAttribute("aria-label", new RegExp(`${n}/6`));
      await expect(target.locator(".ice-crack")).toHaveCount(n);
      if (n === 4)
        await target.screenshot({ path: info.outputPath("ice-cracks.png") });
      if (n < 6) await target.waitForTimeout(110);
    }
    await expect(ice).toHaveClass(/ice-shattered/);
    const canvas = target.locator(".slime-surface canvas"),
      ink = target.locator(".hold-ink");
    await expect(canvas).toBeVisible();
    await expect(ink).toHaveCount(3);
    const effects = p.states.get(target)!.game!.sabotage!.effects!;
    expect(p.states.get(target)!.game!.sabotage!.incoming).toHaveLength(3);
    expect(effects.iceRequiredTaps).toBe(6);
    expect(effects.freezeUntil - p.states.get(target)!.game!.startedAt).toBe(
      2200,
    );
    await target.screenshot({
      path: info.outputPath("combined-obstruction.png"),
    });
    const before = await alphaPixels(canvas);
    await wipe(target, canvas, 0.3, true, true);
    expect(await alphaPixels(canvas)).toBeLessThan(before);
    await expect(target.locator(".wipe-patch:not(.is-clean)")).toHaveCount(1);
    // Early release and cancellation never erase ink or select an answer.
    await hold(target, ink.first(), 90);
    await expect(ink).toHaveCount(3);
    await hold(target, ink.first(), 90, true);
    await expect(ink).toHaveCount(3);
    await target.locator(".wipe-alternative").focus();
    for (let n = 0; n < 3; n++) await target.keyboard.press("Enter");
    await expect(target.locator(".slime-surface")).toHaveClass(/is-clean/);
    const blot = ink.first(),
      rect = (await blot.boundingBox())!;
    await touch(target, "touchStart", [
      { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    ]);
    await expect(blot).toHaveClass(/is-holding/);
    await target.screenshot({ path: info.outputPath("ink-hold-progress.png") });
    await target.waitForTimeout(370);
    await touch(target, "touchEnd", []);
    await expect(ink).toHaveCount(2);
    await ink.first().focus();
    await target.keyboard.press("Enter");
    await expect(ink).toHaveCount(1);
    await expect(target.getByRole("status").filter({ hasText: "2 tintafoltot megtisztítottál." })).toHaveCount(1);
    await expect(target.locator(".answer-card[aria-pressed=true]")).toHaveCount(
      0,
    );
    const q = p.states.get(target)!.game!.question!;
    const item = QUESTIONS.find((v) => v.id === q.id)!;
    if (item.type !== "text")
      throw new Error("Expected a published text question");
    const correctIndex = q.options.indexOf(item.options[item.correctIndex]);
    // Ink imposes no global lock. The answer's letter stays an unobstructed control.
    await target
      .locator(
        `.answer-card[data-option-index="${correctIndex}"] .answer-letter`,
      )
      .click();
    await expect(target.locator(".answer-card[aria-pressed=true]")).toHaveCount(
      1,
    );
    expect(await ink.count()).toBeGreaterThan(0);
    for (const page of p.phones.slice(1))
      await page
        .locator(`.answer-card[data-option-index="${correctIndex}"]`)
        .click();
    await expect(target.locator('[data-phase="results"]')).toBeVisible();
    expect(
      p.states.get(target)!.game!.result!.players.every((v) => v.correct),
    ).toBe(true);
  } finally {
    for (const c of p.contexts) await c.close();
  }
});

test("TV ink is text-local, persists after refresh and expires at its original deadline", async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(45000);
  const p = await party(browser, baseURL!, true, 2),
    target = p.phones[0];
  try {
    await attacks(p, ["ink"]);
    const ink = target.locator(".hold-ink");
    await expect(ink).toHaveCount(3);
    await expect(target.locator(".question-prompt")).toHaveCount(0);
    await expect(target.locator(".slime-surface")).toHaveCount(0);
    await expect(target.locator(".effect-status")).toContainText("Tartsd lenyomva");
    await expect(p.owner.locator(".hold-ink")).toHaveCount(0);
    await target.screenshot({ path: info.outputPath("controller-ink.png") });
    const deadline = p.states.get(target)!.game!.sabotage!.effects!.inkUntil!;
    await hold(target, ink.first(), 380);
    await expect(ink).toHaveCount(2);
    await target.reload();
    await expect(ink).toHaveCount(2);
    expect(p.states.get(target)!.game!.sabotage!.effects!.inkUntil).toBe(
      deadline,
    );
    for (const width of [320, 375, 390, 430]) {
      await target.setViewportSize({ width, height: 640 });
      expect(
        await target.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await expect(target.locator(".answer-card")).toHaveCount(4);
    }
    const rect = (await ink.first().boundingBox())!;
    await touch(target, "touchStart", [
      { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    ]);
    await touch(target, "touchCancel", []);
    await expect(ink).toHaveCount(2);
    await expect(ink).toHaveCount(0, { timeout: 4500 });
    expect(Date.now()).toBeGreaterThanOrEqual(deadline - 150);
    await expect(target.locator(".answer-card[aria-pressed=true]")).toHaveCount(
      0,
    );
  } finally {
    for (const c of p.contexts) await c.close();
  }
});

test("mobile gameplay scopes pinch/double-tap policy and retains internal text scrolling", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(45000);
  const p = await party(browser, baseURL!, false, 2),
    target = p.phones[0];
  try {
    for (const page of p.phones)
      await page.getByRole("button", { name: "Most nem támadok" }).click();
    await expect(target.locator('[data-phase="question"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(target.locator("body")).toHaveAttribute(
      "data-player-gameplay",
      "",
    );
    for (const viewport of [
      { width: 320, height: 640 },
      { width: 375, height: 600 },
      { width: 390, height: 740 },
      { width: 430, height: 640 },
      { width: 740, height: 320 },
    ]) {
      await target.setViewportSize(viewport);
      expect(
        await target
          .locator(".game-card")
          .evaluate((el) => getComputedStyle(el).touchAction),
      ).toBe("pan-y");
      expect(
        await target
          .locator(".answer-card")
          .first()
          .evaluate((el) => getComputedStyle(el).touchAction),
      ).toBe("pan-y");
      expect(
        await target.evaluate(() => ({
          x: scrollX,
          y: scrollY,
          overflow: document.documentElement.scrollWidth > innerWidth,
        })),
      ).toEqual({ x: 0, y: 0, overflow: false });
    }
    await target.setViewportSize({ width: 390, height: 740 });
    const r = (await target.locator(".question-prompt").boundingBox())!;
    const y = r.y + r.height / 2,
      center = r.x + r.width / 2;
    const scale = await target.evaluate(() => visualViewport!.scale);
    for (let n = 0; n < 2; n++) {
      await touch(target, "touchStart", [{ x: center, y }]);
      await touch(target, "touchEnd", []);
    }
    await touch(target, "touchStart", [
      { x: center - 20, y },
      { x: center + 20, y },
    ]);
    for (let n = 1; n <= 6; n++)
      await touch(target, "touchMove", [
        { x: center - 20 - n * 12, y },
        { x: center + 20 + n * 12, y },
      ]);
    await touch(target, "touchEnd", []);
    expect(await target.evaluate(() => visualViewport!.scale)).toBe(scale);
    // Large text gets a scroll fallback rather than hidden answers.
    await target.addStyleTag({
      content:
        ".answer-card strong {font-size: 32px!important} .question-prompt {font-size:40px!important}",
    });
    const panel = target.locator(".game-card");
    await target.setViewportSize({ width: 390, height: 500 });
    const pr = (await panel.boundingBox())!;
    await panel.evaluate((el) => {
      el.scrollTop = 0;
    });
    await touch(target, "touchStart", [
      { x: pr.x + 12, y: pr.y + pr.height - 30 },
    ]);
    for (let n = 1; n <= 8; n++)
      await touch(target, "touchMove", [
        { x: pr.x + 12, y: pr.y + pr.height - 30 - n * 12 },
      ]);
    await touch(target, "touchEnd", []);
    await expect
      .poll(() => panel.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await panel.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(target.locator(".answer-card").last()).toBeVisible();
    expect(await target.evaluate(() => scrollY)).toBe(0);
    await target.getByRole("button", { name: "Kilépés a szobából" }).click();
    await expect(target.locator("body")).not.toHaveAttribute(
      "data-player-gameplay",
    );
    await expect(target.locator("html")).not.toHaveAttribute("data-gameplay");
    expect(
      await target
        .locator("body")
        .evaluate((el) => getComputedStyle(el).touchAction),
    ).toBe("auto");
    expect(
      await target.locator('meta[name="viewport"]').getAttribute("content"),
    ).not.toMatch(/user-scalable|maximum-scale/);
  } finally {
    for (const c of p.contexts) await c.close();
  }
});
