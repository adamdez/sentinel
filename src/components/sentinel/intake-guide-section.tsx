"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientFile } from "./master-client-file-modal";

// ── Types ───────────────────────────────────────────────────────────────

interface FieldStatus {
  label: string;
  filled: boolean;
}

interface GuideStep {
  id: string;
  title: string;
  subtitle: string;
  talkingPoints: string[];
  fields: FieldStatus[];
}

// ── Component ───────────────────────────────────────────────────────────

export function IntakeGuideSection({ cf }: { cf: ClientFile }) {
  const [expanded, setExpanded] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // Only show for early-stage leads with 0-1 calls
  const shouldShow =
    (cf.status === "prospect" || cf.status === "lead") && cf.totalCalls <= 1;

  if (!shouldShow) return null;

  const steps: GuideStep[] = [
    {
      id: "opener",
      title: "1. Opener",
      subtitle: "First 15 seconds — warm, local, human",
      talkingPoints: [
        `"Hi, this is Logan with Dominion Home Deals here in Spokane. Am I speaking with ${cf.ownerName || "the homeowner"}?"`,
        cf.source === "google_ads" || cf.source === "facebook"
          ? `"I saw you reached out about ${cf.address || "your property"} — I wanted to follow up and see how I can help."`
          : `"I'm calling about ${cf.address || "a property"} — do you have a couple minutes?"`,
        "Match their energy. If they sound guarded, slow down. If they sound ready to talk, let them lead.",
      ],
      fields: [],
    },
    {
      id: "core",
      title: "2. Core Questions",
      subtitle: "Fill the CRM fields — ask naturally, not like a form",
      talkingPoints: [
        `"Can you tell me a little about ${cf.address ? "the property at " + cf.address : "the property"}? How long have you owned it?"`,
        "\"What's the current condition — is it livable as-is, or does it need some work?\"",
        "\"Is anyone living there now, or is it vacant?\"",
        "\"What's got you thinking about selling? What would it mean for you to get this handled?\"",
        "\"If we could work something out, what kind of timeline are you looking at?\"",
        "\"Is there anyone else who'd need to be involved in a decision?\"",
        "\"Have you had any other offers or had the property appraised recently?\"",
        "\"Do you know roughly what you owe on the property — mortgage, taxes, liens?\"",
      ],
      fields: [
        { label: "Motivation", filled: cf.motivationLevel != null },
        { label: "Condition", filled: cf.conditionLevel != null },
        { label: "Timeline", filled: cf.sellerTimeline != null },
        { label: "Decision Maker", filled: cf.decisionMakerConfirmed },
        { label: "Asking Price", filled: cf.priceExpectation != null },
        { label: "Occupancy", filled: cf.occupancyScore != null },
        { label: "Phone", filled: !!cf.ownerPhone },
        { label: "Email", filled: !!cf.ownerEmail },
      ],
    },
    {
      id: "transition",
      title: "3. Transition",
      subtitle: "Bridge from questions to next step",
      talkingPoints: [
        "\"Based on what you've told me, this sounds like something we could potentially help with.\"",
        "\"Here's what I'd like to do next — I'll pull some numbers on the property, look at what comparable homes are selling for, and put together a fair offer for you.\"",
        cf.estimatedValue
          ? "\"I can see the estimated value is in a range — I'll want to verify that with recent sales in the area.\""
          : "\"I'll need to research comparable sales to get an accurate picture of value.\"",
        "\"We buy as-is, handle all closing costs, and can close on your timeline.\"",
      ],
      fields: [],
    },
    {
      id: "close",
      title: "4. Close for Next Step",
      subtitle: "Never end without a scheduled next action",
      talkingPoints: [
        "\"Can I call you back [tomorrow / in a couple days] with those numbers? What time works best?\"",
        "\"I'll follow up by [day] with a written offer — is email or text better for you?\"",
        "Set the follow-up date in the CRM before hanging up.",
        "If they're ready now: move to qualification and verbal offer framing.",
      ],
      fields: [
        { label: "Follow-up Date", filled: !!cf.nextCallScheduledAt || !!cf.followUpDate },
      ],
    },
  ];

  const totalFields = steps.flatMap((s) => s.fields);
  const filledCount = totalFields.filter((f) => f.filled).length;
  const totalCount = totalFields.length;

  return (
    <div className="rounded-[12px] border border-border/15 bg-muted/[0.03]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-foreground/90">
              First-Call Intake Guide
            </p>
            <span className="text-sm text-muted-foreground/70">
              {filledCount}/{totalCount} fields captured
            </span>
          </div>
          {!expanded && (
            <p className="text-sm text-muted-foreground/60 mt-0.5">
              Structured intake for first seller conversation
            </p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Step tabs */}
          <div className="flex gap-1">
            {steps.map((step, i) => (
              <button
                key={step.id}
                onClick={() => setActiveStep(i)}
                className={cn(
                  "flex-1 h-7 rounded-[6px] text-sm font-medium transition-colors",
                  activeStep === i
                    ? "bg-muted/[0.12] border border-border/25 text-foreground"
                    : "bg-white/[0.03] border border-white/[0.06] text-muted-foreground hover:border-white/[0.12]"
                )}
              >
                {step.title}
              </button>
            ))}
          </div>

          {/* Active step content */}
          {(() => {
            const step = steps[activeStep];
            return (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground/70 italic">
                  {step.subtitle}
                </p>

                {/* Talking points */}
                <div className="space-y-1.5">
                  {step.talkingPoints.map((point, i) => (
                    <div
                      key={i}
                      className="flex gap-2 text-sm text-foreground/85 leading-relaxed"
                    >
                      <span className="text-foreground/50 shrink-0 mt-0.5">•</span>
                      <span>{point}</span>
                    </div>
                  ))}
                </div>

                {/* Field status indicators */}
                {step.fields.length > 0 && (
                  <div className="pt-1 border-t border-white/[0.06]">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/50 font-semibold mb-1.5">
                      Fields to capture
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {step.fields.map((field) => (
                        <span
                          key={field.label}
                          className={cn(
                            "inline-flex items-center gap-1 text-sm",
                            field.filled
                              ? "text-foreground/80"
                              : "text-foreground/70"
                          )}
                        >
                          {field.filled ? (
                            <CheckCircle2 className="h-2.5 w-2.5" />
                          ) : (
                            <Circle className="h-2.5 w-2.5" />
                          )}
                          {field.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
