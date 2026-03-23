"use client";

import { useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import type {
  BrickedProperty,
  BrickedHistoricListing,
} from "@/providers/bricked/adapter";

type TabKey = "property" | "land" | "mortgage" | "ownership" | "mls";

const TABS: { key: TabKey; label: string }[] = [
  { key: "property", label: "Property" },
  { key: "land", label: "Land" },
  { key: "mortgage", label: "Mortgage" },
  { key: "ownership", label: "Ownership" },
  { key: "mls", label: "MLS" },
];

function ts(v?: number | null): string {
  if (v == null) return "—";
  return new Date(v * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function cur(v?: number | null): string {
  if (v == null) return "—";
  return formatCurrency(v);
}

function pct(v?: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === "—" || value == null) return null;
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-overlay-4 last:border-0">
      <span className="text-sm text-muted-foreground/70 shrink-0">{label}</span>
      <span className="text-sm text-foreground font-mono text-right">{value}</span>
    </div>
  );
}

export function BrickedPropertyTabs({ property }: { property: BrickedProperty }) {
  const [tab, setTab] = useState<TabKey>("property");

  return (
    <div className="rounded-[10px] border border-overlay-6 bg-panel overflow-hidden">
      <div className="flex border-b border-overlay-6 overflow-x-auto scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              tab === t.key
                ? "text-cyan border-b-2 border-cyan bg-cyan/[0.04]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-3 max-h-[320px] overflow-y-auto">
        {tab === "property" && <PropertyTab d={property.details} />}
        {tab === "land" && <LandTab d={property.landLocation} />}
        {tab === "mortgage" && <MortgageTab d={property.mortgageDebt} />}
        {tab === "ownership" && <OwnershipTab d={property.ownership} />}
        {tab === "mls" && <MlsTab d={property.mls} />}
      </div>
    </div>
  );
}

function PropertyTab({ d }: { d?: BrickedProperty["details"] }) {
  if (!d) return <Empty />;
  const lotAcres = d.lotSquareFeet ? (d.lotSquareFeet / 43560).toFixed(2) : null;
  const reno = d.renovationScore;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-0">
      <Row label="Beds" value={d.bedrooms} />
      <Row label="Baths" value={d.bathrooms} />
      <Row label="Sq Ft" value={d.squareFeet?.toLocaleString()} />
      <Row label="Year Built" value={d.yearBuilt} />
      <Row label="Lot Size" value={lotAcres ? `${lotAcres} ac` : "—"} />
      <Row label="Stories" value={d.stories} />
      <Row label="Occupancy" value={d.occupancy} />
      <Row label="Last Sale" value={ts(d.lastSaleDate)} />
      <Row label="Last Sale Price" value={cur(d.lastSaleAmount)} />
      <Row label="Basement" value={d.basementType ?? "—"} />
      <Row label="Pool" value={d.poolAvailable != null ? (d.poolAvailable ? "Yes" : "No") : "—"} />
      <Row label="Garage" value={d.garageType ?? "—"} />
      <Row label="Garage Sq Ft" value={d.garageSquareFeet?.toLocaleString() ?? "—"} />
      <Row label="AC" value={d.airConditioningType ?? "—"} />
      <Row label="Heating" value={d.heatingType ?? "—"} />
      <Row label="Heating Fuel" value={d.heatingFuelType ?? "—"} />
      <Row label="HOA" value={d.hoaPresent != null ? (d.hoaPresent ? `Yes — ${cur(d.hoa1Fee)} ${d.hoa1FeeFrequency ?? ""}` : "No") : "—"} />
      {reno?.hasScore && (
        <Row label="Renovation Score" value={`${reno.score}/100 (${reno.confidence}% conf.)`} />
      )}
      {d.legalDescription && <div className="col-span-2"><Row label="Legal" value={d.legalDescription} /></div>}
    </div>
  );
}

function LandTab({ d }: { d?: BrickedProperty["landLocation"] }) {
  if (!d) return <Empty />;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-0">
      <Row label="APN" value={d.apn} />
      <Row label="Zoning" value={d.zoning} />
      <Row label="Land Use" value={d.landUse} />
      <Row label="Property Class" value={d.propertyClass} />
      <Row label="Lot #" value={d.lotNumber} />
      <Row label="School District" value={d.schoolDistrict} />
      <Row label="Subdivision" value={d.subdivision} />
      <Row label="County" value={d.countyName} />
    </div>
  );
}

function MortgageTab({ d }: { d?: BrickedProperty["mortgageDebt"] }) {
  if (!d) return <Empty />;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-0">
        <Row label="Open Balance" value={cur(d.openMortgageBalance)} />
        <Row label="Est. Equity" value={cur(d.estimatedEquity)} />
        <Row label="Purchase Method" value={d.purchaseMethod} />
        <Row label="LTV" value={pct(d.ltvRatio)} />
      </div>
      {d.mortgages && d.mortgages.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-overlay-6">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-overlay-6 bg-overlay-2 text-muted-foreground text-left">
                <th className="px-2.5 py-2">Amount</th>
                <th className="px-2.5 py-2">Rate</th>
                <th className="px-2.5 py-2">Type</th>
                <th className="px-2.5 py-2">Recorded</th>
                <th className="px-2.5 py-2">Maturity</th>
                <th className="px-2.5 py-2">Lender</th>
              </tr>
            </thead>
            <tbody>
              {d.mortgages.map((m, i) => (
                <tr key={i} className="border-b border-overlay-4">
                  <td className="px-2.5 py-2 font-mono">{cur(m.amount)}</td>
                  <td className="px-2.5 py-2">{m.interestRate != null ? `${m.interestRate}%` : "—"}</td>
                  <td className="px-2.5 py-2">{m.loanType ?? "—"}</td>
                  <td className="px-2.5 py-2">{ts(m.recordingDate)}</td>
                  <td className="px-2.5 py-2">{ts(m.maturityDate)}</td>
                  <td className="px-2.5 py-2">{m.lenderName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OwnershipTab({ d }: { d?: BrickedProperty["ownership"] }) {
  if (!d) return <Empty />;
  const ownerNames = (d.owners ?? [])
    .map((o) => [o.firstName, o.lastName].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-0">
        <Row label="Owner(s)" value={ownerNames || "—"} />
        <Row label="Length" value={d.ownershipLength != null ? `${d.ownershipLength} yr` : "—"} />
        <Row label="Type" value={d.ownerType} />
        <Row label="Occupancy" value={d.ownerOccupancy} />
        <Row label="Tax" value={cur(d.taxAmount)} />
      </div>
      {d.transactions && d.transactions.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-overlay-6">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-overlay-6 bg-overlay-2 text-muted-foreground text-left">
                <th className="px-2.5 py-2">Date</th>
                <th className="px-2.5 py-2">Amount</th>
                <th className="px-2.5 py-2">Method</th>
                <th className="px-2.5 py-2">Seller</th>
                <th className="px-2.5 py-2">Buyer</th>
              </tr>
            </thead>
            <tbody>
              {d.transactions.map((t, i) => (
                <tr key={i} className="border-b border-overlay-4">
                  <td className="px-2.5 py-2">{ts(t.saleDate)}</td>
                  <td className="px-2.5 py-2 font-mono">{cur(t.amount)}</td>
                  <td className="px-2.5 py-2">{t.purchaseMethod ?? "—"}</td>
                  <td className="px-2.5 py-2">{t.sellerNames ?? "—"}</td>
                  <td className="px-2.5 py-2">{t.buyerNames ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MlsTab({ d }: { d?: BrickedProperty["mls"] }) {
  if (!d) return <Empty />;
  const history: BrickedHistoricListing[] = d.historicListings ?? [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-0">
        <Row label="Status" value={d.status} />
        <Row label="Category" value={d.category} />
        <Row label="Listing Date" value={ts(d.listingDate)} />
        <Row label="Listing Price" value={cur(d.amount)} />
        <Row label="Days on Market" value={d.daysOnMarket} />
        <Row label="MLS" value={d.mlsName} />
        <Row label="MLS #" value={d.mlsNumber} />
      </div>
      {d.interiorFeatures && <Row label="Interior" value={d.interiorFeatures} />}
      {d.applianceFeatures && <Row label="Appliances" value={d.applianceFeatures} />}
      {d.agent && (
        <>
          <p className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold pt-2">Agent</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0">
            <Row label="Name" value={d.agent.agentName} />
            <Row label="Phone" value={d.agent.agentPhone} />
            <Row label="Office" value={d.agent.officeName} />
            <Row label="Office Phone" value={d.agent.officePhone} />
          </div>
        </>
      )}
      {history.length > 0 && (
        <>
          <p className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold pt-2">Historic Listings</p>
          <div className="overflow-x-auto rounded-md border border-overlay-6">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-overlay-6 bg-overlay-2 text-muted-foreground text-left">
                  <th className="px-2.5 py-2">Date</th>
                  <th className="px-2.5 py-2">Status</th>
                  <th className="px-2.5 py-2">Amount</th>
                  <th className="px-2.5 py-2">$/SqFt</th>
                  <th className="px-2.5 py-2">DOM</th>
                  <th className="px-2.5 py-2">Agent</th>
                  <th className="px-2.5 py-2">MLS</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-b border-overlay-4">
                    <td className="px-2.5 py-2">{ts(h.listingDate)}</td>
                    <td className="px-2.5 py-2">{h.status ?? "—"}</td>
                    <td className="px-2.5 py-2 font-mono">{cur(h.amount)}</td>
                    <td className="px-2.5 py-2 font-mono">
                      {h.pricePerSquareFoot != null ? `$${h.pricePerSquareFoot.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-2.5 py-2">{h.daysOnMarket ?? "—"}</td>
                    <td className="px-2.5 py-2 max-w-[120px] truncate">{h.agentName ?? "N/A"}</td>
                    <td className="px-2.5 py-2 max-w-[100px] truncate">{h.mlsName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-muted-foreground/40 py-4 text-center">No data available</p>;
}
