import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator } from "@playwright/test";
import { resetDemoBurrow } from "./db.ts";
import { ask, cards, signIn } from "./helpers.ts";

test.skip(process.env.WALKTHROUGH !== "1", "run npm run walkthrough");

const PUBLIC_DIR = fileURLToPath(new URL("../apps/web/public/", import.meta.url));

const PROFILES = [
  {
    name: "desktop",
    viewport: { width: 1280, height: 720 },
    isMobile: false,
    hasTouch: false,
  },
  {
    name: "mobile",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
] as const;

const idOf = async (locator: Locator) => {
  const testId = await locator.getAttribute("data-testid");
  if (!testId?.startsWith("card-")) throw new Error("not a card");
  return testId.slice("card-".length);
};

const stamp = (ms: number) => {
  const value = Math.max(0, Math.round(ms));
  const hours = String(Math.floor(value / 3_600_000)).padStart(2, "0");
  const minutes = String(Math.floor(value / 60_000) % 60).padStart(2, "0");
  const seconds = String(Math.floor(value / 1000) % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}.${String(value % 1000).padStart(3, "0")}`;
};

for (const profile of PROFILES) {
  test(`records the ${profile.name} walkthrough`, async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    resetDemoBurrow();

    const context = await browser.newContext({
      baseURL,
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      recordVideo: {
        dir: `test-results/walkthrough-${profile.name}`,
        size: profile.viewport,
      },
    });
    const page = await context.newPage();

    const started = Date.now();
    const cues: { at: number; text: string }[] = [];
    const cue = (text: string) => cues.push({ at: Date.now() - started, text });
    const pause = (ms = 600) => page.waitForTimeout(ms);

    await signIn(page);
    await page.goto("/app");
    await expect(page.getByTestId("workspace")).toBeVisible();
    await expect(cards(page)).toHaveCount(4);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
    });
    await page.addStyleTag({
      content:
        "[data-walkthrough-pulse]{outline:3px solid #10b981;outline-offset:3px;border-radius:8px}",
    });

    const pulse = async (target: Locator) => {
      await target.evaluate((element) => element.setAttribute("data-walkthrough-pulse", ""));
      await pause(350);
      await target.evaluate((element) => element.removeAttribute("data-walkthrough-pulse"));
    };
    const click = async (target: Locator) => {
      await pulse(target);
      await target.click();
    };
    const fitted = async () => {
      await click(page.getByRole("button", { name: "Fit" }));
      await pause(500);
    };
    const focus = async (query: string) => {
      await click(page.getByTestId("open-palette"));
      await page.getByTestId("palette-input").fill(query);
      await expect(page.getByTestId("palette-row-0")).toBeVisible();
      await click(page.getByTestId("palette-row-0"));
      await expect(page.getByTestId("palette")).toHaveCount(0);
      await pause(600);
    };
    const answered = (target: Locator) =>
      expect(target).toHaveAttribute("data-status", "answered", { timeout: 20_000 });

    // Default framing is the whole viewport, not a zoomed-in corner.
    await fitted();
    cue("DeepBurrow: deep dives branch");
    await pause(500);

    cue("Start a new burrow");
    if (profile.isMobile) {
      await click(page.getByTestId("open-burrows"));
      await expect(page.getByRole("dialog", { name: "Burrows" })).toBeVisible();
      await pause(400);
    }
    await click(page.getByTestId("new-burrow"));
    await expect(page.getByTestId("new-burrow-dialog")).toBeVisible();
    await pause(400);
    await page.getByTestId("new-burrow-input").fill("How does TCP congestion control work?");
    await pause(400);
    await click(page.getByTestId("new-burrow-submit"));

    cue("The first answer streams into the root card");
    await expect(cards(page)).toHaveCount(1);
    const root = cards(page).last();
    await expect(root).toHaveAttribute("data-status", "pending");
    await expect(root.locator('[data-testid^="body-"]')).toContainText("Researching…");
    await answered(root);
    const rootId = await idOf(root);
    await pause(900);
    await fitted();

    cue("Ask again from the root");
    await focus("How does TCP congestion control work?");
    const second = await ask(page, "Why does slow start double per RTT?", rootId);
    await expect(second.locator('[data-testid^="progress-"]')).toContainText("Writing the answer…");
    await answered(second);
    await pause(700);
    await fitted();

    cue("Branch a second time");
    await focus("How does TCP congestion control work?");
    const third = await ask(page, "When does CUBIC beat Reno?", rootId);
    await answered(third);
    await pause(700);
    await fitted();

    cue("Ask from a child card");
    await focus("Why does slow start double per RTT?");
    const childId = await idOf(second);
    const rich = await ask(page, "Explain congestion signals with a diagram and math", childId);
    await answered(rich);
    const body = rich.locator('[data-testid^="body-"]');
    await body.evaluate((element) => element.scrollTo({ top: 0 }));
    await pause(900);

    cue("Scroll inside a long answer");
    await rich.locator(".katex-display").first().scrollIntoViewIfNeeded();
    await pause(900);

    cue("KaTeX and Mermaid render as you scroll");
    await rich.locator(".db-mermaid").scrollIntoViewIfNeeded();
    await pause(1200);

    cue("Back to the whole tree");
    await fitted();
    // End on the diagram so the poster does not include the inert raw-HTML sample
    // that the rich test answer carries below it.
    await body.evaluate((element) => {
      const diagram = element.querySelector(".db-mermaid");
      if (!diagram) return;
      element.scrollTop +=
        diagram.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom;
    });
    await pause(1500);

    const stem = `walkthrough-${profile.name}`;
    await page.screenshot({ path: `${PUBLIC_DIR}${stem}-poster.png` });
    const ended = Date.now() - started;
    await page.close();
    await page.video()?.saveAs(`${PUBLIC_DIR}${stem}.webm`);
    await context.close();

    const captions = [
      "WEBVTT",
      "",
      ...cues.map((entry, index) => {
        const until = cues[index + 1]?.at ?? ended + 500;
        return `${stamp(entry.at)} --> ${stamp(until)}\n${entry.text}\n`;
      }),
    ].join("\n");
    writeFileSync(`${PUBLIC_DIR}${stem}.vtt`, captions);
  });
}
