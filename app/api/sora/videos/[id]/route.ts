import { NextRequest, NextResponse } from "next/server";
import {
  OPENAI_VIDEOS_URL,
  azureHeaders,
  isMockEnabled,
  normalizeAzureJobStatus,
  openAiHeaders,
  progressForAzureStatus,
  providerConfigError,
  readSoraProvider
} from "@/lib/server/sora-provider";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (id.startsWith("mock_") || isMockEnabled()) {
    return NextResponse.json({
      id,
      status: "completed",
      progress: 1,
      data: []
    });
  }

  const config = readSoraProvider(request);
  const configError = providerConfigError(config);
  if (configError) {
    return NextResponse.json(
      { error: configError, provider: config.provider },
      { status: configError.includes("ENDPOINT") ? 400 : 401 }
    );
  }

  if (config.provider === "azure") {
    const isFoundryVideos = config.azureApiKind === "foundry-videos";
    const response = await fetch(
      isFoundryVideos
        ? `${config.endpoint}/openai/v1/videos/${encodeURIComponent(id)}?api-version=${config.apiVersion}`
        : `${config.endpoint}/openai/v1/video/generations/jobs/${encodeURIComponent(id)}?api-version=${config.apiVersion}`,
      {
        headers: azureHeaders(config, false)
      }
    );
    const data = await response.json().catch(() => ({}));
    const status = normalizeAzureJobStatus((data as { status?: unknown }).status);
    const rawProgress = (data as { progress?: unknown }).progress;
    const progress =
      typeof rawProgress === "number"
        ? Math.max(0, Math.min(1, rawProgress > 1 ? rawProgress / 100 : rawProgress))
        : progressForAzureStatus((data as { status?: unknown }).status);
    const generationId = Array.isArray((data as { generations?: unknown }).generations)
      ? ((data as { generations: Array<{ id?: string }> }).generations[0]?.id ?? null)
      : null;
    const videoUrl =
      status === "completed" && (isFoundryVideos || generationId)
        ? `/api/sora/videos/${encodeURIComponent(id)}/content${
            generationId ? `?generationId=${encodeURIComponent(generationId)}` : ""
          }`
        : null;

    return NextResponse.json(
      {
        ...data,
        provider: "azure",
        status,
        progress,
        ...(videoUrl
          ? {
              url: videoUrl,
              output: [{ url: videoUrl }],
              data: [{ url: videoUrl }]
            }
          : {})
      },
      { status: response.status }
    );
  }

  const response = await fetch(`${OPENAI_VIDEOS_URL}/${encodeURIComponent(id)}`, {
    headers: openAiHeaders(config)
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json({ ...data, provider: "openai" }, { status: response.status });
}
