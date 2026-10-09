import { expect, test, type Page, type Locator } from "@playwright/test";
import { QUESTIONS } from "../../src/server/questions";

export async function anchored(page: Page) {
  await expect(page.locator("body")).toHaveAttribute("data-gameplay", "");
  const dimensions = await page.evaluate(() => ({
    offset: window.scrollY,
    x: window.scrollX,
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
    viewportHeight: innerHeight,
    viewportWidth: innerWidth,
  }));
  expect(dimensions.offset).toBe(0);
  expect(dimensions.x).toBe(0);
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewportWidth);
}
async function touchDrag(page: Page, x: number, start: number, end: number) {
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: start }],
  });
  for (let step = 1; step <= 6; step++)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: start + ((end - start) * step) / 6 }],
    });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await client.detach();
}
async function reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  await expect(control).toBeInViewport();
  const box = await control.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test("eight independent mobile players can reach offers, seven targets, answers and home without document scrolling", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const contexts = await Promise.all(
    Array.from({ length: 8 }, () =>
      browser.newContext({
        viewport: { width: 320, height: 420 },
        hasTouch: true,
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage())),
    host = pages[0];
  try {
    await host.goto(baseURL!);
    await host.getByRole("button", { name: "Játék létrehozása" }).click();
    await host.getByLabel("Beceneved").fill("MobilMester");
    await host.getByRole("button", { name: "Szoba létrehozása" }).click();
    await expect(host.getByText("Élő kapcsolat")).toBeVisible();
    await Promise.all(
      pages.slice(1).map(async (page, index) => {
        await page.goto(host.url());
        await page.getByLabel("Beceneved").fill(`Vendég${index + 1}`);
        await page.getByRole("button", { name: "Belépek a szobába" }).click();
        await expect(page.getByText("Élő kapcsolat")).toBeVisible();
      }),
    );
    await expect(host.locator(".players li")).toHaveCount(8);
    await host.getByRole("button", { name: "6", exact: true }).click();
    // Normal lobby document scrolling remains available at this short height.
    expect(
      await host.evaluate(
        () => document.documentElement.scrollHeight > innerHeight,
      ),
    ).toBe(true);
    await Promise.all(
      pages.map(async (page) => {
        await expect(
          page.getByRole("button", { name: "6", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await page
          .getByRole("button", { name: "Készen állok!", exact: true })
          .click();
      }),
    );
    await host.getByRole("button", { name: "Indulhat a játék!" }).click();
    await expect(host.locator('[data-phase="category-vote"]')).toBeVisible();
    await anchored(host);
    await touchDrag(host, 2, 350, 110);
    await host.touchscreen.tap(2, 360);
    await host.touchscreen.tap(2, 360);
    await anchored(host);
    await expect(host.locator('[data-phase="sabotage-selection"]')).toBeVisible(
      { timeout: 12_000 },
    );
    await expect(host.locator(".ability-card")).toHaveCount(3);
    await reachable(host.getByRole("button", { name: "Most nem támadok" }));
    expect(
      await host.locator(".game-card").evaluate((el) => el.scrollTop),
    ).toBeGreaterThan(0);
    for (const card of await host.locator(".ability-card").all())
      await reachable(card);
    await host.locator(".ability-card").first().tap();
    await expect(host.locator(".target-card")).toHaveCount(7);
    await expect(
      host.getByRole("button", { name: "Célpont: MobilMester" }),
    ).toHaveCount(0);
    await reachable(host.locator(".target-card").last());
    await anchored(host);
    await host.screenshot({
      path: testInfo.outputPath("seven-targets-320-short.png"),
    });
    await host.locator(".target-card").last().tap();
    await expect(
      host.getByRole("heading", { name: "Támadás rögzítve!" }),
    ).toBeVisible();
    await Promise.all(
      pages.slice(1).map(async (page) => {
        await expect(page.locator(".ability-card")).toHaveCount(3);
        await page.getByRole("button", { name: "Most nem támadok" }).click();
      }),
    );
    await expect(host.locator('[data-phase="question"]')).toBeVisible({
      timeout: 5000,
    });
    // Host receives no attacks, so reaching controls cannot be confused with a
    // temporary sabotage restriction. Other tests exercise all actual effects.
    await expect(host.locator(".answer-card")).toHaveCount(4);
    for (const size of [
      { width: 320, height: 420 },
      { width: 740, height: 320 },
      { width: 390, height: 640 },
    ]) {
      await host.setViewportSize(size);
      for (const answer of await host.locator(".answer-card").all())
        await reachable(answer);
      await anchored(host);
    }
    // Increased text, without disabling browser zoom, uses the bounded fallback.
    await host.addStyleTag({
      content: `
      body[data-gameplay] .game-card .answer-text { font-size: 24px; }
      body[data-gameplay] .game-card .question-prompt { font-size: 36px; }
      body[data-gameplay] .game-card .rank-person strong { font-size: 24px; }
    `,
    });
    expect(
      await host
        .locator(".answer-text")
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBe(24);
    await reachable(host.locator(".answer-card").last());
    await host.setViewportSize({ width: 320, height: 420 });
    await host.locator(".game-card").evaluate((el) => {
      el.scrollTop = 0;
    });
    const card = await host.locator(".game-card").boundingBox();
    await touchDrag(
      host,
      card!.x + card!.width / 2,
      card!.y + card!.height - 15,
      card!.y + 20,
    );
    await expect
      .poll(() => host.locator(".game-card").evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await anchored(host);
    await host.screenshot({
      path: testInfo.outputPath("question-short-internal-scroll.png"),
    });
    await host.locator(".answer-card").last().tap();
    await expect(
      host.getByText("✓ Válaszod rögzítve. Várjuk a többieket!", {
        exact: true,
      }),
    ).toBeVisible();
    for (let round = 1; round <= 6; round++) {
      if (round > 1) {
        if (round === 4)
          await expect(
            host.locator('[data-phase="category-vote"]'),
          ).toBeVisible({ timeout: 6000 });
        await expect(
          host.locator('[data-phase="sabotage-selection"]'),
        ).toBeVisible({ timeout: 12_000 });
        await Promise.all(
          pages.map(async (page) => {
            await expect(page.locator(".ability-card")).toHaveCount(3);
            await page
              .getByRole("button", { name: "Most nem támadok" })
              .click();
          }),
        );
        await expect(host.locator('[data-phase="question"]')).toBeVisible({
          timeout: 5000,
        });
        await expect(host.locator(".step-chip")).toContainText(`${round}. / 6`);
      }
      await Promise.all(
        (round === 1 ? pages.slice(1) : pages).map(async (page) => {
          await expect(page.locator('[data-phase="question"]')).toBeVisible();
          let answer = page.locator(".answer-card").first();
          if (round >= 5) {
            const prompt = await page.locator(".question-prompt").innerText();
            const item = QUESTIONS.find((q) => q.prompt === prompt)!;
            if (item.type !== "text") throw new Error("Expected text question");
            answer = page
              .locator(".answer-card")
              .filter({
                has: page.getByText(item.options[item.correctIndex], {
                  exact: true,
                }),
              });
          }
          await expect(answer).not.toHaveAttribute("aria-disabled", "true", {
            timeout: 3500,
          });
          await answer.click();
        }),
      );
      await expect(host.locator('[data-phase="results"]')).toBeVisible();
      await host.locator(".earned").scrollIntoViewIfNeeded();
      await expect(host.locator(".earned")).toBeInViewport();
      await anchored(host);
      await expect(host.locator('[data-phase="leaderboard"]')).toBeVisible({
        timeout: 6000,
      });
      await expect(host.locator(".rank-list li")).toHaveCount(8);
      await host.locator(".game-card").focus();
      await host.keyboard.press("End");
      await host.locator(".rank-list li").last().scrollIntoViewIfNeeded();
      await expect(host.locator(".rank-list li").last()).toBeInViewport();
      await anchored(host);
    }
    await expect(host.locator('[data-phase="final-results"]')).toBeVisible({
      timeout: 6000,
    });
    await reachable(host.getByRole("button", { name: "Új parti" }));
    await host.screenshot({
      path: testInfo.outputPath("eight-player-final-rematch-short.png"),
    });
    await host.getByRole("button", { name: "Új parti" }).click();
    await expect(
      host.getByRole("heading", { name: "Mindenki itt van?" }),
    ).toBeVisible();
    await expect(host.locator("body")).not.toHaveAttribute("data-gameplay", "");
    await host.evaluate(() => window.scrollTo(0, 300));
    expect(await host.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await Promise.all(
      pages.map((page) =>
        page
          .getByRole("button", { name: "Készen állok!", exact: true })
          .click(),
      ),
    );
    await host.getByRole("button", { name: "Indulhat a játék!" }).click();
    await expect(host.locator('[data-phase="category-vote"]')).toBeVisible();
    await anchored(host);
    // A real authenticated takeover reaches the terminal connection-error view.
    const replacement = await host.context().newPage();
    await replacement.goto(host.url());
    await expect(
      replacement.locator('[data-phase="category-vote"]'),
    ).toBeVisible();
    await expect(
      host.getByRole("heading", { name: "Másik ablakban megnyitva" }),
    ).toBeVisible();
    await expect(host.locator("body")).not.toHaveAttribute("data-gameplay", "");
    expect(
      await host.evaluate(() => getComputedStyle(document.body).overflow),
    ).not.toBe("hidden");
    await replacement.close();
    await host.getByRole("button", { name: "Itt folytatom" }).click();
    await expect(host.locator(".game-card")).toBeVisible();
    await anchored(host);
    await host.getByRole("button", { name: "Észvesztő főmenü" }).click();
    await expect(host.locator("body")).not.toHaveAttribute("data-gameplay", "");
    await host.evaluate(() => window.scrollTo(0, 300));
    expect(await host.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await host.getByRole("button", { name: "Csatlakozás" }).click();
    await expect(host.getByLabel("Beceneved")).toBeVisible();
    expect(
      await host.evaluate(
        () => document.documentElement.scrollHeight > innerHeight,
      ),
    ).toBe(true);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("audio is gesture-gated and the mute preference survives reload", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    const counters = { contexts: 0, notes: 0 };
    (window as Window & { audioCounters?: typeof counters }).audioCounters =
      counters;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        counters.contexts++;
      }
      createOscillator() {
        const oscillator = super.createOscillator(),
          start = oscillator.start.bind(oscillator);
        oscillator.start = (when?: number) => {
          counters.notes++;
          start(when);
        };
        return oscillator;
      }
    };
  });
  const counts = () =>
    page.evaluate(
      () =>
        (
          window as Window & {
            audioCounters?: { contexts: number; notes: number };
          }
        ).audioCounters!,
    );
  await page.goto("/");
  expect(await counts()).toEqual({ contexts: 0, notes: 0 });
  await page.getByRole("button", { name: "Hang kikapcsolása" }).click();
  await expect(
    page.getByRole("button", { name: "Hang bekapcsolása" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  expect(await counts()).toEqual({ contexts: 0, notes: 0 });
  await page.getByRole("button", { name: "Játék létrehozása" }).click();
  await page.getByRole("button", { name: "Züm", exact: true }).click();
  expect(await counts()).toEqual({ contexts: 0, notes: 0 });
  await page.getByRole("button", { name: "Hang bekapcsolása" }).click();
  await page.getByRole("button", { name: "Csonti", exact: true }).click();
  await expect.poll(async () => (await counts()).contexts).toBe(1);
  await expect.poll(async () => (await counts()).notes).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Hang kikapcsolása" }).click();
  const notes = (await counts()).notes;
  await page.getByRole("button", { name: "Züm", exact: true }).click();
  expect((await counts()).notes).toBe(notes);
});
