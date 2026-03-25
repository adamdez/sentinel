import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  researchAgentJob,
  dispoAgentJob,
  followUpAgentJob,
  postCallAnalysisJob,
  outboundBatchJob,
  bulkSkiptraceJob,
} from "../../../inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [researchAgentJob, dispoAgentJob, followUpAgentJob, postCallAnalysisJob, outboundBatchJob, bulkSkiptraceJob],
});
