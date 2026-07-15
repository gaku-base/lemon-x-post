import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const AIR_RESERVE_URL =
  process.env.AIR_RESERVE_URL ?? "https://airrsv.net/lemonnoki/calendar";
const START_DATE = process.env.START_DATE ?? new Date().toISOString().slice(0, 10);
const DAYS = Math.min(Math.max(Number(process.env.DAYS ?? 4), 1), 4);
const OUTPUT_DIR = path.resolve("data/airreserve-debug");

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalize(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function inferStatus(text, slots) {
  if (
    text.includes("選択可能な予約メニューがありません") ||
    text.includes("予約可能なメニューがありません")
  ) {
    return {
      code: "noSlots",
      label: "予約枠なし",
      reason: "予約メニューがない旨の表示を検出"
    };
  }

  if (text.includes("満席") || text.includes("満員")) {
    return {
      code: "full",
      label: "満席",
      reason: "満席または満員の表示を検出"
    };
  }

  if (text.includes("受付終了")) {
    return {
      code: "closed",
      label: "受付終了",
      reason: "受付終了の表示を検出"
    };
  }

  if (slots.length > 0) {
    return {
      code: "available",
      label: "空きあり",
      reason: `${slots.length}件の予約枠候補を検出`
    };
  }

  return {
    code: "unknown",
    label: "判定保留",
    reason: "予約状態を確定できる表示を検出できず"
  };
}

async function visibleText(page) {
  return normalize(await page.locator("body").innerText({ timeout: 15000 }));
}

async function collectInteractiveElements(page) {
  return await page.locator(
    'button, a, [role="button"], input, select, [tabindex]'
  ).evaluateAll((elements) =>
    elements.slice(0, 500).map((element, index) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);

      return {
        index,
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type") ?? "",
        role: element.getAttribute("role") ?? "",
        text: (element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 160),
        value: "value" in element ? String(element.value ?? "").slice(0, 160) : "",
        name: element.getAttribute("name") ?? "",
        id: element.id ?? "",
        className: String(element.className ?? "").slice(0, 200),
        href: element instanceof HTMLAnchorElement ? element.href : "",
        visible:
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none",
        disabled:
          "disabled" in element ? Boolean(element.disabled) : false
      };
    })
  );
}

async function collectNetwork(page) {
  const requests = [];
  const handler = (request) => {
    const url = request.url();
    if (
      /(reserve|reservation|calendar|schedule|slot|vacan|avail|menu|course|booking|search)/i.test(
        url
      )
    ) {
      requests.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url
      });
    }
  };

  page.on("request", handler);
  return {
    requests,
    stop: () => page.off("request", handler)
  };
}

async function findDateControls(page, targetDate) {
  const date = new Date(`${targetDate}T00:00:00+09:00`);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = "日月火水木金土"[date.getDay()];

  const candidates = [
    targetDate,
    targetDate.replaceAll("-", "/"),
    `${month}/${day}`,
    `${month}月${day}日`,
    `${day}`,
    `${day}日`,
    `${month}/${day}(${weekday})`,
    `${month}/${day}（${weekday}）`
  ];

  const matches = [];
  for (const candidate of candidates) {
    const locator = page.getByText(candidate, { exact: true });
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < Math.min(count, 10); index += 1) {
      const item = locator.nth(index);
      if (await item.isVisible().catch(() => false)) {
        matches.push({
          label: candidate,
          locator: item
        });
      }
    }
  }
  return matches;
}

async function attemptDateSelection(page, targetDate) {
  const before = await visibleText(page);
  const matches = await findDateControls(page, targetDate);

  for (const match of matches) {
    try {
      await match.locator.click({ timeout: 2500 });
      await page.waitForTimeout(1200);
      const after = await visibleText(page);

      if (after !== before) {
        return {
          success: true,
          method: `text:${match.label}`,
          changed: true
        };
      }
    } catch {
      // 次の候補を試す
    }
  }

  const inputResult = await page.evaluate((targetDate) => {
    const inputs = [...document.querySelectorAll('input[type="date"]')];
    for (const input of inputs) {
      if (!(input instanceof HTMLInputElement)) continue;
      input.value = targetDate;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }, targetDate);

  if (inputResult) {
    await page.waitForTimeout(1200);
    const after = await visibleText(page);
    return {
      success: after !== before,
      method: "input[type=date]",
      changed: after !== before
    };
  }

  return {
    success: false,
    method: "not-found",
    changed: false
  };
}

async function detectSlotCandidates(page) {
  return await page.locator("body").evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    };

    const results = [];
    const timePattern = /(?:^|[^\d])([0-2]?\d:[0-5]\d)(?=[^\d]|$)/g;

    for (const element of document.querySelectorAll("button,a,li,td,div,label")) {
      if (!visible(element)) continue;

      const text = (element.innerText || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 250) continue;

      const times = [...text.matchAll(timePattern)].map((match) => match[1]);
      if (!times.length) continue;

      if (!/(予約|空き|受付|残|○|△|満|時|分|〜|-)/.test(text)) continue;

      results.push({
        text,
        times,
        tag: element.tagName.toLowerCase(),
        className: String(element.className || "").slice(0, 160)
      });
    }

    return results.slice(0, 300);
  });
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 1440, height: 1400 }
  });

  const page = await context.newPage();
  const network = await collectNetwork(page);

  await page.goto(AIR_RESERVE_URL, {
    waitUntil: "networkidle",
    timeout: 60000
  });

  await page.screenshot({
    path: path.join(OUTPUT_DIR, "00-initial.png"),
    fullPage: true
  });

  const initial = {
    url: page.url(),
    title: await page.title(),
    text: await visibleText(page),
    interactiveElements: await collectInteractiveElements(page)
  };

  const days = [];

  for (let offset = 0; offset < DAYS; offset += 1) {
    const targetDate = addDays(START_DATE, offset);
    const selection = await attemptDateSelection(page, targetDate);

    await page.waitForTimeout(800);

    const text = await visibleText(page);
    const slotCandidates = await detectSlotCandidates(page);
    const slotTimes = unique(
      slotCandidates.flatMap((candidate) => candidate.times)
    );
    const status = inferStatus(text, slotCandidates);

    const screenshotName = `${String(offset + 1).padStart(2, "0")}-${targetDate}.png`;
    await page.screenshot({
      path: path.join(OUTPUT_DIR, screenshotName),
      fullPage: true
    });

    days.push({
      date: targetDate,
      offset,
      selection,
      status,
      slotTimes,
      slotCandidates,
      url: page.url(),
      visibleText: text
    });
  }

  network.stop();

  const output = {
    ok: true,
    stage: "browser-automation-diagnostic-v1",
    fetchedAt: new Date().toISOString(),
    sourceUrl: AIR_RESERVE_URL,
    startDate: START_DATE,
    daysRequested: DAYS,
    initial,
    days,
    networkRequests: network.requests
  };

  await fs.writeFile(
    path.join(OUTPUT_DIR, "availability.json"),
    JSON.stringify(output, null, 2),
    "utf8"
  );

  await fs.writeFile(
    path.resolve("data/availability.json"),
    JSON.stringify(
      {
        ok: output.ok,
        stage: output.stage,
        fetchedAt: output.fetchedAt,
        sourceUrl: output.sourceUrl,
        startDate: output.startDate,
        days: output.days.map((day) => ({
          date: day.date,
          status: day.status,
          slotTimes: day.slotTimes,
          slotCandidates: day.slotCandidates,
          selection: day.selection
        }))
      },
      null,
      2
    ),
    "utf8"
  );

  await browser.close();
}

main().catch(async (error) => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(
    path.join(OUTPUT_DIR, "error.txt"),
    error instanceof Error ? error.stack ?? error.message : String(error),
    "utf8"
  );
  console.error(error);
  process.exitCode = 1;
});
