import { expect, test } from "@playwright/test";
import { alphaPixels, wipe } from "./interactions";

test("real touch cancellation and mouse trails survive resizing and refresh, then auto-fade without answering", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(60000);
  const hostContext = await browser.newContext({
    viewport: { width: 390, height: 740 },
    hasTouch: true,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const guestContext = await browser.newContext({
    viewport: { width: 375, height: 740 },
    hasTouch: true,
  });
  const host = await hostContext.newPage(),
    guest = await guestContext.newPage();
  let identity: { playerId: string; phaseId: string } | null = null;
  host.on("websocket", (ws) =>
    ws.on("framereceived", (event) => {
      const message = JSON.parse(event.payload.toString());
      if (message.type === "state" && message.room.game)
        identity = {
          playerId: message.playerId,
          phaseId: message.room.game.phaseId,
        };
    }),
  );
  try {
    await host.goto(baseURL!);
    await host.getByRole("button", { name: "Játék létrehozása" }).click();
    await host.getByLabel("Beceneved").fill("Takarító");
    await host.getByRole("button", { name: "Szoba létrehozása" }).click();
    await expect(host.getByText("Élő kapcsolat")).toBeVisible();
    await guest.goto(host.url());
    await guest.getByLabel("Beceneved").fill("Jégtörő");
    await guest.getByRole("button", { name: "Belépek a szobába" }).click();
    await expect(guest.getByText("Élő kapcsolat")).toBeVisible();
    await host.getByRole("button", { name: "6", exact: true }).click();
    await expect(
      guest.getByRole("button", { name: "6", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await host
      .getByRole("button", { name: "Készen állok!", exact: true })
      .click();
    await guest
      .getByRole("button", { name: "Készen állok!", exact: true })
      .click();
    await host.getByRole("button", { name: "Indulhat a játék!" }).click();
    await expect(host.locator('[data-phase="sabotage-selection"]')).toBeVisible(
      { timeout: 12000 },
    );
    const code = host.url().split("/").at(-1)!;
    const seed = await host.request.post(`/__fixture/${code}`);
    expect(seed.ok()).toBe(true);
    await host
      .locator(".ability-card")
      .filter({ hasText: "Fagyasztás" })
      .click();
    await host.getByRole("button", { name: "Célpont: Jégtörő" }).click();
    await guest
      .locator(".ability-card")
      .filter({ hasText: "Takonybomba" })
      .click();
    await guest.getByRole("button", { name: "Célpont: Takarító" }).click();
    await expect(host.locator('[data-phase="question"]')).toBeVisible({
      timeout: 5000,
    });
    await Promise.all([
      (async () => {
        const ice = guest.locator(".ice-barrier");
        await ice.focus();
        for (let n = 0; n < 3; n++) {
          await guest.keyboard.press("Enter");
          if (n < 2) await guest.waitForTimeout(110);
        }
        await expect(ice).toHaveClass(/ice-shattered/);
        await expect(ice).toHaveAttribute("aria-label", /3\/3/);
        await expect(guest.locator(".answer-card").first()).not.toHaveAttribute(
          "aria-disabled",
          "true",
        );
      })(),
      (async () => {
        const canvases = host.locator(".wipe-patch canvas");
        await expect(canvases).toHaveCount(2);
        const first = canvases.first(),
          before = await alphaPixels(first);
        const panel = await host
          .locator(".game-card")
          .evaluate((el) => el.scrollTop);
        await wipe(host, first, 0.3, true, true);
        const partial = await alphaPixels(first);
        expect(partial).toBeLessThan(before);
        const state = await host.evaluate(() =>
          Object.keys(localStorage)
            .filter((k) => k.startsWith("eszveszto:slime:"))
            .map((k) => JSON.parse(localStorage.getItem(k)!)),
        );
        expect(state[0].strokes).toBe(0);
        expect(
          await host.locator(".game-card").evaluate((el) => el.scrollTop),
        ).toBe(panel);
        await expect(
          host.locator(".answer-card[aria-pressed=true]"),
        ).toHaveCount(0);
        // Preserve visual progress saved by the previous tap-to-clear client.
        await host.evaluate(
          ({ playerId, phaseId }) =>
            localStorage.setItem(
              `eszveszto:clearing:${playerId}`,
              JSON.stringify({ phaseId, slime: [1], ink: [], inkHits: {} }),
            ),
          identity!,
        );
        await host.reload();
        await expect(canvases).toHaveCount(2);
        await expect(host.locator(".wipe-patch.is-clean")).toHaveCount(1);
        expect(await alphaPixels(first)).toBe(partial);
        for (const width of [320, 375, 390, 430, 1280]) {
          await host.setViewportSize({ width, height: 740 });
          await expect
            .poll(() =>
              first.evaluate((node) => (node as HTMLCanvasElement).width),
            )
            .toBeGreaterThan(0);
          expect(
            await host.evaluate(() => ({
              x: scrollX,
              y: scrollY,
              overflow: document.documentElement.scrollWidth > innerWidth,
            })),
          ).toEqual({ x: 0, y: 0, overflow: false });
          expect(
            await first.evaluate((node) =>
              Math.max(
                (node as HTMLCanvasElement).width,
                (node as HTMLCanvasElement).height,
              ),
            ),
          ).toBeLessThanOrEqual(512);
          await host.screenshot({
            path: testInfo.outputPath(`slime-${width}.png`),
          });
        }
        await host.setViewportSize({ width: 390, height: 740 });
        await wipe(host, first, 0.65);
        await expect(host.locator(".wipe-patch:not(.is-clean)")).toHaveCount(1); // cancel + one finished stroke is insufficient
        const held = (await first.boundingBox())!;
        await host.mouse.move(
          held.x + held.width / 2,
          held.y + held.height / 2,
        );
        await host.mouse.down();
        await expect(host.locator(".wipe-patch")).toHaveCount(0, {
          timeout: 6000,
        });
        await host.mouse.up(); // Expiry while holding cannot click the answer below.
        await expect(
          host.locator(".answer-card[aria-pressed=true]"),
        ).toHaveCount(0);
        await expect(host.locator(".answer-card").first()).not.toHaveAttribute(
          "aria-disabled",
          "true",
        );
        expect(
          await host.evaluate(() =>
            Object.keys(localStorage).filter((k) =>
              k.startsWith("eszveszto:slime:"),
            ),
          ),
        ).toEqual([]);
      })(),
    ]);
    await host.locator(".answer-card").first().click();
    await guest.locator(".answer-card").first().click();
    await expect(host.locator('[data-phase="results"]')).toBeVisible();
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
