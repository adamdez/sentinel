/**
 * Server-only utilities for Tina official federal form templates.
 * These functions require filesystem access and must only be called from server code.
 */
import fs from "node:fs";
import path from "node:path";
import { getTinaOfficialFederalFormTemplate } from "@/tina/lib/official-form-templates";
import type { TinaOfficialFederalFormId } from "@/tina/types";

export function readTinaOfficialFederalFormTemplateAsset(
  formId: TinaOfficialFederalFormId,
  taxYear: string
): Uint8Array | null {
  const template = getTinaOfficialFederalFormTemplate(formId, taxYear);
  if (!template) return null;

  const absolutePath = path.join(process.cwd(), template.localAssetPath);
  if (!fs.existsSync(absolutePath)) return null;

  return fs.readFileSync(absolutePath);
}
