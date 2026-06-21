export type Resolution = "480p" | "720p" | "1080p";
export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3";
export type Fps = 24 | 30 | 60;
export type CameraMotion =
  | "static"
  | "pan_left"
  | "pan_right"
  | "zoom_in"
  | "zoom_out"
  | "orbit";

export type JobStatus =
  | "pending"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export interface GenerationSettings {
  resolution: Resolution;
  duration: number;
  aspectRatio: AspectRatio;
  fps: Fps;
  motionStrength: number;
  seed: number | null;
  negativePrompt: string;
  loop: boolean;
  cameraMotion: CameraMotion;
  stylePreset: string | null;
  imageInfluence: number;
}

export interface ClipEdit {
  id: string;
  editPrompt: string;
  rangeStart: number;
  rangeEnd: number;
  resultClipId: string;
  createdAt: string;
}

export interface Clip {
  id: string;
  name: string;
  url: string | null;
  thumbnailUrl: string | null;
  duration: number;
  width: number;
  height: number;
  fps: Fps;
  prompt: string;
  settings: GenerationSettings;
  status: "generating" | "ready" | "error";
  editHistory: ClipEdit[];
  jobId: string;
  createdAt: string;
  visual: "neon" | "alpine" | "studio" | "ocean" | "forest" | "ember";
}

export interface TimelineClip {
  id: string;
  clipId: string;
  startTime: number;
  trimStart: number;
  trimEnd: number;
}

export interface TimelineTrack {
  id: string;
  name: string;
  color: string;
  clips: TimelineClip[];
}

export interface TimelineState {
  tracks: TimelineTrack[];
  totalDuration: number;
  playheadPosition: number;
}

export interface Job {
  id: string;
  type: "text_to_video" | "image_to_video" | "clip_edit";
  prompt: string;
  status: JobStatus;
  progress: number;
  soraJobId: string | null;
  resultClipId: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  settings: GenerationSettings;
}

export interface SavedPrompt {
  id: string;
  text: string;
  tags: string[];
  settings: Partial<GenerationSettings>;
  thumbnailUrl: string | null;
  usageCount: number;
  createdAt: string;
}

export interface ApiConfig {
  apiKey: string;
  useProxy: boolean;
  proxyUrl: string;
  mockMode: boolean;
  connectionStatus: "unknown" | "connected" | "invalid" | "rate_limited";
}

export interface ProjectState {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  saveStatus: "saved" | "saving" | "unsaved";
}

export interface UiState {
  activeTab: "generate" | "library" | "settings";
  selectedClipId: string | null;
  selectedTimelineClipId: string | null;
  isPlaying: boolean;
  isQueueOpen: boolean;
  isExportOpen: boolean;
  toast: { kind: "success" | "warning" | "danger" | "info"; message: string } | null;
  generationSettings: GenerationSettings;
}

export interface AppState {
  apiConfig: ApiConfig;
  project: ProjectState;
  clips: Clip[];
  timeline: TimelineState;
  jobs: Job[];
  promptLibrary: SavedPrompt[];
  ui: UiState;
}

export interface SoraCreateRequest {
  prompt: string;
  mode: "text_to_video" | "image_to_video" | "clip_edit";
  settings: GenerationSettings;
  imageDataUrl?: string | null;
  mockMode?: boolean;
}
