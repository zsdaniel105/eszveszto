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
export async function wipe(
  page: Page,
  canvas: Locator,
  y: number,
  touch = false,
  cancel = false,
) {
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
