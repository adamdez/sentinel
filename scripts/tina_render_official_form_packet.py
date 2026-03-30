from __future__ import annotations

import json
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


def badge_color(status: str) -> colors.Color:
    if status == "ready" or status == "filled":
        return colors.HexColor("#e0f3df")
    if status == "needs_review" or status == "review":
        return colors.HexColor("#fff0c7")
    return colors.HexColor("#ffe0db")


def text_color(status: str) -> colors.Color:
    if status == "ready" or status == "filled":
        return colors.HexColor("#255a2a")
    if status == "needs_review" or status == "review":
        return colors.HexColor("#7b5800")
    return colors.HexColor("#8a261d")


def draft_banner(form_status: str) -> tuple[str, str, colors.Color, colors.Color] | None:
    if form_status == "ready":
        return None
    if form_status == "blocked":
        return (
            "BLOCKED - DO NOT FILE",
            "Tina made a paperwork preview, but blockers still exist. A human must fix them before this should be treated like filing-ready paperwork.",
            colors.HexColor("#ffe0db"),
            colors.HexColor("#8a261d"),
        )
    return (
        "DRAFT - REVIEW REQUIRED",
        "Tina made a paperwork preview, but a human still needs to review the flagged lines and notes before this should be treated like filing-ready paperwork.",
        colors.HexColor("#fff0c7"),
        colors.HexColor("#7b5800"),
    )


def from_top(page_height: float, top_value: float, height: float = 0) -> float:
    return page_height - top_value - height


def draw_badge(
    pdf: canvas.Canvas, x: float, y: float, label: str, status: str, padding_x: float = 8
) -> None:
    pdf.setFont("Helvetica-Bold", 8)
    width = stringWidth(label, "Helvetica-Bold", 8) + (padding_x * 2)
    height = 16
    pdf.setFillColor(badge_color(status))
    pdf.roundRect(x, y, width, height, 8, stroke=0, fill=1)
    pdf.setFillColor(text_color(status))
    pdf.drawCentredString(x + width / 2, y + 4.5, label.upper())


def draw_wrapped_label(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    top_y: float,
    width: float,
    font_name: str = "Helvetica",
    font_size: int = 9,
    leading: int = 11,
    color: colors.Color = colors.HexColor("#1f1b17"),
) -> None:
    lines = simpleSplit(text, font_name, font_size, width)
    pdf.setFillColor(color)
    pdf.setFont(font_name, font_size)
    current_y = top_y
    for line in lines:
        pdf.drawString(x, current_y, line)
        current_y -= leading


def draw_field(pdf: canvas.Canvas, field: dict, page_height: float) -> None:
    label_top = from_top(page_height, field["labelY"])
    box_y = from_top(page_height, field["boxY"], field["boxHeight"])
    status = field["state"]

    pdf.setFillColor(colors.HexColor("#6b6258"))
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(field["labelX"], label_top + 10, field["lineNumber"].upper())
    draw_wrapped_label(
        pdf,
        field["label"],
        field["labelX"] + 42,
        label_top + 10,
        field["labelWidth"] - 42,
        font_name="Helvetica",
        font_size=9,
        leading=11,
        color=colors.HexColor("#1f1b17"),
    )
    pdf.setFont("Helvetica", 7)
    pdf.setFillColor(colors.HexColor("#6b6258"))
    pdf.drawString(field["labelX"] + 42, label_top - 12, field["reference"])

    pdf.setFillColor(colors.white)
    pdf.setStrokeColor(colors.HexColor("#cfc5b7"))
    pdf.roundRect(field["boxX"], box_y, field["boxWidth"], field["boxHeight"], 4, stroke=1, fill=1)
    pdf.setFillColor(badge_color(status))
    pdf.roundRect(field["boxX"], box_y, field["boxWidth"], field["boxHeight"], 4, stroke=0, fill=1)
    pdf.setStrokeColor(colors.HexColor("#cfc5b7"))
    pdf.roundRect(field["boxX"], box_y, field["boxWidth"], field["boxHeight"], 4, stroke=1, fill=0)

    pdf.setFillColor(text_color(status))
    pdf.setFont("Helvetica-Bold", 10)
    value = field["value"] or ""
    if value:
        text_width = stringWidth(value, "Helvetica-Bold", 10)
        pdf.drawString(field["boxX"] + field["boxWidth"] - text_width - 8, box_y + 5.5, value)
    else:
        pdf.setFont("Helvetica", 9)
        pdf.drawString(field["boxX"] + 8, box_y + 5.5, "Blank for now")

    draw_badge(
        pdf,
        field["boxX"] + field["boxWidth"] + 8,
        box_y + 1,
        field["state"].replace("_", " "),
        status,
        padding_x=6,
    )


def draw_summary_box(pdf: canvas.Canvas, page_width: float, summary: str, next_step: str) -> None:
    x = 42
    y = 54
    width = page_width - 84
    height = 92
    pdf.setFillColor(colors.HexColor("#efe7d4"))
    pdf.roundRect(x, y, width, height, 14, stroke=0, fill=1)
    pdf.setStrokeColor(colors.HexColor("#d8cfbf"))
    pdf.roundRect(x, y, width, height, 14, stroke=1, fill=0)

    pdf.setFillColor(colors.HexColor("#1f1b17"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(x + 14, y + height - 20, "Tina note")
    draw_wrapped_label(
        pdf,
        summary,
        x + 14,
        y + height - 40,
        width - 28,
        font_name="Helvetica",
        font_size=9,
        leading=12,
        color=colors.HexColor("#1f1b17"),
    )
    draw_wrapped_label(
        pdf,
        next_step,
        x + 14,
        y + 20,
        width - 28,
        font_name="Helvetica",
        font_size=8,
        leading=10,
        color=colors.HexColor("#655d52"),
    )


def draw_draft_banner(pdf: canvas.Canvas, page_width: float, page_height: float, form_status: str) -> None:
    banner = draft_banner(form_status)
    if banner is None:
        return

    title, summary, fill_color, ink_color = banner
    x = 42
    width = page_width - 84
    height = 58
    y = page_height - 178

    pdf.setFillColor(fill_color)
    pdf.roundRect(x, y, width, height, 14, stroke=0, fill=1)
    pdf.setStrokeColor(colors.HexColor("#d8cfbf"))
    pdf.roundRect(x, y, width, height, 14, stroke=1, fill=0)

    pdf.setFillColor(ink_color)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(x + 14, y + height - 18, title)
    draw_wrapped_label(
        pdf,
        summary,
        x + 14,
        y + height - 34,
        width - 28,
        font_name="Helvetica",
        font_size=8,
        leading=10,
        color=ink_color,
    )


def draw_support_schedule_page(pdf: canvas.Canvas, payload: dict, form: dict, schedule: dict) -> None:
    page_width, page_height = letter
    pdf.setPageSize(letter)
    pdf.setFillColor(colors.HexColor("#f6f2e8"))
    pdf.rect(0, 0, page_width, page_height, stroke=0, fill=1)

    header_x = 36
    header_y = page_height - 112
    header_width = page_width - 72
    header_height = 76
    pdf.setFillColor(colors.HexColor("#fffdf8"))
    pdf.roundRect(header_x, header_y, header_width, header_height, 18, stroke=0, fill=1)
    pdf.setStrokeColor(colors.HexColor("#d8cfbf"))
    pdf.roundRect(header_x, header_y, header_width, header_height, 18, stroke=1, fill=0)

    pdf.setFillColor(colors.HexColor("#655d52"))
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(header_x + 16, header_y + header_height - 18, "TINA SUPPORT SCHEDULE")

    pdf.setFillColor(colors.HexColor("#1f1b17"))
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(header_x + 16, header_y + header_height - 42, schedule["title"])
    pdf.setFont("Helvetica", 10)
    pdf.setFillColor(colors.HexColor("#655d52"))
    pdf.drawString(
        header_x + 16,
        header_y + 18,
        f"{payload['businessName']} - {form['formNumber']} - Tax year {form['taxYear']}",
    )

    has_banner = draft_banner(form["status"]) is not None
    if has_banner:
        draw_draft_banner(pdf, page_width, page_height, form["status"])

    table_x = 42
    table_width = page_width - 84
    top_y = page_height - (236 if has_banner else 168)
    row_height = 46

    pdf.setFillColor(colors.HexColor("#efe7d4"))
    pdf.rect(table_x, top_y, table_width, 26, stroke=0, fill=1)
    pdf.setStrokeColor(colors.HexColor("#d8cfbf"))
    pdf.rect(table_x, top_y, table_width, 26, stroke=1, fill=0)
    pdf.setFillColor(colors.HexColor("#1f1b17"))
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(table_x + 10, top_y + 9, "Item")
    pdf.drawString(table_x + 260, top_y + 9, "Amount")
    pdf.drawString(table_x + 350, top_y + 9, "Tina note")

    current_top = top_y - row_height
    for row in schedule.get("rows", []):
        pdf.setFillColor(colors.white)
        pdf.rect(table_x, current_top, table_width, row_height, stroke=0, fill=1)
        pdf.setStrokeColor(colors.HexColor("#d8cfbf"))
        pdf.rect(table_x, current_top, table_width, row_height, stroke=1, fill=0)
        draw_wrapped_label(
            pdf,
            row["label"],
            table_x + 10,
            current_top + row_height - 14,
            230,
            font_name="Helvetica-Bold",
            font_size=9,
            leading=11,
        )
        pdf.setFont("Helvetica-Bold", 9)
        pdf.setFillColor(colors.HexColor("#1f1b17"))
        pdf.drawRightString(table_x + 334, current_top + row_height - 14, row["amount"])
        draw_wrapped_label(
            pdf,
            row["summary"],
            table_x + 350,
            current_top + row_height - 14,
            178,
            font_name="Helvetica",
            font_size=8,
            leading=10,
            color=colors.HexColor("#655d52"),
        )
        current_top -= row_height
        if current_top < 170:
            break

    draw_summary_box(pdf, page_width, schedule["summary"], form["nextStep"])
    pdf.showPage()


def draw_template_page(pdf: canvas.Canvas, payload: dict, form: dict) -> None:
    page_width = form.get("pageWidth") or letter[0]
    page_height = form.get("pageHeight") or letter[1]
    pdf.setPageSize((page_width, page_height))

    pdf.setFillColor(colors.HexColor("#f3efe6"))
    pdf.rect(0, 0, page_width, page_height, stroke=0, fill=1)

    header_x = 36
    header_y = page_height - 112
    header_width = page_width - 72
    header_height = 76
    pdf.setFillColor(colors.HexColor("#fffdf8"))
    pdf.roundRect(header_x, header_y, header_width, header_height, 18, stroke=0, fill=1)
    pdf.setStrokeColor(colors.HexColor("#d8cfbf"))
    pdf.roundRect(header_x, header_y, header_width, header_height, 18, stroke=1, fill=0)

    pdf.setFillColor(colors.HexColor("#655d52"))
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(header_x + 16, header_y + header_height - 18, "TINA TEMPLATE-DRIVEN FORM OUTPUT")

    pdf.setFillColor(colors.HexColor("#1f1b17"))
    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawString(header_x + 16, header_y + header_height - 42, form["formNumber"])

    pdf.setFont("Helvetica", 10)
    pdf.setFillColor(colors.HexColor("#655d52"))
    pdf.drawString(
        header_x + 16,
        header_y + 18,
        f"{payload['businessName']} - Tax year {form['taxYear']} - {form['title']}",
    )

    has_banner = draft_banner(form["status"]) is not None
    if has_banner:
        draw_draft_banner(pdf, page_width, page_height, form["status"])

    draw_badge(
        pdf,
        header_x + header_width - 90,
        header_y + header_height - 22,
        form["status"].replace("_", " "),
        form["status"],
    )

    content_top = 208 if has_banner else 140
    income_top = from_top(page_height, content_top)
    expenses_top = from_top(page_height, content_top + 186)
    pdf.setFillColor(colors.HexColor("#7b4f2a"))
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(42, income_top, "Income")
    pdf.drawString(42, expenses_top, "Expenses")

    for field in sorted(form.get("placedFields", []), key=lambda item: item["boxY"]):
        draw_field(pdf, field, page_height)

    if form.get("unmatchedLines"):
        pdf.setFillColor(colors.HexColor("#655d52"))
        pdf.setFont("Helvetica-Bold", 8)
        pdf.drawString(42, 162, "Extra lines Tina is not placing on the form sheet yet:")
        pdf.setFont("Helvetica", 8)
        current_y = 150
        for line in form["unmatchedLines"]:
            pdf.drawString(
                48,
                current_y,
                f"{line['lineNumber']} - {line['label']}: {line['value'] or 'Blank for now'}",
            )
            current_y -= 10
            if current_y < 120:
                break

    draw_summary_box(pdf, page_width, form["summary"], form["nextStep"])
    pdf.showPage()


def build_pdf(payload: dict, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output_path), pagesize=letter)
    pdf.setTitle(f"Tina official form packet - {payload['businessName']}")

    for form in payload["forms"]:
        draw_template_page(pdf, payload, form)
        for schedule in form.get("supportSchedules", []):
            draw_support_schedule_page(pdf, payload, form, schedule)

    pdf.save()


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: tina_render_official_form_packet.py <input-json> <output-pdf>", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    build_pdf(payload, output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
