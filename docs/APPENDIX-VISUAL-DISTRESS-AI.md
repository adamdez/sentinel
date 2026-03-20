# Appendix: Visual Distress AI — Street View Property Condition Engine

> Status: Research complete, design pending. Saved 2026-03-20.

---

## Why This Matters for the Main Goal

The main goal is contracts per founder-hour. Visual distress data hits three leverage points:

1. **Call angle accuracy** — Logan knows whether to lead with "I can see the property needs work, we buy as-is" vs. "looks like a great property, what's your situation?" Wrong angle = lost rapport in the first 30 seconds.
2. **Repair estimate grounding** — Without knowing condition, the repair spread on any offer could be $15K or $60K. Visual evidence ("damaged roof, peeling siding") lets Logan confidently anchor a larger repair deduction.
3. **Lead prioritization** — Data distress (pre-foreclosure + high equity) AND visual distress (neglected exterior) together are a much stronger prospect signal than data alone. Visual neglect often means the owner has checked out.

## What It Must Include to Be Useful

- Specific observable conditions per category (roof, siding, landscaping, windows, driveway, general upkeep) — not a vague 1-10 score
- Feed the scoring engine — visual distress boosts opportunity score
- Feed the call angle — dossier's recommended_call_angle incorporates visual findings
- Feed repair estimate reasoning — visual condition informs repair confidence
- Only run on leads that matter — triggered on promotion, not bulk staging
- Multiple angles — 4 cardinal headings (0, 90, 180, 270) from Street View
- Structured output — per-category condition rating with observed details
- Medium confidence ceiling — Street View images can be 6-18 months old

## The Vision: A Trainable AI Brain

Not a prompt-and-pray approach. A real model that:
- Trains on labeled property images
- Gets better over time as more data is collected
- Could eventually work on any city worldwide
- Outputs structured analysis with reasoning

## Recommended Architecture: LLaVA Fine-Tuned Model

**LLaVA** (Large Language and Vision Assistant) — 24.5k GitHub stars, Apache 2.0, NeurIPS'23 paper.

Combines a Vision Transformer encoder with a LLaMA language model. Fine-tuned with QLoRA on 500-1,000 labeled property photos. Outputs structured JSON with per-category severity scores AND reasoning.

Training data format:
```json
{
  "image": "property_001.jpg",
  "conversations": [
    {"from": "human", "value": "Analyze this property exterior for signs of distress or deferred maintenance."},
    {"from": "gpt", "value": "{\"roof\":{\"condition\":\"damaged\",\"severity\":4,\"details\":\"Missing shingles on south face, visible sagging near chimney\"},\"siding\":{\"condition\":\"fair\",\"severity\":2,\"details\":\"Minor peeling paint on west wall\"},\"yard\":{\"condition\":\"overgrown\",\"severity\":3,\"details\":\"Unmowed lawn, overgrown shrubs blocking front window\"},\"driveway\":{\"condition\":\"good\",\"severity\":1},\"windows\":{\"condition\":\"intact\",\"severity\":1},\"overall_distress\":3,\"confidence\":\"medium\",\"notes\":\"Property shows signs of 6-12 months deferred maintenance. Owner may be absent or overwhelmed.\"}"}
  ]
}
```

### Why LLaVA Over Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **LLaVA (recommended)** | Structured JSON + reasoning, generalizes to any city, Apache 2.0, 24.5k stars | Needs 16GB+ VRAM for QLoRA fine-tuning |
| **ViT + LoRA (HuggingFace)** | Simpler, trains on 8GB VRAM, 140k stars | Classification only, no reasoning, no spatial detail |
| **OpenCLIP zero-shot** | No training needed, instant prototype | Not trainable to improve, low domain accuracy |
| **YOLOv8 (Ultralytics)** | Bounding boxes show WHERE damage is | AGPL license, heavy annotation burden |
| **Roboflow** | Lowest friction prototype | Platform dependency, no self-hosted model |

### Phased Rollout

**Phase 1 — Prove it works (1-2 weeks)**
- Use OpenCLIP zero-shot with text labels against Street View images from existing leads
- Start collecting and labeling property photos (target: 200+)
- Validate that visual signal correlates with actual deal outcomes

**Phase 2 — Build the real model (2-3 weeks)**
- Fine-tune LLaVA-7B with QLoRA on labeled dataset (cloud GPU: RunPod/Lambda ~$1/hr)
- Structured JSON output format integrates directly into Sentinel intelligence pipeline
- Deploy as API endpoint (Sentinel calls model, stores results as artifacts + facts)

**Phase 3 — Compound improvement (ongoing)**
- Every property Logan views becomes potential training data
- Model improves as dataset grows — the flywheel
- Expand to new markets by adding photos from those cities
- Feed into scoring engine, call angle, repair estimates

## Integration with Sentinel Write Path

```
Street View images (4 angles)
  → Visual Distress AI model (LLaVA endpoint)
  → structured JSON response
  → dossier_artifacts (raw AI output, source_type: "visual_distress_ai")
  → fact_assertions (per-category: roof_condition, yard_condition, etc.)
  → scoring engine boost (visual_distress_severity feeds opportunity score)
  → dossier (recommended_call_angle updated with visual context)
  → operator review (medium confidence — Street View images may be stale)
```

## Existing Infrastructure

Already built in Sentinel:
- `GET /api/street-view` — Server-side proxy for Google Street View Static API (4 headings supported)
- `GET /api/property-photos` — Multi-source photo pipeline (Google Places, Zillow, Street View, satellite)
- Photos cached in `properties.owner_flags.photos` (JSONB)
- `GOOGLE_STREET_VIEW_KEY` configured in .env.local
- Full intelligence pipeline (artifacts → facts → dossiers → review queue)
- Scoring engine with signal weights and combination bonuses
- Claude client (`src/lib/claude-client.ts`) for AI API calls

## Key Open-Source Resources

| Resource | Stars | License | Use |
|----------|-------|---------|-----|
| [haotian-liu/LLaVA](https://github.com/haotian-liu/LLaVA) | 24.5k | Apache 2.0 | Primary model for fine-tuning |
| [mlfoundations/open_clip](https://github.com/mlfoundations/open_clip) | 13.4k | MIT | Phase 1 zero-shot prototype |
| [Praveenkottari/BD3-Dataset](https://github.com/Praveenkottari/BD3-Dataset) | — | — | 3,965 annotated building defect images (pre-labeled training data) |
| [huggingface/transformers](https://github.com/huggingface/transformers) | 140k+ | Apache 2.0 | ViT fallback if LLaVA too heavy |
| [ultralytics/ultralytics](https://github.com/ultralytics/ultralytics) | 53k | AGPL-3.0 | Bounding box detection (license concern) |

## Hardware Options

- **Cloud training (recommended):** RunPod or Lambda Labs, ~$1-2/hr for A100/H100. Fine-tune in 4-8 hours = $8-16 per training run.
- **Local GPU:** RTX 4090 (24GB VRAM) handles LLaVA QLoRA fine-tuning. RTX 3060 (12GB) handles ViT/CLIP only.
- **Inference:** Quantized model runs on 8GB VRAM or via cloud API.

## Academic Reference

"Detecting individual abandoned houses from Google Street View: A hierarchical deep learning approach" — achieved F-score of 0.84 across five Rust Belt cities using patch-based CNN classification of facade deterioration and vegetation overgrowth. Closest published research to this exact use case.
