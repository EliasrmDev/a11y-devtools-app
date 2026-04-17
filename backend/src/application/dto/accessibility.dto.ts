import { z } from "zod";
import { ACCESSIBILITY } from "../../shared/constants.js";

const violationCheckSchema = z.object({
  id: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  impact: z.enum(["minor", "moderate", "serious", "critical"]).optional(),
});

export const accessibilitySuggestInputSchema = z
  .object({
    connectionId: z.string().uuid(),
    model: z.string().min(1).max(100),
    lang: z.string().min(2).max(10).default("en"),
    ruleId: z.string().min(1).max(100),
    help: z.string().min(1).max(500),
    description: z.string().min(1).max(1_000),
    impact: z.enum(["minor", "moderate", "serious", "critical"]),
    selector: z.string().min(1).max(ACCESSIBILITY.SELECTOR_MAX_LENGTH),
    htmlSnippet: z.string().min(1).max(ACCESSIBILITY.HTML_SNIPPET_MAX_LENGTH),
    failureSummary: z.string().min(1).max(ACCESSIBILITY.FAILURE_SUMMARY_MAX_LENGTH),
    checks: z.array(violationCheckSchema).min(0).max(20),
  })
  .strict();

export type AccessibilitySuggestInput = z.infer<typeof accessibilitySuggestInputSchema>;

export interface AccessibilitySuggestOutput {
  shortExplanation: string;
  userImpact: string;
  recommendedFix: string;
  codeExample: string | null;
  warnings: string[];
  confidence: "high" | "medium" | "low";
  provider: string;
  model: string;
  latencyMs: number;
  promptVersion: string;
}
