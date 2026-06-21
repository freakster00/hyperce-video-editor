import { NextRequest } from "next/server";
import type { AspectRatio, GenerationSettings, Resolution } from "@/lib/types";

export type SoraProvider = "openai" | "azure";
export type AzureSoraApiKind = "foundry-videos" | "azure-openai-v1";

export interface SoraProviderConfig {
  provider: SoraProvider;
  apiKey: string;
  endpoint: string;
  deploymentName: string;
  apiVersion: string;
  azureApiKind?: AzureSoraApiKind;
}

export const OPENAI_VIDEOS_URL = "https://api.openai.com/v1/videos";

export function isMockEnabled(requestedMock?: boolean) {
  return requestedMock === true || process.env.SORA_MOCK_MODE?.toLowerCase() === "true";
}

function withoutTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function inferAzureOpenAiEndpoint(rawEndpoint?: string | null) {
  const value = rawEndpoint?.trim();
  if (!value) return "";

  try {
    const url = new URL(value);

    if (url.hostname.endsWith(".services.ai.azure.com")) {
      url.hostname = url.hostname.replace(".services.ai.azure.com", ".openai.azure.com");
      url.pathname = "";
      url.search = "";
      url.hash = "";
      return withoutTrailingSlash(url.toString());
    }

    if (url.hostname.endsWith(".openai.azure.com")) {
      url.pathname = "";
      url.search = "";
      url.hash = "";
      return withoutTrailingSlash(url.toString());
    }

    const openAiPathIndex = url.pathname.indexOf("/openai/");
    if (openAiPathIndex >= 0) {
      url.pathname = url.pathname.slice(0, openAiPathIndex);
      url.search = "";
      url.hash = "";
      return withoutTrailingSlash(url.toString());
    }

    return withoutTrailingSlash(url.toString());
  } catch {
    return withoutTrailingSlash(value.replace(/\/api\/projects\/[^/]+\/?$/i, ""));
  }
}

export function inferAzureFoundryEndpoint(rawEndpoint?: string | null) {
  const value = rawEndpoint?.trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    const openAiPathIndex = url.pathname.indexOf("/openai/");
    if (openAiPathIndex >= 0) {
      url.pathname = url.pathname.slice(0, openAiPathIndex);
    }
    url.pathname = url.pathname
      .replace(/\/videos(?:\/.*)?$/i, "")
      .replace(/\/api\/projects\/[^/]+\/?$/i, "");
    url.search = "";
    url.hash = "";
    return withoutTrailingSlash(url.toString());
  } catch {
    return withoutTrailingSlash(
      value
        .replace(/\/videos(?:\/.*)?$/i, "")
        .replace(/\/api\/projects\/[^/]+\/?$/i, "")
    );
  }
}

function normalizeAzureApiKind(value?: string | null): AzureSoraApiKind | null {
  const requested = value?.trim().toLowerCase();
  if (!requested) return null;
  if (["azure-openai", "azure-openai-v1", "openai-v1"].includes(requested)) {
    return "azure-openai-v1";
  }
  if (
    ["foundry", "foundry-videos", "foundry-openai-videos", "openai-videos", "videos"].includes(
      requested
    )
  ) {
    return "foundry-videos";
  }
  return null;
}

function readAzureEndpoint() {
  const foundryEndpoint =
    process.env.AZURE_AI_FOUNDRY_ENDPOINT ||
    process.env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT ||
    process.env.AZURE_AI_PROJECT_ENDPOINT ||
    process.env.FOUNDRY_PROJECT_ENDPOINT;
  const rawEndpoint = foundryEndpoint || process.env.AZURE_OPENAI_ENDPOINT || "";
  const isFoundryResource = /\.services\.ai\.azure\.com/i.test(rawEndpoint);
  const requestedKind = normalizeAzureApiKind(process.env.SORA_AZURE_API_KIND);
  const azureApiKind =
    requestedKind || (foundryEndpoint || isFoundryResource ? "foundry-videos" : "azure-openai-v1");

  return {
    endpoint:
      azureApiKind === "azure-openai-v1"
        ? inferAzureOpenAiEndpoint(rawEndpoint)
        : inferAzureFoundryEndpoint(rawEndpoint),
    azureApiKind
  };
}

function readOpenAiApiKey(request: NextRequest) {
  return request.headers.get("x-openai-api-key") || process.env.OPENAI_API_KEY || "";
}

function readAzureApiKey(request: NextRequest) {
  return (
    request.headers.get("x-azure-api-key") ||
    request.headers.get("x-azure-openai-api-key") ||
    request.headers.get("x-openai-api-key") ||
    process.env.AZURE_API_KEY ||
    process.env.AZURE_AI_FOUNDRY_API_KEY ||
    process.env.AZURE_OPENAI_API_KEY ||
    ""
  );
}

export function readSoraProvider(request: NextRequest): SoraProviderConfig {
  const azureEndpoint = readAzureEndpoint();
  const requestedProvider = process.env.SORA_API_PROVIDER?.toLowerCase();
  const useAzure = requestedProvider === "azure" || Boolean(azureEndpoint.endpoint);

  if (useAzure) {
    return {
      provider: "azure",
      apiKey: readAzureApiKey(request),
      endpoint: azureEndpoint.endpoint,
      deploymentName:
        azureEndpoint.azureApiKind === "foundry-videos"
          ? process.env.AZURE_AI_FOUNDRY_MODEL || process.env.SORA_MODEL || "sora-2"
          : process.env.AZURE_OPENAI_DEPLOYMENT_NAME ||
            process.env.SORA_AZURE_DEPLOYMENT_NAME ||
            process.env.SORA_DEPLOYMENT_NAME ||
            "sora",
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "preview",
      azureApiKind: azureEndpoint.azureApiKind
    };
  }

  return {
    provider: "openai",
    apiKey: readOpenAiApiKey(request),
    endpoint: "https://api.openai.com",
    deploymentName: "",
    apiVersion: ""
  };
}

export function providerConfigError(config: SoraProviderConfig) {
  if (!config.apiKey) {
    return config.provider === "azure"
      ? "Missing AZURE_API_KEY, AZURE_AI_FOUNDRY_API_KEY, AZURE_OPENAI_API_KEY, or x-azure-api-key header."
      : "Missing OPENAI_API_KEY or x-openai-api-key header.";
  }

  if (config.provider === "azure" && !config.endpoint) {
    return "Missing AZURE_AI_FOUNDRY_ENDPOINT, AZURE_AI_FOUNDRY_PROJECT_ENDPOINT, or AZURE_OPENAI_ENDPOINT.";
  }

  if (config.provider === "azure" && !config.deploymentName) {
    return "Missing AZURE_OPENAI_DEPLOYMENT_NAME.";
  }

  return "";
}

export function azureHeaders(config: SoraProviderConfig, includeJson = true) {
  return {
    "api-key": config.apiKey,
    ...(includeJson ? { "Content-Type": "application/json" } : {})
  };
}

export function openAiHeaders(config: SoraProviderConfig) {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json"
  };
}

export function sizeFor(resolution: Resolution, aspectRatio: AspectRatio) {
  const map: Record<Resolution, Record<AspectRatio, string>> = {
    "480p": {
      "16:9": "1280x720",
      "9:16": "720x1280",
      "1:1": "480x480",
      "4:3": "720x720"
    },
    "720p": {
      "16:9": "1280x720",
      "9:16": "720x1280",
      "1:1": "720x720",
      "4:3": "720x720"
    },
    "1080p": {
      "16:9": "1920x1080",
      "9:16": "720x1280",
      "1:1": "1080x1080",
      "4:3": "1080x1080"
    }
  };

  return map[resolution][aspectRatio];
}

export function dimensionsFor(resolution: Resolution, aspectRatio: AspectRatio) {
  const [width, height] = sizeFor(resolution, aspectRatio).split("x").map(Number);
  return { width, height };
}

export function secondsForOpenAi(duration: number) {
  const allowed = [4, 8, 12, 16, 20];
  return String(
    allowed.reduce((best, value) =>
      Math.abs(value - duration) < Math.abs(best - duration) ? value : best
    )
  );
}

export function secondsForAzure(duration: number) {
  const allowed = [4, 8, 12];
  return Number(
    allowed.reduce((best, value) =>
      Math.abs(value - duration) < Math.abs(best - duration) ? value : best
    )
  );
}

export function secondsForFoundryVideo(duration: number) {
  const allowed = [4, 8, 12];
  return String(
    allowed.reduce((best, value) =>
      Math.abs(value - duration) < Math.abs(best - duration) ? value : best
    )
  );
}

export function sizeForFoundryVideo(
  resolution: Resolution,
  aspectRatio: AspectRatio,
  model: string
) {
  const isPortrait = aspectRatio === "9:16";
  const isLargePro = model === "sora-2-pro" && resolution === "1080p";

  if (isLargePro) {
    return isPortrait ? "1024x1792" : "1792x1024";
  }

  return isPortrait ? "720x1280" : "1280x720";
}

export function normalizeSettings(settings?: Partial<GenerationSettings>): GenerationSettings {
  const allowedDurations = [4, 8, 12];
  const requestedDuration = settings?.duration ?? 4;
  const duration = allowedDurations.reduce((best, value) =>
    Math.abs(value - requestedDuration) < Math.abs(best - requestedDuration) ? value : best
  );

  return {
    resolution: settings?.resolution ?? "720p",
    aspectRatio: settings?.aspectRatio ?? "16:9",
    duration,
    fps: settings?.fps ?? 24,
    motionStrength: settings?.motionStrength ?? 0.7,
    seed: settings?.seed ?? null,
    negativePrompt: settings?.negativePrompt ?? "",
    loop: settings?.loop ?? false,
    cameraMotion: settings?.cameraMotion ?? "static",
    stylePreset: settings?.stylePreset ?? null,
    imageInfluence: settings?.imageInfluence ?? 0.75
  };
}

export function normalizeAzureJobStatus(status: unknown) {
  const value = String(status ?? "processing").toLowerCase();
  if (value === "succeeded" || value === "completed") return "completed";
  if (value === "queued" || value === "pending") return "queued";
  if (value === "failed" || value === "cancelled" || value === "canceled") {
    return value === "canceled" ? "cancelled" : value;
  }
  return "processing";
}

export function progressForAzureStatus(status: unknown) {
  const value = String(status ?? "").toLowerCase();
  if (value === "succeeded" || value === "completed") return 1;
  if (value === "queued") return 0.1;
  if (value === "preprocessing") return 0.25;
  if (value === "running" || value === "in_progress") return 0.55;
  if (value === "processing") return 0.8;
  return 0.2;
}
