// Protected resource metadata for the MCP endpoint. See lib/mcp/discovery.js.
import { metadataOptions, metadataResponse } from "@/lib/mcp/discovery";

export const dynamic = "force-dynamic";

export function GET(request) {
  return metadataResponse(request);
}

export function OPTIONS() {
  return metadataOptions();
}
