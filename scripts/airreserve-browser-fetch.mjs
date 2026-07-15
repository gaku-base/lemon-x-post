import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { extractSchedule } from "./airreserve-extract.mjs";

const AIR_RESERVE_URL =
  process.env.AIR_RESERVE_URL || "https://airrsv.net/lemonnoki/calendar";
const START_DATE =
  process.env.START_DATE || new Date().toISOString().slice(0, 10);
const DAYS = Math.min(Math.max(Number(process.env.DAYS || 4), 1), 4);
const PLAYWRIGHT_CHANNEL = process.env.PLAYWRIGHT_CHANNEL || "chrome";
const DEBUG_SCREENSHOT = process.env.DEBUG_SCREENSHOT === "1";

const OUTPUT_DIR = path.resolve("data/airreserve-debug");
const PUBLIC_JSON_PATH = path.resolve("data/availability.json");

function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function requestedDates() {
  return Array.from({ length: DAYS }, (_, index) =>
    addDays(START_DATE, index)
  );
}

async function waitForScheduleReady(page) {
  await page.waitForSelector("td.scheduleBodyCell.tdCell", {
    state: "visible",
    timeout: 30000
  });

  await page.waitForFunction(
    ({ minimumColumns }) => {
      const visible = (element) => {
        if (!(element instanceof Element)) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      };

      const datePattern = /\d{1,2}\/\d{1,2}\([日月火水木金土]\)/;
      const headers = [...document.querySelectorAll("body *")].filter(
        (element) =>
          visible(element) &&
          datePattern.test(String(element.textContent || "").trim())
      );
      const cells = [
        ...document.querySelectorAll("td.scheduleBodyCell.tdCell")
      ].filter(visible);

      return headers.length >= minimumColumns && cells.length >= minimumColumns;
    },
    { minimumColumns: Math.min(DAYS, 4) },
    { timeout: 30000, polling: 200 }
  );

  // Wait until the visible schedule text stops changing.
  let previous = "";
  let stableReads = 0;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const signature = await page
      .locator("td.scheduleBodyCell.tdCell")
      .evaluateAll((cells) =>
        cells
          .map((cell) => String(cell.innerText || "").replace(/\s+/g, " ").trim())
          .join("|")
      );

    if (signature === previous) {
      stableReads += 1;
      if (stableReads >= 2) return;
    } else {
      stableReads = 0;
      previous = signature;
    }

    await page.waitForTimeout(250);
  }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    channel: PLAYWRIGHT_CHANNEL,
    headless: true,
    args: ["--disable-dev-shm-usage"]
  });

  let page = null;

  try {
    const context = await browser.newContext({
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      viewport: { width: 1440, height: 1400 }
    });

    page = await context.newPage();

    await page.goto(AIR_RESERVE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await waitForScheduleReady(page);

    if (DEBUG_SCREENSHOT) {
      await page.screenshot({
        path: path.join(OUTPUT_DIR, "schedule.png"),
        fullPage: true
      });
    }

    const schedule = await extractSchedule(page, START_DATE);
    const dates = requestedDates();

    const days = dates.map((date) => {
      const column = schedule.columns.find((item) => item.date === date);

      if (!column) {
        return {
          date,
          status: {
            code: "notVisible",
            label: "表示範囲外",
            reason: "現在表示されている週間予約表に日付がありません。"
          },
          slots: [],
          availableSlots: []
        };
      }

      return column;
    });

    const result = {
      ok: true,
      stage: "weekly-column-extraction-v4-fast",
      fetchedAt: new Date().toISOString(),
      sourceUrl: AIR_RESERVE_URL,
      startDate: START_DATE,
      daysRequested: DAYS,
      days
    };

    await fs.writeFile(
      path.join(OUTPUT_DIR, "availability.json"),
      JSON.stringify({ ...result, debugSchedule: schedule }, null, 2),
      "utf8"
    );

    await fs.writeFile(
      PUBLIC_JSON_PATH,
      JSON.stringify(result, null, 2),
      "utf8"
    );
  } catch (error) {
    if (page) {
      await page
        .screenshot({
          path: path.join(OUTPUT_DIR, "failure.png"),
          fullPage: true
        })
        .catch(() => {});
    }
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(async (error) => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const message =
    error instanceof Error ? error.stack || error.message : String(error);

  await fs.writeFile(
    path.join(OUTPUT_DIR, "error.txt"),
    message,
    "utf8"
  );

  console.error(error);
  process.exitCode = 1;
});
