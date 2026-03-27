import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    product: "Tina",
    status: "foundation",
    supportedLane: "schedule_c_single_member_llc",
    guide: "docs/tina/TINA_V1_BUILD_GUIDE.md",
  });
}
