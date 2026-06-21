import { NextRequest, NextResponse } from "next/server";
import {
  isMockEnabled,
  openAiHeaders,
  providerConfigError,
  readSoraProvider
} from "@/lib/server/sora-provider";

function localEnhance(prompt: string) {
  return [
    prompt.trim(),
    "Use a clear subject, cinematic camera movement, coherent temporal action, tactile environmental texture, precise lighting, and a production-ready visual style.",
    "Avoid abrupt scene changes unless explicitly requested."
  ].join(" ");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const prompt = String((body as { prompt?: unknown }).prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  if (isMockEnabled((body as { mockMode?: unknown }).mockMode === true)) {
    return NextResponse.json({ prompt: localEnhance(prompt), mock: true });
  }

  const config = readSoraProvider(request);
  if (config.provider === "azure") {
    return NextResponse.json({ prompt: localEnhance(prompt), provider: "local" });
  }

  const configError = providerConfigError(config);
  if (configError) {
    return NextResponse.json({ error: configError, provider: config.provider }, { status: 401 });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: openAiHeaders(config),
    body: JSON.stringify({
      model: process.env.OPENAI_PROMPT_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Rewrite user video prompts for Sora. Keep the user's intent, add cinematic detail, camera movement, lighting, setting, and temporal action. Return only the improved prompt."
        },
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  const outputText =
    typeof data.output_text === "string"
      ? data.output_text
      : Array.isArray(data.output)
        ? data.output
            .flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
            .map((item: { text?: string }) => item.text)
            .filter(Boolean)
            .join("\n")
        : "";

  return NextResponse.json({ prompt: outputText || localEnhance(prompt) });
}
