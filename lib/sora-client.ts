import type { SoraCreateRequest } from "@/lib/types";

export async function createSoraVideo(
  request: SoraCreateRequest,
  apiKey?: string
) {
  const response = await fetch("/api/sora/videos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-openai-api-key": apiKey, "x-azure-api-key": apiKey } : {})
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getSoraVideoJob(jobId: string, apiKey?: string) {
  const response = await fetch(`/api/sora/videos/${jobId}`, {
    headers: apiKey ? { "x-openai-api-key": apiKey, "x-azure-api-key": apiKey } : undefined
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function testSoraConnection(apiKey?: string, mockMode = true) {
  const response = await fetch("/api/sora/connection", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-openai-api-key": apiKey, "x-azure-api-key": apiKey } : {})
    },
    body: JSON.stringify({ mockMode })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function enhancePrompt(prompt: string, apiKey?: string, mockMode = true) {
  const response = await fetch("/api/sora/enhance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-openai-api-key": apiKey, "x-azure-api-key": apiKey } : {})
    },
    body: JSON.stringify({ prompt, mockMode })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<{ prompt: string }>;
}
