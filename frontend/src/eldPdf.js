import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 1100;
const PAGE_HEIGHT = 840;
const PAGE_LEFT = 34;
const PAGE_TOP = 26;
const PAGE_WIDTH_INNER = 1032;
const PAGE_HEIGHT_INNER = 780;
const GRID_LEFT = 114;
const GRID_TOP = 266;
const GRID_WIDTH = 820;
const GRID_HEIGHT = 128;
const TOTALS_LEFT = GRID_LEFT + GRID_WIDTH;
const TOTALS_WIDTH = 64;
const TIME_BAR_TOP = GRID_TOP - 28;
const TIME_BAR_HEIGHT = 28;
const ROW_HEIGHT = GRID_HEIGHT / 4;
const REMARKS_TOP = 442;
const REMARKS_BOTTOM = 650;
const FOOTER_TOP = 704;
const MINUTES_PER_DAY = 24 * 60;
const BLACK = rgb(0.06, 0.06, 0.06);
const WHITE = rgb(1, 1, 1);

const STATUS_ROW_INDEX = {
  off_duty: 0,
  sleeper_berth: 1,
  driving: 2,
  on_duty: 3,
};

const STATUS_LABELS = {
  off_duty: ["1. Off Duty", ""],
  sleeper_berth: ["2. Sleeper Berth", ""],
  driving: ["3. Driving", ""],
  on_duty: ["4. On Duty", "(not driving)"],
};

export async function generateTripLogPdf(planResult) {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const dailyLog of planResult.plan.daily_logs) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const layout = buildLayout(dailyLog, planResult.plan);
    drawPage(page, layout, regularFont, boldFont);
  }

  return pdfDoc.save();
}

function drawPage(page, layout, regularFont, boldFont) {
  const text = (value, x, y, options = {}) => {
    page.drawText(String(value), {
      x,
      y: toPdfY(y),
      size: options.size ?? 8,
      font: options.bold ? boldFont : regularFont,
      color: options.color ?? BLACK,
    });
  };

  const centeredText = (value, centerX, y, options = {}) => {
    const font = options.bold ? boldFont : regularFont;
    const size = options.size ?? 8;
    const width = font.widthOfTextAtSize(String(value), size);
    text(value, centerX - width / 2, y, options);
  };

  const line = (x1, y1, x2, y2, thickness = 1, color = BLACK) => {
    page.drawLine({
      start: { x: x1, y: toPdfY(y1) },
      end: { x: x2, y: toPdfY(y2) },
      thickness,
      color,
    });
  };

  const rect = (x, y, width, height, options = {}) => {
    page.drawRectangle({
      x,
      y: PAGE_HEIGHT - y - height,
      width,
      height,
      borderWidth: options.borderWidth ?? 1,
      borderColor: options.borderColor ?? BLACK,
      color: options.fill,
    });
  };

  rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, { fill: WHITE, borderWidth: 0 });
  rect(PAGE_LEFT, PAGE_TOP, PAGE_WIDTH_INNER, PAGE_HEIGHT_INNER, { borderWidth: 1.8 });
  text("Drivers Daily Log", 54, 48, { size: 20, bold: true });
  text("(24 hours)", 190, 67, { size: 9 });
  text("Original - File at home terminal.", 728, 42, { size: 8 });
  text("Duplicate - Driver retains in his/her possession for 8 days.", 728, 58, { size: 8 });

  text("(month)", 349, 34, { size: 7 });
  text("(day)", 434, 34, { size: 7 });
  text("(year)", 517, 34, { size: 7 });
  line(324, 48, 394, 48);
  line(410, 48, 474, 48);
  line(492, 48, 560, 48);
  text(layout.dateParts.month, 358, 46, { size: 10 });
  text(layout.dateParts.day, 439, 46, { size: 10 });
  text(layout.dateParts.year, 518, 46, { size: 10 });

  drawHeader({ text, centeredText, line, rect }, layout);
  drawGrid({ text, centeredText, line, rect }, layout);
  drawRemarks({ text, line, rect }, layout);
  drawFooter({ text, centeredText, line, rect }, layout);
}

function drawHeader(draw, layout) {
  draw.text("From:", 60, 92, { size: 13, bold: true });
  draw.line(112, 88, 470, 88);
  draw.text(layout.fromLocation, 114, 82, { size: 11 });
  draw.text("To:", 505, 92, { size: 13, bold: true });
  draw.line(540, 88, 890, 88);
  draw.text(layout.toLocation, 542, 82, { size: 11 });

  draw.rect(92, 106, 175, 46, { borderWidth: 1.5 });
  draw.rect(272, 106, 175, 46, { borderWidth: 1.5 });
  draw.centeredText(layout.milesDrivingToday, 178, 126, { size: 14 });
  draw.centeredText(layout.milesTotalToday, 358, 126, { size: 14 });
  draw.centeredText("Total Miles Driving Today", 178, 144, { size: 7 });
  draw.centeredText("Total Mileage Today", 358, 144, { size: 7 });

  for (const field of layout.headerLines) {
    draw.line(field.x1, field.y, field.x2, field.y);
    draw.centeredText(field.value, (field.x1 + field.x2) / 2, field.y - 4, { size: 10 });
    draw.centeredText(field.label, (field.x1 + field.x2) / 2, field.y + 12, { size: 8 });
  }

  draw.rect(92, 170, 355, 42, { borderWidth: 1.4 });
  draw.centeredText(layout.vehicleUnitNumbers, 270, 186, { size: 9 });
  draw.centeredText("Truck/Tractor and Trailer Numbers or", 270, 202, { size: 6.8 });
  draw.centeredText("License Plate(s)/State (show each unit)", 270, 210, { size: 6.8 });
}

function drawGrid(draw, layout) {
  draw.rect(GRID_LEFT, TIME_BAR_TOP, GRID_WIDTH, TIME_BAR_HEIGHT, { fill: BLACK, borderWidth: 0 });
  draw.rect(GRID_LEFT, GRID_TOP, GRID_WIDTH, GRID_HEIGHT, { borderWidth: 1.5 });
  draw.rect(TOTALS_LEFT, TIME_BAR_TOP, TOTALS_WIDTH, TIME_BAR_HEIGHT + GRID_HEIGHT, { borderWidth: 1.5 });
  draw.centeredText("Total", TOTALS_LEFT + TOTALS_WIDTH / 2, TIME_BAR_TOP + 11, { size: 8, color: WHITE });
  draw.centeredText("Hours", TOTALS_LEFT + TOTALS_WIDTH / 2, TIME_BAR_TOP + 22, { size: 8, color: WHITE });

  for (const tick of buildHourTicks()) {
    draw.line(tick.x, GRID_TOP, tick.x, GRID_TOP + GRID_HEIGHT, tick.strokeWidth);
    draw.centeredText(tick.label, tick.x, TIME_BAR_TOP + 18, { size: 8, color: WHITE });
  }

  for (const tick of buildQuarterTicks()) {
    draw.line(tick.x, GRID_TOP, tick.x, tick.y2, 0.8);
  }

  for (let row = 1; row < 4; row += 1) {
    const y = GRID_TOP + row * ROW_HEIGHT;
    draw.line(GRID_LEFT, y, TOTALS_LEFT + TOTALS_WIDTH, y, 1.2);
  }

  for (const label of buildRowLabels()) {
    draw.text(label.line1, label.x, label.y, { size: 10 });
    if (label.line2) {
      draw.text(label.line2, label.x, label.y + 12, { size: 10 });
    }
  }

  for (const total of layout.rowTotals) {
    draw.centeredText(total.value, total.x, total.y, { size: 10 });
  }

  for (const connector of layout.connectors) {
    draw.line(connector.x, connector.y1, connector.x, connector.y2, 3.2);
  }

  for (const segment of layout.segments) {
    draw.line(segment.x1, segment.y, segment.x2, segment.y, 3.2);
  }
}

function drawRemarks(draw, layout) {
  draw.text("Remarks", 62, REMARKS_TOP - 16, { size: 13, bold: true });
  draw.line(60, REMARKS_TOP - 8, 60, REMARKS_BOTTOM, 2);
  draw.line(60, REMARKS_BOTTOM, 764, REMARKS_BOTTOM, 1.6);
  draw.text("Shipping", 66, REMARKS_TOP + 32, { size: 11, bold: true });
  draw.text("Documents:", 66, REMARKS_TOP + 48, { size: 11, bold: true });
  draw.rect(66, REMARKS_TOP + 58, 182, 102, { borderWidth: 1.2 });
  draw.line(66, REMARKS_TOP + 96, 248, REMARKS_TOP + 96);
  draw.text(layout.shippingManifest, 66, REMARKS_TOP + 80, { size: 8 });
  draw.text("DVIR or Manifest No.", 66, REMARKS_TOP + 95, { size: 8 });
  draw.text(layout.shippingCommodity, 66, REMARKS_TOP + 123, { size: 8 });
  draw.text("Shipper & Commodity", 66, REMARKS_TOP + 140, { size: 8 });

  for (const [index, remark] of layout.remarks.entries()) {
    draw.text(remark, 270, REMARKS_TOP + 24 + index * 26, { size: 10 });
  }

  for (const y of [REMARKS_TOP + 62, REMARKS_TOP + 112, REMARKS_TOP + 162]) {
    draw.line(780, y, 948, y, 1.1);
  }

  draw.text("Enter name of place you reported and where released from work and when and where each change of duty occurred.", 292, REMARKS_BOTTOM - 14, { size: 6.8 });
  draw.text("Use time standard of home terminal.", 434, REMARKS_BOTTOM - 2, { size: 6.8 });
}

function drawFooter(draw, layout) {
  draw.text("Recap:", 60, FOOTER_TOP, { size: 10, bold: true });
  draw.text("Complete at", 60, FOOTER_TOP + 14, { size: 8 });
  draw.text("end of day.", 60, FOOTER_TOP + 26, { size: 8 });

  for (const column of layout.recapColumns) {
    draw.line(column.x1, FOOTER_TOP - 2, column.x2, FOOTER_TOP - 2, 1.2);
    draw.centeredText(column.title, column.centerX, FOOTER_TOP + 12, { size: 8 });
    for (const [index, line] of column.lines.entries()) {
      draw.centeredText(line, column.centerX, FOOTER_TOP + 28 + index * 12, { size: 7.2 });
    }
  }

  draw.rect(52, 806, 996, 6, { fill: BLACK, borderWidth: 0 });
}

function buildLayout(dailyLog, plan) {
  const events = dailyLog.events;
  const segments = [];
  const connectors = [];
  let previousSegment = null;

  for (const event of events) {
    const startMinutes = minutesFromIso(event.start_at);
    const endMinutes = minutesFromIso(event.end_at);
    const y = rowCenter(event.status);
    const x1 = minuteToX(startMinutes);
    const segment = {
      status: event.status,
      x1,
      x2: Math.max(minuteToX(endMinutes), x1 + 2),
      y,
    };

    if (previousSegment && previousSegment.status !== event.status) {
      connectors.push({ x: segment.x1, y1: previousSegment.y, y2: segment.y });
    }

    segments.push(segment);
    previousSegment = segment;
  }

  const currentCycleUsed = Number(plan.input_summary.current_cycle_used_hours);
  const totals = dailyLog.totals_minutes;
  const drivingMiles = events
    .filter((event) => event.status === "driving")
    .reduce((sum, event) => sum + Number(event.miles_delta || 0), 0);
  const activeTodayHours = (totals.driving + totals.on_duty) / 60;
  const rollingCycle = currentCycleUsed + activeTodayHours;
  const remainingCycle = Math.max(0, 70 - rollingCycle);

  return {
    dateParts: splitDateParts(dailyLog.date),
    fromLocation: truncate(firstEventLocation(events), 56),
    toLocation: truncate(lastEventLocation(events), 56),
    milesDrivingToday: roundOne(drivingMiles),
    milesTotalToday: roundOne(drivingMiles),
    vehicleUnitNumbers: readLogField(plan, ["input_summary", "vehicle_unit_numbers"], "Vehicle unit numbers not provided"),
    headerLines: [
      { x1: 470, x2: 955, y: 120, label: "Name of Carrier or Carriers", value: readLogField(plan, ["input_summary", "carrier_name"], "Carrier name not provided") },
      { x1: 470, x2: 955, y: 156, label: "Main Office Address", value: readLogField(plan, ["input_summary", "main_office_address"], "Main office address not provided") },
      { x1: 470, x2: 955, y: 192, label: "Home Terminal Address", value: truncate(firstEventLocation(events), 58) },
    ],
    rowTotals: [
      { x: TOTALS_LEFT + TOTALS_WIDTH / 2, y: rowCenter("off_duty") + 4, value: minuteTotal(totals.off_duty) },
      { x: TOTALS_LEFT + TOTALS_WIDTH / 2, y: rowCenter("sleeper_berth") + 4, value: minuteTotal(totals.sleeper_berth) },
      { x: TOTALS_LEFT + TOTALS_WIDTH / 2, y: rowCenter("driving") + 4, value: minuteTotal(totals.driving) },
      { x: TOTALS_LEFT + TOTALS_WIDTH / 2, y: rowCenter("on_duty") + 4, value: minuteTotal(totals.on_duty) },
    ],
    segments,
    connectors,
    remarks: buildRemarks(events),
    shippingManifest: readLogField(plan, ["input_summary", "shipping_manifest"], "Manifest / BOL number not provided"),
    shippingCommodity: readLogField(plan, ["input_summary", "shipping_commodity"], "Shipper and commodity not provided"),
    recapColumns: buildRecapColumns(activeTodayHours, currentCycleUsed, rollingCycle, remainingCycle, events),
  };
}

function buildHourTicks() {
  const ticks = [];
  for (let hour = 0; hour <= 24; hour += 1) {
    const x = minuteToX(hour * 60);
    let label = String(hour < 12 ? hour : hour - 12);
    if (hour === 0 || hour === 24) {
      label = "Mid-";
    } else if (hour === 12) {
      label = "Noon";
    }
    ticks.push({ x, label, strokeWidth: hour % 6 === 0 || hour === 12 || hour === 24 ? 1.3 : 0.9 });
  }
  return ticks;
}

function buildQuarterTicks() {
  const ticks = [];
  for (let quarter = 1; quarter < 96; quarter += 1) {
    if (quarter % 4 === 0) {
      continue;
    }
    const x = minuteToX(quarter * 15);
    const tickLength = quarter % 2 === 0 ? 24 : 14;
    ticks.push({ x, y2: GRID_TOP + tickLength });
  }
  return ticks;
}

function buildRowLabels() {
  return Object.entries(STATUS_ROW_INDEX).map(([status, index]) => ({
    line1: STATUS_LABELS[status][0],
    line2: STATUS_LABELS[status][1],
    x: 34,
    y: GRID_TOP + index * ROW_HEIGHT + 20,
  }));
}

function buildRemarks(events) {
  const remarks = events
    .filter((event) => event.remarks !== "Off duty")
    .map((event) => `${formatTime(event.start_at)}  ${truncate(event.location, 24)}  ${truncate(event.remarks, 48)}`);
  const releaseRemark = remarks.find((remark) => remark.includes("Off duty / released from work"));
  if (releaseRemark && remarks.length > 8) {
    return [...remarks.slice(0, 7), releaseRemark];
  }
  return remarks.slice(0, 8);
}

function buildRecapColumns(activeTodayHours, currentCycleUsed, rollingCycle, remainingCycle, events) {
  const restartTaken = events.some((event) => event.remarks.includes("34-hour restart"));
  return [
    {
      x1: 182,
      x2: 348,
      centerX: 265,
      title: "Drivers",
      lines: ["A.", "On duty", "hours", "today,", `Total lines 3 & 4  ${roundOne(activeTodayHours)}`],
    },
    {
      x1: 392,
      x2: 558,
      centerX: 475,
      title: "70 Hour / 8 Day",
      lines: ["A. Total hours on", "duty last 8 days", `incl. today  ${roundOne(rollingCycle)}`, "B. Available tomorrow", roundOne(remainingCycle)],
    },
    {
      x1: 602,
      x2: 768,
      centerX: 685,
      title: "60 Hour / 7 Day",
      lines: ["A. Total hours on", "duty last 7 days", "N/A", "B. Available tomorrow", "N/A"],
    },
    {
      x1: 812,
      x2: 978,
      centerX: 895,
      title: "34 hour restart",
      lines: ["If you took", "34 consecutive", "hours off duty", `today: ${restartTaken ? "Yes" : "No"}`, `Cycle used start  ${roundOne(currentCycleUsed)}`],
    },
  ];
}

function rowCenter(status) {
  return GRID_TOP + STATUS_ROW_INDEX[status] * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function minuteToX(minute) {
  const bounded = Math.max(0, Math.min(MINUTES_PER_DAY, minute));
  return Math.round((GRID_LEFT + (bounded / MINUTES_PER_DAY) * GRID_WIDTH) * 100) / 100;
}

function minutesFromIso(timestamp) {
  return Number(timestamp.slice(11, 13)) * 60 + Number(timestamp.slice(14, 16));
}

function formatTime(timestamp) {
  const hour = Number(timestamp.slice(11, 13));
  const minute = Number(timestamp.slice(14, 16));
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function minuteTotal(minutes) {
  return roundOne(minutes / 60);
}

function roundOne(value) {
  const rounded = Math.round(Number(value) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function firstEventLocation(events) {
  return events[0]?.location || "N/A";
}

function lastEventLocation(events) {
  return events[events.length - 1]?.location || "N/A";
}

function splitDateParts(dateString) {
  const [year, month, day] = dateString.split("-");
  return { year, month, day };
}

function truncate(value, length) {
  if (!value || value.length <= length) {
    return value || "";
  }
  return `${value.slice(0, length - 3)}...`;
}

function readLogField(plan, path, fallback) {
  let current = plan;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return fallback;
    }

    current = current[key];
  }

  const value = String(current || "").trim();
  return value || fallback;
}

function toPdfY(y) {
  return PAGE_HEIGHT - y;
}
