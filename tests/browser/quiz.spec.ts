import { expect, test } from "@playwright/test";
import { QUESTIONS } from "../../src/server/questions";
import type { PublicRoom } from "../../src/shared/game";

test("two mobile browsers play six real questions, reconnect, finish and start a rematch", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const hostContext = await browser.newContext({
    viewport: { width: 390, height: 740 },
  });
  const guestContext = await browser.newContext({
    viewport: { width: 320, height: 640 },
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
    await guest.getByLabel("Beceneved").fill("Kihívó");
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
          host.getByRole("heading", { name: "ITT A DÖNTŐ!" }),
        ).toBeVisible({ timeout: 10_000 });
        await expect(
          guest.getByRole("heading", { name: "ITT A DÖNTŐ!" }),
        ).toBeVisible();
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
      if (round === 1) {
        for (const width of [320, 375, 390, 430, 1280]) {
          await host.setViewportSize({ width, height: 740 });
          expect(
            await host.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          const buttons = await host
            .locator(".answer-card")
            .first()
            .boundingBox();
          expect(buttons!.height).toBeGreaterThanOrEqual(44);
        }
        await host.setViewportSize({ width: 390, height: 740 });
        await host.screenshot({
          path: testInfo.outputPath("question-mobile.png"),
          fullPage: true,
        });
      }
      await host.locator(".answer-card").filter({ hasText: correct }).click();
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
        .filter({ hasText: round === 1 ? correct : wrong })
        .click();
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
      expect(guestResult.correct).toBe(round === 1);
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
    const ranking = snapshots.host!.game!.ranking;
    expect(ranking[0].nickname).toBe("Kvízmester");
    expect(ranking[0].score).toBe(hostScore);
    expect(ranking[0].correctAnswers).toBe(6);
    expect(ranking[1].score).toBe(guestScore);
    expect(ranking[1].correctAnswers).toBe(1);
    await expect(host.locator(".personal-summary")).toContainText(
      "6/6 helyes válasz · 100% pontosság",
    );
    await expect(guest.locator(".personal-summary")).toContainText(
      "1/6 helyes válasz · 17% pontosság",
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
