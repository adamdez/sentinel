from __future__ import annotations

import csv
import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from openpyxl import Workbook
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ROOT = ROOT / "e2e" / "fixtures" / "tina"


@dataclass(frozen=True)
class FixtureManifest:
    id: str
    business_name: str
    owner_name: str
    tax_year: str
    entity_type: str
    formation_state: str
    formation_date: str
    accounting_method: str
    naics_code: str
    has_payroll: bool
    pays_contractors: bool
    has_inventory: bool
    has_fixed_assets: bool
    collects_sales_tax: bool
    has_idaho_activity: bool
    notes: str
    prior_return: str
    books_files: list[str]
    bank_files: list[str]
    extra_files: list[str]
    llc_federal_tax_treatment: str | None = None
    llc_community_property_status: str | None = None
    expected_recommendation_title_after_reading: str | None = None
    expected_absent_next_actions: list[str] = field(default_factory=list)
    expected_visible_next_actions_after_reading: list[str] = field(default_factory=list)
    expected_visible_next_actions_after_review: list[str] = field(default_factory=list)
    expected_page_text_after_review: list[str] = field(default_factory=list)

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "business_name": self.business_name,
            "owner_name": self.owner_name,
            "tax_year": self.tax_year,
            "entity_type": self.entity_type,
            "formation_state": self.formation_state,
            "formation_date": self.formation_date,
            "accounting_method": self.accounting_method,
            "naics_code": self.naics_code,
            "has_payroll": self.has_payroll,
            "pays_contractors": self.pays_contractors,
            "has_inventory": self.has_inventory,
            "has_fixed_assets": self.has_fixed_assets,
            "collects_sales_tax": self.collects_sales_tax,
            "has_idaho_activity": self.has_idaho_activity,
            "notes": self.notes,
            "prior_return": self.prior_return,
            "books_files": self.books_files,
            "bank_files": self.bank_files,
            "extra_files": self.extra_files,
            "llc_federal_tax_treatment": self.llc_federal_tax_treatment,
            "llc_community_property_status": self.llc_community_property_status,
            "expected_recommendation_title_after_reading": self.expected_recommendation_title_after_reading,
            "expected_absent_next_actions": self.expected_absent_next_actions,
            "expected_visible_next_actions_after_reading": self.expected_visible_next_actions_after_reading,
            "expected_visible_next_actions_after_review": self.expected_visible_next_actions_after_review,
            "expected_page_text_after_review": self.expected_page_text_after_review,
            "files": [self.prior_return, *self.books_files, *self.bank_files, *self.extra_files],
        }


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def write_csv(path: Path, headers: list[str], rows: list[list[object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)
        writer.writerows(rows)


def write_xlsx(path: Path, sheet_name: str, headers: list[str], rows: list[list[object]]) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = sheet_name
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    workbook.save(path)


def write_prior_return_pdf(
    path: Path,
    *,
    business_name: str,
    owner_name: str,
    tax_year: str,
    gross_income: str,
    expenses: str,
    net_profit: str,
    notes: list[str],
    return_type_hint: str = "Schedule C / single-member LLC",
    extra_fact_lines: list[str] | None = None,
) -> None:
    pdf = canvas.Canvas(str(path), pagesize=LETTER)
    width, height = LETTER
    top = height - 64

    pdf.setTitle(f"{business_name} prior return")
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(54, top, f"{business_name} - Prior Year Return Snapshot")

    pdf.setFont("Helvetica", 11)
    lines = [
        f"Owner: {owner_name}",
        f"Return type hint: {return_type_hint}",
        f"Tax year: {tax_year}",
        f"Business name: {business_name}",
        "State clue: Washington",
        f"Gross receipts: {gross_income}",
        f"Total expenses: {expenses}",
        f"Net profit: {net_profit}",
        "",
        "Working notes:",
        *(extra_fact_lines or []),
        *notes,
    ]

    cursor = top - 34
    for line in lines:
        pdf.drawString(54, cursor, line)
        cursor -= 18

    pdf.setFont("Helvetica-Oblique", 9)
    pdf.drawString(
        54,
        42,
        "Synthetic fixture for Tina owner-flow testing only. Not a real tax filing.",
    )
    pdf.save()


def write_receipt_png(path: Path, *, title: str, lines: list[str]) -> None:
    image = Image.new("RGB", (900, 1280), color=(247, 241, 230))
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()

    y = 48
    draw.text((42, y), title, fill=(24, 24, 24), font=font)
    y += 42
    for line in lines:
        draw.text((42, y), line, fill=(40, 40, 40), font=font)
        y += 28

    draw.line((42, y + 12, 858, y + 12), fill=(120, 120, 120), width=1)
    draw.text(
        (42, 1210),
        "Synthetic Tina fixture. Not a real receipt.",
        fill=(80, 80, 80),
        font=font,
    )
    image.save(path)


def build_clean_pack() -> None:
    pack_dir = FIXTURE_ROOT / "clean-sole-prop"
    reset_dir(pack_dir)

    manifest = FixtureManifest(
        id="clean-sole-prop",
        business_name="Blue Cedar Home Services LLC",
        owner_name="Maya Jensen",
        tax_year="2025",
        entity_type="single_member_llc",
        formation_state="WA",
        formation_date="2024-01-15",
        accounting_method="cash",
        naics_code="561790 cleaning and home services",
        has_payroll=False,
        pays_contractors=False,
        has_inventory=False,
        has_fixed_assets=False,
        collects_sales_tax=False,
        has_idaho_activity=False,
        notes="Simple Spokane service business for calm Tina owner-flow testing.",
        prior_return="prior-return-2024.pdf",
        books_files=["2025-profit-loss.csv"],
        bank_files=["2025-bank-summary.csv"],
        extra_files=["2025-general-ledger.xlsx", "truck-fuel-receipt.png"],
    )

    write_prior_return_pdf(
        pack_dir / manifest.prior_return,
        business_name=manifest.business_name,
        owner_name=manifest.owner_name,
        tax_year="2024",
        gross_income="$146,200",
        expenses="$52,940",
        net_profit="$93,260",
        notes=[
            "Simple Spokane home-services business with one owner.",
            "No payroll, no contractors, no sales tax, no Idaho activity.",
        ],
    )

    write_csv(
        pack_dir / "2025-profit-loss.csv",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-31", "Service Income", "January house cleaning income", 12450],
            ["2025-02-28", "Service Income", "February house cleaning income", 11820],
            ["2025-03-31", "Service Income", "March house cleaning income", 12980],
            ["2025-04-15", "Supplies", "Cleaners and paper goods", -640],
            ["2025-05-15", "Fuel", "Van fuel", -390],
            ["2025-06-15", "Supplies", "Mops and scrub brushes", -285],
            ["2025-08-31", "Service Income", "August house cleaning income", 13240],
            ["2025-10-31", "Service Income", "October house cleaning income", 12810],
            ["2025-12-31", "Service Income", "December house cleaning income", 13320],
        ],
    )

    write_xlsx(
        pack_dir / "2025-general-ledger.xlsx",
        "General Ledger",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-03", "Checking", "Client deposit", 2200],
            ["2025-01-04", "Supplies", "Janitorial supplies", -120],
            ["2025-03-09", "Fuel", "Fuel stop", -58],
            ["2025-06-12", "Meals", "Crew lunch", -24],
            ["2025-09-19", "Checking", "Client deposit", 2650],
            ["2025-12-20", "Insurance", "General liability", -950],
        ],
    )

    write_csv(
        pack_dir / "2025-bank-summary.csv",
        ["Date", "Description", "Amount"],
        [
            ["2025-01-02", "Customer payment", 2200],
            ["2025-01-04", "Supply shop", -120],
            ["2025-04-14", "Customer payment", 2400],
            ["2025-07-21", "Fuel stop", -71],
            ["2025-11-09", "Customer payment", 2550],
            ["2025-12-11", "Office supply store", -88],
        ],
    )

    write_receipt_png(
        pack_dir / "truck-fuel-receipt.png",
        title="Fuel Stop Receipt",
        lines=[
            "Blue Cedar Home Services LLC",
            "Date: 2025-07-21",
            "Fuel for work van",
            "Total: $71.42",
            "Card ending: 1002",
        ],
    )

    (pack_dir / "manifest.json").write_text(
        json.dumps(manifest.to_json(), indent=2),
        encoding="utf-8",
    )


def build_messy_pack() -> None:
    pack_dir = FIXTURE_ROOT / "messy-books"
    reset_dir(pack_dir)

    manifest = FixtureManifest(
        id="messy-books",
        business_name="Blue Cedar Home Services LLC",
        owner_name="Maya Jensen",
        tax_year="2025",
        entity_type="single_member_llc",
        formation_state="WA",
        formation_date="2024-01-15",
        accounting_method="cash",
        naics_code="561790 cleaning and home services",
        has_payroll=False,
        pays_contractors=False,
        has_inventory=False,
        has_fixed_assets=False,
        collects_sales_tax=False,
        has_idaho_activity=False,
        notes=(
            "Messy Spokane service business with partial books, payroll hints, contractor "
            "payments, sales tax notes, inventory-like purchases, and Idaho job clues."
        ),
        prior_return="prior-return-2024.pdf",
        books_files=["2025-quickbooks-january-june.csv"],
        bank_files=["2025-bank-summary-messy.csv"],
        extra_files=["2025-general-ledger-messy.xlsx", "warehouse-box-receipt.png"],
    )

    write_prior_return_pdf(
        pack_dir / manifest.prior_return,
        business_name=manifest.business_name,
        owner_name=manifest.owner_name,
        tax_year="2024",
        gross_income="$163,480",
        expenses="$88,120",
        net_profit="$75,360",
        notes=[
            "Prior year had a few Idaho cleanup jobs but owner is unsure if that matters now.",
            "Owner remembers some contractors, but books are messy.",
            "Synthetic prior-return summary for Tina testing only.",
        ],
    )

    write_csv(
        pack_dir / "2025-quickbooks-january-june.csv",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-05", "Service Income", "Spokane cleaning income", 11850],
            ["2025-01-17", "Payroll Expense", "Payroll run for two employees", -2650],
            ["2025-02-11", "Sales Tax Payable", "WA sales tax collected on retail add-ons", -440],
            ["2025-02-15", "Contract Labor", "1099 contractor deep clean crew", -1850],
            ["2025-03-08", "Supplies", "Inventory stock for resale air filters", -940],
            ["2025-03-30", "Service Income", "Idaho move-out cleaning income", 6240],
            ["2025-04-14", "COGS", "Inventory stock replacement", -730],
            ["2025-05-03", "Payroll Expense", "Payroll with overtime wages", -2890],
            ["2025-05-22", "Contract Labor", "Freelance carpet specialist", -1225],
            ["2025-06-29", "Service Income", "June Spokane cleaning income", 13220],
        ],
    )

    write_xlsx(
        pack_dir / "2025-general-ledger-messy.xlsx",
        "Books Export",
        ["Date", "Account", "Description", "Amount", "Class"],
        [
            ["2025-03-01", "Checking", "Customer deposit batch", 6420, "Operations"],
            ["2025-03-12", "Meals", "Crew meal after Idaho job", -122, "Operations"],
            ["2025-04-08", "Payroll Expense", "Wages for field employee", -1710, "Payroll"],
            ["2025-05-19", "Sales Tax Payable", "Retail sales tax payable", -185, "State"],
            ["2025-07-06", "Contract Labor", "1099 contractor floor tech", -980, "Vendors"],
            ["2025-07-18", "Supplies", "Inventory stock restock", -615, "Warehouse"],
            ["2025-08-02", "Checking", "Idaho restoration payment", 5080, "Operations"],
        ],
    )

    write_csv(
        pack_dir / "2025-bank-summary-messy.csv",
        ["Date", "Description", "Amount"],
        [
            ["2025-01-03", "Client payment - Spokane home care", 3920],
            ["2025-02-11", "WA sales tax payable draft", -440],
            ["2025-04-10", "Payroll ACH", -2650],
            ["2025-07-07", "1099 contractor transfer", -980],
            ["2025-09-03", "Inventory stock warehouse card", -615],
            ["2025-10-21", "Idaho customer deposit", 2440],
            ["2025-12-16", "Client payment - Spokane", 3010],
        ],
    )

    write_receipt_png(
        pack_dir / "warehouse-box-receipt.png",
        title="Warehouse Box Store",
        lines=[
            "Blue Cedar Home Services LLC",
            "Date: 2025-09-03",
            "Air filters and mop heads",
            "Inventory stock for resale shelf",
            "Total: $614.88",
        ],
    )

    (pack_dir / "manifest.json").write_text(
        json.dumps(manifest.to_json(), indent=2),
        encoding="utf-8",
    )


def build_fringe_pack() -> None:
    pack_dir = FIXTURE_ROOT / "fringe-opportunities"
    reset_dir(pack_dir)

    manifest = FixtureManifest(
        id="fringe-opportunities",
        business_name="Blue Cedar Specialty Services LLC",
        owner_name="Maya Jensen",
        tax_year="2025",
        entity_type="single_member_llc",
        formation_state="WA",
        formation_date="2024-01-15",
        accounting_method="cash",
        naics_code="561790 specialty cleaning and restoration",
        has_payroll=False,
        pays_contractors=False,
        has_inventory=False,
        has_fixed_assets=True,
        collects_sales_tax=False,
        has_idaho_activity=True,
        notes=(
            "Obscure-opportunity Tina pack with big purchases, small-tool write-off clues, "
            "repair-vs-capitalization ambiguity, and noisy multistate hints."
        ),
        prior_return="prior-return-2024.pdf",
        books_files=["2025-fringe-books.csv"],
        bank_files=["2025-fringe-bank-summary.csv"],
        extra_files=["2025-fringe-ledger.xlsx", "equipment-invoice.png"],
    )

    write_prior_return_pdf(
        pack_dir / manifest.prior_return,
        business_name=manifest.business_name,
        owner_name=manifest.owner_name,
        tax_year="2024",
        gross_income="$198,460",
        expenses="$104,210",
        net_profit="$94,250",
        notes=[
            "Prior year included a Section 179 election on cleaning equipment.",
            "Owner remembers a Washington B&O credit discussion but is not sure if it still applies.",
            "Synthetic prior-return summary for Tina fringe-opportunity testing only.",
        ],
    )

    write_csv(
        pack_dir / "2025-fringe-books.csv",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-04", "Service Income", "Spokane restoration income", 16420],
            ["2025-01-10", "Equipment", "Portable extraction machine package", -2480],
            ["2025-01-12", "Repairs & Maintenance", "Vacuum motor rebuild and service", -860],
            ["2025-02-08", "Tools", "Meters, hoses, nozzles, filters", -1425],
            ["2025-03-15", "Service Income", "Commercial mold cleanup", 18950],
            ["2025-04-03", "Insurance", "Owner health insurance reimbursement note", -980],
            ["2025-05-14", "Service Income", "Coeur d'Alene emergency cleanout", 5240],
            ["2025-05-18", "Repairs & Maintenance", "Van shelving retrofit and tie-downs", -1190],
            ["2025-06-11", "Equipment", "Floor scrubber attachment kit", -890],
            ["2025-07-09", "Service Income", "Spokane restoration income", 17330],
        ],
    )

    write_xlsx(
        pack_dir / "2025-fringe-ledger.xlsx",
        "Fringe Books",
        ["Date", "Account", "Description", "Amount", "Class"],
        [
            ["2025-01-10", "Equipment", "Portable extraction machine package", -2480, "Assets?"],
            ["2025-01-12", "Repairs & Maintenance", "Vacuum motor rebuild", -860, "Repairs"],
            ["2025-02-08", "Tools", "Meters and hoses under policy threshold", -1425, "Field gear"],
            ["2025-04-03", "Insurance", "Self-employed health premium", -980, "Owner"],
            ["2025-05-14", "Service Income", "Idaho emergency cleanout deposit", 5240, "Operations"],
            ["2025-05-18", "Repairs & Maintenance", "Van shelving retrofit", -1190, "Vehicle"],
            ["2025-06-11", "Equipment", "Floor scrubber attachment kit", -890, "Supplies?"],
        ],
    )

    write_csv(
        pack_dir / "2025-fringe-bank-summary.csv",
        ["Date", "Description", "Amount"],
        [
            ["2025-01-10", "Warehouse equipment invoice", -2480],
            ["2025-01-12", "Vacuum service center", -860],
            ["2025-02-08", "Tool supply depot", -1425],
            ["2025-04-03", "Health insurance ACH", -980],
            ["2025-05-14", "Idaho cleanup deposit", 5240],
            ["2025-05-18", "Commercial van shelving", -1190],
            ["2025-06-11", "Floor scrubber add-on kit", -890],
            ["2025-07-09", "Spokane restoration deposit", 6110],
        ],
    )

    write_receipt_png(
        pack_dir / "equipment-invoice.png",
        title="Northwest Equipment Outlet",
        lines=[
            "Blue Cedar Specialty Services LLC",
            "Date: 2025-01-10",
            "Portable extraction machine package",
            "Accessory hose kit and pressure gauge bundle",
            "Invoice total: $2,480.00",
            "Service note: field use starts immediately",
        ],
    )

    (pack_dir / "manifest.json").write_text(
        json.dumps(manifest.to_json(), indent=2),
        encoding="utf-8",
    )


def build_llc_s_corp_paper_first_pack() -> None:
    pack_dir = FIXTURE_ROOT / "llc-s-corp-paper-first"
    reset_dir(pack_dir)

    manifest = FixtureManifest(
        id="llc-s-corp-paper-first",
        business_name="Harbor Signal Analytics LLC",
        owner_name="Jordan Lee",
        tax_year="2025",
        entity_type="single_member_llc",
        formation_state="WA",
        formation_date="2022-03-01",
        accounting_method="cash",
        naics_code="541611 business analytics consulting",
        has_payroll=False,
        pays_contractors=False,
        has_inventory=False,
        has_fixed_assets=False,
        collects_sales_tax=False,
        has_idaho_activity=False,
        notes=(
            "Single-member LLC with an S-corp election already shown in the prior return. "
            "The owner leaves the LLC tax-path question at the normal default so Tina has to "
            "learn it from the saved paper instead of asking again."
        ),
        prior_return="prior-return-2024.pdf",
        books_files=["2025-profit-loss.csv"],
        bank_files=["2025-bank-summary.csv"],
        extra_files=["2025-general-ledger.xlsx"],
        expected_recommendation_title_after_reading="1120-S / LLC Taxed as S-Corp",
        expected_absent_next_actions=["How this LLC files with the IRS"],
    )

    write_prior_return_pdf(
        pack_dir / manifest.prior_return,
        business_name=manifest.business_name,
        owner_name=manifest.owner_name,
        tax_year="2024",
        gross_income="$212,840",
        expenses="$118,420",
        net_profit="$94,420",
        return_type_hint="Form 1120-S / LLC taxed as S corporation",
        extra_fact_lines=[
            "LLC election clue: Form 2553 election accepted for S corporation treatment.",
            "LLC tax treatment clue: S corporation return treatment for this one-owner LLC.",
        ],
        notes=[
            "Prior year was filed on the S corporation path after a valid election.",
            "Synthetic prior-return summary for Tina LLC owner-flow testing only.",
        ],
    )

    write_csv(
        pack_dir / "2025-profit-loss.csv",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-01", "Tax Setup Note", "Form 2553 election accepted for S corporation treatment", 0],
            ["2025-01-31", "Service Income", "January consulting income", 18240],
            ["2025-02-28", "Service Income", "February consulting income", 17630],
            ["2025-03-31", "Service Income", "March consulting income", 19410],
            ["2025-04-15", "Software", "Analytics software subscription", -420],
            ["2025-06-15", "Travel", "Client workshop travel", -1160],
            ["2025-08-31", "Service Income", "August consulting income", 20380],
            ["2025-10-31", "Service Income", "October consulting income", 19890],
            ["2025-12-31", "Service Income", "December consulting income", 21410],
        ],
    )

    write_xlsx(
        pack_dir / "2025-general-ledger.xlsx",
        "General Ledger",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-01", "Tax Setup Note", "1120-S path after Form 2553 election", 0],
            ["2025-01-04", "Checking", "Client retainer", 6400],
            ["2025-02-12", "Software", "Forecasting platform", -210],
            ["2025-03-21", "Checking", "Client retainer", 7100],
            ["2025-06-10", "Travel", "Client workshop flight", -680],
            ["2025-09-19", "Checking", "Quarterly strategy project", 8350],
            ["2025-12-20", "Insurance", "Professional liability", -1240],
        ],
    )

    write_csv(
        pack_dir / "2025-bank-summary.csv",
        ["Date", "Description", "Amount"],
        [
            ["2025-01-03", "Client retainer", 6400],
            ["2025-02-12", "Software subscription", -210],
            ["2025-04-14", "Client retainer", 7250],
            ["2025-06-11", "Workshop travel", -680],
            ["2025-11-09", "Client retainer", 8120],
            ["2025-12-11", "Insurance premium", -1240],
        ],
    )

    (pack_dir / "manifest.json").write_text(
        json.dumps(manifest.to_json(), indent=2),
        encoding="utf-8",
    )


def build_llc_partnership_paper_first_pack() -> None:
    pack_dir = FIXTURE_ROOT / "llc-partnership-paper-first"
    reset_dir(pack_dir)

    manifest = FixtureManifest(
        id="llc-partnership-paper-first",
        business_name="North Shore Strategy Partners LLC",
        owner_name="Jordan Lee",
        tax_year="2025",
        entity_type="multi_member_llc",
        formation_state="WA",
        formation_date="2021-05-01",
        accounting_method="cash",
        naics_code="541611 management consulting services",
        has_payroll=False,
        pays_contractors=False,
        has_inventory=False,
        has_fixed_assets=False,
        collects_sales_tax=False,
        has_idaho_activity=False,
        notes=(
            "Two-owner LLC with partnership treatment already shown in the saved papers. "
            "The owner leaves the LLC tax-path answer on unsure so Tina has to learn the "
            "1065 path from the papers instead of asking again."
        ),
        prior_return="prior-return-2024.pdf",
        books_files=["2025-profit-loss.csv"],
        bank_files=["2025-bank-summary.csv"],
        extra_files=["2025-general-ledger.xlsx"],
        llc_federal_tax_treatment="unsure",
        expected_recommendation_title_after_reading="1065 / Multi-Member LLC",
        expected_absent_next_actions=["How this LLC files with the IRS"],
    )

    write_prior_return_pdf(
        pack_dir / manifest.prior_return,
        business_name=manifest.business_name,
        owner_name=manifest.owner_name,
        tax_year="2024",
        gross_income="$286,240",
        expenses="$149,880",
        net_profit="$136,360",
        return_type_hint="Form 1065 / multi-member LLC partnership",
        extra_fact_lines=[
            "LLC tax treatment clue: Partnership return treatment for this two-owner LLC.",
            "Owner split clue: Two members each received a Schedule K-1 from the 1065 return.",
        ],
        notes=[
            "Prior year filed on the partnership path for this two-member LLC.",
            "Synthetic prior-return summary for Tina LLC owner-flow testing only.",
        ],
    )

    write_csv(
        pack_dir / "2025-profit-loss.csv",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-01", "Tax Setup Note", "Form 1065 partnership return for two-member LLC with Schedule K-1s", 0],
            ["2025-01-31", "Service Income", "January advisory income", 24180],
            ["2025-02-28", "Service Income", "February advisory income", 22840],
            ["2025-03-31", "Service Income", "March advisory income", 25210],
            ["2025-04-15", "Software", "Project management software", -560],
            ["2025-06-15", "Travel", "Client planning retreat travel", -1480],
            ["2025-08-31", "Service Income", "August advisory income", 26120],
            ["2025-10-31", "Service Income", "October advisory income", 25740],
            ["2025-12-31", "Service Income", "December advisory income", 27410],
        ],
    )

    write_xlsx(
        pack_dir / "2025-general-ledger.xlsx",
        "General Ledger",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-01", "Tax Setup Note", "1065 partnership path with member K-1 support", 0],
            ["2025-01-04", "Checking", "Client retainer", 8100],
            ["2025-02-12", "Software", "Research platform", -280],
            ["2025-03-21", "Checking", "Client retainer", 9250],
            ["2025-06-10", "Travel", "Partner client travel", -920],
            ["2025-09-19", "Checking", "Quarterly strategy project", 10480],
            ["2025-12-20", "Insurance", "Professional liability", -1520],
        ],
    )

    write_csv(
        pack_dir / "2025-bank-summary.csv",
        ["Date", "Description", "Amount"],
        [
            ["2025-01-03", "Client retainer", 8100],
            ["2025-02-12", "Software subscription", -280],
            ["2025-04-14", "Client retainer", 9310],
            ["2025-06-11", "Partner travel", -920],
            ["2025-11-09", "Client retainer", 10540],
            ["2025-12-11", "Insurance premium", -1520],
        ],
    )

    (pack_dir / "manifest.json").write_text(
        json.dumps(manifest.to_json(), indent=2),
        encoding="utf-8",
    )


def build_llc_community_property_paper_first_pack() -> None:
    pack_dir = FIXTURE_ROOT / "llc-community-property-paper-first"
    reset_dir(pack_dir)

    manifest = FixtureManifest(
        id="llc-community-property-paper-first",
        business_name="Sound Harbor Design LLC",
        owner_name="Jordan Lee",
        tax_year="2025",
        entity_type="multi_member_llc",
        formation_state="WA",
        formation_date="2021-02-10",
        accounting_method="cash",
        naics_code="541410 interior design services",
        has_payroll=False,
        pays_contractors=False,
        has_inventory=False,
        has_fixed_assets=False,
        collects_sales_tax=False,
        has_idaho_activity=False,
        notes=(
            "Husband-and-wife Washington LLC using the community-property owner-return path. "
            "The owner leaves the LLC tax-path answer on unsure so Tina has to learn both the "
            "owner-return treatment and the spouse/community-property exception from the papers."
        ),
        prior_return="prior-return-2024.pdf",
        books_files=["2025-profit-loss.csv"],
        bank_files=["2025-bank-summary.csv"],
        extra_files=["2025-general-ledger.xlsx"],
        llc_federal_tax_treatment="unsure",
        expected_recommendation_title_after_reading="Schedule C / Community-Property Spouse LLC",
        expected_absent_next_actions=[
            "How this LLC files with the IRS",
            "Whether only spouses own this LLC in a community-property state",
        ],
    )

    write_prior_return_pdf(
        pack_dir / manifest.prior_return,
        business_name=manifest.business_name,
        owner_name=manifest.owner_name,
        tax_year="2024",
        gross_income="$198,420",
        expenses="$91,860",
        net_profit="$106,560",
        return_type_hint="Schedule C / married-couple community-property LLC",
        extra_fact_lines=[
            "LLC tax treatment clue: Schedule C owner return for this husband-and-wife LLC.",
            "Community property clue: Husband and wife community property owners in Washington.",
        ],
        notes=[
            "Prior year stayed on the owner-return path under the married-couple community-property rule.",
            "Synthetic prior-return summary for Tina LLC owner-flow testing only.",
        ],
    )

    write_csv(
        pack_dir / "2025-profit-loss.csv",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-01", "Tax Setup Note", "Schedule C owner return for husband and wife community property LLC", 0],
            ["2025-01-31", "Service Income", "January design income", 16820],
            ["2025-02-28", "Service Income", "February design income", 15980],
            ["2025-03-31", "Service Income", "March design income", 17140],
            ["2025-04-15", "Supplies", "Client sample materials", -480],
            ["2025-06-15", "Travel", "Seattle client visit", -620],
            ["2025-08-31", "Service Income", "August design income", 18220],
            ["2025-10-31", "Service Income", "October design income", 17640],
            ["2025-12-31", "Service Income", "December design income", 18810],
        ],
    )

    write_xlsx(
        pack_dir / "2025-general-ledger.xlsx",
        "General Ledger",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-01", "Tax Setup Note", "Community property spouse LLC on Schedule C owner-return path", 0],
            ["2025-01-04", "Checking", "Client retainer", 5200],
            ["2025-02-12", "Supplies", "Sample boards", -180],
            ["2025-03-21", "Checking", "Design retainer", 6480],
            ["2025-06-10", "Travel", "Client ferry trip", -210],
            ["2025-09-19", "Checking", "Kitchen redesign project", 7120],
            ["2025-12-20", "Insurance", "Professional liability", -980],
        ],
    )

    write_csv(
        pack_dir / "2025-bank-summary.csv",
        ["Date", "Description", "Amount"],
        [
            ["2025-01-03", "Client retainer", 5200],
            ["2025-02-12", "Sample material shop", -180],
            ["2025-04-14", "Client retainer", 6380],
            ["2025-06-11", "Client travel", -210],
            ["2025-11-09", "Client retainer", 7040],
            ["2025-12-11", "Insurance premium", -980],
        ],
    )

    (pack_dir / "manifest.json").write_text(
        json.dumps(manifest.to_json(), indent=2),
        encoding="utf-8",
    )


def build_llc_c_corp_paper_first_pack() -> None:
    pack_dir = FIXTURE_ROOT / "llc-c-corp-paper-first"
    reset_dir(pack_dir)

    manifest = FixtureManifest(
        id="llc-c-corp-paper-first",
        business_name="Northlight Systems LLC",
        owner_name="Jordan Lee",
        tax_year="2025",
        entity_type="single_member_llc",
        formation_state="WA",
        formation_date="2020-07-15",
        accounting_method="cash",
        naics_code="541511 custom software consulting",
        has_payroll=False,
        pays_contractors=False,
        has_inventory=False,
        has_fixed_assets=False,
        collects_sales_tax=False,
        has_idaho_activity=False,
        notes=(
            "Single-member LLC with corporation treatment already shown in the saved papers. "
            "The owner leaves the LLC tax-path answer on the normal default so Tina has to learn the "
            "1120 path from the papers instead of asking again."
        ),
        prior_return="prior-return-2024.pdf",
        books_files=["2025-profit-loss.csv"],
        bank_files=["2025-bank-summary.csv"],
        extra_files=["2025-general-ledger.xlsx"],
        expected_recommendation_title_after_reading="1120 / LLC Taxed as Corporation",
        expected_absent_next_actions=["How this LLC files with the IRS"],
    )

    write_prior_return_pdf(
        pack_dir / manifest.prior_return,
        business_name=manifest.business_name,
        owner_name=manifest.owner_name,
        tax_year="2024",
        gross_income="$244,680",
        expenses="$132,540",
        net_profit="$112,140",
        return_type_hint="Form 1120 / LLC taxed as corporation",
        extra_fact_lines=[
            "LLC election clue: Form 8832 corporation election accepted for this LLC.",
            "LLC tax treatment clue: Corporation return treatment for this LLC.",
        ],
        notes=[
            "Prior year filed on the corporation return path after a valid election.",
            "Synthetic prior-return summary for Tina LLC owner-flow testing only.",
        ],
    )

    write_csv(
        pack_dir / "2025-profit-loss.csv",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-01", "Tax Setup Note", "Form 8832 corporation election with Form 1120 return treatment", 0],
            ["2025-01-31", "Service Income", "January software consulting income", 21840],
            ["2025-02-28", "Service Income", "February software consulting income", 20630],
            ["2025-03-31", "Service Income", "March software consulting income", 22410],
            ["2025-04-15", "Software", "Development tools", -520],
            ["2025-06-15", "Travel", "Client implementation travel", -980],
            ["2025-08-31", "Service Income", "August software consulting income", 23680],
            ["2025-10-31", "Service Income", "October software consulting income", 22940],
            ["2025-12-31", "Service Income", "December software consulting income", 24120],
        ],
    )

    write_xlsx(
        pack_dir / "2025-general-ledger.xlsx",
        "General Ledger",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-01", "Tax Setup Note", "1120 path after Form 8832 corporation election", 0],
            ["2025-01-04", "Checking", "Client retainer", 7600],
            ["2025-02-12", "Software", "Developer platform", -310],
            ["2025-03-21", "Checking", "Client retainer", 8840],
            ["2025-06-10", "Travel", "Implementation travel", -540],
            ["2025-09-19", "Checking", "Quarterly project", 9480],
            ["2025-12-20", "Insurance", "Professional liability", -1380],
        ],
    )

    write_csv(
        pack_dir / "2025-bank-summary.csv",
        ["Date", "Description", "Amount"],
        [
            ["2025-01-03", "Client retainer", 7600],
            ["2025-02-12", "Software subscription", -310],
            ["2025-04-14", "Client retainer", 8920],
            ["2025-06-11", "Implementation travel", -540],
            ["2025-11-09", "Client retainer", 9550],
            ["2025-12-11", "Insurance premium", -1380],
        ],
    )

    (pack_dir / "manifest.json").write_text(
        json.dumps(manifest.to_json(), indent=2),
        encoding="utf-8",
    )


def build_llc_s_corp_conflict_pack() -> None:
    pack_dir = FIXTURE_ROOT / "llc-s-corp-conflict"
    reset_dir(pack_dir)

    manifest = FixtureManifest(
        id="llc-s-corp-conflict",
        business_name="Harbor Beam Studio LLC",
        owner_name="Jordan Lee",
        tax_year="2025",
        entity_type="single_member_llc",
        formation_state="WA",
        formation_date="2020-03-12",
        accounting_method="cash",
        naics_code="541430 graphic design services",
        has_payroll=False,
        pays_contractors=False,
        has_inventory=False,
        has_fixed_assets=False,
        collects_sales_tax=False,
        has_idaho_activity=False,
        notes=(
            "Single-member LLC where the owner explicitly leaves the organizer on the owner-return path, "
            "but the saved papers point to an S-corp election. Tina should not silently pick a side. "
            "She should keep the owner flow calm and route the mismatch to review."
        ),
        prior_return="prior-return-2024.pdf",
        books_files=["2025-profit-loss.csv"],
        bank_files=["2025-bank-summary.csv"],
        extra_files=["2025-general-ledger.xlsx"],
        llc_federal_tax_treatment="owner_return",
        expected_recommendation_title_after_reading="Schedule C / Owner Return LLC",
        expected_absent_next_actions=["How this LLC files with the IRS"],
        expected_visible_next_actions_after_reading=["Review this with Tina"],
        expected_visible_next_actions_after_review=["Review this with Tina"],
        expected_page_text_after_review=[
            "Tina found 2 blocking conflicts in your saved papers and setup.",
            "Return type confidence",
            "A saved paper hints the current return type may not be right.",
        ],
    )

    write_prior_return_pdf(
        pack_dir / manifest.prior_return,
        business_name=manifest.business_name,
        owner_name=manifest.owner_name,
        tax_year="2024",
        gross_income="$212,440",
        expenses="$104,980",
        net_profit="$107,460",
        return_type_hint="Form 1120-S / LLC taxed as S-corp",
        notes=[
            "Prior year summary still shows the S-corp filing path.",
            "Synthetic prior-return summary for Tina LLC owner-flow testing only.",
        ],
        extra_fact_lines=[
            "LLC election clue: Form 2553 election accepted for S corporation treatment.",
            "LLC tax treatment clue: S corporation return treatment for this LLC.",
        ],
    )

    write_csv(
        pack_dir / "2025-profit-loss.csv",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-01", "Tax Setup Note", "Form 2553 election remains on file for S corporation treatment", 0],
            ["2025-01-31", "Service Income", "January branding project income", 18420],
            ["2025-02-28", "Service Income", "February design project income", 17610],
            ["2025-03-31", "Service Income", "March design project income", 19140],
            ["2025-04-15", "Software", "Creative suite", -430],
            ["2025-06-15", "Travel", "Client site visit", -620],
            ["2025-08-31", "Service Income", "August design project income", 20580],
            ["2025-10-31", "Service Income", "October design project income", 19810],
            ["2025-12-31", "Service Income", "December design project income", 21470],
        ],
    )

    write_xlsx(
        pack_dir / "2025-general-ledger.xlsx",
        "General Ledger",
        ["Date", "Account", "Description", "Amount"],
        [
            ["2025-01-01", "Tax Setup Note", "1120-S path remains active after Form 2553 election", 0],
            ["2025-01-04", "Checking", "Client retainer", 5900],
            ["2025-02-12", "Software", "Creative platform", -220],
            ["2025-03-21", "Checking", "Client retainer", 6620],
            ["2025-06-10", "Travel", "Brand workshop travel", -340],
            ["2025-09-19", "Checking", "Quarterly design project", 7280],
            ["2025-12-20", "Insurance", "Professional liability", -1120],
        ],
    )

    write_csv(
        pack_dir / "2025-bank-summary.csv",
        ["Date", "Description", "Amount"],
        [
            ["2025-01-03", "Client retainer", 5900],
            ["2025-02-12", "Creative software", -220],
            ["2025-04-14", "Client retainer", 6750],
            ["2025-06-11", "Client workshop travel", -340],
            ["2025-11-09", "Client retainer", 7360],
            ["2025-12-11", "Insurance premium", -1120],
        ],
    )

    (pack_dir / "manifest.json").write_text(
        json.dumps(manifest.to_json(), indent=2),
        encoding="utf-8",
    )


def main() -> None:
    FIXTURE_ROOT.mkdir(parents=True, exist_ok=True)
    build_clean_pack()
    build_messy_pack()
    build_fringe_pack()
    build_llc_s_corp_paper_first_pack()
    build_llc_partnership_paper_first_pack()
    build_llc_community_property_paper_first_pack()
    build_llc_c_corp_paper_first_pack()
    build_llc_s_corp_conflict_pack()
    print(f"Fixture packs written to {FIXTURE_ROOT}")


if __name__ == "__main__":
    main()
