import type { Locator, Page } from "@playwright/test";
export async function alphaPixels(canvas: Locator) {
  return canvas.evaluate((node) => {
    const c = node as HTMLCanvasElement,
      data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let total = 0;
    for (let i = 3; i < data.length; i += 4) total += data[i];
    return total;
  });
}
export async function textMaskCoverage(canvas: Locator) {
  return canvas.evaluate((node) => {
    const c = node as HTMLCanvasElement,
      surface = c.getBoundingClientRect();
    const pixels = c
      .getContext("2d")!
      .getImageData(0, 0, c.width, c.height).data;
    return [...c.closest(".answer-area")!.querySelectorAll(".answer-text")].map(
      (el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        const left = Math.max(
          0,
          Math.floor(((r.x - surface.x) / surface.width) * c.width),
        );
        const top = Math.max(
          0,
          Math.floor(((r.y - surface.y) / surface.height) * c.height),
        );
        const right = Math.min(
          c.width,
          Math.ceil(((r.right - surface.x) / surface.width) * c.width),
        );
        const bottom = Math.min(
          c.height,
          Math.ceil(((r.bottom - surface.y) / surface.height) * c.height),
        );
        let masked = 0,
          total = 0;
        for (let y = top; y < bottom; y += 2)
          for (let x = left; x < right; x += 2) {
            total++;
            if (pixels[(y * c.width + x) * 4 + 3] > 30) masked++;
          }
        return masked / Math.max(1, total);
      },
    );
  });
}
export async function wipe(
  page: Page,
  canvas: Locator,
  y: number,
  touch = false,
  cancel = false,
) {
  if (
    await canvas.evaluate((el) =>
      el.parentElement!.classList.contains("slime-surface"),
    )
  ) {
    const hits = canvas.locator("..").locator(".wipe-hit");
    await hits.first().scrollIntoViewIfNeeded();
    const points = await hits.evaluateAll(
      (elements, offset) =>
        elements.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width * offset, y: r.y + r.height / 2 };
        }),
      y,
    );
    if (touch) {
      const c = await page.context().newCDPSession(page);
      await c.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [points[0]],
      });
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        for (let n = 1; n <= 8; n++)
          await c.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              {
                x: a.x + ((b.x - a.x) * n) / 8,
                y: a.y + ((b.y - a.y) * n) / 8,
              },
            ],
          });
      }
      await c.send("Input.dispatchTouchEvent", {
        type: cancel ? "touchCancel" : "touchEnd",
        touchPoints: [],
      });
      await c.detach();
    } else {
      await page.mouse.move(points[0].x, points[0].y);
      await page.mouse.down();
      for (const p of points.slice(1))
        await page.mouse.move(p.x, p.y, { steps: 8 });
      await page.mouse.up();
    }
    return;
  }
  const box = (await canvas.boundingBox())!;
  const start = { x: box.x + box.width * 0.03, y: box.y + box.height * y },
    end = { x: box.x + box.width * 0.97, y: start.y };
  if (touch) {
    const c = await page.context().newCDPSession(page);
    await c.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    for (let n = 1; n <= 8; n++)
      await c.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: start.x + ((end.x - start.x) * n) / 8, y: start.y }],
      });
    await c.send("Input.dispatchTouchEvent", {
      type: cancel ? "touchCancel" : "touchEnd",
      touchPoints: [],
    });
    await c.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
  }
}
