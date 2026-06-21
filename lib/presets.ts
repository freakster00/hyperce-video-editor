import type { GenerationSettings, SavedPrompt } from "@/lib/types";

export const defaultGenerationSettings: GenerationSettings = {
  resolution: "720p",
  duration: 5,
  aspectRatio: "16:9",
  fps: 24,
  motionStrength: 0.7,
  seed: null,
  negativePrompt: "",
  loop: false,
  cameraMotion: "pan_left",
  stylePreset: "cinematic",
  imageInfluence: 0.75
};

export const promptPresets: SavedPrompt[] = [
  {
    id: "preset_aerial_reveal",
    text: "A cinematic aerial reveal over a mountain ridge at golden hour, slow pan left, detailed clouds, film grain, natural lens flare.",
    tags: ["cinematic", "aerial", "nature"],
    settings: { duration: 6, resolution: "1080p", aspectRatio: "16:9", motionStrength: 0.65 },
    thumbnailUrl: null,
    usageCount: 0,
    createdAt: "2026-06-01T00:00:00.000Z"
  },
  {
    id: "preset_neon_rain",
    text: "A lone figure walks through heavy rain on a neon-lit street, reflections on wet asphalt, shallow depth of field, smooth dolly push-in.",
    tags: ["cyberpunk", "rain", "dolly"],
    settings: { duration: 5, resolution: "720p", aspectRatio: "9:16", motionStrength: 0.82 },
    thumbnailUrl: null,
    usageCount: 0,
    createdAt: "2026-06-01T00:00:00.000Z"
  },
  {
    id: "preset_product_orbit",
    text: "A premium product hero shot in a dark studio, controlled rim lighting, slow orbit camera movement, crisp reflections and elegant shadows.",
    tags: ["product", "studio", "orbit"],
    settings: { duration: 4, resolution: "1080p", aspectRatio: "1:1", motionStrength: 0.5 },
    thumbnailUrl: null,
    usageCount: 0,
    createdAt: "2026-06-01T00:00:00.000Z"
  },
  {
    id: "preset_ocean_macro",
    text: "Macro slow motion of sea foam washing over black volcanic sand, soft morning light, delicate texture, calming natural camera drift.",
    tags: ["macro", "ocean", "slow motion"],
    settings: { duration: 7, resolution: "720p", aspectRatio: "16:9", motionStrength: 0.42 },
    thumbnailUrl: null,
    usageCount: 0,
    createdAt: "2026-06-01T00:00:00.000Z"
  }
];

export const stylePresets = [
  "none",
  "cinematic",
  "photorealistic",
  "anime",
  "watercolor",
  "3d render",
  "vintage vhs"
];

export const cameraMotions = [
  { label: "Static", value: "static" },
  { label: "Pan left", value: "pan_left" },
  { label: "Pan right", value: "pan_right" },
  { label: "Zoom in", value: "zoom_in" },
  { label: "Zoom out", value: "zoom_out" },
  { label: "Orbit", value: "orbit" }
] as const;
