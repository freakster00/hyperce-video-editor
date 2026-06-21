import { NextRequest, NextResponse } from "next/server";
import {
  azureHeaders,
  providerConfigError,
  readSoraProvider
} from "@/lib/server/sora-provider";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const generationId = request.nextUrl.searchParams.get("generationId");

  const config = readSoraProvider(request);
  if (config.provider !== "azure") {
    return NextResponse.json(
      { error: "Video content proxy is only used for Azure Sora jobs." },
      { status: 400 }
    );
  }

  const configError = providerConfigError(config);
  if (configError) {
    return NextResponse.json(
      { error: configError, provider: config.provider },
      { status: configError.includes("ENDPOINT") ? 400 : 401 }
    );
  }

  if (config.azureApiKind !== "foundry-videos" && !generationId) {
    return NextResponse.json({ error: "Missing generationId." }, { status: 400 });
  }

  const response = await fetch(
    config.azureApiKind === "foundry-videos"
      ? `${config.endpoint}/openai/v1/videos/${encodeURIComponent(params.id)}/content?api-version=${config.apiVersion}`
      : `${config.endpoint}/openai/v1/video/generations/${encodeURIComponent(generationId ?? "")}/content/video?api-version=${config.apiVersion}`,
    {
      headers: azureHeaders(config, false)
    }
  );

  if (!response.ok || !response.body) {
    const message = await response.text().catch(() => "");
    return NextResponse.json(
      { error: message || "Unable to retrieve generated video." },
      { status: response.status }
    );
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "video/mp4",
      "Cache-Control": "private, max-age=3600"
    }
  });
}
