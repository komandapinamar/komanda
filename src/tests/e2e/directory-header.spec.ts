import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) {
  test(`directory keeps its original header at the top while scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");

    const header = page.locator("header").filter({ has: page.getByRole("link", { name: "Komanda", exact: true }) });
    await expect(header).toHaveCount(1);
    await expect(header.getByRole("link", { name: "Registrar Negocio" })).toBeVisible();
    const appearance = () => header.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        border: style.borderBottomColor,
        borderWidth: style.borderBottomWidth,
        padding: style.paddingTop,
        height: element.getBoundingClientRect().height,
      };
    });
    const originalAppearance = await appearance();

    await page.evaluate(() => {
      document.body.style.minHeight = "2000px";
      window.scrollTo(0, 350);
    });
    await expect(header).toHaveClass(/fixed/);
    await expect(header.getByRole("link", { name: "Registrar Negocio" })).toBeHidden();
    expect(await header.evaluate((element) => element.getBoundingClientRect().top)).toBe(0);
    expect(await appearance()).toEqual(originalAppearance);

    await page.evaluate(() => window.scrollTo(0, 200));
    await expect(header.getByRole("link", { name: "Registrar Negocio" })).toBeVisible();
    await expect(header).toHaveClass(/fixed/);
    expect(await appearance()).toEqual(originalAppearance);

    await page.evaluate(() => window.scrollTo(0, 350));
    await expect(header.getByRole("link", { name: "Registrar Negocio" })).toBeHidden();

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(header).not.toHaveClass(/fixed/);
    await expect(header.getByRole("link", { name: "Registrar Negocio" })).toBeVisible();
  });
}
