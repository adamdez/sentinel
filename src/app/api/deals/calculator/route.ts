import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * POST /api/deals/calculator
 *
 * Deal calculator — computes offer math for wholesaling.
 * Takes property data and returns offer range, assignment fee projections,
 * and profit analysis.
 *
 * Body: {
 *   arv: number,              // After Repair Value
 *   repairEstimate: number,   // Estimated repair costs
 *   askPrice?: number,        // Seller's asking price (if known)
 *   holdingCostMonths?: number, // Expected holding period (default: 3)
 *   closingCostPct?: number,  // Buyer closing costs % (default: 3)
 *   targetAssignmentFee?: number, // Desired assignment fee (default: auto-calc)
 *   dealId?: string,          // If updating an existing deal
 *   leadId?: string,          // For context
 * }
 *
 * Returns: {
 *   mao: number,              // Maximum Allowable Offer (70% rule)
 *   offerRange: { low, mid, high },
 *   assignmentFeeRange: { low, mid, high },
 *   buyerPrice: number,       // What end buyer pays
 *   profitMargin: number,     // % profit for end buyer
 *   holdingCosts: number,
 *   closingCosts: number,
 *   dealScore: string,        // "strong" | "marginal" | "thin" | "no_deal"
 *   breakdown: object,        // Full calculation breakdown
 * }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    arv,
    repairEstimate,
    askPrice,
    holdingCostMonths = 3,
    closingCostPct = 3,
    targetAssignmentFee,
    dealId,
    leadId,
  } = body as {
    arv: number;
    repairEstimate: number;
    askPrice?: number;
    holdingCostMonths?: number;
    closingCostPct?: number;
    targetAssignmentFee?: number;
    dealId?: string;
    leadId?: string;
  };

  if (!arv || arv <= 0) {
    return NextResponse.json({ error: "arv (After Repair Value) is required and must be positive" }, { status: 400 });
  }
  if (repairEstimate === undefined || repairEstimate < 0) {
    return NextResponse.json({ error: "repairEstimate is required" }, { status: 400 });
  }

  // ── Core Calculations ──────────────────────────────────────────────

  // 70% rule: MAO = ARV * 0.70 - repairs
  const mao = Math.round(arv * 0.70 - repairEstimate);

  // Holding costs (monthly: taxes + insurance + utilities ≈ 1.5% ARV/year)
  const monthlyHoldingCost = Math.round((arv * 0.015) / 12);
  const holdingCosts = monthlyHoldingCost * holdingCostMonths;

  // Closing costs for end buyer
  const closingCosts = Math.round(arv * (closingCostPct / 100));

  // Total buyer all-in costs
  const buyerAllIn = repairEstimate + holdingCosts + closingCosts;

  // What end buyer would pay (ARV - desired profit margin of ~20-25%)
  // Conservative buyer price: ARV * 0.75 - repairs
  const conservativeBuyerPrice = Math.round(arv * 0.75 - repairEstimate);
  // Aggressive buyer price: ARV * 0.80 - repairs
  const aggressiveBuyerPrice = Math.round(arv * 0.80 - repairEstimate);
  // Mid buyer price
  const midBuyerPrice = Math.round((conservativeBuyerPrice + aggressiveBuyerPrice) / 2);

  // Assignment fee range
  const assignmentFeeLow = Math.max(0, Math.round(conservativeBuyerPrice - mao));
  const assignmentFeeHigh = Math.max(0, Math.round(aggressiveBuyerPrice - mao));
  const assignmentFeeMid = Math.round((assignmentFeeLow + assignmentFeeHigh) / 2);

  // Offer range (what to offer the seller)
  const offerLow = Math.round(mao * 0.85); // aggressive offer
  const offerMid = mao;                     // standard MAO
  const offerHigh = Math.round(mao * 1.05); // stretch offer

  // Buyer profit analysis (at mid buyer price, mid offer)
  const buyerProfit = arv - midBuyerPrice - buyerAllIn;
  const buyerProfitMargin = arv > 0 ? Math.round((buyerProfit / arv) * 100) : 0;

  // Deal quality scoring
  let dealScore: string;
  let dealScoreReason: string;

  if (mao <= 0) {
    dealScore = "no_deal";
    dealScoreReason = "MAO is negative — repairs exceed 70% of ARV";
  } else if (assignmentFeeMid >= 15000) {
    dealScore = "strong";
    dealScoreReason = `$${assignmentFeeMid.toLocaleString()} projected assignment fee`;
  } else if (assignmentFeeMid >= 7500) {
    dealScore = "marginal";
    dealScoreReason = `$${assignmentFeeMid.toLocaleString()} projected — tight but workable`;
  } else if (assignmentFeeMid > 0) {
    dealScore = "thin";
    dealScoreReason = `$${assignmentFeeMid.toLocaleString()} projected — very thin margin`;
  } else {
    dealScore = "no_deal";
    dealScoreReason = "No room for assignment fee at this ARV/repair level";
  }

  // Ask price analysis (if provided)
  let askAnalysis = null;
  if (askPrice && askPrice > 0) {
    const askVsMao = askPrice - mao;
    const askVsMaoPct = Math.round((askVsMao / mao) * 100);
    const askVsArv = Math.round((askPrice / arv) * 100);

    askAnalysis = {
      askPrice,
      askVsMao: askVsMao,
      askVsMaoPct,
      askVsArvPct: askVsArv,
      assessment: askVsMao <= 0
        ? "At or below MAO — strong position"
        : askVsMaoPct <= 10
          ? "Slightly above MAO — negotiable"
          : askVsMaoPct <= 25
            ? "Above MAO — needs significant negotiation"
            : "Far above MAO — seller expectations may be unrealistic",
    };
  }

  const result = {
    mao,
    offerRange: { low: offerLow, mid: offerMid, high: offerHigh },
    assignmentFeeRange: { low: assignmentFeeLow, mid: assignmentFeeMid, high: assignmentFeeHigh },
    buyerPrice: { conservative: conservativeBuyerPrice, mid: midBuyerPrice, aggressive: aggressiveBuyerPrice },
    profitMargin: buyerProfitMargin,
    holdingCosts,
    closingCosts,
    totalBuyerCosts: buyerAllIn,
    dealScore,
    dealScoreReason,
    askAnalysis,
    breakdown: {
      arv,
      repairEstimate,
      maoFormula: "ARV × 0.70 − repairs",
      holdingCostMonths,
      monthlyHoldingCost,
      closingCostPct,
    },
  };

  // If dealId provided, save the calculation to the deal
  if (dealId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("deals") as any)
      .update({
        arv,
        repair_estimate: repairEstimate,
        offer_price: offerMid,
        assignment_fee: assignmentFeeMid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dealId)
      .catch(() => {});
  }

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "deal.calculator_run",
    entity_type: dealId ? "deal" : "lead",
    entity_id: dealId ?? leadId ?? null,
    details: { arv, repairEstimate, mao, assignmentFeeMid, dealScore },
  }).catch(() => {});

  return NextResponse.json(result);
}
