export async function extractSchedule(page, startDate) {
  return await page.evaluate(
    ({ startDate }) => {
      function normalizeText(text) {
        return String(text || "").replace(/\s+/g, " ").trim();
      }

      function visible(element) {
        if (!(element instanceof Element)) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      }

      function dateParts(text) {
        const match = normalizeText(text).match(
          /(\d{1,2})\/(\d{1,2})\(([日月火水木金土])\)/
        );
        if (!match) return null;
        return {
          month: Number(match[1]),
          day: Number(match[2]),
          weekday: match[3]
        };
      }

      function rectData(element) {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          centerX: rect.left + rect.width / 2
        };
      }

      const requestedYear = Number(startDate.slice(0, 4));

      const headerCandidates = [...document.querySelectorAll("body *")]
        .filter(visible)
        .map((element) => ({
          element,
          text: normalizeText(element.textContent),
          rect: rectData(element)
        }))
        .filter((item) => {
          if (!dateParts(item.text)) return false;
          if (item.text.length > 16) return false;
          return item.rect.width > 20 && item.rect.height > 10;
        })
        .sort(
          (a, b) =>
            a.rect.width * a.rect.height - b.rect.width * b.rect.height
        );

      const headers = [];
      const usedDateLabels = new Set();

      for (const candidate of headerCandidates) {
        const parts = dateParts(candidate.text);
        if (!parts) continue;

        const key = `${parts.month}/${parts.day}`;
        if (usedDateLabels.has(key)) continue;

        usedDateLabels.add(key);
        headers.push({
          ...parts,
          label: candidate.text,
          rect: candidate.rect
        });
      }

      headers.sort((a, b) => a.rect.left - b.rect.left);

      let year = requestedYear;
      let previousMonth = null;

      for (const header of headers) {
        if (
          previousMonth !== null &&
          previousMonth === 12 &&
          header.month === 1
        ) {
          year += 1;
        }
        header.date = [
          String(year).padStart(4, "0"),
          String(header.month).padStart(2, "0"),
          String(header.day).padStart(2, "0")
        ].join("-");
        previousMonth = header.month;
      }

      const bodyCells = [
        ...document.querySelectorAll("td.scheduleBodyCell.tdCell")
      ]
        .filter(visible)
        .map((element) => ({
          element,
          rect: rectData(element),
          className: String(element.className || ""),
          backgroundColor: getComputedStyle(element).backgroundColor
        }))
        .filter((cell) => cell.rect.width > 20);

      const columns = headers.map((header) => {
        let nearestCell = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const cell of bodyCells) {
          const distance = Math.abs(cell.rect.centerX - header.rect.centerX);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestCell = cell;
          }
        }

        const cell = nearestCell?.element || null;
        const cellStyle = cell ? getComputedStyle(cell) : null;

        const slotElements = cell
          ? [...cell.querySelectorAll(".dataListItem.js-lane")]
          : [];

        const seen = new Set();
        const slots = [];

        for (const slotElement of slotElements) {
          if (!visible(slotElement)) continue;

          const text = normalizeText(slotElement.innerText);
          const timeMatch = text.match(/([0-2]?\d:[0-5]\d)/);
          const durationMatch = text.match(/(\d+)\s*分/);
          const remainingMatch = text.match(/残\s*(\d+)/);

          if (!timeMatch || !durationMatch) continue;

          const start = timeMatch[1].padStart(5, "0");
          const durationMinutes = Number(durationMatch[1]);
          const remaining = remainingMatch
            ? Number(remainingMatch[1])
            : null;

          const anchor = slotElement.querySelector(
            "a.js-dataLinkBox, a[href]"
          );
          const anchorStyle = anchor ? getComputedStyle(anchor) : null;

          const slotStyle = getComputedStyle(slotElement);
          const parentClasses = [];
          let parent = slotElement.parentElement;

          while (parent && parent !== cell) {
            parentClasses.push(String(parent.className || ""));
            parent = parent.parentElement;
          }

          const disabledByClass = [
            String(slotElement.className || ""),
            String(anchor?.className || ""),
            ...parentClasses,
            String(cell?.className || "")
          ].some((value) =>
            /(is-full|disabled|disable|is-disabled|closed|unavailable)/i.test(
              value
            )
          );

          const full =
            slotElement.classList.contains("is-full") ||
            text.includes("満") ||
            remaining === 0;

          const clickable =
            Boolean(anchor) &&
            anchorStyle?.pointerEvents !== "none" &&
            anchor?.getAttribute("aria-disabled") !== "true" &&
            !disabledByClass &&
            !full;

          const key = `${start}|${durationMinutes}|${remaining}|${text}`;
          if (seen.has(key)) continue;
          seen.add(key);

          slots.push({
            start,
            end: (() => {
              const [hour, minute] = start.split(":").map(Number);
              const total = hour * 60 + minute + durationMinutes;
              return `${String(Math.floor(total / 60) % 24).padStart(
                2,
                "0"
              )}:${String(total % 60).padStart(2, "0")}`;
            })(),
            durationMinutes,
            remaining,
            full,
            clickable,
            text,
            className: String(slotElement.className || ""),
            anchorClassName: String(anchor?.className || ""),
            href: anchor instanceof HTMLAnchorElement ? anchor.href : "",
            pointerEvents: anchorStyle?.pointerEvents || "",
            backgroundColor: slotStyle.backgroundColor,
            color: slotStyle.color,
            parentClasses
          });
        }

        const availableSlots = slots.filter(
          (slot) =>
            !slot.full &&
            slot.remaining !== 0 &&
            slot.clickable
        );

        const waitingSlots = slots.filter(
          (slot) =>
            !slot.full &&
            slot.remaining !== 0 &&
            !slot.clickable
        );

        let status;

        if (slots.length === 0) {
          status = {
            code: "noSlots",
            label: "予約枠なし",
            reason: "この日付の列に予約枠がありません。"
          };
        } else if (availableSlots.length > 0) {
          status = {
            code: "available",
            label: "空きあり",
            reason: `${availableSlots.length}件の選択可能な空き枠があります。`
          };
        } else if (slots.every((slot) => slot.full)) {
          status = {
            code: "full",
            label: "満席",
            reason: "すべての予約枠が満席です。"
          };
        } else if (waitingSlots.length > 0) {
          status = {
            code: "notOpen",
            label: "受付開始前",
            reason:
              "枠は表示されていますが、現在は選択できません。"
          };
        } else {
          status = {
            code: "unknown",
            label: "判定保留",
            reason: "予約状態を確定できませんでした。"
          };
        }

        return {
          date: header.date,
          label: header.label,
          weekday: header.weekday,
          headerRect: header.rect,
          cellRect: nearestCell?.rect || null,
          cellClassName: nearestCell?.className || "",
          cellBackgroundColor:
            nearestCell?.backgroundColor ||
            cellStyle?.backgroundColor ||
            "",
          status,
          slots,
          availableSlots
        };
      });

      return {
        headers,
        bodyCellCount: bodyCells.length,
        columns
      };
    },
    { startDate }
  );
}
