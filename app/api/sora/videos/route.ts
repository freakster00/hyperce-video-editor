import { NextRequest, NextResponse } from "next/server";
import {
  OPENAI_VIDEOS_URL,
  azureHeaders,
  dimensionsFor,
  isMockEnabled,
  normalizeSettings,
  openAiHeaders,
  providerConfigError,
  readSoraProvider,
  secondsForAzure,
  secondsForFoundryVideo,
  secondsForOpenAi,
  sizeForFoundryVideo,
  sizeFor
} from "@/lib/server/sora-provider";
import type { GenerationSettings } from "@/lib/types";

function dataUrlToBlob(dataUrl: string) {
  const [metadata, base64] = dataUrl.split(",");
  if (!metadata || !base64 || !metadata.startsWith("data:")) return null;
  const mime = metadata.match(/^data:([^;]+)/)?.[1] ?? "image/png";
  return new Blob([Buffer.from(base64, "base64")], { type: mime });
}

function fileNameForImage(image: Blob) {
  if (image.type === "image/jpeg") return "reference-image.jpg";
  if (image.type === "image/webp") return "reference-image.webp";
  return "reference-image.png";
}

async function createAzureOpenAiVideo(
  config: ReturnType<typeof readSoraProvider>,
  prompt: string,
  settings: GenerationSettings,
  imageDataUrl?: string | null
) {
  const createUrl = `${config.endpoint}/openai/v1/video/generations/jobs?api-version=${config.apiVersion}`;
  const { width, height } = dimensionsFor(settings.resolution, settings.aspectRatio);

  if (imageDataUrl) {
    const image = dataUrlToBlob(imageDataUrl);
    if (!image) {
      return NextResponse.json({ error: "Invalid image data URL." }, { status: 400 });
    }

    const fileName = fileNameForImage(image);
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("width", String(width));
    formData.append("height", String(height));
    formData.append("n_seconds", String(secondsForAzure(settings.duration)));
    formData.append("n_variants", "1");
    formData.append("model", config.deploymentName);
    formData.append(
      "inpaint_items",
      JSON.stringify([
        {
          frame_index: 0,
          type: "image",
          file_name: fileName,
          crop_bounds: {
            left_fraction: 0,
            top_fraction: 0,
            right_fraction: 1,
            bottom_fraction: 1
          }
        }
      ])
    );
    formData.append("files", image, fileName);

    const response = await fetch(createUrl, {
      method: "POST",
      headers: azureHeaders(config, false),
      body: formData
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json({ ...data, provider: "azure" }, { status: response.status });
  }

  const response = await fetch(createUrl, {
    method: "POST",
    headers: azureHeaders(config),
    body: JSON.stringify({
      prompt,
      width,
      height,
      n_seconds: secondsForAzure(settings.duration),
      n_variants: 1,
      model: config.deploymentName
    })
  });
  const data = await response.json().catch(() => ({}));
  return NextResponse.json({ ...data, provider: "azure" }, { status: response.status });
}

async function createAzureFoundryVideo(
  config: ReturnType<typeof readSoraProvider>,
  prompt: string,
  settings: GenerationSettings,
  imageDataUrl?: string | null
) {
  const createUrl = `${config.endpoint}/openai/v1/videos?api-version=${config.apiVersion}`;
  const payload = {
    prompt,
    model: config.deploymentName,
    size: sizeForFoundryVideo(settings.resolution, settings.aspectRatio, config.deploymentName),
    seconds: secondsForFoundryVideo(settings.duration)
  };

  if (imageDataUrl) {
    const image = dataUrlToBlob(imageDataUrl);
    if (!image) {
      return NextResponse.json({ error: "Invalid image data URL." }, { status: 400 });
    }

    const formData = new FormData();
    formData.append("prompt", payload.prompt);
    formData.append("model", payload.model);
    formData.append("size", payload.size);
    formData.append("seconds", payload.seconds);
    formData.append("input_reference", image, fileNameForImage(image));

    const response = await fetch(createUrl, {
      method: "POST",
      headers: azureHeaders(config, false),
      body: formData
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json({ ...data, provider: "azure" }, { status: response.status });
  }

  const response = await fetch(createUrl, {
    method: "POST",
    headers: azureHeaders(config),
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  return NextResponse.json({ ...data, provider: "azure" }, { status: response.status });
}

async function createAzureVideo(
  config: ReturnType<typeof readSoraProvider>,
  prompt: string,
  settings: GenerationSettings,
  imageDataUrl?: string | null
) {
  if (config.azureApiKind === "azure-openai-v1") {
    return createAzureOpenAiVideo(config, prompt, settings, imageDataUrl);
  }

  return createAzureFoundryVideo(config, prompt, settings, imageDataUrl);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const settings = body.settings as GenerationSettings | undefined;
  const prompt = String(body.prompt ?? "").trim();

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  if (isMockEnabled((body as { mockMode?: unknown }).mockMode === true)) {
    return NextResponse.json({
      id: `mock_${Date.now()}`,
      status: "processing",
      progress: 0.08,
      mock: true
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

  const safeSettings = normalizeSettings(settings);

  if (config.provider === "azure") {
    return createAzureVideo(config, prompt, safeSettings, String(body.imageDataUrl ?? "") || null);
  }

  const payload: Record<string, unknown> = {
    model: safeSettings.resolution === "1080p" ? "sora-2-pro" : "sora-2",
    prompt,
    seconds: secondsForOpenAi(safeSettings.duration),
    size: sizeFor(safeSettings.resolution, safeSettings.aspectRatio)
  };

  if (body.imageDataUrl) {
    payload.input_reference = {
      image_url: body.imageDataUrl
    };
  }

  const response = await fetch(OPENAI_VIDEOS_URL, {
    method: "POST",
    headers: openAiHeaders(config),
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json({ ...data, provider: "openai" }, { status: response.status });
}
