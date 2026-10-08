import { expect, test } from "@playwright/test";
test("two real browsers create, join, synchronize, refresh, transfer host and start", async ({
  browser,
  baseURL,
}) => {
  const hostContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const guestContext = await browser.newContext({
    viewport: { width: 320, height: 740 },
  });
  const host = await hostContext.newPage(),
    guest = await guestContext.newPage();
  await host.goto(baseURL!);
  await host.getByRole("button", { name: "Játék létrehozása" }).click();
  await host.getByLabel("Beceneved").fill("Árvíztűrő");
  await host.getByRole("button", { name: "Szoba létrehozása" }).click();
  await expect(host.getByText("Élő kapcsolat")).toBeVisible();
  const invite = host.url();
  expect(invite).toMatch(/\/join\/[A-Z2-9]{7}$/);
  await guest.goto(invite);
  await guest.getByLabel("Beceneved").fill("Vendég");
  await guest.getByRole("button", { name: "Züm", exact: true }).click();
  await guest.getByRole("button", { name: "Belépek a szobába" }).click();
  await expect(guest.getByText("Élő kapcsolat")).toBeVisible();
  await expect(host.locator(".players li")).toHaveCount(2);
  await expect(
    host.locator(".players").getByText("Züm", { exact: true }),
  ).toBeVisible();
  await expect(
    guest.getByRole("button", { name: "12", exact: true }),
  ).toBeDisabled();
  await host.getByRole("button", { name: "6", exact: true }).click();
  await expect(
    guest.getByRole("button", { name: "6", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await guest
    .getByRole("button", { name: "Készen állok!", exact: true })
    .click();
  await expect(host.locator(".ready-pill.ready")).toHaveCount(1);
  await guest.reload();
  await expect(guest.getByText("Élő kapcsolat")).toBeVisible();
  await expect(guest.locator(".players li")).toHaveCount(2);
  await expect(host.locator(".players li")).toHaveCount(2);
  await guest.getByRole("button", { name: "Karaktercsere" }).click();
  await guest.getByRole("button", { name: "Csonti", exact: true }).click();
  await expect(
    host.locator(".players").getByText("Csonti", { exact: true }),
  ).toBeVisible();
  await expect(
    host.getByRole("button", { name: "Indulhat a játék!" }),
  ).toBeDisabled();
  await host.getByRole("button", { name: "Kilépés a szobából" }).click();
  await expect(guest.locator(".players li")).toHaveCount(1);
  await expect(
    guest.getByText("Te vagy a házigazda.", { exact: false }),
  ).toBeVisible();
  await host.goto(invite);
  await host.getByLabel("Beceneved").fill("Visszatérő");
  await host.getByRole("button", { name: "Belépek a szobába" }).click();
  await expect(host.getByText("Élő kapcsolat")).toBeVisible();
  await guest
    .getByRole("button", { name: "Készen állok!", exact: true })
    .click();
  await host
    .getByRole("button", { name: "Készen állok!", exact: true })
    .click();
  await expect(
    guest.getByRole("button", { name: "Indulhat a játék!" }),
  ).toBeEnabled();
  await guest.getByRole("button", { name: "Indulhat a játék!" }).click();
  for (const page of [host, guest]) {
    await expect(page.locator('[data-phase="category-vote"]')).toBeVisible();
    await expect(page.locator(".vote-card")).toHaveCount(3);
  }
  await host.reload();
  await expect(host.locator('[data-phase="category-vote"]')).toBeVisible();
  await expect(host.locator(".vote-card")).toHaveCount(3);
  for (const page of [host, guest])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  await guest.getByRole("button", { name: "Kilépés a szobából" }).click();
  await host.getByRole("button", { name: "Kilépés a szobából" }).click();
  await hostContext.close();
  await guestContext.close();
});

test("home fits portrait widths, unknown rooms show a Hungarian error", async ({
  page,
}) => {
  for (const width of [320, 375, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Játék létrehozása" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/join/AAAAAAA");
  await page.getByLabel("Beceneved").fill("Próba");
  await page.getByRole("button", { name: "Belépek a szobába" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "nem létezik vagy már lejárt",
  );
});
