import {
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import jsQR from "jsqr";
import { CHARACTERS, type PublicRoom } from "../../src/shared/game";
import { QUESTIONS } from "../../src/server/questions";
import { alphaPixels, wipe } from "./interactions";

async function setup(browser: Browser, baseURL: string, info?: TestInfo) {
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1366, height: 768 } }),
    browser.newContext({
      viewport: { width: 375, height: 740 },
      hasTouch: true,
    }),
    browser.newContext({
      viewport: { width: 320, height: 640 },
      hasTouch: true,
      reducedMotion: "reduce",
    }),
  ]);
  const [display, one, two] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  const snapshots: {
    display: PublicRoom | null;
    one: PublicRoom | null;
    two: PublicRoom | null;
  } = { display: null, one: null, two: null };
  let displayIdentity = "";
  for (const [key, page] of [
    ["display", display],
    ["one", one],
    ["two", two],
  ] as const)
    page.on("websocket", (ws) =>
      ws.on("framereceived", (event) => {
        const m = JSON.parse(event.payload.toString());
        if (m.type === "state") {
          snapshots[key] = m.room;
          if (key === "display") displayIdentity = m.identityId;
        }
      }),
    );
  await display.goto(baseURL);
  await display.getByRole("button", { name: "Játék létrehozása" }).click();
  await expect(
    display.getByRole("button", { name: "Játékosként", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await display
    .getByRole("button", { name: "Kijelzőként", exact: true })
    .click();
  await expect(display.getByLabel("Beceneved")).toHaveCount(0);
  await expect(display.locator(".character-card")).toHaveCount(0);
  if (info)
    await display.screenshot({
      path: info.outputPath("mode-selection.png"),
      fullPage: true,
    });
  await display.getByRole("button", { name: "Szoba létrehozása" }).click();
  await expect(display.locator(".display-lobby")).toBeVisible();
  await expect(
    display.getByText("Élő kapcsolat", { exact: true }),
  ).toBeVisible();
  await expect(display.locator(".display-player-grid li")).toHaveCount(0);
  const code = snapshots.display!.code;
  const joinURL = baseURL + "/join/" + code;
  await expect(display.locator(".display-code")).toHaveText(code);
  await expect(display.locator(".display-invite-url")).toHaveAttribute(
    "href",
    joinURL,
  );
  await expect(
    display.getByRole("button", { name: "Indulhat a játék!" }),
  ).toBeDisabled();
  expect(snapshots.display!.mode).toBe("tv-party");
  expect(snapshots.display!.players).toEqual([]);
  expect(snapshots.display!.display!.id).toBe(displayIdentity);
  for (const [page, nickname, character] of [
    [one, "Telefonos Anna", "Paca"],
    [two, "Telefonos Béla", "Züm"],
  ] as const) {
    await page.goto(joinURL);
    await page.getByLabel("Beceneved").fill(nickname);
    await page
      .locator(".character-card")
      .filter({ hasText: character })
      .click();
    await page.getByRole("button", { name: "Belépek a szobába" }).click();
    await expect(
      page.getByText("Élő kapcsolat", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/TV Party – A kérdések a közös kijelzőn jelennek meg/),
    ).toBeVisible();
  }
  await expect(display.locator(".display-player-grid li")).toHaveCount(2);
  await expect(
    display.getByRole("button", { name: "Készen állok!", exact: true }),
  ).toHaveCount(0);
  await display.getByRole("button", { name: "6", exact: true }).focus();
  await display.keyboard.press("ArrowRight");
  await expect(
    display.getByRole("button", { name: "12", exact: true }),
  ).toBeFocused();
  await display.getByRole("button", { name: "6", exact: true }).click();
  await expect(
    one.getByRole("button", { name: "6", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  for (const page of [one, two])
    await page
      .getByRole("button", { name: "Készen állok!", exact: true })
      .click();
  await expect(display.locator(".display-player-grid")).toContainText("✓ Kész");
  if (info)
    await display.screenshot({ path: info.outputPath("display-lobby.png") });
  await display.getByRole("button", { name: "Indulhat a játék!" }).click();
  await expect(display.locator('[data-phase="category-vote"]')).toBeVisible();
  return {
    contexts,
    display,
    one,
    two,
    snapshots,
    joinURL,
    code,
    displayIdentity,
  };
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => ({
      x: scrollX,
      y: scrollY,
      overflow: document.documentElement.scrollWidth > innerWidth,
    })),
  ).toEqual({ x: 0, y: 0, overflow: false });
}
async function choose(page: Page, name: string, opponent: string) {
  await page.locator(".ability-card").filter({ hasText: name }).click();
  await expect(page.locator(".target-card")).toHaveCount(1);
  await page.getByRole("button", { name: `Célpont: ${opponent}` }).click();
}
async function correct(page: Page, value: string) {
  const button = page
    .locator(".answer-card")
    .filter({ has: page.getByText(value, { exact: true }) });
  await expect(button).toBeEnabled();
  await button.click();
}
async function answerBoxes(page: Page) {
  return page.locator(".answer-card").evaluateAll((nodes) =>
    nodes.map((n) => {
      const b = n.getBoundingClientRect();
      return { x: b.x, y: b.y, height: b.height, width: b.width };
    }),
  );
}

test("TV Party: one authenticated Display and two phones play a full match with real QR, personal effects, finale penalties and rematch", async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(240000);
  const s = await setup(browser, baseURL!, info);
  try {
    const { display, one, two, snapshots, code } = s;
    let totalOne = 0,
      totalTwo = 0;
    for (let round = 1; round <= 6; round++) {
      if ((round - 1) % 3 === 0) {
        await expect(
          display.locator('[data-phase="category-vote"]'),
        ).toBeVisible({ timeout: 10000 });
        expect(snapshots.display!.game!.categoryOptions).toEqual(
          snapshots.one!.game!.categoryOptions,
        );
        const category = display.locator(".display-categories strong").first();
        const name = await category.innerText();
        for (const page of [one, two])
          await page.locator(".vote-card").filter({ hasText: name }).click();
        expect(snapshots.display!.game!.myVote).toBeNull();
        expect(snapshots.display!.game!.voteCounts).toEqual({});
        await expect(display.locator(".display-intermission")).toContainText(
          "2/2 játékos szavazott",
        );
      }
      if (round === 5)
        await expect(
          display.getByRole("heading", { name: "Döntő – dupla pont!" }),
        ).toBeVisible({ timeout: 10000 });
      for (const page of [display, one, two])
        await expect(
          page.locator('[data-phase="sabotage-selection"]'),
        ).toBeVisible({ timeout: 12000 });
      await expect(display.locator(".ability-card")).toHaveCount(0);
      expect(snapshots.display!.game!.sabotage!.offers).toEqual([]);
      expect(snapshots.display!.game!.sharedAttacks).toEqual([]);
      if (round === 1) {
        // Real production actions/effects; only offered choices are fixed in the
        // separate browser Worker so tactile coverage is deterministic.
        expect((await display.request.post(`/__fixture/${code}`)).ok()).toBe(
          true,
        );
        await expect
          .poll(() => snapshots.one!.game!.sabotage!.offers[0])
          .toBe("freeze");
        await expect
          .poll(() => snapshots.two!.game!.sabotage!.offers[0])
          .toBe("slime");
        await one.screenshot({
          path: info.outputPath("controller-sabotage.png"),
        });
        await choose(one, "Fagyasztás", "Telefonos Béla");
        await expect(
          one.getByRole("heading", { name: "Támadás rögzítve!" }),
        ).toBeVisible();
        expect(snapshots.display!.game!.sabotage!.myChoice).toBeNull();
        expect(snapshots.display!.game!.sharedAttacks).toEqual([]);
        await choose(two, "Takonybomba", "Telefonos Anna");
        await expect(
          display.locator('[data-phase="sabotage-reveal"]'),
        ).toBeVisible();
        await expect(display.locator(".display-attacks li")).toHaveCount(2);
      } else {
        for (const page of [one, two]) {
          await expect(page.locator(".ability-card")).toHaveCount(3);
          await page.getByRole("button", { name: "Most nem támadok" }).click();
        }
      }
      for (const page of [display, one, two])
        await expect(page.locator('[data-phase="question"]')).toBeVisible({
          timeout: 5000,
        });
      const q = snapshots.display!.game!.question!;
      const item = QUESTIONS.find((item) => item.id === q.id)!;
      if (item.type !== "text") throw Error("Expected published text question");
      const answer = item.options[item.correctIndex],
        wrong = q.options
          .filter((o) => o !== answer)
          .sort((a, b) => b.length - a.length)[0];
      await expect(display.locator(".display-question h1")).toHaveText(
        q.prompt,
      );
      await expect(display.locator(".answer-card")).toHaveCount(0);
      for (const page of [one, two]) {
        await expect(page.locator(".question-prompt")).toHaveCount(0);
        await expect(page.locator(".answer-card")).toHaveCount(4);
        await noOverflow(page);
      }
      expect(snapshots.one!.game!.deadline).toBe(
        snapshots.display!.game!.deadline,
      );
      expect(snapshots.two!.game!.deadline).toBe(
        snapshots.display!.game!.deadline,
      );
      expect(snapshots.display!.game!.myAnswer).toBeNull();
      expect(snapshots.display!.game!.myFinale).toBeNull();
      expect(snapshots.display!.game!.sabotage!.effects).toBeNull();
      expect(JSON.stringify(snapshots.display!.game)).not.toContain(
        "correctIndex",
      );
      if (round === 1) {
        await Promise.all([
          (async () => {
            const ice = two.locator(".ice-barrier");
            for (let n = 0; n < 3; n++) {
              await ice.click();
              if (n < 2) await two.waitForTimeout(110);
            }
            await expect(ice).toHaveClass(/ice-shattered/);
          })(),
          (async () => {
            const patches = one.locator(".wipe-patch:not(.is-clean)");
            await expect(patches).toHaveCount(2);
            const canvas = patches.first().locator("canvas"),
              before = await alphaPixels(canvas);
            await canvas.tap();
            expect(await alphaPixels(canvas)).toBe(before);
            await wipe(one, canvas, 0.35, true);
            expect(await alphaPixels(canvas)).toBeLessThan(before);
            await wipe(one, canvas, 0.65);
            await expect(patches).toHaveCount(1);
            await patches.first().getByRole("button").focus();
            for (let n = 0; n < 4; n++) await one.keyboard.press("Enter");
            await expect(patches).toHaveCount(0);
            await expect(
              one.locator(".answer-card[aria-pressed=true]"),
            ).toHaveCount(0);
          })(),
        ]);
        for (const viewport of [
          { width: 1920, height: 1080 },
          { width: 1366, height: 768 },
          { width: 1280, height: 720 },
          { width: 1024, height: 768 },
        ]) {
          await display.setViewportSize(viewport);
          await noOverflow(display);
          expect(
            await display
              .locator(".display-stage")
              .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
          ).toBe(true);
          await display.screenshot({
            path: info.outputPath(`display-question-${viewport.width}.png`),
          });
        }
        await display.setViewportSize({ width: 1366, height: 768 });
        for (const width of [320, 375, 390, 430]) {
          await one.setViewportSize({ width, height: 740 });
          await noOverflow(one);
          for (const button of await one.locator(".answer-card").all()) {
            const box = (await button.boundingBox())!;
            expect(box.height).toBeGreaterThanOrEqual(44);
            expect(box.width).toBeGreaterThanOrEqual(44);
          }
          await one.screenshot({
            path: info.outputPath(`controller-question-${width}.png`),
          });
        }
        await one.setViewportSize({ width: 375, height: 740 });
        await one
          .getByRole("button", { name: "Kérdés mutatása", exact: true })
          .click();
        await expect(one.locator(".question-prompt")).toHaveText(q.prompt);
        await one
          .getByRole("button", { name: "Kérdés elrejtése", exact: true })
          .click();
        await expect(one.locator(".question-prompt")).toHaveCount(0);
        const deadline = snapshots.display!.game!.deadline,
          identity = snapshots.display!.display!.id;
        await display.reload();
        await expect(display.locator(".display-question h1")).toHaveText(
          q.prompt,
        );
        expect(snapshots.display!.display!.id).toBe(identity);
        expect(snapshots.display!.game!.deadline).toBe(deadline);
        expect(snapshots.display!.players).toHaveLength(2);
      }
      if (round >= 5) {
        await one.locator(".game-card").evaluate(async (node) => {
          await Promise.all(node.getAnimations().map((a) => a.finished));
        });
        await one
          .locator(".answer-card")
          .filter({ has: one.getByText(answer, { exact: true }) })
          .scrollIntoViewIfNeeded();
      }
      const firstBoxes = round >= 5 ? await answerBoxes(one) : null;
      await correct(one, answer);
      if (round >= 5) {
        await expect(one.locator(".answer-card.selected")).toHaveCount(1);
        await one.locator(".answer-card.selected").evaluate(async (node) => {
          await Promise.all(node.getAnimations().map((a) => a.finished));
        });
        expect(await answerBoxes(one)).toEqual(firstBoxes);
        // Short screens intentionally scroll the inner panel to reach an
        // answer. Measure after making this target visible, so the strict
        // assertion detects guess-driven movement rather than that scroll.
        await two
          .locator(".answer-card")
          .filter({ has: two.getByText(wrong, { exact: true }) })
          .scrollIntoViewIfNeeded();
        const boxes = await answerBoxes(two);
        await correct(two, wrong);
        await expect(two.locator(".answer-card.eliminated")).toHaveCount(1);
        expect(snapshots.one!.game!.myFinale!.wrongAttempts).toBe(0);
        expect(snapshots.two!.game!.myFinale!.wrongAttempts).toBe(1);
        await expect(one.locator(".answer-card.eliminated")).toHaveCount(0);
        await expect(display.locator('[data-phase="question"]')).toBeVisible();
        expect(snapshots.display!.game!.myFinale).toBeNull();
        expect(JSON.stringify(snapshots.display!.game)).not.toContain(
          "correctIndex",
        );
        expect(await answerBoxes(two)).toEqual(boxes);
        if (round === 5) {
          const history = snapshots.two!.game!.myFinale;
          await two.reload();
          await expect(two.locator(".answer-card.eliminated")).toHaveCount(1);
          expect(snapshots.two!.game!.myFinale).toEqual(history);
          await expect(two.locator(".question-prompt")).toHaveCount(0);
        }
      }
      await correct(two, answer);
      for (const page of [display, one, two])
        await expect(page.locator('[data-phase="results"]')).toBeVisible();
      await expect(display.locator(".display-correct")).toHaveText(answer);
      const results = snapshots.display!.game!.result!.players;
      const first = results.find(
          (p) =>
            p.playerId ===
            snapshots.one!.players.find((p) => p.nickname === "Telefonos Anna")!
              .id,
        )!,
        second = results.find((p) => p.playerId !== first.playerId)!;
      expect(first.correct).toBe(true);
      expect(second.correct).toBe(true);
      if (round >= 5) {
        expect(second.basePoints).toBe(70);
        expect(second.wrongAttempts).toBe(1);
        expect(second.total).toBe((70 + second.speedBonus) * 2);
      }
      totalOne += first.total;
      totalTwo += second.total;
      for (const page of [display, one, two])
        await expect(page.locator('[data-phase="leaderboard"]')).toBeVisible({
          timeout: 7000,
        });
      await expect(display.locator(".display-ranks li")).toHaveCount(2);
      await expect(one.locator(".rank-list li")).toHaveCount(1);
      if (round === 1)
        await display.screenshot({
          path: info.outputPath("display-leaderboard.png"),
        });
    }
    for (const page of [display, one, two])
      await expect(page.locator('[data-phase="final-results"]')).toBeVisible({
        timeout: 7000,
      });
    const rankings = snapshots.display!.game!.ranking;
    expect(rankings).toHaveLength(2);
    expect(rankings.find((p) => p.nickname === "Telefonos Anna")!.score).toBe(
      totalOne,
    );
    expect(rankings.find((p) => p.nickname === "Telefonos Béla")!.score).toBe(
      totalTwo,
    );
    expect(
      rankings.every(
        (p) => p.correctAnswers === 6 && p.answeredQuestions === 6,
      ),
    ).toBe(true);
    expect(rankings.some((p) => p.id === s.displayIdentity)).toBe(false);
    await display.screenshot({
      path: info.outputPath("display-final-results.png"),
    });
    await noOverflow(display);
    await expect(
      one.getByRole("button", { name: "Új parti", exact: true }),
    ).toHaveCount(0);
    await display
      .getByRole("button", { name: "Új parti", exact: true })
      .click();
    await expect(display.locator(".display-lobby")).toBeVisible();
    for (const page of [one, two]) {
      await expect(
        page.getByRole("heading", { name: "Mindenki itt van?" }),
      ).toBeVisible();
      await expect(page.locator(".ready-pill.ready")).toHaveCount(0);
    }
    expect(snapshots.display!.mode).toBe("tv-party");
    expect(snapshots.display!.display!.id).toBe(s.displayIdentity);
    expect(snapshots.display!.game).toBeNull();
    // Decode pixels rendered by the actual SVG with the current invitation URL.
    const pixels = await display.locator(".join-qr").evaluate(async (node) => {
      const img = new Image();
      const svg = new XMLSerializer().serializeToString(node);
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = 300;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, 300, 300);
      return Array.from(ctx.getImageData(0, 0, 300, 300).data);
    });
    expect(jsQR(new Uint8ClampedArray(pixels), 300, 300)?.data).toBe(s.joinURL);
  } finally {
    await Promise.all(s.contexts.map((c) => c.close()));
  }
});

test("Display loss enables authoritative question fallback; reconnect restores controller layout and keeps explicit personal preference", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60000);
  const s = await setup(browser, baseURL!);
  try {
    const { display, one, two, snapshots } = s;
    for (const page of [one, two]) {
      await expect(
        page.locator('[data-phase="sabotage-selection"]'),
      ).toBeVisible({ timeout: 12000 });
      await page.getByRole("button", { name: "Most nem támadok" }).click();
    }
    await expect(display.locator(".display-question h1")).toBeVisible({
      timeout: 5000,
    });
    const prompt = snapshots.display!.game!.question!.prompt,
      deadline = snapshots.display!.game!.deadline;
    await expect(one.locator(".question-prompt")).toHaveCount(0);
    await two
      .getByRole("button", { name: "Kérdés mutatása", exact: true })
      .click();
    await two.reload();
    await expect(two.locator(".question-prompt")).toHaveText(prompt);
    await display.goto("about:blank");
    await expect(one.locator(".controller-fallback")).toBeVisible();
    await expect(one.locator(".question-prompt")).toHaveText(prompt);
    expect(snapshots.one!.display!.connected).toBe(false);
    expect(snapshots.one!.game!.deadline).toBe(deadline);
    await display.goto(s.joinURL);
    await expect(display.locator(".display-question h1")).toHaveText(prompt);
    await expect(one.locator(".controller-fallback")).toHaveCount(0);
    await expect(one.locator(".question-prompt")).toHaveCount(0);
    await expect(two.locator(".question-prompt")).toHaveText(prompt);
    expect(snapshots.display!.game!.deadline).toBe(deadline);
    expect(snapshots.display!.hostRole).toBe("display");
    if (await display.evaluate(() => document.fullscreenEnabled)) {
      await display
        .getByRole("button", { name: "Teljes képernyő", exact: true })
        .click();
      await expect
        .poll(() => display.evaluate(() => !!document.fullscreenElement))
        .toBe(true);
      await display
        .getByRole("button", {
          name: "Kilépés a teljes képernyőből",
          exact: true,
        })
        .click();
      await expect
        .poll(() => display.evaluate(() => !!document.fullscreenElement))
        .toBe(false);
    }
    await display
      .getByRole("button", { name: "Kijelző bezárása", exact: true })
      .click();
    await expect(one.locator(".question-prompt")).toHaveText(prompt);
    expect(snapshots.one!.display).toBeNull();
    expect(snapshots.one!.hostRole).toBe("player");
    expect(snapshots.one!.hostId).toBe(
      snapshots.one!.players.find((p) => p.nickname === "Telefonos Anna")!.id,
    );
    for (const page of [one, two]) {
      await page.locator(".answer-card").first().click();
      await noOverflow(page);
    }
    await expect(one.locator('[data-phase="results"]')).toBeVisible();
    expect(snapshots.one!.game!.ranking).toHaveLength(2);
  } finally {
    await Promise.all(s.contexts.map((c) => c.close()));
  }
});

test("eight phone seats remain usable with a separate Display and seven real attacks against one controller", async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(90000);
  const contexts = await Promise.all(
    Array.from({ length: 9 }, (_, i) =>
      browser.newContext({
        viewport:
          i === 0 ? { width: 1280, height: 720 } : { width: 390, height: 740 },
        hasTouch: i !== 0,
        reducedMotion: "reduce",
      }),
    ),
  );
  try {
    const [display, ...phones] = await Promise.all(
      contexts.map((c) => c.newPage()),
    );
    const snapshots: (PublicRoom | null)[] = Array(9).fill(null);
    for (const [i, page] of [display, ...phones].entries())
      page.on("websocket", (ws) =>
        ws.on("framereceived", (frame) => {
          const message = JSON.parse(frame.payload.toString());
          if (message.type === "state") snapshots[i] = message.room;
        }),
      );
    await display.goto(baseURL!);
    await display.getByRole("button", { name: "Játék létrehozása" }).click();
    await display
      .getByRole("button", { name: "Kijelzőként", exact: true })
      .click();
    await display.getByRole("button", { name: "Szoba létrehozása" }).click();
    await expect(display.locator(".display-lobby")).toBeVisible();
    const joinURL = baseURL + "/join/" + snapshots[0]!.code;
    await Promise.all(
      phones.map(async (page, i) => {
        await page.goto(joinURL);
        await page.getByLabel("Beceneved").fill(`Telefon ${i + 1}`);
        await page
          .locator(".character-card")
          .filter({ hasText: CHARACTERS[i].name })
          .click();
        await page.getByRole("button", { name: "Belépek a szobába" }).click();
        await expect(
          page.getByText("Élő kapcsolat", { exact: true }),
        ).toBeVisible();
      }),
    );
    await expect(display.locator(".display-player-grid li")).toHaveCount(8);
    expect(
      snapshots[0]!.players.some((p) => p.id === snapshots[0]!.display!.id),
    ).toBe(false);
    await display.getByRole("button", { name: "6", exact: true }).click();
    await Promise.all(
      phones.map(async (page) => {
        await expect(
          page.getByRole("button", { name: "6", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await page
          .getByRole("button", { name: "Készen állok!", exact: true })
          .click();
      }),
    );
    await expect(
      display.getByRole("button", { name: "Indulhat a játék!" }),
    ).toBeEnabled();
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1280, height: 720 },
      { width: 1024, height: 768 },
    ]) {
      await display.setViewportSize(viewport);
      await noOverflow(display);
      for (const panel of [".display-invite", ".display-team"])
        expect(
          await display
            .locator(panel)
            .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
        ).toBe(true);
      await display.screenshot({
        path: info.outputPath(`display-eight-lobby-${viewport.width}.png`),
      });
    }
    await display.setViewportSize({ width: 1280, height: 720 });
    await display.getByRole("button", { name: "Indulhat a játék!" }).click();
    await expect(display.locator('[data-phase="category-vote"]')).toBeVisible();
    const topic = await display
      .locator(".display-categories strong")
      .first()
      .innerText();
    await Promise.all(
      phones.map((page) =>
        page.locator(".vote-card").filter({ hasText: topic }).click(),
      ),
    );
    await expect(display.locator(".display-intermission")).toContainText(
      "8/8 játékos szavazott",
    );
    await expect(
      display.locator('[data-phase="sabotage-selection"]'),
    ).toBeVisible({ timeout: 10000 });
    await phones[0].getByRole("button", { name: "Most nem támadok" }).click();
    await Promise.all(
      phones.slice(1).map(async (page) => {
        await page.locator(".ability-card").first().click();
        await expect(page.locator(".target-card")).toHaveCount(7);
        await page
          .getByRole("button", { name: "Célpont: Telefon 1", exact: true })
          .click();
      }),
    );
    await expect(
      display.locator('[data-phase="sabotage-reveal"]'),
    ).toBeVisible();
    await expect(display.locator(".display-attacks li")).toHaveCount(7);
    expect(snapshots[0]!.game!.sabotage!.offers).toEqual([]);
    await expect(display.locator('[data-phase="question"]')).toBeVisible();
    const screen = snapshots[0]!.game!,
      question = screen.question!;
    const item = QUESTIONS.find((q) => q.id === question.id)!;
    if (item.type !== "text") throw Error("Expected text question");
    const victim = snapshots[1]!.game!.sabotage!;
    expect(victim.incoming).toHaveLength(7);
    expect(new Set(victim.incoming.map((a) => a.attackerId)).size).toBe(7);
    expect(
      victim.effects!.answerUnlockAt - screen.startedAt,
    ).toBeLessThanOrEqual(2000);
    expect(snapshots[0]!.game!.sabotage!.effects).toBeNull();
    await expect(phones[0].locator(".attack-summary")).toContainText("7");
    const answer = item.options[item.correctIndex];
    await Promise.all(phones.slice(1).map((page) => correct(page, answer)));
    // Keyboard activation follows the same canonical answer under every capped
    // personal visual effect; it never clicks through a slime clearing surface.
    const button = phones[0]
      .locator(".answer-card")
      .filter({ has: phones[0].getByText(answer, { exact: true }) });
    await expect(button).toBeEnabled();
    await button.focus();
    await phones[0].keyboard.press("Enter");
    await expect(display.locator('[data-phase="results"]')).toBeVisible();
    const results = snapshots[0]!.game!.result!.players;
    expect(results).toHaveLength(8);
    expect(results.every((p) => p.correct && p.total > 0)).toBe(true);
    await expect(display.locator(".display-ranks li")).toHaveCount(8);
    expect(
      await display
        .locator(".display-stage")
        .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
    ).toBe(true);
    await display.screenshot({
      path: info.outputPath("display-eight-results.png"),
    });
    await expect(display.locator('[data-phase="leaderboard"]')).toBeVisible({
      timeout: 7000,
    });
    expect(
      await display
        .locator(".display-stage")
        .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
    ).toBe(true);
    await display.screenshot({
      path: info.outputPath("display-eight-leaderboard.png"),
    });
    await noOverflow(display);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
