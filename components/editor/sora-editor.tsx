"use client";

import {
  DndContext,
  type DragEndEvent,
  useDraggable,
  useDroppable
} from "@dnd-kit/core";
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  Clipboard,
  Copy,
  Download,
  Eye,
  EyeOff,
  Film,
  FileInput,
  FileJson,
  FolderPlus,
  GripVertical,
  Image as ImageIcon,
  KeyRound,
  Layers3,
  Library,
  ListVideo,
  LogOut,
  Loader2,
  PanelLeft,
  Pause,
  Play,
  Plus,
  Save,
  Scissors,
  Settings,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X
} from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildInitialState,
  createClipFromPrompt,
  createId,
  useEditor
} from "@/lib/editor-state";
import { cameraMotions, promptPresets, stylePresets } from "@/lib/presets";
import { createSoraVideo, enhancePrompt, getSoraVideoJob, testSoraConnection } from "@/lib/sora-client";
import { copyText, downloadJson, readJsonFile } from "@/lib/storage";
import type {
  Clip,
  Fps,
  GenerationSettings,
  Job,
  SavedPrompt,
  AppState,
  TimelineClip,
  TimelineTrack
} from "@/lib/types";

const PIXELS_PER_SECOND = 84;
const SUPPORTED_DURATIONS = [4, 8, 12] as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${minutes}:${wholeSeconds.toString().padStart(2, "0")}.${tenths}`;
}

function getClipDuration(placement: TimelineClip, clip: Clip) {
  return Math.max(0.5, clip.duration - placement.trimStart - placement.trimEnd);
}

function extractVideoUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const direct = data.url ?? data.video_url ?? data.output_url;
  if (typeof direct === "string") return direct;

  const output = data.output;
  if (Array.isArray(output)) {
    const item = output[0] as Record<string, unknown> | undefined;
    if (typeof item?.url === "string") return item.url;
  }

  const nestedData = data.data;
  if (Array.isArray(nestedData)) {
    const item = nestedData[0] as Record<string, unknown> | undefined;
    if (typeof item?.url === "string") return item.url;
  }

  return null;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function referenceImageSize(settings: GenerationSettings) {
  return settings.aspectRatio === "9:16"
    ? { width: 720, height: 1280 }
    : { width: 1280, height: 720 };
}

function loadDataUrlImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the reference image."));
    image.src = dataUrl;
  });
}

async function normalizeReferenceImage(dataUrl: string, settings: GenerationSettings) {
  const image = await loadDataUrlImage(dataUrl);
  const target = referenceImageSize(settings);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the reference image.");
  }

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = target.width / target.height;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    cropX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetRatio;
    cropY = (sourceHeight - cropHeight) / 2;
  }

  context.fillStyle = "#000";
  context.fillRect(0, 0, target.width, target.height);
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    target.width,
    target.height
  );

  return canvas.toDataURL("image/jpeg", 0.95);
}

export function SoraEditor() {
  const { state, dispatch } = useEditor();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"text_to_video" | "image_to_video">("text_to_video");
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ clipId: string; placementId?: string; trackId?: string } | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const timersRef = useRef<number[]>([]);

  const selectedClip = useMemo(
    () => state.clips.find((clip) => clip.id === state.ui.selectedClipId) ?? null,
    [state.clips, state.ui.selectedClipId]
  );

  const activeJobCount = state.jobs.filter((job) =>
    ["pending", "queued", "processing"].includes(job.status)
  ).length;

  const selectedTimeline = useMemo(() => {
    for (const track of state.timeline.tracks) {
      const placement = track.clips.find((item) => item.id === state.ui.selectedTimelineClipId);
      if (placement) return { track, placement };
    }
    return null;
  }, [state.timeline.tracks, state.ui.selectedTimelineClipId]);

  useEffect(() => {
    if (!state.ui.isPlaying) return;
    if (selectedClip?.url) return;
    const timer = window.setInterval(() => {
      dispatch({
        type: "SET_PLAYHEAD",
        seconds:
          state.timeline.playheadPosition >= state.timeline.totalDuration
            ? 0
            : state.timeline.playheadPosition + 0.2
      });
    }, 200);

    return () => window.clearInterval(timer);
  }, [
    dispatch,
    selectedClip?.url,
    state.timeline.playheadPosition,
    state.timeline.totalDuration,
    state.ui.isPlaying
  ]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearInterval(timer));
    };
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (isTyping) return;

      if (event.code === "Space") {
        event.preventDefault();
        dispatch({ type: "SET_PLAYING" });
      }
      if (event.key === "Home") dispatch({ type: "SET_PLAYHEAD", seconds: 0 });
      if (event.key === "End") dispatch({ type: "SET_PLAYHEAD", seconds: state.timeline.totalDuration });
      if (event.key === "ArrowLeft") {
        dispatch({
          type: "SET_PLAYHEAD",
          seconds: state.timeline.playheadPosition - (event.shiftKey ? 1 : 1 / state.ui.generationSettings.fps)
        });
      }
      if (event.key === "ArrowRight") {
        dispatch({
          type: "SET_PLAYHEAD",
          seconds: state.timeline.playheadPosition + (event.shiftKey ? 1 : 1 / state.ui.generationSettings.fps)
        });
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "REDO" : "UNDO" });
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && selectedTimeline) {
        event.preventDefault();
        dispatch({
          type: "DUPLICATE_TIMELINE_CLIP",
          trackId: selectedTimeline.track.id,
          placementId: selectedTimeline.placement.id
        });
      }
      if (event.key === "Delete" && selectedTimeline) {
        dispatch({
          type: "REMOVE_TIMELINE_CLIP",
          trackId: selectedTimeline.track.id,
          placementId: selectedTimeline.placement.id
        });
      }
      if (event.key.toLowerCase() === "s" && selectedTimeline) {
        dispatch({
          type: "SPLIT_TIMELINE_CLIP",
          trackId: selectedTimeline.track.id,
          placementId: selectedTimeline.placement.id,
          splitTime: state.timeline.playheadPosition
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    dispatch,
    selectedTimeline,
    state.timeline.playheadPosition,
    state.timeline.totalDuration,
    state.ui.generationSettings.fps
  ]);

  useEffect(() => {
    if (!state.ui.toast) return;
    const timer = window.setTimeout(() => dispatch({ type: "SHOW_TOAST", toast: null }), 3200);
    return () => window.clearTimeout(timer);
  }, [dispatch, state.ui.toast]);

  function queueMockGeneration(jobId: string, currentPrompt: string, settings: GenerationSettings) {
    let progress = 0.08;
    dispatch({
      type: "UPDATE_JOB",
      jobId,
      patch: { status: "processing", progress }
    });

    const timer = window.setInterval(() => {
      progress = Math.min(0.94, progress + 0.11);
      dispatch({
        type: "UPDATE_JOB",
        jobId,
        patch: { status: "processing", progress }
      });
    }, 460);

    timersRef.current.push(timer);

    window.setTimeout(() => {
      window.clearInterval(timer);
      timersRef.current = timersRef.current.filter((item) => item !== timer);
      const clip = createClipFromPrompt(currentPrompt, settings, jobId);
      dispatch({ type: "COMPLETE_JOB", jobId, clip });
      dispatch({
        type: "SHOW_TOAST",
        toast: { kind: "success", message: "Video ready in the media gallery." }
      });
    }, 3800);
  }

  async function pollRealGeneration(
    jobId: string,
    soraJobId: string,
    currentPrompt: string,
    settings: GenerationSettings
  ) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await delay(5000);
      const payload = await getSoraVideoJob(soraJobId, state.apiConfig.apiKey);
      const status = String((payload as { status?: string }).status ?? "processing");
      const progress =
        typeof (payload as { progress?: number }).progress === "number"
          ? (payload as { progress: number }).progress
          : Math.min(0.94, (attempt + 1) / 24);

      dispatch({
        type: "UPDATE_JOB",
        jobId,
        patch: {
          status: status === "failed" ? "failed" : status === "completed" ? "completed" : "processing",
          progress
        }
      });

      if (status === "completed" || status === "succeeded") {
        const clip = createClipFromPrompt(currentPrompt, settings, jobId, extractVideoUrl(payload));
        dispatch({ type: "COMPLETE_JOB", jobId, clip });
        return;
      }

      if (status === "failed") {
        dispatch({ type: "FAIL_JOB", jobId, error: "Video generation failed." });
        return;
      }
    }

    dispatch({ type: "FAIL_JOB", jobId, error: "Generation timed out after 10 minutes." });
  }

  async function handleGenerate() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;
    if (!state.apiConfig.mockMode && !isOnline) {
      dispatch({
        type: "SHOW_TOAST",
        toast: { kind: "warning", message: "Generation is paused while offline." }
      });
      return;
    }
    const settings = state.ui.generationSettings;
    const jobId = createId("job");
    const job: Job = {
      id: jobId,
      type: mode,
      prompt: trimmedPrompt,
      status: "queued",
      progress: 0,
      soraJobId: null,
      resultClipId: null,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      settings
    };

    dispatch({ type: "SUBMIT_JOB", job });

    if (state.apiConfig.mockMode) {
      queueMockGeneration(jobId, trimmedPrompt, settings);
      dispatch({
        type: "SHOW_TOAST",
        toast: { kind: "info", message: "Mock generation queued." }
      });
      return;
    }

    try {
      const preparedImageDataUrl =
        mode === "image_to_video" && imageDataUrl
          ? await normalizeReferenceImage(imageDataUrl, settings)
          : null;
      const created = await createSoraVideo(
        {
          prompt: trimmedPrompt,
          mode,
          settings,
          imageDataUrl: preparedImageDataUrl,
          mockMode: false
        },
        state.apiConfig.apiKey
      );
      const soraJobId =
        (created as { id?: string; job_id?: string }).id ??
        (created as { id?: string; job_id?: string }).job_id;

      if (!soraJobId) {
        const clip = createClipFromPrompt(trimmedPrompt, settings, jobId, extractVideoUrl(created));
        dispatch({ type: "COMPLETE_JOB", jobId, clip });
        return;
      }

      dispatch({
        type: "UPDATE_JOB",
        jobId,
        patch: { status: "processing", soraJobId, progress: 0.05 }
      });

      void pollRealGeneration(jobId, soraJobId, trimmedPrompt, settings);
    } catch (error) {
      dispatch({
        type: "FAIL_JOB",
        jobId,
        error: error instanceof Error ? error.message : "Generation request failed."
      });
      dispatch({
        type: "SHOW_TOAST",
        toast: { kind: "danger", message: "Generation request failed." }
      });
    }
  }

  function handleRetryJob(job: Job) {
    const retryId = createId("job");
    const retry: Job = {
      ...job,
      id: retryId,
      status: "queued",
      progress: 0,
      error: null,
      soraJobId: null,
      resultClipId: null,
      createdAt: new Date().toISOString(),
      completedAt: null
    };
    dispatch({ type: "SUBMIT_JOB", job: retry });
    if (state.apiConfig.mockMode) {
      queueMockGeneration(retryId, job.prompt, job.settings);
    } else {
      setPrompt(job.prompt);
      dispatch({
        type: "SHOW_TOAST",
        toast: { kind: "info", message: "Prompt restored. Press Generate to retry the API request." }
      });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const clipId = event.active.data.current?.clipId as string | undefined;
    const placementId = event.active.data.current?.placementId as string | undefined;
    const fromTrackId = event.active.data.current?.trackId as string | undefined;
    const trackId = event.over?.data.current?.trackId as string | undefined;
    if (placementId && fromTrackId) {
      const track = state.timeline.tracks.find((item) => item.id === fromTrackId);
      const placement = track?.clips.find((item) => item.id === placementId);
      if (!placement) return;
      const rawStart = placement.startTime + event.delta.x / PIXELS_PER_SECOND;
      dispatch({
        type: "MOVE_TIMELINE_CLIP",
        trackId: fromTrackId,
        toTrackId: trackId ?? fromTrackId,
        placementId,
        startTime: snapTime(rawStart, placementId)
      });
      return;
    }

    if (!clipId || !trackId) return;

    addClipToTimeline(clipId, trackId);
  }

  function snapTime(value: number, movingPlacementId?: string) {
    const points = [
      0,
      state.timeline.playheadPosition,
      ...state.timeline.tracks.flatMap((track) =>
        track.clips.flatMap((placement) => {
          if (placement.id === movingPlacementId) return [];
          const source = state.clips.find((clip) => clip.id === placement.clipId);
          if (!source) return [];
          const end = placement.startTime + getClipDuration(placement, source);
          return [placement.startTime, end];
        })
      )
    ];
    const nearest = points.reduce(
      (best, point) =>
        Math.abs(point - value) < Math.abs(best - value) ? point : best,
      value
    );
    return Math.abs(nearest - value) <= 0.18 ? Math.max(0, nearest) : Math.max(0, value);
  }

  function addClipToTimeline(clipId: string, trackId = state.timeline.tracks[0]?.id) {
    const clip = state.clips.find((item) => item.id === clipId);
    const track = state.timeline.tracks.find((item) => item.id === trackId);
    if (!clip || !track) return;

    const startTime = track.clips.reduce((end, placement) => {
      const source = state.clips.find((item) => item.id === placement.clipId);
      if (!source) return end;
      return Math.max(end, placement.startTime + getClipDuration(placement, source));
    }, 0);

    dispatch({
      type: "ADD_CLIP_TO_TIMELINE",
      trackId,
      placement: {
        id: createId("place"),
        clipId,
        startTime,
        trimStart: 0,
        trimEnd: 0
      }
    });
  }

  function handleSavePrompt() {
    const text = prompt.trim();
    if (!text) return;

    const saved: SavedPrompt = {
      id: createId("prompt"),
      text,
      tags: [mode === "text_to_video" ? "text" : "image", state.ui.generationSettings.stylePreset ?? "custom"],
      settings: state.ui.generationSettings,
      thumbnailUrl: null,
      usageCount: 0,
      createdAt: new Date().toISOString()
    };

    dispatch({ type: "SAVE_PROMPT", prompt: saved });
    dispatch({ type: "SET_ACTIVE_TAB", tab: "library" });
  }

  async function handleEnhancePrompt() {
    const current = prompt.trim();
    if (!current) return;
    try {
      const result = await enhancePrompt(current, state.apiConfig.apiKey, state.apiConfig.mockMode);
      setPrompt(result.prompt);
      dispatch({
        type: "SHOW_TOAST",
        toast: { kind: "success", message: "Prompt enhanced." }
      });
    } catch {
      setPrompt(
        `${current} Use cinematic composition, specific camera motion, detailed lighting, tactile environmental texture, and coherent temporal action.`
      );
      dispatch({
        type: "SHOW_TOAST",
        toast: { kind: "warning", message: "Used local prompt enhancement fallback." }
      });
    }
  }

  function handleExportProject() {
    const safeName = state.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "hyperce-project";
    downloadJson(`${safeName}.soraproject`, state);
    dispatch({ type: "MARK_SAVED" });
    dispatch({
      type: "SHOW_TOAST",
      toast: { kind: "success", message: "Project file exported." }
    });
  }

  async function handleImportProject(file: File | null) {
    if (!file) return;
    try {
      const imported = await readJsonFile<AppState>(file);
      dispatch({ type: "HYDRATE", state: imported });
      dispatch({
        type: "SHOW_TOAST",
        toast: { kind: "success", message: "Project imported." }
      });
    } catch (error) {
      dispatch({
        type: "SHOW_TOAST",
        toast: {
          kind: "danger",
          message: error instanceof Error ? error.message : "Could not import project."
        }
      });
    }
  }

  function handleAddTrack() {
    const colors = ["#58BCCB", "#3F8D9A", "#20C98B", "#FFD400"];
    const nextIndex = state.timeline.tracks.length + 1;
    const track: TimelineTrack = {
      id: createId("track"),
      name: `V${nextIndex}`,
      color: colors[nextIndex % colors.length],
      clips: []
    };
    dispatch({ type: "ADD_TRACK", track });
  }

  function handleImageInput(file: File | null) {
    if (!file) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(typeof reader.result === "string" ? reader.result : null);
      setMode("image_to_video");
    };
    reader.readAsDataURL(file);
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="editor-app">
        <TopBar
          activeJobCount={activeJobCount}
          onExport={handleExportProject}
          onImport={handleImportProject}
          onNewProject={() => dispatch({ type: "NEW_PROJECT", state: buildInitialState() })}
        />

        <div className="editor-grid">
          <aside className="panel left-panel overflow-y-auto">
            <Sidebar
              mode={mode}
              setMode={setMode}
              prompt={prompt}
              setPrompt={setPrompt}
              imageName={imageName}
              imageDataUrl={imageDataUrl}
              onImageInput={handleImageInput}
              onRemoveImage={() => {
                setImageName(null);
                setImageDataUrl(null);
              }}
              onGenerate={handleGenerate}
              onSavePrompt={handleSavePrompt}
              onEnhancePrompt={handleEnhancePrompt}
              isGenerating={activeJobCount > 0}
            />
          </aside>

          <main className="main-workspace">
            <PreviewPanel
              clip={selectedClip}
              isPlaying={state.ui.isPlaying}
              onTogglePlay={() =>
                dispatch({
                  type: "TOGGLE_QUEUE"
                })
              }
              onEditClip={() => {
                if (selectedTimeline) {
                  setEditTarget({
                    clipId: selectedTimeline.placement.clipId,
                    placementId: selectedTimeline.placement.id,
                    trackId: selectedTimeline.track.id
                  });
                  return;
                }
                if (selectedClip) setEditTarget({ clipId: selectedClip.id });
              }}
              onUseFrame={(frameDataUrl) => {
                setImageDataUrl(frameDataUrl);
                setImageName("Captured frame");
                setMode("image_to_video");
                dispatch({ type: "SET_ACTIVE_TAB", tab: "generate" });
                dispatch({
                  type: "SHOW_TOAST",
                  toast: { kind: "success", message: "Current frame is ready for image-to-video." }
                });
              }}
            />
            <TimelinePanel
              onAddTrack={handleAddTrack}
              onEditClip={(clipId, placementId, trackId) =>
                setEditTarget({ clipId, placementId, trackId })
              }
            />
          </main>

          <aside className="panel right-panel overflow-y-auto">
            <MediaGallery onAddClip={addClipToTimeline} />
          </aside>
        </div>

        <GenerationQueue onAddClip={addClipToTimeline} onRetryJob={handleRetryJob} />
        {state.ui.isExportOpen ? <ExportModal /> : null}
        {state.ui.toast ? <Toast /> : null}
        {!isOnline ? <OfflineBanner /> : null}
        {editTarget ? (
          <ClipEditModal
            clipId={editTarget.clipId}
            placementId={editTarget.placementId}
            trackId={editTarget.trackId}
            onClose={() => setEditTarget(null)}
          />
        ) : null}
      </div>
    </DndContext>
  );
}

function TopBar({
  activeJobCount,
  onExport,
  onImport,
  onNewProject
}: {
  activeJobCount: number;
  onExport: () => void;
  onImport: (file: File | null) => void;
  onNewProject: () => void;
}) {
  const { state, dispatch, canUndo, canRedo } = useEditor();
  const importInputRef = useRef<HTMLInputElement | null>(null);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/signin";
  }

  return (
    <header className="flex min-w-0 items-center gap-3 border-b border-space-700 bg-space-950/95 px-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyanline/50 bg-cyanline/20">
        <img
          src="/hyperce-logo.png"
          alt="Hyperce"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0">
        <div className="font-display text-sm font-semibold tracking-normal">Hyperce Editor</div>
        <div className="text-[11px] text-muted">Prompt-first video workspace</div>
      </div>

      <input
        className="field ml-2 h-9 max-w-[270px] px-3 text-sm"
        value={state.project.name}
        aria-label="Project name"
        onChange={(event) =>
          dispatch({ type: "UPDATE_PROJECT", project: { name: event.target.value } })
        }
      />

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-2 rounded-lg border border-space-700 bg-space-900 px-3 py-2 text-xs text-muted md:inline-flex">
          <span className={cx("status-dot", state.project.saveStatus)} />
          {state.project.saveStatus === "unsaved" ? "Unsaved changes" : "Saved locally"}
        </span>
        <button className="command-button" title="New project" onClick={onNewProject}>
          <FolderPlus size={16} />
          <span className="hidden sm:inline">New</span>
        </button>
        <button
          className="command-button"
          title="Save project"
          onClick={() => dispatch({ type: "MARK_SAVED" })}
        >
          <Save size={16} />
          <span className="hidden sm:inline">Save</span>
        </button>
        <button
          className="icon-button"
          title="Undo"
          disabled={!canUndo}
          onClick={() => dispatch({ type: "UNDO" })}
        >
          <SkipBack size={15} />
        </button>
        <button
          className="icon-button"
          title="Redo"
          disabled={!canRedo}
          onClick={() => dispatch({ type: "REDO" })}
        >
          <SkipForward size={15} />
        </button>
        <input
          ref={importInputRef}
          className="sr-only"
          type="file"
          accept=".soraproject,application/json"
          onChange={(event) => onImport(event.target.files?.[0] ?? null)}
        />
        <button
          className="command-button"
          title="Import project"
          onClick={() => importInputRef.current?.click()}
        >
          <FileInput size={16} />
          <span className="hidden sm:inline">Import</span>
        </button>
        <button className="command-button command-secondary" title="Export manifest" onClick={onExport}>
          <Download size={16} />
          <span className="hidden sm:inline">Export</span>
        </button>
        <button
          className="command-button command-secondary"
          title="Open export panel"
          onClick={() => dispatch({ type: "TOGGLE_EXPORT", open: true })}
        >
          <FileJson size={16} />
          <span className="hidden sm:inline">Render</span>
        </button>
        <button
          className="command-button"
          title="Toggle queue"
          onClick={() => dispatch({ type: "TOGGLE_QUEUE" })}
        >
          <ListVideo size={16} />
          <span>{activeJobCount}</span>
        </button>
        <button className="command-button" title="Logout" onClick={handleLogout}>
          <LogOut size={16} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}

function Sidebar({
  mode,
  setMode,
  prompt,
  setPrompt,
  imageName,
  imageDataUrl,
  onImageInput,
  onRemoveImage,
  onGenerate,
  onSavePrompt,
  onEnhancePrompt,
  isGenerating
}: {
  mode: "text_to_video" | "image_to_video";
  setMode: (mode: "text_to_video" | "image_to_video") => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  imageName: string | null;
  imageDataUrl: string | null;
  onImageInput: (file: File | null) => void;
  onRemoveImage: () => void;
  onGenerate: () => void;
  onSavePrompt: () => void;
  onEnhancePrompt: () => void;
  isGenerating: boolean;
}) {
  const { state, dispatch } = useEditor();

  return (
    <div className="flex min-h-full flex-col">
      <nav className="grid grid-cols-3 gap-1 border-b border-space-700 p-2">
        {[
          { id: "generate", label: "Generate", icon: Wand2 },
          { id: "library", label: "Library", icon: Library },
          { id: "settings", label: "Settings", icon: Settings }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={cx(
                "command-button h-10 px-2 text-xs",
                state.ui.activeTab === item.id && "border-pulse/70 bg-space-800"
              )}
              onClick={() =>
                dispatch({ type: "SET_ACTIVE_TAB", tab: item.id as typeof state.ui.activeTab })
              }
            >
              <Icon size={15} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {state.ui.activeTab === "generate" ? (
        <GeneratePanel
          mode={mode}
          setMode={setMode}
          prompt={prompt}
          setPrompt={setPrompt}
          imageName={imageName}
          imageDataUrl={imageDataUrl}
          onImageInput={onImageInput}
          onRemoveImage={onRemoveImage}
          onGenerate={onGenerate}
          onSavePrompt={onSavePrompt}
          onEnhancePrompt={onEnhancePrompt}
          isGenerating={isGenerating}
        />
      ) : null}

      {state.ui.activeTab === "library" ? (
        <PromptLibraryPanel onUsePrompt={setPrompt} />
      ) : null}

      {state.ui.activeTab === "settings" ? <SettingsPanel /> : null}
    </div>
  );
}

function GeneratePanel({
  mode,
  setMode,
  prompt,
  setPrompt,
  imageName,
  imageDataUrl,
  onImageInput,
  onRemoveImage,
  onGenerate,
  onSavePrompt,
  onEnhancePrompt,
  isGenerating
}: {
  mode: "text_to_video" | "image_to_video";
  setMode: (mode: "text_to_video" | "image_to_video") => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  imageName: string | null;
  imageDataUrl: string | null;
  onImageInput: (file: File | null) => void;
  onRemoveImage: () => void;
  onGenerate: () => void;
  onSavePrompt: () => void;
  onEnhancePrompt: () => void;
  isGenerating: boolean;
}) {
  const { state, dispatch } = useEditor();
  const settings = state.ui.generationSettings;

  return (
    <section className="space-y-4 p-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          className={cx("command-button h-10", mode === "text_to_video" && "border-pulse bg-space-800")}
          onClick={() => setMode("text_to_video")}
        >
          <Film size={16} />
          Text
        </button>
        <button
          className={cx("command-button h-10", mode === "image_to_video" && "border-pulse bg-space-800")}
          onClick={() => setMode("image_to_video")}
        >
          <ImageIcon size={16} />
          Image
        </button>
      </div>

      {mode === "image_to_video" ? (
        <label className="block rounded-lg border border-dashed border-space-700 bg-space-950 p-3">
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => onImageInput(event.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-space-700 bg-space-900">
              <Upload size={18} className="text-cyanline" />
            </div>
            <div className="min-w-0 text-sm">
              <div className="font-medium">{imageName ?? "Drop in a source frame"}</div>
              <div className="truncate text-xs text-muted">JPG, PNG, or WEBP up to your browser limit</div>
            </div>
            {imageName ? (
              <button
                type="button"
                className="icon-button ml-auto"
                title="Remove image"
                onClick={(event) => {
                  event.preventDefault();
                  onRemoveImage();
                }}
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
          {imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageDataUrl}
              alt=""
              className="mt-3 h-32 w-full rounded-lg object-cover"
            />
          ) : null}
        </label>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>{mode === "text_to_video" ? "Prompt" : "What should happen to this image?"}</span>
          <span className={prompt.length > 2000 ? "text-danger" : ""}>{prompt.length}/2000</span>
        </div>
        <textarea
          className="field min-h-36 resize-none p-3 text-sm leading-6"
          value={prompt}
          maxLength={2400}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="A cinematic shot of mountains at golden hour, slow pan left, film grain..."
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button className="command-button" onClick={onEnhancePrompt}>
          <Sparkles size={16} />
          Enhance
        </button>
        <button className="command-button" onClick={onSavePrompt}>
          <Library size={16} />
          Save
        </button>
      </div>

      <GenerationSettingsPanel
        settings={settings}
        update={(patch) => dispatch({ type: "UPDATE_GENERATION_SETTINGS", settings: patch })}
      />

      <button
        className={cx(
          "command-button command-primary min-h-12 w-full text-sm font-semibold",
          isGenerating && "pulse-active"
        )}
        disabled={!prompt.trim()}
        onClick={onGenerate}
      >
        {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
        Generate Video
      </button>
    </section>
  );
}

function GenerationSettingsPanel({
  settings,
  update
}: {
  settings: GenerationSettings;
  update: (patch: Partial<GenerationSettings>) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-space-700 bg-space-950 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal size={16} className="text-cyanline" />
        Generation Settings
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-muted">
          Resolution
          <select
            className="field h-9 px-2 text-sm"
            value={settings.resolution}
            onChange={(event) => update({ resolution: event.target.value as GenerationSettings["resolution"] })}
          >
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          Aspect
          <select
            className="field h-9 px-2 text-sm"
            value={settings.aspectRatio}
            onChange={(event) =>
              update({ aspectRatio: event.target.value as GenerationSettings["aspectRatio"] })
            }
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
            <option value="4:3">4:3</option>
          </select>
        </label>
      </div>

      <label className="block space-y-2 text-xs text-muted">
        Duration
        <div className="grid grid-cols-3 gap-2">
          {SUPPORTED_DURATIONS.map((duration) => (
            <button
              key={duration}
              type="button"
              className={cx(
                "command-button h-9 text-sm",
                settings.duration === duration && "command-primary"
              )}
              onClick={() => update({ duration })}
            >
              {duration}s
            </button>
          ))}
        </div>
      </label>

      <label className="block space-y-2 text-xs text-muted">
        Motion strength: {settings.motionStrength.toFixed(2)}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.motionStrength}
          onChange={(event) => update({ motionStrength: Number(event.target.value) })}
          className="w-full accent-pulse"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-muted">
          FPS
          <select
            className="field h-9 px-2 text-sm"
            value={settings.fps}
            onChange={(event) => update({ fps: Number(event.target.value) as Fps })}
          >
            <option value={24}>24</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          Style
          <select
            className="field h-9 px-2 text-sm"
            value={settings.stylePreset ?? "none"}
            onChange={(event) =>
              update({ stylePreset: event.target.value === "none" ? null : event.target.value })
            }
          >
            {stylePresets.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="space-y-1 text-xs text-muted">
        Camera motion
        <select
          className="field h-9 px-2 text-sm"
          value={settings.cameraMotion}
          onChange={(event) =>
            update({ cameraMotion: event.target.value as GenerationSettings["cameraMotion"] })
          }
        >
          {cameraMotions.map((motion) => (
            <option key={motion.value} value={motion.value}>
              {motion.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <label className="space-y-1 text-xs text-muted">
          Seed
          <input
            className="field h-9 px-2 text-sm"
            type="number"
            value={settings.seed ?? ""}
            placeholder="random"
            onChange={(event) =>
              update({ seed: event.target.value ? Number(event.target.value) : null })
            }
          />
        </label>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-space-700 bg-space-900 px-3 text-xs text-muted">
          <input
            type="checkbox"
            className="accent-cyanline"
            checked={settings.loop}
            onChange={(event) => update({ loop: event.target.checked })}
          />
          Loop
        </label>
      </div>

      <label className="block space-y-2 text-xs text-muted">
        Image influence: {settings.imageInfluence.toFixed(2)}
        <input
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={settings.imageInfluence}
          onChange={(event) => update({ imageInfluence: Number(event.target.value) })}
          className="w-full accent-cyanline"
        />
      </label>

      <textarea
        className="field min-h-16 resize-none p-2 text-xs"
        value={settings.negativePrompt}
        onChange={(event) => update({ negativePrompt: event.target.value })}
        placeholder="Negative prompt"
      />
    </div>
  );
}

function PromptLibraryPanel({ onUsePrompt }: { onUsePrompt: (prompt: string) => void }) {
  const { state, dispatch } = useEditor();
  const [query, setQuery] = useState("");
  const prompts = [...state.promptLibrary, ...promptPresets].filter((prompt) => {
    const haystack = `${prompt.text} ${prompt.tags.join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <section className="space-y-3 p-3">
      <input
        className="field h-10 px-3 text-sm"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search prompts"
      />
      <div className="space-y-2">
        {prompts.map((item) => {
          const isUserPrompt = !item.id.startsWith("preset_");
          return (
            <article key={item.id} className="rounded-lg border border-space-700 bg-space-950 p-3">
              <p className="line-clamp-3 text-sm leading-5">{item.text}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-space-700 bg-space-900 px-2 py-1 text-[11px] text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="command-button h-8 flex-1 text-xs"
                  onClick={() => {
                    onUsePrompt(item.text);
                    dispatch({ type: "SET_ACTIVE_TAB", tab: "generate" });
                  }}
                >
                  <ArrowDownToLine size={14} />
                  Use
                </button>
                {isUserPrompt ? (
                  <>
                    <button
                      className="icon-button h-8 w-8"
                      title="Duplicate prompt"
                      onClick={() => dispatch({ type: "DUPLICATE_PROMPT", promptId: item.id })}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      className="icon-button h-8 w-8"
                      title="Delete prompt"
                      onClick={() => dispatch({ type: "DELETE_PROMPT", promptId: item.id })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SettingsPanel() {
  const { state, dispatch } = useEditor();
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    setTesting(true);
    try {
      await testSoraConnection(state.apiConfig.apiKey, state.apiConfig.mockMode);
      dispatch({
        type: "UPDATE_API_CONFIG",
        config: { connectionStatus: "connected" }
      });
    } catch {
      dispatch({
        type: "UPDATE_API_CONFIG",
        config: { connectionStatus: "invalid" }
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="space-y-4 p-3">
      <div className="rounded-lg border border-space-700 bg-space-950 p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <KeyRound size={16} className="text-cyanline" />
          API Key Override
        </div>
        <div className="flex gap-2">
          <input
            className="field h-10 px-3 text-sm"
            type={showKey ? "text" : "password"}
            value={state.apiConfig.apiKey}
            onChange={(event) =>
              dispatch({
                type: "UPDATE_API_CONFIG",
                config: { apiKey: event.target.value, connectionStatus: "unknown" }
              })
            }
            placeholder="Optional server key override"
          />
          <button className="icon-button h-10 w-10" title="Reveal key" onClick={() => setShowKey((value) => !value)}>
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs text-muted">
            <span className={cx("status-dot", state.apiConfig.connectionStatus)} />
            {state.apiConfig.connectionStatus.replace("_", " ")}
          </span>
          <button className="command-button h-9 text-xs" onClick={handleTest}>
            {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Test
          </button>
        </div>
      </div>

      <label className="flex items-center justify-between rounded-lg border border-space-700 bg-space-950 p-3 text-sm">
        <span>
          <span className="block font-medium">Mock generation</span>
          <span className="block text-xs text-muted">Keep the editor usable without model access.</span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-pulse"
          checked={state.apiConfig.mockMode}
          onChange={(event) =>
            dispatch({ type: "UPDATE_API_CONFIG", config: { mockMode: event.target.checked } })
          }
        />
      </label>

      <label className="flex items-center justify-between rounded-lg border border-space-700 bg-space-950 p-3 text-sm">
        <span>
          <span className="block font-medium">Use local proxy</span>
          <span className="block text-xs text-muted">Routes calls through Next.js API handlers.</span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-cyanline"
          checked={state.apiConfig.useProxy}
          onChange={(event) =>
            dispatch({ type: "UPDATE_API_CONFIG", config: { useProxy: event.target.checked } })
          }
        />
      </label>

      <label className="space-y-1 text-xs text-muted">
        Proxy URL
        <input
          className="field h-10 px-3 text-sm"
          value={state.apiConfig.proxyUrl}
          onChange={(event) =>
            dispatch({ type: "UPDATE_API_CONFIG", config: { proxyUrl: event.target.value } })
          }
        />
      </label>
    </section>
  );
}

function PreviewPanel({
  clip,
  isPlaying,
  onTogglePlay,
  onEditClip,
  onUseFrame
}: {
  clip: Clip | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onEditClip: () => void;
  onUseFrame: (dataUrl: string) => void;
}) {
  const { state, dispatch } = useEditor();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const playheadRef = useRef(0);
  const [localPreviewTime, setLocalPreviewTime] = useState(0);
  const timelineMode = Boolean(state.ui.selectedTimelineClipId);
  const clipMap = useMemo(() => new Map(state.clips.map((item) => [item.id, item])), [state.clips]);
  const timelineItems = useMemo(() => {
    return state.timeline.tracks
      .flatMap((track, trackIndex) =>
        track.clips.flatMap((placement, placementIndex) => {
          const source = clipMap.get(placement.clipId);
          if (!source) return [];
          const duration = getClipDuration(placement, source);
          return [{ track, trackIndex, placement, placementIndex, clip: source, duration }];
        })
      )
      .sort((a, b) => a.placement.startTime - b.placement.startTime || a.trackIndex - b.trackIndex);
  }, [clipMap, state.timeline.tracks]);

  const activeTimelineItem = useMemo(() => {
    if (!timelineMode) return null;
    const playhead = state.timeline.playheadPosition;
    return (
      timelineItems.find((item) => {
        const start = item.placement.startTime;
        const end = start + item.duration;
        return playhead >= start && playhead < end;
      }) ?? null
    );
  }, [state.timeline.playheadPosition, timelineItems, timelineMode]);

  const nextTimelineItem = useMemo(() => {
    if (!timelineMode) return null;
    return timelineItems.find((item) => item.placement.startTime > state.timeline.playheadPosition) ?? null;
  }, [state.timeline.playheadPosition, timelineItems, timelineMode]);

  const previewClip = timelineMode ? activeTimelineItem?.clip ?? null : clip;
  const previewPlacement = timelineMode ? activeTimelineItem?.placement ?? null : null;
  const previewPlacementId = previewPlacement?.id ?? null;
  const clipPreviewStart = previewPlacement?.trimStart ?? 0;
  const clipPreviewEnd = previewClip
    ? Math.max(clipPreviewStart, previewClip.duration - (previewPlacement?.trimEnd ?? 0))
    : 0;
  const previewDuration = timelineMode ? state.timeline.totalDuration : previewClip?.duration ?? 0;
  const previewTime = timelineMode ? state.timeline.playheadPosition : localPreviewTime;
  const canPreviewPlay = timelineMode
    ? timelineItems.some((item) => Boolean(item.clip.url))
    : Boolean(previewClip?.url);

  useEffect(() => {
    playheadRef.current = state.timeline.playheadPosition;
  }, [state.timeline.playheadPosition]);

  function setTimelineVideoRef(placementId: string, node: HTMLVideoElement | null) {
    if (node) {
      timelineVideoRefs.current.set(placementId, node);
      return;
    }
    timelineVideoRefs.current.delete(placementId);
  }

  function activePreviewVideo() {
    if (timelineMode) {
      return previewPlacement ? timelineVideoRefs.current.get(previewPlacement.id) ?? null : null;
    }

    return videoRef.current;
  }

  function pauseInactiveTimelineVideos() {
    if (!timelineMode) return;
    for (const [placementId, video] of timelineVideoRefs.current.entries()) {
      if (placementId !== previewPlacement?.id) video.pause();
    }
  }

  function videoTimeForPlayhead(playheadPosition: number) {
    if (!previewClip) return 0;

    if (previewPlacement) {
      const relativeTime = playheadPosition - previewPlacement.startTime;
      return clamp(previewPlacement.trimStart + relativeTime, clipPreviewStart, clipPreviewEnd);
    }

    return clamp(playheadPosition, 0, previewClip.duration);
  }

  function playheadForVideoTime(videoTime: number) {
    if (previewPlacement && previewClip) {
      return previewPlacement.startTime + clamp(videoTime - previewPlacement.trimStart, 0, getClipDuration(previewPlacement, previewClip));
    }

    return videoTime;
  }

  function syncVideoToPlayhead() {
    const video = activePreviewVideo();
    if (!video || !previewClip?.url) return;
    if (timelineMode && !previewPlacement) return;

    const nextTime = videoTimeForPlayhead(state.timeline.playheadPosition);
    const allowedDrift = timelineMode && isPlaying ? 0.9 : 0.18;
    if (Number.isFinite(nextTime) && Math.abs(video.currentTime - nextTime) > allowedDrift) {
      video.currentTime = nextTime;
    }
  }

  function syncPlayheadFromVideo() {
    const video = activePreviewVideo();
    if (!video || !previewClip?.url) return;
    if (timelineMode && !previewPlacement) return;

    if (previewPlacement && video.currentTime < clipPreviewStart) {
      video.currentTime = clipPreviewStart;
      dispatch({ type: "SET_PLAYHEAD", seconds: previewPlacement.startTime });
      return;
    }

    if (previewPlacement && video.currentTime >= clipPreviewEnd) {
      video.currentTime = clipPreviewEnd;
      const nextPlayhead = previewPlacement.startTime + getClipDuration(previewPlacement, previewClip);
      dispatch({
        type: "SET_PLAYHEAD",
        seconds: nextPlayhead
      });
      if (nextPlayhead >= state.timeline.totalDuration) {
        dispatch({ type: "SET_PLAYING", playing: false });
      }
      return;
    }

    if (timelineMode) {
      dispatch({ type: "SET_PLAYHEAD", seconds: playheadForVideoTime(video.currentTime) });
    } else {
      setLocalPreviewTime(video.currentTime);
    }
  }

  function handleVideoEnded() {
    if (previewPlacement && previewClip) {
      const nextPlayhead = previewPlacement.startTime + getClipDuration(previewPlacement, previewClip);
      dispatch({ type: "SET_PLAYHEAD", seconds: nextPlayhead });
      if (nextPlayhead >= state.timeline.totalDuration) {
        dispatch({ type: "SET_PLAYING", playing: false });
      }
      return;
    }

    dispatch({ type: "SET_PLAYING", playing: false });
  }

  function seekPreview(seconds: number) {
    const safeSeconds = clamp(seconds, 0, previewDuration);
    if (timelineMode) {
      dispatch({ type: "SET_PLAYHEAD", seconds: safeSeconds });
      return;
    }

    const video = videoRef.current;
    if (video) video.currentTime = safeSeconds;
    setLocalPreviewTime(safeSeconds);
  }

  function playPreviewFromStart() {
    seekPreview(0);
    dispatch({ type: "SET_PLAYING", playing: true });
  }

  useEffect(() => {
    pauseInactiveTimelineVideos();
    if (!isPlaying || !timelineMode) {
      syncVideoToPlayhead();
    }
  }, [
    isPlaying,
    previewClip?.id,
    previewClip?.url,
    clipPreviewEnd,
    clipPreviewStart,
    previewPlacement?.id,
    previewPlacement?.startTime,
    state.timeline.playheadPosition,
    timelineMode
  ]);

  useEffect(() => {
    if (!timelineMode || !nextTimelineItem?.clip.url) return;
    const secondsUntilNext = nextTimelineItem.placement.startTime - state.timeline.playheadPosition;
    if (secondsUntilNext > 1.2) return;

    const nextVideo = timelineVideoRefs.current.get(nextTimelineItem.placement.id);
    if (!nextVideo) return;
    const nextStart = nextTimelineItem.placement.trimStart;
    if (nextVideo.readyState === 0) nextVideo.load();
    if (Number.isFinite(nextVideo.duration) && Math.abs(nextVideo.currentTime - nextStart) > 0.12) {
      nextVideo.currentTime = nextStart;
    }
  }, [nextTimelineItem?.placement.id, state.timeline.playheadPosition, timelineMode]);

  useEffect(() => {
    pauseInactiveTimelineVideos();
    const video = activePreviewVideo();
    if (!video || !previewClip?.url) {
      if (!isPlaying) {
        for (const timelineVideo of timelineVideoRefs.current.values()) timelineVideo.pause();
      }
      return;
    }

    if (isPlaying) {
      if (previewPlacement && video.currentTime >= clipPreviewEnd) {
        video.currentTime = clipPreviewStart;
      }
      if (timelineMode) {
        syncVideoToPlayhead();
      }
      void video.play().catch(() => {
        dispatch({ type: "SET_PLAYING", playing: false });
      });
    } else {
      video.pause();
      for (const timelineVideo of timelineVideoRefs.current.values()) timelineVideo.pause();
    }
  }, [clipPreviewEnd, clipPreviewStart, dispatch, isPlaying, previewClip?.url, previewPlacementId]);

  useEffect(() => {
    if (!isPlaying || !timelineMode) return;
    let animationFrame = 0;
    const startedAt = performance.now();
    const startPlayhead = playheadRef.current;

    function tick(nowTime: number) {
      const nextPlayhead = Math.min(
        state.timeline.totalDuration,
        startPlayhead + (nowTime - startedAt) / 1000
      );
      if (Math.abs(nextPlayhead - playheadRef.current) >= 0.1) {
        playheadRef.current = nextPlayhead;
        dispatch({ type: "SET_PLAYHEAD", seconds: nextPlayhead });
      }

      if (nextPlayhead >= state.timeline.totalDuration) {
        dispatch({ type: "SET_PLAYING", playing: false });
        return;
      }

      animationFrame = window.requestAnimationFrame(tick);
    }

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [dispatch, isPlaying, state.timeline.totalDuration, timelineMode]);

  useEffect(() => {
    if (timelineMode) return;
    setLocalPreviewTime(0);
  }, [previewClip?.id, timelineMode]);

  useEffect(() => {
    if (!isPlaying || !timelineMode || activeTimelineItem) return;
    const timer = window.setInterval(() => {
      dispatch({
        type: "SET_PLAYHEAD",
        seconds:
          state.timeline.playheadPosition >= state.timeline.totalDuration
            ? state.timeline.totalDuration
            : state.timeline.playheadPosition + 0.2
      });
      if (state.timeline.playheadPosition >= state.timeline.totalDuration) {
        dispatch({ type: "SET_PLAYING", playing: false });
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, [
    activeTimelineItem,
    dispatch,
    isPlaying,
    state.timeline.playheadPosition,
    state.timeline.totalDuration,
    timelineMode
  ]);

  function captureFrame() {
    const video = activePreviewVideo();
    if (!video || !previewClip?.url) {
      dispatch({
        type: "SHOW_TOAST",
        toast: { kind: "warning", message: "A playable video is needed to capture a frame." }
      });
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || previewClip.width;
    canvas.height = video.videoHeight || previewClip.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    onUseFrame(canvas.toDataURL("image/png"));
  }

  return (
    <section className="min-h-0 overflow-hidden border-b border-space-700 bg-space-950 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-semibold tracking-normal">
            {timelineMode ? "Timeline Preview" : previewClip ? previewClip.name : "Preview"}
          </h1>
          <p className="truncate text-xs text-muted">
            {previewClip
              ? `${previewClip.width}x${previewClip.height} - ${previewClip.duration}s - ${previewClip.fps}fps`
              : timelineMode
                ? "Move the playhead over a timeline clip"
                : "Select a clip from the gallery"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="icon-button"
            title="Skip to start"
            onClick={() => dispatch({ type: "SET_PLAYHEAD", seconds: 0 })}
          >
            <SkipBack size={16} />
          </button>
          <button
            className="icon-button"
            title={isPlaying ? "Pause" : "Play"}
            onClick={() => dispatch({ type: "SET_PLAYING" })}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            className="icon-button"
            title="Skip to end"
            onClick={() => dispatch({ type: "SET_PLAYHEAD", seconds: state.timeline.totalDuration })}
          >
            <SkipForward size={16} />
          </button>
          <button className="command-button" disabled={!clip} onClick={onEditClip}>
            <Scissors size={16} />
            Edit
          </button>
        </div>
      </div>

      <div className="grid h-[calc(100%-58px)] min-h-0 grid-cols-[minmax(0,1fr)_190px] gap-3 max-lg:grid-cols-1">
        <div className="preview-shell">
          <div
            className="visual-frame preview-stage flex min-h-0 items-start rounded-none p-4"
            data-visual={previewClip?.visual ?? "studio"}
          >
            {timelineMode ? (
              timelineItems.map((item) =>
                item.clip.url ? (
                  <video
                    key={item.placement.id}
                    ref={(node) => setTimelineVideoRef(item.placement.id, node)}
                    src={item.clip.url}
                    preload="auto"
                    playsInline
                    className={cx(
                      "preview-video transition-opacity duration-75",
                      item.placement.id === previewPlacement?.id ? "opacity-100" : "opacity-0"
                    )}
                    poster={item.clip.thumbnailUrl ?? undefined}
                    onLoadedMetadata={() => {
                      if (item.placement.id === previewPlacement?.id) syncVideoToPlayhead();
                    }}
                    onPlay={() => {
                      if (item.placement.id === previewPlacement?.id) {
                        dispatch({ type: "SET_PLAYING", playing: true });
                      }
                    }}
                    onEnded={() => {
                      if (item.placement.id === previewPlacement?.id) handleVideoEnded();
                    }}
                  />
                ) : null
              )
            ) : previewClip?.url ? (
              <video
                ref={videoRef}
                src={previewClip.url}
                preload="auto"
                playsInline
                className="preview-video"
                poster={previewClip.thumbnailUrl ?? undefined}
                onLoadedMetadata={syncVideoToPlayhead}
                onPlay={() => dispatch({ type: "SET_PLAYING", playing: true })}
                onPause={(event) => {
                  if (timelineMode) return;
                  if (!event.currentTarget.ended) {
                    dispatch({ type: "SET_PLAYING", playing: false });
                  }
                }}
                onSeeking={syncPlayheadFromVideo}
                onSeeked={syncPlayheadFromVideo}
                onTimeUpdate={syncPlayheadFromVideo}
                onEnded={handleVideoEnded}
              />
            ) : null}
            <div className="pointer-events-none relative z-10 max-w-2xl">
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-xs">
                <span className={cx("status-dot", previewClip?.status ?? "ready")} />
                {timelineMode ? "Timeline preview" : previewClip ? "Clip preview" : "No clip selected"}
              </div>
              <p className="line-clamp-2 text-sm leading-6 text-ink/90">
                {previewClip?.prompt ??
                  "Generated clips and timeline playback appear here after a prompt is submitted."}
              </p>
            </div>
          </div>
          <div className="preview-controls">
            <button
              className="icon-button h-8 w-8"
              title="Play from start"
              disabled={!canPreviewPlay}
              onClick={playPreviewFromStart}
            >
              <SkipBack size={15} />
            </button>
            <button
              className="icon-button h-8 w-8"
              title={isPlaying ? "Pause" : "Play"}
              disabled={!canPreviewPlay}
              onClick={() => dispatch({ type: "SET_PLAYING" })}
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <input
              className="w-full accent-cyanline"
              type="range"
              min={0}
              max={Math.max(0.1, previewDuration)}
              step={0.1}
              value={previewTime}
              disabled={!canPreviewPlay}
              onChange={(event) => seekPreview(Number(event.target.value))}
            />
            <span className="whitespace-nowrap font-mono text-xs text-muted">
              {formatTime(previewTime)} / {formatTime(previewDuration)}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-space-700 bg-space-900 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Clock3 size={16} className="text-cyanline" />
            Timecode
          </div>
          <div className="font-mono text-3xl">{formatTime(state.timeline.playheadPosition)}</div>
          <div className="mt-1 text-xs text-muted">of {formatTime(state.timeline.totalDuration)}</div>
          <input
            className="mt-5 w-full accent-cyanline"
            type="range"
            min={0}
            max={Math.max(0.1, state.timeline.totalDuration)}
            step={0.1}
            value={state.timeline.playheadPosition}
            onChange={(event) =>
              dispatch({ type: "SET_PLAYHEAD", seconds: Number(event.target.value) })
            }
          />
          <button className="command-button mt-4 w-full" onClick={onTogglePlay}>
            <PanelLeft size={16} />
            Queue
          </button>
          <button className="command-button mt-2 w-full" disabled={!previewClip?.url} onClick={captureFrame}>
            <ImageIcon size={16} />
            Use Frame
          </button>
        </div>
      </div>
    </section>
  );
}

function TimelinePanel({
  onAddTrack,
  onEditClip
}: {
  onAddTrack: () => void;
  onEditClip: (clipId: string, placementId?: string, trackId?: string) => void;
}) {
  const { state, dispatch } = useEditor();
  const timelineSurfaceRef = useRef<HTMLDivElement | null>(null);
  const isScrubbingTimelineRef = useRef(false);
  const clipMap = useMemo(() => new Map(state.clips.map((clip) => [clip.id, clip])), [state.clips]);
  const width = Math.max(820, (state.timeline.totalDuration + 4) * PIXELS_PER_SECOND);
  const selected = useMemo(() => {
    for (const track of state.timeline.tracks) {
      const placement = track.clips.find((clip) => clip.id === state.ui.selectedTimelineClipId);
      if (placement) {
        const clip = clipMap.get(placement.clipId);
        if (clip) return { track, placement, clip };
      }
    }
    return null;
  }, [clipMap, state.timeline.tracks, state.ui.selectedTimelineClipId]);

  function pointerSeconds(event: ReactPointerEvent<HTMLDivElement>) {
    const surface = timelineSurfaceRef.current;
    if (!surface) return state.timeline.playheadPosition;
    const rect = surface.getBoundingClientRect();
    const x = event.clientX - rect.left - 64;
    return clamp(x / PIXELS_PER_SECOND, 0, state.timeline.totalDuration);
  }

  function shouldIgnoreTimelineScrub(target: EventTarget | null) {
    return target instanceof HTMLElement
      ? Boolean(target.closest("button,input,select,textarea,.timeline-clip"))
      : true;
  }

  function handleTimelinePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (shouldIgnoreTimelineScrub(event.target)) return;
    isScrubbingTimelineRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    dispatch({ type: "SET_PLAYHEAD", seconds: pointerSeconds(event) });
  }

  function handleTimelinePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isScrubbingTimelineRef.current) return;
    dispatch({ type: "SET_PLAYHEAD", seconds: pointerSeconds(event) });
  }

  function handleTimelinePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isScrubbingTimelineRef.current) return;
    isScrubbingTimelineRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section className="grid min-h-0 grid-rows-[44px_minmax(0,1fr)_auto] overflow-hidden bg-space-900">
      <div className="flex h-11 items-center justify-between border-b border-space-700 px-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Layers3 size={16} className="text-cyanline" />
          Timeline
        </div>
        <div className="flex items-center gap-2">
          <label className="hidden items-center gap-2 text-xs text-muted md:flex">
            Current
            <input
              className="field h-8 w-20 px-2 font-mono text-xs"
              type="number"
              min={0}
              max={Math.max(0, state.timeline.totalDuration)}
              step={0.1}
              value={Number(state.timeline.playheadPosition.toFixed(1))}
              onChange={(event) =>
                dispatch({ type: "SET_PLAYHEAD", seconds: Number(event.target.value) })
              }
            />
          </label>
          <button
            className="icon-button"
            title={state.ui.isPlaying ? "Pause timeline" : "Play timeline"}
            onClick={() => dispatch({ type: "SET_PLAYING" })}
          >
            {state.ui.isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="command-button h-8 text-xs" onClick={onAddTrack}>
            <Plus size={14} />
            Add Track
          </button>
        </div>
      </div>

      <div className="overflow-auto">
        <div
          ref={timelineSurfaceRef}
          className="relative min-h-full cursor-crosshair touch-none"
          style={{ width }}
          onPointerDown={handleTimelinePointerDown}
          onPointerMove={handleTimelinePointerMove}
          onPointerUp={handleTimelinePointerEnd}
          onPointerCancel={handleTimelinePointerEnd}
        >
          <div className="timeline-ruler sticky top-0 z-10 flex h-9 items-end border-b border-space-700 pl-16">
            {Array.from({ length: Math.ceil(width / PIXELS_PER_SECOND) + 1 }).map((_, index) => (
              <div
                key={index}
                className="h-full border-l border-white/10 pl-1 pt-1 font-mono text-[11px] text-muted"
                style={{ width: PIXELS_PER_SECOND }}
              >
                {index}s
              </div>
            ))}
          </div>

          <div
            className="timeline-playhead"
            style={{ left: 64 + state.timeline.playheadPosition * PIXELS_PER_SECOND }}
          />

          {state.timeline.tracks.map((track) => (
            <TimelineTrackRow
              key={track.id}
              track={track}
              clipMap={clipMap}
              onEditClip={onEditClip}
            />
          ))}
        </div>
      </div>
      <TimelineInspector selected={selected} onEditClip={onEditClip} />
    </section>
  );
}

function TimelineTrackRow({
  track,
  clipMap,
  onEditClip
}: {
  track: TimelineTrack;
  clipMap: Map<string, Clip>;
  onEditClip: (clipId: string, placementId?: string, trackId?: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${track.id}`,
    data: { trackId: track.id }
  });
  const { state, dispatch } = useEditor();
  const canDeleteTrack = state.timeline.tracks.length > 1;

  function handleDeleteTrack() {
    if (!canDeleteTrack) return;
    if (track.clips.length > 0 && !window.confirm(`Delete ${track.name} and remove its timeline clips?`)) {
      return;
    }
    dispatch({ type: "DELETE_TRACK", trackId: track.id });
  }

  return (
    <div className="grid min-h-[78px] grid-cols-[64px_minmax(760px,1fr)] border-b border-space-700">
      <div className="flex items-center justify-center gap-1 border-r border-space-700 bg-space-950 text-xs font-semibold text-muted">
        <span>{track.name}</span>
        <button
          className={cx("icon-button h-7 w-7", !canDeleteTrack && "opacity-40")}
          title={canDeleteTrack ? `Delete ${track.name}` : "Keep at least one track"}
          disabled={!canDeleteTrack}
          onClick={handleDeleteTrack}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={cx("timeline-track-grid relative", isOver && "outline outline-1 outline-cyanline")}
      >
        {track.clips.map((placement) => {
          const clip = clipMap.get(placement.clipId);
          if (!clip) return null;
          const duration = getClipDuration(placement, clip);

          return (
            <TimelinePlacement
              key={placement.id}
              track={track}
              clip={clip}
              placement={placement}
              duration={duration}
              onEditClip={onEditClip}
            />
          );
        })}
      </div>
    </div>
  );
}

function TimelinePlacement({
  track,
  clip,
  placement,
  duration,
  onEditClip
}: {
  track: TimelineTrack;
  clip: Clip;
  placement: TimelineClip;
  duration: number;
  onEditClip: (clipId: string, placementId?: string, trackId?: string) => void;
}) {
  const { state, dispatch } = useEditor();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `placement-${placement.id}`,
    data: { placementId: placement.id, trackId: track.id }
  });
  const selected = state.ui.selectedTimelineClipId === placement.id;

  return (
    <button
      ref={setNodeRef}
      className={cx("timeline-clip text-left", selected && "ring-2 ring-cyanline", isDragging && "opacity-70")}
      style={{
        left: placement.startTime * PIXELS_PER_SECOND,
        width: duration * PIXELS_PER_SECOND,
        borderLeftColor: track.color,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined
      }}
      title="Double click to edit with prompt"
      onClick={() => dispatch({ type: "SELECT_TIMELINE_CLIP", placementId: placement.id })}
      onDoubleClick={() => onEditClip(clip.id, placement.id, track.id)}
      {...attributes}
      {...listeners}
    >
      <div className="visual-frame absolute inset-0 rounded-none opacity-70" data-visual={clip.visual} />
      <div className="relative z-[2] flex h-full flex-col justify-between p-2">
        <span className="truncate text-xs font-semibold">{clip.name}</span>
        <span className="flex items-center justify-between gap-2 font-mono text-[11px] text-ink/80">
          {duration.toFixed(1)}s
          <Trash2
            size={13}
            onClick={(event) => {
              event.stopPropagation();
              dispatch({
                type: "REMOVE_TIMELINE_CLIP",
                trackId: track.id,
                placementId: placement.id
              });
            }}
          />
        </span>
      </div>
    </button>
  );
}

function TimelineInspector({
  selected,
  onEditClip
}: {
  selected: { track: TimelineTrack; placement: TimelineClip; clip: Clip } | null;
  onEditClip: (clipId: string, placementId?: string, trackId?: string) => void;
}) {
  const { state, dispatch } = useEditor();
  if (!selected) {
    return (
      <div className="border-t border-space-700 bg-space-950 px-3 py-2 text-xs text-muted">
        Select a timeline clip for trim, split, duplicate, and prompt-edit controls.
      </div>
    );
  }

  const duration = getClipDuration(selected.placement, selected.clip);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-space-700 bg-space-950 p-3 max-lg:grid-cols-1">
      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        <label className="text-xs text-muted">
          Start: {selected.placement.startTime.toFixed(1)}s
          <input
            className="mt-1 w-full accent-cyanline"
            type="range"
            min={0}
            max={Math.max(state.timeline.totalDuration + 5, selected.placement.startTime + duration)}
            step={0.1}
            value={selected.placement.startTime}
            onChange={(event) =>
              dispatch({
                type: "MOVE_TIMELINE_CLIP",
                trackId: selected.track.id,
                placementId: selected.placement.id,
                startTime: Number(event.target.value)
              })
            }
          />
        </label>
        <label className="text-xs text-muted">
          Trim in: {selected.placement.trimStart.toFixed(1)}s
          <input
            className="mt-1 w-full accent-pulse"
            type="range"
            min={0}
            max={Math.max(0, selected.clip.duration - selected.placement.trimEnd - 0.5)}
            step={0.1}
            value={selected.placement.trimStart}
            onChange={(event) =>
              dispatch({
                type: "TRIM_TIMELINE_CLIP",
                trackId: selected.track.id,
                placementId: selected.placement.id,
                trimStart: Number(event.target.value),
                trimEnd: selected.placement.trimEnd
              })
            }
          />
        </label>
        <label className="text-xs text-muted">
          Trim out: {selected.placement.trimEnd.toFixed(1)}s
          <input
            className="mt-1 w-full accent-pulse"
            type="range"
            min={0}
            max={Math.max(0, selected.clip.duration - selected.placement.trimStart - 0.5)}
            step={0.1}
            value={selected.placement.trimEnd}
            onChange={(event) =>
              dispatch({
                type: "TRIM_TIMELINE_CLIP",
                trackId: selected.track.id,
                placementId: selected.placement.id,
                trimStart: selected.placement.trimStart,
                trimEnd: Number(event.target.value)
              })
            }
          />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <button
          className="command-button h-9 text-xs"
          onClick={() =>
            dispatch({
              type: "SPLIT_TIMELINE_CLIP",
              trackId: selected.track.id,
              placementId: selected.placement.id,
              splitTime: state.timeline.playheadPosition
            })
          }
        >
          <Scissors size={14} />
          Split
        </button>
        <button
          className="command-button h-9 text-xs"
          onClick={() =>
            dispatch({
              type: "DUPLICATE_TIMELINE_CLIP",
              trackId: selected.track.id,
              placementId: selected.placement.id
            })
          }
        >
          <Copy size={14} />
          Duplicate
        </button>
        <button
          className="command-button h-9 text-xs"
          onClick={() => onEditClip(selected.clip.id, selected.placement.id, selected.track.id)}
        >
          <Wand2 size={14} />
          Edit
        </button>
      </div>
    </div>
  );
}

function MediaGallery({ onAddClip }: { onAddClip: (clipId: string) => void }) {
  const { state, dispatch } = useEditor();

  return (
    <section className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold tracking-normal">Media Gallery</h2>
          <p className="text-xs text-muted">{state.clips.length} clips generated</p>
        </div>
        <Film size={18} className="text-cyanline" />
      </div>

      <div className="space-y-3">
        {state.clips.map((clip) => (
          <DraggableClipCard
            key={clip.id}
            clip={clip}
            selected={state.ui.selectedClipId === clip.id}
            onSelect={() => dispatch({ type: "SELECT_CLIP", clipId: clip.id })}
            onAdd={() => onAddClip(clip.id)}
            onDuplicate={() => dispatch({ type: "DUPLICATE_CLIP", clipId: clip.id })}
            onDelete={() => dispatch({ type: "DELETE_CLIP", clipId: clip.id })}
          />
        ))}
      </div>
    </section>
  );
}

function DraggableClipCard({
  clip,
  selected,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete
}: {
  clip: Clip;
  selected: boolean;
  onSelect: () => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `clip-${clip.id}`,
    data: { clipId: clip.id }
  });

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined
      }}
      className={cx(
        "rounded-lg border bg-space-950 p-2 transition",
        selected ? "border-cyanline/70" : "border-space-700",
        isDragging && "opacity-70"
      )}
    >
      <button className="block w-full text-left" onClick={onSelect}>
        <div className="visual-frame h-28 w-full" data-visual={clip.visual}>
          {clip.thumbnailUrl ? (
            <img
              src={clip.thumbnailUrl}
              alt={clip.name}
              className="absolute inset-0 z-[1] h-full w-full object-cover"
            />
          ) : clip.url ? (
            <video
              src={clip.url}
              muted
              playsInline
              preload="metadata"
              className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover"
            />
          ) : null}
          <div className="relative z-10 flex h-full items-end justify-between gap-2 p-2 text-xs font-semibold">
            <span className="rounded-md bg-black/45 px-2 py-1">{clip.duration}s</span>
            {clip.url ? (
              <span className="rounded-md bg-black/45 px-2 py-1 text-[10px] text-ink/80">Preview</span>
            ) : null}
          </div>
        </div>
        <div className="mt-2 min-w-0">
          <h3 className="truncate text-sm font-semibold">{clip.name}</h3>
          <p className="line-clamp-2 text-xs leading-5 text-muted">{clip.prompt}</p>
        </div>
      </button>
      <div className="mt-3 flex gap-2">
        <button
          className="command-button h-8 flex-1 text-xs"
          {...attributes}
          {...listeners}
          title="Drag to timeline"
        >
          <GripVertical size={14} />
          Drag
        </button>
        <button className="command-button h-8 flex-1 text-xs" onClick={onAdd}>
          <Plus size={14} />
          Add
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button className="command-button h-8 text-xs" onClick={onDuplicate}>
          <Copy size={14} />
          Copy
        </button>
        <button
          className="command-button h-8 text-xs"
          disabled={!clip.url}
          onClick={() => clip.url && window.open(clip.url, "_blank", "noopener,noreferrer")}
        >
          <Download size={14} />
          Clip
        </button>
        <button className="command-button h-8 text-xs" onClick={onDelete}>
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </article>
  );
}

function GenerationQueue({
  onAddClip,
  onRetryJob
}: {
  onAddClip: (clipId: string) => void;
  onRetryJob: (job: Job) => void;
}) {
  const { state, dispatch } = useEditor();
  const visibleJobs = state.jobs.slice(0, state.ui.isQueueOpen ? 8 : 3);

  return (
    <footer className={cx("generation-queue bg-space-950", state.ui.isQueueOpen ? "is-open" : "is-closed")}>
      <div className="flex h-14 min-w-0 items-center justify-between gap-3 border-b border-space-700 px-3">
        <button className="command-button h-9" onClick={() => dispatch({ type: "TOGGLE_QUEUE" })}>
          <ListVideo size={16} />
          Queue
          <span className="rounded-md bg-space-800 px-2 py-0.5 text-xs">{state.jobs.length}</span>
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <button className="command-button h-8 text-xs" onClick={() => dispatch({ type: "CLEAR_FINISHED_JOBS" })}>
            <Trash2 size={14} />
            Clear
          </button>
          <div className="truncate text-xs text-muted">Background generation and polling</div>
        </div>
      </div>

      {state.ui.isQueueOpen ? (
        <div className="flex min-h-0 items-stretch gap-3 overflow-auto p-3">
          {visibleJobs.length ? (
            visibleJobs.map((job) => (
              <article
                key={job.id}
                className={cx(
                  "flex min-h-[142px] w-[min(420px,calc(100vw-32px))] min-w-[300px] flex-col rounded-lg border border-space-700 bg-space-900 p-3",
                  job.status === "processing" && "pulse-active"
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-xs font-semibold">
                    <span className={cx("status-dot", job.status)} />
                    <span className="truncate">{job.id}</span>
                  </span>
                  <span className="rounded-md border border-space-700 px-2 py-1 text-[11px] text-muted">
                    {job.status}
                  </span>
                </div>
                <p className="line-clamp-2 min-h-10 text-xs leading-5 text-muted">{job.prompt}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-space-700">
                  <div
                    className={cx(
                      "h-full rounded-full",
                      job.status === "failed" ? "bg-danger" : "bg-cyanline"
                    )}
                    style={{ width: `${Math.round(job.progress * 100)}%` }}
                  />
                </div>
                <div className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 pt-3">
                  <span className="font-mono text-[11px] text-muted">
                    {Math.round(job.progress * 100)}%
                  </span>
                  <div className="flex min-w-0 items-center justify-end gap-2">
                    {job.resultClipId ? (
                      <button
                        className="command-button queue-action-button"
                        onClick={() => onAddClip(job.resultClipId as string)}
                      >
                        <Plus size={14} />
                        Timeline
                      </button>
                    ) : null}
                    {["pending", "queued", "processing"].includes(job.status) ? (
                      <button
                        className="command-button queue-action-button"
                        onClick={() => dispatch({ type: "CANCEL_JOB", jobId: job.id })}
                      >
                        <X size={14} />
                        Cancel
                      </button>
                    ) : null}
                    {job.status === "failed" || job.status === "cancelled" || job.status === "timed_out" ? (
                      <button className="command-button queue-action-button" onClick={() => onRetryJob(job)}>
                        <Wand2 size={14} />
                        Retry
                      </button>
                    ) : null}
                    <button
                      className="icon-button queue-icon-button"
                      title="Delete job"
                      onClick={() => dispatch({ type: "DELETE_JOB", jobId: job.id })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {job.error ? (
                  <div className="mt-2 flex gap-2 text-xs text-danger">
                    <AlertTriangle size={14} />
                    <span className="line-clamp-2">{job.error}</span>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="flex min-h-[120px] min-w-full items-center justify-center rounded-lg border border-dashed border-space-700 text-sm text-muted">
              No jobs yet
            </div>
          )}
        </div>
      ) : null}
    </footer>
  );
}

function ExportModal() {
  const { state, dispatch } = useEditor();
  const [format, setFormat] = useState("mp4");
  const [quality, setQuality] = useState("medium");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  const manifest = useMemo(() => {
    const clipMap = new Map(state.clips.map((clip) => [clip.id, clip]));
    return {
      project: state.project,
      totalDuration: state.timeline.totalDuration,
      format,
      quality,
      includeAudio,
      clips: state.timeline.tracks.flatMap((track) =>
        track.clips.map((placement) => {
          const clip = clipMap.get(placement.clipId);
          return {
            trackId: track.id,
            trackName: track.name,
            placementId: placement.id,
            clipId: placement.clipId,
            name: clip?.name ?? "Missing clip",
            url: clip?.url,
            prompt: clip?.prompt,
            startTime: placement.startTime,
            trimStart: placement.trimStart,
            trimEnd: placement.trimEnd,
            duration: clip ? getClipDuration(placement, clip) : 0
          };
        })
      )
    };
  }, [format, includeAudio, quality, state.clips, state.project, state.timeline]);

  async function copyUrls() {
    const urls = state.clips.map((clip) => clip.url).filter(Boolean).join("\n");
    await copyText(urls || "No hosted clip URLs available yet.");
    dispatch({
      type: "SHOW_TOAST",
      toast: { kind: "success", message: "Clip URLs copied." }
    });
  }

  async function stitchTimeline() {
    const timelineClips = manifest.clips.filter((clip) => clip.url);
    if (!timelineClips.length) {
      dispatch({
        type: "SHOW_TOAST",
        toast: { kind: "warning", message: "No hosted video URLs are available for stitching." }
      });
      return;
    }

    setRendering(true);
    setRenderProgress(0.05);
    try {
      const [{ FFmpeg }, { fetchFile }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util")
      ]);
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress }) => setRenderProgress(Math.max(0.05, progress)));
      await ffmpeg.load();

      const sorted = timelineClips.sort((a, b) => a.startTime - b.startTime);
      const extension = format === "webm" ? "webm" : "mp4";
      const list = sorted
        .map((clip, index) => {
          const fileName = `clip_${index}.${extension}`;
          return `file '${fileName}'`;
        })
        .join("\n");

      for (const [index, clip] of sorted.entries()) {
        await ffmpeg.writeFile(`clip_${index}.${extension}`, await fetchFile(clip.url as string));
        setRenderProgress((index + 1) / Math.max(sorted.length * 2, 1));
      }

      await ffmpeg.writeFile("clips.txt", list);
      await ffmpeg.exec([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "clips.txt",
        includeAudio ? "-c" : "-an",
        includeAudio ? "copy" : "",
        `output.${extension}`
      ].filter(Boolean));

      const data = await ffmpeg.readFile(`output.${extension}`);
      const binary =
        typeof data === "string"
          ? new TextEncoder().encode(data)
          : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      const arrayBuffer = new ArrayBuffer(binary.byteLength);
      new Uint8Array(arrayBuffer).set(binary);
      const blob = new Blob([arrayBuffer], { type: extension === "webm" ? "video/webm" : "video/mp4" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${state.project.name || "hyperce-export"}.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
      setRenderProgress(1);
      dispatch({
        type: "SHOW_TOAST",
        toast: { kind: "success", message: "Stitched video exported." }
      });
    } catch (error) {
      dispatch({
        type: "SHOW_TOAST",
        toast: {
          kind: "danger",
          message: error instanceof Error ? error.message : "Could not stitch video."
        }
      });
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-3xl rounded-lg border border-space-700 bg-space-900 shadow-panel">
        <header className="flex items-center justify-between border-b border-space-700 p-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-normal">Export</h2>
            <p className="text-sm text-muted">Timeline manifest, clip URLs, and separate clip downloads.</p>
          </div>
          <button className="icon-button" onClick={() => dispatch({ type: "TOGGLE_EXPORT", open: false })} title="Close">
            <X size={16} />
          </button>
        </header>

        <div className="grid gap-4 p-4 md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-3">
            <label className="space-y-1 text-xs text-muted">
              Format
              <select className="field h-10 px-3 text-sm" value={format} onChange={(event) => setFormat(event.target.value)}>
                <option value="mp4">MP4</option>
                <option value="webm">WebM</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted">
              Quality
              <select className="field h-10 px-3 text-sm" value={quality} onChange={(event) => setQuality(event.target.value)}>
                <option value="low">Low 720p</option>
                <option value="medium">Medium 1080p</option>
                <option value="high">High bitrate</option>
              </select>
            </label>
            <label className="flex items-center justify-between rounded-lg border border-space-700 bg-space-950 p-3 text-sm">
              Include audio
              <input
                type="checkbox"
                className="accent-cyanline"
                checked={includeAudio}
                onChange={(event) => setIncludeAudio(event.target.checked)}
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-space-700 bg-space-950 p-3">
              <div className="font-mono text-2xl">{formatTime(state.timeline.totalDuration)}</div>
              <div className="mt-1 text-xs text-muted">
                {manifest.clips.length} timeline placements across {state.timeline.tracks.length} tracks
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
              <button
                className="command-button command-primary h-10"
                onClick={() => downloadJson(`${state.project.name || "hyperce"}-manifest.json`, manifest)}
              >
                <FileJson size={16} />
                Export Manifest
              </button>
              <button className="command-button h-10" onClick={copyUrls}>
                <Clipboard size={16} />
                Copy URLs
              </button>
              <button
                className="command-button h-10"
                disabled={rendering}
                onClick={stitchTimeline}
              >
                {rendering ? <Loader2 size={16} className="animate-spin" /> : <Film size={16} />}
                Stitch Video
              </button>
              <button
                className="command-button h-10"
                onClick={() => downloadJson(`${state.project.name || "hyperce"}.soraproject`, state)}
              >
                <Download size={16} />
                Project File
              </button>
            </div>
            {rendering ? (
              <div className="h-2 overflow-hidden rounded-full bg-space-700">
                <div className="h-full rounded-full bg-cyanline" style={{ width: `${Math.round(renderProgress * 100)}%` }} />
              </div>
            ) : null}
            <div className="rounded-lg border border-space-700 bg-space-950 p-3 text-xs leading-5 text-muted">
              Browser-side stitching uses FFmpeg.wasm and requires generated clips with fetchable video URLs and compatible
              codecs. The manifest export is always available and preserves clip timing for external finishing.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toast() {
  const { state } = useEditor();
  if (!state.ui.toast) return null;
  return (
    <div
      className={cx(
        "fixed bottom-4 right-4 z-[60] max-w-sm rounded-lg border bg-space-900 px-4 py-3 text-sm shadow-panel",
        state.ui.toast.kind === "success" && "border-mint/50",
        state.ui.toast.kind === "warning" && "border-ember/60",
        state.ui.toast.kind === "danger" && "border-danger/60",
        state.ui.toast.kind === "info" && "border-cyanline/50"
      )}
    >
      {state.ui.toast.message}
    </div>
  );
}

function OfflineBanner() {
  return (
    <div className="fixed left-1/2 top-16 z-[60] -translate-x-1/2 rounded-lg border border-ember/60 bg-space-900 px-4 py-2 text-sm shadow-panel">
      No internet connection. Generation requests will stay paused until the connection returns.
    </div>
  );
}

function ClipEditModal({
  clipId,
  placementId,
  trackId,
  onClose
}: {
  clipId: string;
  placementId?: string;
  trackId?: string;
  onClose: () => void;
}) {
  const { state, dispatch } = useEditor();
  const clip = state.clips.find((item) => item.id === clipId);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(Math.min(4, clip?.duration ?? 4));
  const [editPrompt, setEditPrompt] = useState("Replace this moment with dramatic storm clouds and lightning flashes.");

  if (!clip) return null;
  const activeClip = clip;

  function submitEdit() {
    const settings: GenerationSettings = {
      ...activeClip.settings,
      duration: Math.max(1, rangeEnd - rangeStart)
    };
    const jobId = createId("job");
    const job: Job = {
      id: jobId,
      type: "clip_edit",
      prompt: editPrompt,
      status: "processing",
      progress: 0.25,
      soraJobId: null,
      resultClipId: null,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      settings
    };
    const result = createClipFromPrompt(editPrompt, settings, jobId);
    result.name = `${activeClip.name} edit`;
    result.editHistory = [
      ...activeClip.editHistory,
      {
        id: createId("edit"),
        editPrompt,
        rangeStart,
        rangeEnd,
        resultClipId: result.id,
        createdAt: new Date().toISOString()
      }
    ];
    dispatch({ type: "SUBMIT_JOB", job });
    window.setTimeout(() => {
      if (placementId && trackId) {
        dispatch({
          type: "REPLACE_TIMELINE_SEGMENT",
          trackId,
          placementId,
          resultClip: result,
          rangeStart,
          rangeEnd,
          editPrompt
        });
      } else {
        dispatch({ type: "COMPLETE_JOB", jobId, clip: result });
      }
      dispatch({
        type: "SHOW_TOAST",
        toast: { kind: "success", message: "Prompt edit generated." }
      });
    }, 1200);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-3xl rounded-lg border border-space-700 bg-space-900 shadow-panel">
        <header className="flex items-center justify-between border-b border-space-700 p-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-normal">Edit Clip</h2>
            <p className="text-sm text-muted">{activeClip.name}</p>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </header>

        <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="visual-frame min-h-64" data-visual={activeClip.visual}>
            <div className="relative z-10 flex h-full items-end p-4">
              <p className="line-clamp-3 text-sm leading-6">{activeClip.prompt}</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block space-y-2 text-xs text-muted">
              Range start: {rangeStart.toFixed(1)}s
              <input
                className="w-full accent-cyanline"
                type="range"
                min={0}
                max={activeClip.duration}
                step={0.1}
                value={rangeStart}
                onChange={(event) =>
                  setRangeStart(Math.min(Number(event.target.value), rangeEnd - 0.5))
                }
              />
            </label>
            <label className="block space-y-2 text-xs text-muted">
              Range end: {rangeEnd.toFixed(1)}s
              <input
                className="w-full accent-pulse"
                type="range"
                min={0.5}
                max={activeClip.duration}
                step={0.1}
                value={rangeEnd}
                onChange={(event) =>
                  setRangeEnd(Math.max(Number(event.target.value), rangeStart + 0.5))
                }
              />
            </label>
            <textarea
              className="field min-h-32 resize-none p-3 text-sm leading-6"
              value={editPrompt}
              onChange={(event) => setEditPrompt(event.target.value)}
            />
            <button className="command-button command-primary w-full" onClick={submitEdit}>
              <Wand2 size={16} />
              Generate Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
