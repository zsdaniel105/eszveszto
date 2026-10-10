import { abilityById, type AbilityId } from "../../src/shared/sabotage";
import { expect, test } from "@playwright/test";
import { QUESTIONS } from "../../src/server/questions";
import type { PublicRoom } from "../../src/shared/game";
import { alphaPixels, wipe } from "./interactions";

test("two mobile browsers play six real questions, reconnect, finish and start a rematch", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(240_000);
  const hostContext = await browser.newContext({
    viewport: { width: 390, height: 740 },
    hasTouch: true,
  });
  const guestContext = await browser.newContext({
    viewport: { width: 320, height: 640 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const host = await hostContext.newPage(),
    guest = await guestContext.newPage();
  const snapshots: { host: PublicRoom | null; guest: PublicRoom | null } = {
    host: null,
    guest: null,
  };
  for (const [key, page] of [
    ["host", host],
    ["guest", guest],
  ] as const) {
    page.on("websocket", (ws) =>
      ws.on("framereceived", (event) => {
        const message = JSON.parse(event.payload.toString());
        if (message.type === "state") snapshots[key] = message.room;
      }),
    );
  }
  try {
    await host.goto(baseURL!);
    await host.getByRole("button", { name: "Játék létrehozása" }).click();
    await host.getByLabel("Beceneved").fill("Kvízmester");
    await host.getByRole("button", { name: "Szoba létrehozása" }).click();
    await expect(host.getByText("Élő kapcsolat")).toBeVisible();
    await guest.goto(host.url());
    await guest.getByLabel("Beceneved").fill("ŐrültSzabotázsmester");
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
    await expect(host.locator('[data-phase="category-vote"]')).toBeVisible();
    const sessionId = snapshots.host!.game!.sessionId;
    const seen = new Set<string>();
    const abilitiesSeen = new Set<AbilityId>();
    let hostScore = 0,
      guestScore = 0;
    for (let round = 1; round <= 6; round++) {
      if ((round - 1) % 3 === 0) {
        for (const page of [host, guest])
          await expect(
            page.locator('[data-phase="category-vote"]'),
          ).toBeVisible({ timeout: 10_000 });
        const category = await host
          .locator(".vote-card strong")
          .first()
          .innerText();
        await host.getByRole("button", { name: new RegExp(category) }).click();
        await guest.getByRole("button", { name: new RegExp(category) }).click();
        await expect(host.locator(".vote-card[aria-pressed=true]")).toHaveCount(
          1,
        );
        expect(snapshots.host!.game!.categoryOptions).toEqual(
          snapshots.guest!.game!.categoryOptions,
        );
      }
      if (round === 5) {
        await expect(
          host.getByRole("heading", {
            name: "🔥 DÖNTŐ – TÖBB ESÉLY, KEVESEBB PONT!",
          }),
        ).toBeVisible({ timeout: 10_000 });
        await expect(
          guest.getByRole("heading", {
            name: "🔥 DÖNTŐ – TÖBB ESÉLY, KEVESEBB PONT!",
          }),
        ).toBeVisible();
      }
      for (const page of [host, guest])
        await expect(
          page.locator('[data-phase="sabotage-selection"]'),
        ).toBeVisible({ timeout: 12000 });
      for (const page of [host, guest]) {
        await expect(page.locator(".ability-card")).toHaveCount(3);
        await expect(page.locator(".target-card")).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      if (round === 1) {
        const code = snapshots.host!.code;
        const response = await host.request.post(`/__fixture/${code}`);
        expect(response.ok()).toBe(true);
        await expect
          .poll(() => snapshots.host!.game!.sabotage!.offers[0])
          .toBe("freeze");
        await expect
          .poll(() => snapshots.guest!.game!.sabotage!.offers[0])
          .toBe("slime");
      }
      if (round === 1) {
        const before = [...snapshots.host!.game!.sabotage!.offers];
        await host.screenshot({
          path: testInfo.outputPath("sabotage-mobile.png"),
          fullPage: true,
        });
        await host.reload();
        await expect(host.locator(".ability-card")).toHaveCount(3);
        expect(snapshots.host!.game!.sabotage!.offers).toEqual(before);
      }
      if (round === 1)
        await guest.screenshot({
          path: testInfo.outputPath("sabotage-320.png"),
          fullPage: true,
        });
      const selectedAbilities: AbilityId[] = [];
      for (const [key, page, opponent] of [
        ["host", host, "ŐrültSzabotázsmester"],
        ["guest", guest, "Kvízmester"],
      ] as const) {
        const offers = snapshots[key]!.game!.sabotage!.offers;
        const ability =
          offers.find((id) => !abilitiesSeen.has(id)) ?? offers[0];
        selectedAbilities.push(ability);
        abilitiesSeen.add(ability);
        await page
          .locator(".ability-card")
          .filter({ hasText: abilityById(ability).name })
          .click();
        await expect(page.locator(".ability-card")).toHaveCount(0);
        await expect(page.locator(".target-card")).toHaveCount(1);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expect(
          page.getByRole("button", {
            name: `Célpont: ${key === "host" ? "Kvízmester" : "ŐrültSzabotázsmester"}`,
          }),
        ).toHaveCount(0);
        if (round === 1 && key === "host") {
          await page.screenshot({
            path: testInfo.outputPath("target-mobile.png"),
            fullPage: true,
          });
          await page.getByRole("button", { name: "Másik képesség" }).click();
          await expect(page.locator(".ability-card")).toHaveCount(3);
          expect(snapshots.host!.game!.sabotage!.offers).toEqual(offers);
          await page
            .locator(".ability-card")
            .filter({ hasText: abilityById(ability).name })
            .click();
        }
        if (round === 1 && key === "guest")
          await page.screenshot({
            path: testInfo.outputPath("target-320.png"),
            fullPage: true,
          });
        await page
          .getByRole("button", { name: `Célpont: ${opponent}` })
          .click();
        if (key === "host") {
          await expect(
            page.getByRole("heading", { name: "Támadás rögzítve!" }),
          ).toBeVisible();
          expect(snapshots.guest!.game!.sabotage!.incoming).toEqual([]);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          if (round === 1) {
            const choice = snapshots.host!.game!.sabotage!.myChoice;
            await host.reload();
            await expect(
              host.getByRole("heading", { name: "Támadás rögzítve!" }),
            ).toBeVisible();
            expect(snapshots.host!.game!.sabotage!.myChoice).toEqual(choice);
          }
        }
      }
      for (const page of [host, guest])
        await expect(page.locator('[data-phase="question"]')).toBeVisible({
          timeout: 12_000,
        });
      await expect(host.locator(".step-chip")).toContainText(`${round}. / 6`);
      const q = snapshots.host!.game!.question!;
      expect(snapshots.guest!.game!.question).toEqual(q);
      expect(snapshots.host!.game!.result).toBeNull();
      expect(JSON.stringify(snapshots.host!.game)).not.toContain(
        "correctIndex",
      );
      expect(seen.has(q.id)).toBe(false);
      seen.add(q.id);
      const item = QUESTIONS.find((item) => item.id === q.id)!;
      if (item.type !== "text")
        throw new Error("Unexpected starter question format");
      const correct = item.options[item.correctIndex];
      const wrong = q.options.find((option) => option !== correct)!;
      expect(snapshots.host!.game!.sabotage!.incoming[0].abilityId).toBe(
        selectedAbilities[1],
      );
      expect(snapshots.guest!.game!.sabotage!.incoming[0].abilityId).toBe(
        selectedAbilities[0],
      );
      if (round === 1)
        await guest.screenshot({
          path: testInfo.outputPath("question-320.png"),
          fullPage: true,
        });
      // Exercise the actual randomly offered mechanics; no frontend or server fixtures.
      await Promise.all(
        [
          [host, selectedAbilities[1]],
          [guest, selectedAbilities[0]],
        ].map(async ([p, id]) => {
          const page = p as typeof host,
            ability = id as AbilityId;
          if (ability === "freeze") {
            await expect(page.locator(".effect-status")).toContainText(
              "Törd össze a jeget",
            );
            await expect(page.locator(".answer-card").first()).toBeDisabled();
            for (let n = 0; n < 6; n++) {
              await page.locator(".ice-barrier").click();
              if (n < 5) await page.waitForTimeout(110);
            }
            await expect
              .poll(
                () =>
                  (page === host ? snapshots.host : snapshots.guest)!.game!
                    .myIce?.acceptedTaps,
              )
              .toBe(6);
            await expect(page.locator(".ice-barrier")).toHaveClass(
              /ice-shattered/,
            );
            await expect(
              page.locator(".answer-card[aria-pressed=true]"),
            ).toHaveCount(0);
          }
          if (ability === "shuffle" || ability === "roulette") {
            const initial = q.options;
            await expect
              .poll(() => page.locator(".answer-text").allTextContents(), {
                timeout: 3000,
                intervals: [100],
              })
              .not.toEqual(initial);
            await expect(page.locator(".answer-card").first()).toBeEnabled({
              timeout: 3500,
            });
            const settled = await page
              .locator(".answer-text")
              .allTextContents();
            expect(new Set(settled)).toEqual(new Set(q.options));
          }
          if (ability === "upside-down") {
            await expect(page.locator(".answer-options")).toHaveClass(
              /is-upside-down/,
            );
            await expect(page.locator(".answer-options")).not.toHaveClass(
              /is-upside-down/,
              { timeout: 5000 },
            );
          }
          if (ability === "slime") {
            const patches = page.locator(".wipe-patch:not(.is-clean)");
            await expect(patches).toHaveCount(1);
            const canvas = patches.locator("canvas");
            const before = await alphaPixels(canvas);
            await patches.locator(".wipe-hit").first().tap();
            expect(await alphaPixels(canvas)).toBe(before);
            await wipe(page, canvas, 0.35, true);
            const partial = await alphaPixels(canvas);
            expect(partial).toBeLessThan(before);
            await expect(patches).toHaveCount(1);
            await page.reload();
            await expect(patches).toHaveCount(1);
            expect(await alphaPixels(patches.locator("canvas"))).toBe(partial);
            await wipe(page, patches.locator("canvas"), 0.65);
            await expect(patches).toHaveCount(0);
            expect(await page.evaluate(() => window.scrollY)).toBe(0);
            await expect(page.locator(".answer-card[aria-pressed=true]")).toHaveCount(0);
          }
          if (ability === "ink") {
            const ink = page.locator(".ink-patch");
            await expect(ink).toHaveCount(3);
            await ink.first().click();
            await expect(ink).toHaveCount(3); // A quick tap cannot erase ink.
            await ink.first().focus();
            await page.keyboard.press("Enter");
            await expect(ink).toHaveCount(2);
            for (let n = 0; n < 2; n++) {
              const box = (await ink.first().boundingBox())!;
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              await page.mouse.down();
              await expect(ink.first()).toHaveClass(/is-holding/);
              await page.waitForTimeout(400);
              await page.mouse.up();
              await expect(ink).toHaveCount(1 - n);
            }
            await expect(page.locator(".answer-card[aria-pressed=true]")).toHaveCount(0);
          }
          await expect(page.locator(".answer-card").first()).toBeEnabled({
            timeout: 3500,
          });
        }),
      );
      if (round === 1) {
        for (const width of [320, 375, 390, 430, 1280]) {
          await host.setViewportSize({ width, height: 740 });
          expect(
            await host.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          expect(await host.evaluate(() => window.scrollY)).toBe(0);
          expect(
            await host.evaluate(
              () => document.documentElement.scrollHeight <= innerHeight + 1,
            ),
          ).toBe(true);
          const buttons = await host
            .locator(".answer-card")
            .first()
            .boundingBox();
          expect(buttons!.height).toBeGreaterThanOrEqual(44);
          await host.screenshot({
            path: testInfo.outputPath(`question-${width}.png`),
          });
        }
        await host.setViewportSize({ width: 390, height: 740 });
        await host.screenshot({
          path: testInfo.outputPath("question-mobile.png"),
          fullPage: true,
        });
      }
      await host
        .locator(".answer-card")
        .filter({ has: host.getByText(correct, { exact: true }) })
        .click();
      await expect(
        host.getByText("✓ Válaszod rögzítve. Várjuk a többieket!", {
          exact: true,
        }),
      ).toBeVisible();
      expect(snapshots.guest!.game!.myAnswer).toBeNull();
      if (round === 1) {
        await host.reload();
        await expect(
          host.getByText("✓ Válaszod rögzítve. Várjuk a többieket!", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(host.locator(".answer-card").first()).toBeDisabled();
        expect(snapshots.host!.game!.sessionId).toBe(sessionId);
        expect(snapshots.host!.game!.round).toBe(1);
      }
      await guest
        .locator(".answer-card")
        .filter({
          has: guest.getByText(round === 1 ? correct : wrong, { exact: true }),
        })
        .click();
      if (round >= 5) {
        await expect(guest.locator(".answer-card.eliminated")).toHaveCount(1);
        await expect(
          guest.getByText(/Nem talált! Próbáld újra!/),
        ).toBeVisible();
        const before = snapshots.guest!.game!.myFinale;
        expect(snapshots.host!.game!.myFinale!.wrongAttempts).toBe(0);
        expect(JSON.stringify(snapshots.guest!.game)).not.toContain(
          "correctIndex",
        );
        await guest.reload();
        await expect(guest.locator(".answer-card.eliminated")).toHaveCount(1);
        expect(snapshots.guest!.game!.myFinale).toEqual(before);
        await expect(guest.locator(".answer-card")).toHaveCount(4);
        await guest
          .locator(".answer-card")
          .filter({ has: guest.getByText(correct, { exact: true }) })
          .click();
      }
      for (const page of [host, guest])
        await expect(page.locator('[data-phase="results"]')).toBeVisible();
      const hostResult = snapshots.host!.game!.result!.players.find(
        (p) => p.playerId === snapshots.host!.hostId,
      )!;
      const guestResult = snapshots.host!.game!.result!.players.find(
        (p) => p.playerId !== snapshots.host!.hostId,
      )!;
      expect(hostResult.correct).toBe(true);
      expect(hostResult.multiplier).toBe(round >= 5 ? 2 : 1);
      expect(guestResult.correct).toBe(round === 1 || round >= 5);
      if (round >= 5) {
        expect(guestResult.wrongAttempts).toBe(1);
        expect(guestResult.basePoints).toBe(70);
        expect(guestResult.total).toBe((70 + guestResult.speedBonus) * 2);
      }
      hostScore += hostResult.total;
      guestScore += guestResult.total;
      await expect(host.locator(".earned strong")).toHaveText(
        `+${hostResult.total}`,
      );
      await expect(host.locator(".correct-answer strong")).toHaveText(correct);
      for (const page of [host, guest])
        await expect(page.locator('[data-phase="leaderboard"]')).toBeVisible({
          timeout: 7_000,
        });
      expect(snapshots.host!.game!.ranking).toEqual(
        snapshots.guest!.game!.ranking,
      );
      expect(
        snapshots.host!.game!.ranking.find((p) => p.nickname === "Kvízmester")!
          .score,
      ).toBe(hostScore);
    }
    for (const page of [host, guest])
      await expect(page.locator('[data-phase="final-results"]')).toBeVisible({
        timeout: 7_000,
      });
    expect(seen.size).toBe(6);
    await testInfo.attach("actual-abilities-tested", {
      body: JSON.stringify([...abilitiesSeen]),
      contentType: "application/json",
    });
    const ranking = snapshots.host!.game!.ranking;
    expect(ranking[0].nickname).toBe("Kvízmester");
    expect(ranking[0].score).toBe(hostScore);
    expect(ranking[0].correctAnswers).toBe(6);
    expect(ranking[1].score).toBe(guestScore);
    expect(ranking[1].correctAnswers).toBe(3);
    await expect(host.locator(".personal-summary")).toContainText(
      "6/6 helyes válasz · 100% pontosság",
    );
    await expect(guest.locator(".personal-summary")).toContainText(
      "3/6 helyes válasz · 50% pontosság",
    );
    await host.screenshot({
      path: testInfo.outputPath("final-mobile.png"),
      fullPage: true,
    });
    await expect(guest.getByRole("button", { name: "Új parti" })).toHaveCount(
      0,
    );
    await host.getByRole("button", { name: "Új parti" }).click();
    for (const page of [host, guest]) {
      await expect(
        page.getByRole("heading", { name: "Mindenki itt van?" }),
      ).toBeVisible();
      await expect(page.locator(".players li")).toHaveCount(2);
      await expect(page.locator(".ready-pill.ready")).toHaveCount(0);
      await expect(page.locator("body")).not.toHaveAttribute(
        "data-gameplay",
        "",
      );
    }
    await host
      .getByRole("button", { name: "Készen állok!", exact: true })
      .click();
    await guest
      .getByRole("button", { name: "Készen állok!", exact: true })
      .click();
    await host.getByRole("button", { name: "Indulhat a játék!" }).click();
    await expect(host.locator('[data-phase="category-vote"]')).toBeVisible();
    expect(snapshots.host!.game!.sessionId).not.toBe(sessionId);
    expect(snapshots.host!.game!.ranking.every((p) => p.score === 0)).toBe(
      true,
    );
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
