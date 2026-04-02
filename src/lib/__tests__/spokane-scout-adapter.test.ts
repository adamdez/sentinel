import { describe, expect, it } from "vitest";
import { parseSpokaneScoutSummary, sanitizeScoutHtmlForStorage } from "@/providers/spokane-scout/adapter";

const SAMPLE_HTML = `
  <html>
    <body>
      <div>Parcel Number: 55073.1444</div>
      <div>Site Address: 17221 E MISSION AVE <a>SCOUT Map</a></div>
      <div>Owner Name: SNYDER, RICHARD D & DARLENE M Address: 17221 E MISSION AVE, GREENACRES, WA, 99016</div>
      <div>Taxpayer Name: SNYDER, RICHARD D & DARLENE M Address: 17221 E MISSION AVE, GREENACRES, WA, 99016</div>
      <div>Photos</div>
      <img src="data:image/png;base64,AAAAAAABBBBBBCCCCCCDDDDDD" />
      <img src="data:image/png;base64,EEEEEEFFFFFFGGGGGGHHHHHH" />
      <div>Assessed Value</div>
      <table>
        <tr><td>2026</td><td>339,130</td><td>339,130</td><td>117,330</td><td>221,800</td><td>0</td><td>0</td></tr>
      </table>
      <div>Property Taxes</div>
      <div>Total Charges Owing: $3,863.74</div>
      <table>
        <tr><td></td><td>Total Taxes for 2026</td><td>3,863.74</td><td>3,863.74</td></tr>
      </table>
      <div>Characteristics</div>
      <table>
        <tr><td>Dwelling</td><td>1924</td><td>1,616</td><td>NA</td><td>SF</td><td>14 Vintage 1.5 story</td><td>Comp sh medium</td><td>Forced hot air</td><td>None</td><td>3</td><td>0</td><td>1</td></tr>
      </table>
      <div>Sales</div>
      <table>
        <tr><td>09/04/2001</td><td>116,000.00</td><td>Statutory Warranty Deed</td><td>200113799</td><td>55073.1444</td></tr>
      </table>
      <div>Permits</div>
    </body>
  </html>
`;

describe("parseSpokaneScoutSummary", () => {
  it("extracts taxes, characteristics, sales, and photos", () => {
    const parsed = parseSpokaneScoutSummary("55073.1444", SAMPLE_HTML);

    expect(parsed).not.toBeNull();
    expect(parsed?.ownerName).toBe("SNYDER, RICHARD D & DARLENE M");
    expect(parsed?.siteAddress).toBe("17221 E MISSION AVE");
    expect(parsed?.assessedTaxYear).toBe(2026);
    expect(parsed?.assessedValue).toBe(339130);
    expect(parsed?.landValue).toBe(117330);
    expect(parsed?.improvementValue).toBe(221800);
    expect(parsed?.totalChargesOwing).toBe(3863.74);
    expect(parsed?.currentTaxYear).toBe(2026);
    expect(parsed?.currentAnnualTaxes).toBe(3863.74);
    expect(parsed?.currentRemainingChargesOwing).toBe(3863.74);
    expect(parsed?.yearBuilt).toBe(1924);
    expect(parsed?.grossLivingAreaSqft).toBe(1616);
    expect(parsed?.bedrooms).toBe(3);
    expect(parsed?.halfBaths).toBe(0);
    expect(parsed?.fullBaths).toBe(1);
    expect(parsed?.lastSaleDate).toBe("2001-09-04");
    expect(parsed?.lastSalePrice).toBe(116000);
    expect(parsed?.photoCount).toBe(2);
  });
});

describe("sanitizeScoutHtmlForStorage", () => {
  it("removes embedded base64 payloads from raw excerpts", () => {
    const sanitized = sanitizeScoutHtmlForStorage(SAMPLE_HTML);
    expect(sanitized).not.toContain("data:image/png;base64");
    expect(sanitized).toContain("[embedded-image]");
  });
});
