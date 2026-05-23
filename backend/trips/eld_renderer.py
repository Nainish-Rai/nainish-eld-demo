from __future__ import annotations

from datetime import date
from decimal import Decimal
from html import escape
from io import BytesIO

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


SVG_WIDTH = 1100
SVG_HEIGHT = 840
PAGE_LEFT = 34
PAGE_TOP = 26
PAGE_WIDTH = 1032
PAGE_HEIGHT = 780
GRID_LEFT = 114
GRID_TOP = 266
GRID_WIDTH = 820
GRID_HEIGHT = 128
TOTALS_LEFT = GRID_LEFT + GRID_WIDTH
TOTALS_WIDTH = 64
TIME_BAR_TOP = GRID_TOP - 28
TIME_BAR_HEIGHT = 28
ROW_HEIGHT = GRID_HEIGHT / 4
GRID_BOTTOM = GRID_TOP + GRID_HEIGHT
REMARKS_TOP = 442
REMARKS_BOTTOM = 650
FOOTER_TOP = 704
MINUTES_PER_DAY = 24 * 60
MAX_CYCLE_HOURS = Decimal("70.0")
STATUS_ROW_INDEX = {
    "off_duty": 0,
    "sleeper_berth": 1,
    "driving": 2,
    "on_duty": 3,
}
STATUS_LABELS = {
    "off_duty": "1. Off Duty",
    "sleeper_berth": "2. Sleeper Berth",
    "driving": "3. Driving",
    "on_duty": "4. On Duty\n(not driving)",
}


def render_daily_log_svg(daily_log: dict, plan_data: dict) -> str:
    layout = _build_layout(daily_log, plan_data)

    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{SVG_WIDTH}" height="{SVG_HEIGHT}" viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}">',
        _svg_rect(0, 0, SVG_WIDTH, SVG_HEIGHT, fill="#ffffff"),
        _svg_rect(PAGE_LEFT, PAGE_TOP, PAGE_WIDTH, PAGE_HEIGHT, fill="#ffffff", stroke="#111111", stroke_width=1.8),
        _svg_text(54, 48, "Drivers Daily Log", font_size=20, font_weight="700"),
        _svg_text(190, 67, "(24 hours)", font_size=9),
        _svg_text(728, 42, "Original - File at home terminal.", font_size=8),
        _svg_text(728, 58, "Duplicate - Driver retains in his/her possession for 8 days.", font_size=8),
        _svg_text(349, 34, "(month)", font_size=7),
        _svg_text(434, 34, "(day)", font_size=7),
        _svg_text(517, 34, "(year)", font_size=7),
        _svg_line(324, 48, 394, 48),
        _svg_line(410, 48, 474, 48),
        _svg_line(492, 48, 560, 48),
        _svg_text(358, 46, layout["date_parts"]["month"], font_size=10),
        _svg_text(439, 46, layout["date_parts"]["day"], font_size=10),
        _svg_text(518, 46, layout["date_parts"]["year"], font_size=10),
    ]

    svg_parts.extend(_render_header_svg(layout))
    svg_parts.extend(_render_graph_svg(layout))
    svg_parts.extend(_render_remarks_svg(layout))
    svg_parts.extend(_render_footer_svg(layout))
    svg_parts.append("</svg>")
    return "".join(svg_parts)


def build_trip_pdf(plan_data: dict, trip_id: str) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    page_width, page_height = letter

    for daily_log in plan_data["daily_logs"]:
        layout = _build_layout(daily_log, plan_data)
        _draw_pdf_page(pdf, layout, page_width, page_height, trip_id)
        pdf.showPage()

    pdf.save()
    buffer.seek(0)
    return buffer.read()


def _render_header_svg(layout: dict) -> list[str]:
    parts = [
        _svg_text(60, 92, "From:", font_size=13, font_weight="700"),
        _svg_line(112, 88, 470, 88),
        _svg_text(114, 82, layout["from_location"], font_size=11),
        _svg_text(505, 92, "To:", font_size=13, font_weight="700"),
        _svg_line(540, 88, 890, 88),
        _svg_text(542, 82, layout["to_location"], font_size=11),
        _svg_rect(92, 106, 175, 46, stroke="#111111", stroke_width=1.5),
        _svg_rect(272, 106, 175, 46, stroke="#111111", stroke_width=1.5),
        _svg_text(178, 126, layout["miles_driving_today"], font_size=14, text_anchor="middle"),
        _svg_text(358, 126, layout["miles_total_today"], font_size=14, text_anchor="middle"),
        _svg_text(178, 144, "Total Miles Driving Today", font_size=7, text_anchor="middle"),
        _svg_text(358, 144, "Total Mileage Today", font_size=7, text_anchor="middle"),
    ]

    for line in layout["header_lines"]:
        parts.append(_svg_line(line["x1"], line["y"], line["x2"], line["y"]))
        parts.append(_svg_text((line["x1"] + line["x2"]) / 2, line["y"] - 4, line["value"], font_size=10, text_anchor="middle"))
        parts.append(_svg_text((line["x1"] + line["x2"]) / 2, line["y"] + 12, line["label"], font_size=8, text_anchor="middle"))

    parts.extend(
        [
            _svg_rect(92, 170, 355, 42, stroke="#111111", stroke_width=1.4),
            _svg_text(270, 186, layout["vehicle_unit_numbers"], font_size=9, text_anchor="middle"),
            _svg_text(270, 202, "Truck/Tractor and Trailer Numbers or", font_size=6.8, text_anchor="middle"),
            _svg_text(270, 210, "License Plate(s)/State (show each unit)", font_size=6.8, text_anchor="middle"),
        ]
    )
    return parts


def _render_graph_svg(layout: dict) -> list[str]:
    parts = [
        _svg_rect(GRID_LEFT, TIME_BAR_TOP, GRID_WIDTH, TIME_BAR_HEIGHT, fill="#111111", stroke="#111111", stroke_width=1.5),
        _svg_rect(GRID_LEFT, GRID_TOP, GRID_WIDTH, GRID_HEIGHT, fill="#ffffff", stroke="#111111", stroke_width=1.5),
        _svg_rect(TOTALS_LEFT, TIME_BAR_TOP, TOTALS_WIDTH, TIME_BAR_HEIGHT + GRID_HEIGHT, fill="none", stroke="#111111", stroke_width=1.5),
        _svg_text(TOTALS_LEFT + TOTALS_WIDTH / 2, TIME_BAR_TOP + 11, "Total", font_size=8, fill="#ffffff", text_anchor="middle"),
        _svg_text(TOTALS_LEFT + TOTALS_WIDTH / 2, TIME_BAR_TOP + 22, "Hours", font_size=8, fill="#ffffff", text_anchor="middle"),
    ]

    for tick in layout["hour_ticks"]:
        parts.append(_svg_line(tick["x"], GRID_TOP, tick["x"], GRID_BOTTOM, stroke="#111111", stroke_width=tick["stroke_width"]))
        parts.append(
            _svg_text(
                tick["x"] - 2,
                TIME_BAR_TOP + 18,
                tick["label"],
                font_size=8,
                fill="#ffffff",
                text_anchor=tick["anchor"],
            )
        )

    for quarter_tick in layout["quarter_ticks"]:
        parts.append(
            _svg_line(
                quarter_tick["x"],
                GRID_TOP,
                quarter_tick["x"],
                quarter_tick["y2"],
                stroke="#111111",
                stroke_width=0.8,
            )
        )

    for row in range(1, 4):
        y = GRID_TOP + row * ROW_HEIGHT
        parts.append(_svg_line(GRID_LEFT, y, TOTALS_LEFT + TOTALS_WIDTH, y, stroke="#111111", stroke_width=1.2))

    for label in layout["row_labels"]:
        parts.extend(
            [
                _svg_text(label["x"], label["y"], label["line_1"], font_size=10),
                _svg_text(label["x"], label["y"] + 12, label["line_2"], font_size=10),
            ]
        )

    for total in layout["row_totals"]:
        parts.append(_svg_text(total["x"], total["y"], total["value"], font_size=10, text_anchor="middle"))

    for connector in layout["connectors"]:
        parts.append(
            _svg_line(
                connector["x"],
                connector["y1"],
                connector["x"],
                connector["y2"],
                stroke="#111111",
                stroke_width=3.2,
            )
        )

    for segment in layout["segments"]:
        parts.append(
            _svg_line(
                segment["x1"],
                segment["y"],
                segment["x2"],
                segment["y"],
                stroke="#111111",
                stroke_width=3.2,
            )
        )

    return parts


def _render_remarks_svg(layout: dict) -> list[str]:
    parts = [
        _svg_text(62, REMARKS_TOP - 16, "Remarks", font_size=13, font_weight="700"),
        _svg_line(60, REMARKS_TOP - 8, 60, REMARKS_BOTTOM, stroke="#111111", stroke_width=2),
        _svg_line(60, REMARKS_BOTTOM, 764, REMARKS_BOTTOM, stroke="#111111", stroke_width=1.6),
        _svg_text(66, REMARKS_TOP + 32, "Shipping", font_size=11, font_weight="700"),
        _svg_text(66, REMARKS_TOP + 48, "Documents:", font_size=11, font_weight="700"),
        _svg_rect(66, REMARKS_TOP + 58, 182, 102, stroke="#111111", stroke_width=1.2),
        _svg_line(66, REMARKS_TOP + 96, 248, REMARKS_TOP + 96, stroke="#111111", stroke_width=1),
        _svg_text(66, REMARKS_TOP + 80, layout["shipping_manifest"], font_size=8),
        _svg_text(66, REMARKS_TOP + 95, "DVIR or Manifest No.", font_size=8),
        _svg_text(66, REMARKS_TOP + 123, layout["shipping_commodity"], font_size=8),
        _svg_text(66, REMARKS_TOP + 140, "Shipper & Commodity", font_size=8),
        _svg_text(292, REMARKS_BOTTOM - 14, "Enter name of place you reported and where released from work and when and where each change of duty occurred.", font_size=6.8),
        _svg_text(434, REMARKS_BOTTOM - 2, "Use time standard of home terminal.", font_size=6.8),
    ]

    for index, remark in enumerate(layout["remarks"]):
        y = REMARKS_TOP + 24 + index * 26
        parts.append(_svg_text(270, y, remark, font_size=10))

    for y in (REMARKS_TOP + 62, REMARKS_TOP + 112, REMARKS_TOP + 162):
        parts.append(_svg_line(780, y, 948, y, stroke="#111111", stroke_width=1.1))

    return parts


def _render_footer_svg(layout: dict) -> list[str]:
    parts = [
        _svg_text(60, FOOTER_TOP, "Recap:", font_size=10, font_weight="700"),
        _svg_text(60, FOOTER_TOP + 14, "Complete at", font_size=8),
        _svg_text(60, FOOTER_TOP + 26, "end of day.", font_size=8),
    ]

    for column in layout["recap_columns"]:
        parts.append(_svg_line(column["x1"], FOOTER_TOP - 2, column["x2"], FOOTER_TOP - 2, stroke="#111111", stroke_width=1.2))
        parts.append(_svg_text(column["center_x"], FOOTER_TOP + 12, column["title"], font_size=8, text_anchor="middle"))
        for index, line in enumerate(column["lines"]):
            parts.append(_svg_text(column["center_x"], FOOTER_TOP + 28 + index * 12, line, font_size=7.2, text_anchor="middle"))

    parts.append(_svg_rect(52, 806, 996, 6, fill="#111111", stroke="#111111", stroke_width=0))
    return parts


def _draw_pdf_page(pdf: canvas.Canvas, layout: dict, page_width: float, page_height: float, trip_id: str) -> None:
    def sx(value: float) -> float:
        return value * page_width / SVG_WIDTH

    def sy(value: float) -> float:
        return page_height - (value * page_height / SVG_HEIGHT)

    pdf.setTitle(f"trip-{trip_id}-eld-logs")
    pdf.setLineWidth(1)
    pdf.rect(sx(PAGE_LEFT), sy(PAGE_TOP + PAGE_HEIGHT), sx(PAGE_WIDTH), sy(PAGE_TOP) - sy(PAGE_TOP + PAGE_HEIGHT), stroke=1, fill=0)
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(sx(54), sy(48), "Drivers Daily Log")
    pdf.setFont("Helvetica", 6.5)
    pdf.drawString(sx(190), sy(67), "(24 hours)")
    pdf.drawString(sx(728), sy(42), "Original - File at home terminal.")
    pdf.drawString(sx(728), sy(58), "Duplicate - Driver retains in his/her possession for 8 days.")
    pdf.drawString(sx(349), sy(34), "(month)")
    pdf.drawString(sx(434), sy(34), "(day)")
    pdf.drawString(sx(517), sy(34), "(year)")
    pdf.line(sx(324), sy(48), sx(394), sy(48))
    pdf.line(sx(410), sy(48), sx(474), sy(48))
    pdf.line(sx(492), sy(48), sx(560), sy(48))
    pdf.setFont("Helvetica", 8)
    pdf.drawString(sx(358), sy(46), layout["date_parts"]["month"])
    pdf.drawString(sx(439), sy(46), layout["date_parts"]["day"])
    pdf.drawString(sx(518), sy(46), layout["date_parts"]["year"])

    _draw_pdf_header(pdf, layout, sx, sy)
    _draw_pdf_graph(pdf, layout, sx, sy)
    _draw_pdf_remarks(pdf, layout, sx, sy)
    _draw_pdf_footer(pdf, layout, sx, sy)


def _draw_pdf_header(pdf: canvas.Canvas, layout: dict, sx, sy) -> None:
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(sx(60), sy(92), "From:")
    pdf.drawString(sx(505), sy(92), "To:")
    pdf.line(sx(112), sy(88), sx(470), sy(88))
    pdf.line(sx(540), sy(88), sx(890), sy(88))
    pdf.setFont("Helvetica", 8)
    pdf.drawString(sx(114), sy(82), layout["from_location"][:52])
    pdf.drawString(sx(542), sy(82), layout["to_location"][:50])
    pdf.rect(sx(92), sy(152), sx(175), sy(106) - sy(152), stroke=1, fill=0)
    pdf.rect(sx(272), sy(152), sx(175), sy(106) - sy(152), stroke=1, fill=0)
    pdf.drawCentredString(sx(179.5), sy(126), layout["miles_driving_today"])
    pdf.drawCentredString(sx(359.5), sy(126), layout["miles_total_today"])
    pdf.setFont("Helvetica", 5.8)
    pdf.drawCentredString(sx(179.5), sy(144), "Total Miles Driving Today")
    pdf.drawCentredString(sx(359.5), sy(144), "Total Mileage Today")

    for line in layout["header_lines"]:
        pdf.line(sx(line["x1"]), sy(line["y"]), sx(line["x2"]), sy(line["y"]))
        pdf.setFont("Helvetica", 7.5)
        pdf.drawCentredString(sx((line["x1"] + line["x2"]) / 2), sy(line["y"] - 4), line["value"][:42])
        pdf.setFont("Helvetica", 6)
        pdf.drawCentredString(sx((line["x1"] + line["x2"]) / 2), sy(line["y"] + 12), line["label"])

    pdf.rect(sx(92), sy(212), sx(355), sy(170) - sy(212), stroke=1, fill=0)
    pdf.setFont("Helvetica", 6.8)
    pdf.drawCentredString(sx(269.5), sy(186), layout["vehicle_unit_numbers"][:48])
    pdf.setFont("Helvetica", 5)
    pdf.drawCentredString(sx(269.5), sy(202), "Truck/Tractor and Trailer Numbers or")
    pdf.drawCentredString(sx(269.5), sy(210), "License Plate(s)/State (show each unit)")


def _draw_pdf_graph(pdf: canvas.Canvas, layout: dict, sx, sy) -> None:
    pdf.setFillColorRGB(0.07, 0.07, 0.07)
    pdf.rect(sx(GRID_LEFT), sy(TIME_BAR_TOP + TIME_BAR_HEIGHT), sx(GRID_WIDTH), sy(TIME_BAR_TOP) - sy(TIME_BAR_TOP + TIME_BAR_HEIGHT), stroke=1, fill=1)
    pdf.setFillColorRGB(0, 0, 0)
    pdf.rect(sx(TOTALS_LEFT), sy(TIME_BAR_TOP + TIME_BAR_HEIGHT + GRID_HEIGHT), sx(TOTALS_WIDTH), sy(TIME_BAR_TOP) - sy(TIME_BAR_TOP + TIME_BAR_HEIGHT + GRID_HEIGHT), stroke=1, fill=0)
    pdf.rect(sx(GRID_LEFT), sy(GRID_BOTTOM), sx(GRID_WIDTH), sy(GRID_TOP) - sy(GRID_BOTTOM), stroke=1, fill=0)
    pdf.setFillColorRGB(1, 1, 1)
    pdf.setFont("Helvetica", 6.5)
    pdf.drawCentredString(sx(TOTALS_LEFT + TOTALS_WIDTH / 2), sy(TIME_BAR_TOP + 11), "Total")
    pdf.drawCentredString(sx(TOTALS_LEFT + TOTALS_WIDTH / 2), sy(TIME_BAR_TOP + 22), "Hours")
    pdf.setFillColorRGB(0, 0, 0)

    for tick in layout["hour_ticks"]:
        pdf.setLineWidth(0.9 if tick["stroke_width"] > 1 else 0.5)
        pdf.line(sx(tick["x"]), sy(GRID_TOP), sx(tick["x"]), sy(GRID_BOTTOM))
        _draw_pdf_text(pdf, sx(tick["x"] - 2), sy(TIME_BAR_TOP + 18), tick["label"], 6.5, anchor=tick["anchor"], fill=(1, 1, 1))

    pdf.setFillColorRGB(0, 0, 0)
    pdf.setLineWidth(0.45)
    for quarter_tick in layout["quarter_ticks"]:
        pdf.line(sx(quarter_tick["x"]), sy(GRID_TOP), sx(quarter_tick["x"]), sy(quarter_tick["y2"]))

    pdf.setLineWidth(0.8)
    for row in range(1, 4):
        y = GRID_TOP + row * ROW_HEIGHT
        pdf.line(sx(GRID_LEFT), sy(y), sx(TOTALS_LEFT + TOTALS_WIDTH), sy(y))

    pdf.setFont("Helvetica", 7)
    for label in layout["row_labels"]:
        pdf.drawString(sx(label["x"]), sy(label["y"]), label["line_1"])
        pdf.drawString(sx(label["x"]), sy(label["y"] + 12), label["line_2"])

    for total in layout["row_totals"]:
        pdf.drawCentredString(sx(total["x"]), sy(total["y"]), total["value"])

    pdf.setLineWidth(1.8)
    for connector in layout["connectors"]:
        pdf.line(sx(connector["x"]), sy(connector["y1"]), sx(connector["x"]), sy(connector["y2"]))

    for segment in layout["segments"]:
        pdf.line(sx(segment["x1"]), sy(segment["y"]), sx(segment["x2"]), sy(segment["y"]))


def _draw_pdf_remarks(pdf: canvas.Canvas, layout: dict, sx, sy) -> None:
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(sx(62), sy(REMARKS_TOP - 16), "Remarks")
    pdf.line(sx(60), sy(REMARKS_TOP - 8), sx(60), sy(REMARKS_BOTTOM))
    pdf.line(sx(60), sy(REMARKS_BOTTOM), sx(764), sy(REMARKS_BOTTOM))
    pdf.drawString(sx(66), sy(REMARKS_TOP + 32), "Shipping")
    pdf.drawString(sx(66), sy(REMARKS_TOP + 48), "Documents:")
    pdf.rect(sx(66), sy(REMARKS_TOP + 160), sx(182), sy(REMARKS_TOP + 58) - sy(REMARKS_TOP + 160), stroke=1, fill=0)
    pdf.line(sx(66), sy(REMARKS_TOP + 96), sx(248), sy(REMARKS_TOP + 96))
    pdf.setFont("Helvetica", 6)
    pdf.drawString(sx(66), sy(REMARKS_TOP + 80), layout["shipping_manifest"])
    pdf.drawString(sx(66), sy(REMARKS_TOP + 95), "DVIR or Manifest No.")
    pdf.drawString(sx(66), sy(REMARKS_TOP + 123), layout["shipping_commodity"])
    pdf.drawString(sx(66), sy(REMARKS_TOP + 140), "Shipper & Commodity")

    pdf.setFont("Helvetica", 5.4)
    pdf.drawString(
        sx(292),
        sy(REMARKS_BOTTOM - 12),
        "Enter name of place you reported and where released from work and when and where each change of duty occurred.",
    )
    pdf.drawString(sx(434), sy(REMARKS_BOTTOM - 2), "Use time standard of home terminal.")

    pdf.setFont("Helvetica", 7.2)
    for index, remark in enumerate(layout["remarks"]):
        pdf.drawString(sx(270), sy(REMARKS_TOP + 24 + index * 26), remark[:92])

    for y in (REMARKS_TOP + 62, REMARKS_TOP + 112, REMARKS_TOP + 162):
        pdf.line(sx(780), sy(y), sx(948), sy(y))


def _draw_pdf_footer(pdf: canvas.Canvas, layout: dict, sx, sy) -> None:
    pdf.setFont("Helvetica-Bold", 7.5)
    pdf.drawString(sx(60), sy(FOOTER_TOP), "Recap:")
    pdf.setFont("Helvetica", 6)
    pdf.drawString(sx(60), sy(FOOTER_TOP + 14), "Complete at")
    pdf.drawString(sx(60), sy(FOOTER_TOP + 26), "end of day.")

    for column in layout["recap_columns"]:
        pdf.line(sx(column["x1"]), sy(FOOTER_TOP - 2), sx(column["x2"]), sy(FOOTER_TOP - 2))
        pdf.setFont("Helvetica", 6)
        pdf.drawCentredString(sx(column["center_x"]), sy(FOOTER_TOP + 12), column["title"])
        for index, line in enumerate(column["lines"]):
            pdf.drawCentredString(sx(column["center_x"]), sy(FOOTER_TOP + 28 + index * 12), line)

    pdf.setFillColorRGB(0.07, 0.07, 0.07)
    pdf.rect(sx(52), sy(812), sx(996), sy(806) - sy(812), stroke=0, fill=1)
    pdf.setFillColorRGB(0, 0, 0)


def _draw_pdf_text(pdf: canvas.Canvas, x: float, y: float, text: str, font_size: float, anchor: str = "start", fill=(0, 0, 0)) -> None:
    pdf.setFillColorRGB(*fill)
    pdf.setFont("Helvetica", font_size)
    if anchor == "middle":
        pdf.drawCentredString(x, y, text)
    elif anchor == "end":
        pdf.drawRightString(x, y, text)
    else:
        pdf.drawString(x, y, text)
    pdf.setFillColorRGB(0, 0, 0)


def _build_layout(daily_log: dict, plan_data: dict) -> dict:
    events = daily_log["events"]
    log_date = daily_log["date"]
    segments = []
    connectors = []
    previous_segment = None

    for event in events:
        start_minutes = _minutes_from_iso(event["start_at"], log_date)
        end_minutes = _minutes_from_iso(event["end_at"], log_date)
        row_y = _row_center(event["status"])
        segment = {
            "status": event["status"],
            "x1": _minute_to_x(start_minutes),
            "x2": max(_minute_to_x(end_minutes), _minute_to_x(start_minutes) + 2),
            "y": row_y,
        }
        if previous_segment is not None and previous_segment["status"] != event["status"]:
            connectors.append(
                {
                    "x": segment["x1"],
                    "y1": previous_segment["y"],
                    "y2": segment["y"],
                }
            )
        segments.append(segment)
        previous_segment = segment

    current_cycle_used = Decimal(str(plan_data["input_summary"]["current_cycle_used_hours"]))
    totals = daily_log["totals_minutes"]
    driving_miles = sum(_driving_miles_for_day(events), start=0.0)
    active_today_hours = Decimal(totals["driving"] + totals["on_duty"]) / Decimal("60")
    rolling_cycle = current_cycle_used + active_today_hours
    remaining_cycle = max(Decimal("0.0"), MAX_CYCLE_HOURS - rolling_cycle)

    header_lines = [
        {"x1": 470, "x2": 955, "y": 120, "label": "Name of Carrier or Carriers", "value": "Carrier name required"},
        {"x1": 470, "x2": 955, "y": 156, "label": "Main Office Address", "value": "Main office address required"},
        {"x1": 470, "x2": 955, "y": 192, "label": "Home Terminal Address", "value": _truncate(_first_event_location(events), 58)},
    ]

    row_totals = [
        {"x": TOTALS_LEFT + TOTALS_WIDTH / 2, "y": _row_center("off_duty") + 4, "value": _minutes_to_decimal_string(totals["off_duty"])},
        {"x": TOTALS_LEFT + TOTALS_WIDTH / 2, "y": _row_center("sleeper_berth") + 4, "value": _minutes_to_decimal_string(totals["sleeper_berth"])},
        {"x": TOTALS_LEFT + TOTALS_WIDTH / 2, "y": _row_center("driving") + 4, "value": _minutes_to_decimal_string(totals["driving"])},
        {"x": TOTALS_LEFT + TOTALS_WIDTH / 2, "y": _row_center("on_duty") + 4, "value": _minutes_to_decimal_string(totals["on_duty"])},
    ]

    return {
        "date_parts": _split_date_parts(daily_log["date"]),
        "from_location": _truncate(_first_event_location(events), 56),
        "to_location": _truncate(_last_event_location(events), 56),
        "miles_driving_today": f"{round(driving_miles, 1)}",
        "miles_total_today": f"{round(driving_miles, 1)}",
        "vehicle_unit_numbers": "Truck 184 / Trailer 52 / Demo Fleet",
        "header_lines": header_lines,
        "hour_ticks": _build_hour_ticks(),
        "quarter_ticks": _build_quarter_ticks(),
        "row_labels": _build_row_labels(),
        "row_totals": row_totals,
        "segments": segments,
        "connectors": connectors,
        "remarks": _build_remarks(events),
        "shipping_manifest": "Enter manifest / BOL no.",
        "shipping_commodity": "Enter shipper and commodity",
        "recap_columns": _build_recap_columns(active_today_hours, current_cycle_used, rolling_cycle, remaining_cycle, events),
    }


def _build_hour_ticks() -> list[dict]:
    ticks = []
    for hour in range(25):
        x = _minute_to_x(hour * 60)
        if hour in (0, 24):
            label = "Mid-"
            anchor = "start" if hour == 0 else "end"
        elif hour == 12:
            label = "Noon"
            anchor = "middle"
        else:
            label = str(hour if hour < 12 else hour - 12)
            anchor = "middle"
        ticks.append({"x": x, "label": label, "anchor": anchor, "stroke_width": 1.3 if hour % 6 == 0 or hour in (0, 12, 24) else 0.9})
    return ticks


def _build_quarter_ticks() -> list[dict]:
    ticks = []
    for quarter in range(1, 96):
        if quarter % 4 == 0:
            continue
        minute = quarter * 15
        x = _minute_to_x(minute)
        tick_length = 24 if quarter % 2 == 0 else 14
        ticks.append({"x": x, "y2": GRID_TOP + tick_length})
    return ticks


def _build_row_labels() -> list[dict]:
    labels = []
    for status, index in STATUS_ROW_INDEX.items():
        line_1, line_2 = STATUS_LABELS[status].split("\n") if "\n" in STATUS_LABELS[status] else (STATUS_LABELS[status], "")
        labels.append(
            {
                "line_1": line_1,
                "line_2": line_2,
                "x": 34,
                "y": GRID_TOP + index * ROW_HEIGHT + 20,
            }
        )
    return labels


def _build_remarks(events: list[dict]) -> list[str]:
    remarks = []
    release_remark = None
    for event in events:
        if event["remarks"] == "Off duty":
            continue
        time_label = _format_time(event["start_at"])
        location = _truncate(event["location"], 24)
        activity = _truncate(event["remarks"], 48)
        remark = f"{time_label}  {location}  {activity}"
        if event["remarks"] == "Off duty / released from work":
            release_remark = remark
        remarks.append(remark)
    if release_remark and len(remarks) > 8:
        return [*remarks[:7], release_remark]
    return remarks[:8]


def _build_recap_columns(
    active_today_hours: Decimal,
    current_cycle_used: Decimal,
    rolling_cycle: Decimal,
    remaining_cycle: Decimal,
    events: list[dict],
) -> list[dict]:
    restart_taken = any("34-hour restart" in event["remarks"] for event in events)
    columns = [
        {
            "x1": 182,
            "x2": 348,
            "center_x": 265,
            "title": "Drivers",
            "lines": [
                "A.",
                "On duty",
                "hours",
                "today,",
                f"Total lines 3 & 4  {_decimal_hours_string(active_today_hours)}",
            ],
        },
        {
            "x1": 392,
            "x2": 558,
            "center_x": 475,
            "title": "70 Hour / 8 Day",
            "lines": [
                "A. Total hours on",
                "duty last 8 days",
                f"incl. today  {_decimal_hours_string(rolling_cycle)}",
                "B. Available tomorrow",
                f"{_decimal_hours_string(remaining_cycle)}",
            ],
        },
        {
            "x1": 602,
            "x2": 768,
            "center_x": 685,
            "title": "60 Hour / 7 Day",
            "lines": [
                "A. Total hours on",
                "duty last 7 days",
                "N/A",
                "B. Available tomorrow",
                "N/A",
            ],
        },
        {
            "x1": 812,
            "x2": 978,
            "center_x": 895,
            "title": "34 hour restart",
            "lines": [
                "If you took",
                "34 consecutive",
                "hours off duty",
                f"today: {'Yes' if restart_taken else 'No'}",
                f"Cycle used start  {_decimal_hours_string(current_cycle_used)}",
            ],
        },
    ]
    return columns


def _row_center(status: str) -> float:
    row_index = STATUS_ROW_INDEX[status]
    return GRID_TOP + row_index * ROW_HEIGHT + ROW_HEIGHT / 2


def _minute_to_x(minute: int) -> float:
    bounded = max(0, min(MINUTES_PER_DAY, minute))
    return round(GRID_LEFT + (bounded / MINUTES_PER_DAY) * GRID_WIDTH, 2)


def _minutes_from_iso(timestamp: str, log_date: str | None = None) -> int:
    hour = int(timestamp[11:13])
    minute = int(timestamp[14:16])
    total_minutes = hour * 60 + minute
    if not log_date:
        return total_minutes

    base_date = date.fromisoformat(log_date)
    timestamp_date = date.fromisoformat(timestamp[:10])
    return (timestamp_date - base_date).days * MINUTES_PER_DAY + total_minutes


def _format_time(timestamp: str) -> str:
    hour = int(timestamp[11:13])
    minute = int(timestamp[14:16])
    period = "AM" if hour < 12 else "PM"
    display_hour = hour % 12 or 12
    return f"{display_hour}:{minute:02d} {period}"


def _minutes_to_decimal_string(minutes: int) -> str:
    decimal_hours = Decimal(minutes) / Decimal("60")
    return _decimal_hours_string(decimal_hours)


def _decimal_hours_string(value: Decimal) -> str:
    normalized = value.quantize(Decimal("0.1")).normalize()
    return format(normalized, "f")


def _driving_miles_for_day(events: list[dict]) -> list[float]:
    return [float(event.get("miles_delta", 0.0)) for event in events if event["status"] == "driving"]


def _first_event_location(events: list[dict]) -> str:
    return events[0]["location"] if events else "N/A"


def _last_event_location(events: list[dict]) -> str:
    return events[-1]["location"] if events else "N/A"


def _split_date_parts(date_string: str) -> dict:
    year, month, day = date_string.split("-")
    return {"month": month, "day": day, "year": year}


def _truncate(value: str, length: int) -> str:
    if len(value) <= length:
        return value
    return f"{value[: length - 3]}..."


def _svg_text(
    x: float,
    y: float,
    text: str,
    font_size: float,
    font_weight: str = "400",
    fill: str = "#111111",
    text_anchor: str = "start",
) -> str:
    return (
        f'<text x="{x}" y="{y}" font-family="Arial, sans-serif" font-size="{font_size}" '
        f'font-weight="{font_weight}" fill="{fill}" text-anchor="{text_anchor}">{escape(text)}</text>'
    )


def _svg_line(x1: float, y1: float, x2: float, y2: float, stroke: str = "#111111", stroke_width: float = 1) -> str:
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{stroke_width}" stroke-linecap="butt" />'


def _svg_rect(
    x: float,
    y: float,
    width: float,
    height: float,
    fill: str = "none",
    stroke: str = "#111111",
    stroke_width: float = 1,
) -> str:
    return f'<rect x="{x}" y="{y}" width="{width}" height="{height}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}" />'
