import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { extractSchedule } from "./airreserve-extract.mjs";

const AIR_RESERVE_URL =
  process.env.AIR_RESERVE_URL || "https://airrsv.net/lemonnoki/calendar";
const START_DATE =
  process.env.START_DATE || new Date().toISOString().slice(0, 10);
const DAYS = Math.min(Math.max(Number(process.env.DAYS || 7), 1), 7);

const OUTPUT_DIR = path.resolve("data/airreserve-debug");
const PUBLIC_JSON_PATH = path.resolve("data/availability.json");

function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function toIsoDate(year, month, day) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function addMinutes(time, minutes) {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`;
}

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function requestedDates() {
  return Array.from({ length: DAYS }, (_, index) =>
    addDays(START_DATE, index)
  );
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      viewport: { width: 1440, height: 1400 }
    });

    const page = await context.newPage();

    await page.goto(AIR_RESERVE_URL, {
      waitUntil: "networkidle",
      timeout: 60000
    });

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "schedule.png"),
      fullPage: true
    });

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
            reason:
              "現在表示されている週間予約表に日付がありません。"
          },
          slots: [],
          availableSlots: []
        };
      }

      return column;
    });

    const result = {
      ok: true,
      stage: "weekly-column-extraction-v3",
      fetchedAt: new Date().toISOString(),
      sourceUrl: AIR_RESERVE_URL,
      startDate: START_DATE,
      daysRequested: DAYS,
      days
    };

    await fs.writeFile(
      path.join(OUTPUT_DIR, "availability.json"),
      JSON.stringify(
        {
          ...result,
          debugSchedule: schedule
        },
        null,
        2
      ),
      "utf8"
    );

    await fs.writeFile(
      PUBLIC_JSON_PATH,
      JSON.stringify(result, null, 2),
      "utf8"
    );
  } finally {
    await browser.close();
  }
}

main().catch(async (error) => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const message =
    error instanceof Error
      ? error.stack || error.message
      : String(error);

  await fs.writeFile(
    path.join(OUTPUT_DIR, "error.txt"),
    message,
    "utf8"
  );

  console.error(error);
  process.exitCode = 1;
});
