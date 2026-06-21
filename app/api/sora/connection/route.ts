import { NextRequest, NextResponse } from "next/server";
import {
  azureHeaders,
  isMockEnabled,
  openAiHeaders,
  providerConfigError,
  readSoraProvider
} from "@/lib/server/sora-provider";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  if (isMockEnabled(body.mockMode === true)) {
    return NextResponse.json({ status: "connected", mock: true });
  }

  const config = readSoraProvider(request);
  const configError = providerConfigError(config);
  if (configError) {
    return NextResponse.json(
      { status: "invalid", error: configError, provider: config.provider },
      { status: configError.includes("ENDPOINT") ? 400 : 401 }
    );
  }

  if (config.provider === "azure") {
    const urls =
      config.azureApiKind === "foundry-videos"
        ? [
            `${config.endpoint}/openai/v1/videos?api-version=${config.apiVersion}&limit=1`,
            `${config.endpoint}/openai/v1/models?api-version=${config.apiVersion}`
          ]
        : [`${config.endpoint}/openai/deployments?api-version=2024-02-01`];

    for (const url of urls) {
      const response = await fetch(url, {
        headers: azureHeaders(config, false)
      });

      if (response.status === 429) {
        return NextResponse.json({ status: "rate_limited", provider: "azure" }, { status: 429 });
      }

      if (response.ok) {
        return NextResponse.json({ status: "connected", provider: "azure" });
      }

      if (![400, 404, 405].includes(response.status)) {
        return NextResponse.json(
          { status: "invalid", provider: "azure" },
          { status: response.status }
        );
      }
    }

    return NextResponse.json({ status: "invalid", provider: "azure" }, { status: 404 });
  }

  const response = await fetch("https://api.openai.com/v1/models", {
    headers: openAiHeaders(config)
  });

  if (response.status === 429) {
    return NextResponse.json({ status: "rate_limited" }, { status: 429 });
  }

  if (!response.ok) {
    return NextResponse.json({ status: "invalid" }, { status: response.status });
  }

  return NextResponse.json({ status: "connected", provider: "openai" });
}
