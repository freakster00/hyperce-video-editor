# Hyperce Editor

Personal Next.js workspace for prompt-first AI video generation and timeline editing.

## What is built

- Next.js app router project with TypeScript and Tailwind CSS.
- Editor layout from `documentation.md`: left generation panel, preview player, timeline, media gallery, and queue drawer.
- Reducer-based global state with localStorage persistence.
- Prompt library, generation settings, image-to-video upload state, timeline placement, prompt-edit modal, and `.soraproject` export.
- Local mock generation so the UI works before Sora access is configured.
- Next.js API routes that proxy Sora-style video creation and polling through `/api/sora/videos`.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env.local` and set:

```bash
AUTH_USERNAME=admin@example.com
AUTH_PASSWORD=your-editor-password
AUTH_JWT_SECRET=your-long-random-jwt-secret
OPENAI_API_KEY=sk-your-key
SORA_MOCK_MODE=false
```

For Azure AI Foundry / Azure OpenAI Sora, use server-side environment variables instead of pasting keys into the browser:

```bash
SORA_API_PROVIDER=azure
SORA_MOCK_MODE=false
AZURE_AI_FOUNDRY_ENDPOINT=https://your-resource.services.ai.azure.com
AZURE_API_KEY=your-rotated-key
AZURE_AI_FOUNDRY_MODEL=sora-2
```

You can also paste an API key into the Settings panel as a local override while testing. Restart `npm run dev` after changing environment variables.

## Notes

The app supports the OpenAI Videos API path and the Azure AI Foundry OpenAI-compatible `/openai/v1/videos?api-version=preview` flow. Azure generated video bytes are served back through a local Next.js proxy so API keys stay server-side.

For older Azure OpenAI Sora deployments that still use `/openai/v1/video/generations/jobs`, set `SORA_AZURE_API_KIND=azure-openai-v1`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, and `AZURE_OPENAI_DEPLOYMENT_NAME`.
