"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";
import { defaultGenerationSettings } from "@/lib/presets";
import { loadJson, saveJson } from "@/lib/storage";
import type {
  AppState,
  ApiConfig,
  Clip,
  GenerationSettings,
  Job,
  ProjectState,
  SavedPrompt,
  TimelineClip,
  TimelineState,
  TimelineTrack,
  UiState
} from "@/lib/types";

const STORAGE_KEY = "sora_editor_state_v3";

type EditorAction =
  | { type: "HYDRATE"; state: AppState }
  | { type: "SET_ACTIVE_TAB"; tab: UiState["activeTab"] }
  | { type: "UPDATE_API_CONFIG"; config: Partial<ApiConfig> }
  | { type: "UPDATE_PROJECT"; project: Partial<ProjectState> }
  | { type: "UPDATE_GENERATION_SETTINGS"; settings: Partial<GenerationSettings> }
  | { type: "SUBMIT_JOB"; job: Job }
  | { type: "UPDATE_JOB"; jobId: string; patch: Partial<Job> }
  | { type: "COMPLETE_JOB"; jobId: string; clip: Clip }
  | { type: "FAIL_JOB"; jobId: string; error: string }
  | { type: "CANCEL_JOB"; jobId: string }
  | { type: "DELETE_JOB"; jobId: string }
  | { type: "CLEAR_FINISHED_JOBS" }
  | { type: "SELECT_CLIP"; clipId: string | null }
  | { type: "SELECT_TIMELINE_CLIP"; placementId: string | null }
  | { type: "DELETE_CLIP"; clipId: string }
  | { type: "DUPLICATE_CLIP"; clipId: string }
  | { type: "ADD_CLIP_TO_TIMELINE"; trackId: string; placement: TimelineClip }
  | { type: "REMOVE_TIMELINE_CLIP"; trackId: string; placementId: string }
  | { type: "MOVE_TIMELINE_CLIP"; trackId: string; placementId: string; startTime: number; toTrackId?: string }
  | { type: "TRIM_TIMELINE_CLIP"; trackId: string; placementId: string; trimStart: number; trimEnd: number }
  | { type: "DUPLICATE_TIMELINE_CLIP"; trackId: string; placementId: string }
  | { type: "SPLIT_TIMELINE_CLIP"; trackId: string; placementId: string; splitTime: number }
  | {
      type: "REPLACE_TIMELINE_SEGMENT";
      trackId: string;
      placementId: string;
      resultClip: Clip;
      rangeStart: number;
      rangeEnd: number;
      editPrompt: string;
    }
  | { type: "SET_PLAYHEAD"; seconds: number }
  | { type: "SET_PLAYING"; playing?: boolean }
  | { type: "TOGGLE_QUEUE"; open?: boolean }
  | { type: "TOGGLE_EXPORT"; open?: boolean }
  | { type: "SHOW_TOAST"; toast: UiState["toast"] }
  | { type: "SAVE_PROMPT"; prompt: SavedPrompt }
  | { type: "DELETE_PROMPT"; promptId: string }
  | { type: "DUPLICATE_PROMPT"; promptId: string }
  | { type: "UPDATE_PROMPT"; promptId: string; patch: Partial<SavedPrompt> }
  | { type: "ADD_TRACK"; track: TimelineTrack }
  | { type: "DELETE_TRACK"; trackId: string }
  | { type: "MARK_SAVED" }
  | { type: "NEW_PROJECT"; state: AppState }
  | { type: "UNDO" }
  | { type: "REDO" };

interface EditorContextValue {
  state: AppState;
  dispatch: React.Dispatch<EditorAction>;
  canUndo: boolean;
  canRedo: boolean;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function createId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${random}`;
}

function now() {
  return new Date().toISOString();
}

function normalizeGenerationDuration(duration: number | undefined) {
  const allowed = [4, 8, 12];
  const requested = duration ?? 4;
  return allowed.reduce((best, value) =>
    Math.abs(value - requested) < Math.abs(best - requested) ? value : best
  );
}

function dimsFor(settings: GenerationSettings) {
  const landscape = settings.aspectRatio === "16:9";
  const portrait = settings.aspectRatio === "9:16";
  const square = settings.aspectRatio === "1:1";
  const base =
    settings.resolution === "1080p" ? 1080 : settings.resolution === "720p" ? 720 : 480;

  if (square) return { width: base, height: base };
  if (portrait) return { width: Math.round((base * 9) / 16), height: base };
  if (landscape) return { width: Math.round((base * 16) / 9), height: base };
  return { width: Math.round((base * 4) / 3), height: base };
}

export function createClipFromPrompt(
  prompt: string,
  settings: GenerationSettings,
  jobId: string,
  url: string | null = null
): Clip {
  const visualPool: Clip["visual"][] = ["neon", "alpine", "studio", "ocean", "forest", "ember"];
  const visual = visualPool[Math.abs(prompt.length + jobId.length) % visualPool.length];
  const dimensions = dimsFor(settings);

  return {
    id: createId("clip"),
    name: prompt
      .split(" ")
      .slice(0, 5)
      .join(" ")
      .replace(/[^\w\s-]/g, "") || "Generated clip",
    url,
    thumbnailUrl: null,
    duration: settings.duration,
    width: dimensions.width,
    height: dimensions.height,
    fps: settings.fps,
    prompt,
    settings,
    status: "ready",
    editHistory: [],
    jobId,
    createdAt: now(),
    visual
  };
}

function calculateTimelineDuration(timeline: TimelineState, clips: Clip[]) {
  const clipMap = new Map(clips.map((clip) => [clip.id, clip]));
  return timeline.tracks.reduce((max, track) => {
    const trackMax = track.clips.reduce((innerMax, placement) => {
      const source = clipMap.get(placement.clipId);
      if (!source) return innerMax;
      const duration = Math.max(0.5, source.duration - placement.trimStart - placement.trimEnd);
      return Math.max(innerMax, placement.startTime + duration);
    }, 0);
    return Math.max(max, trackMax);
  }, 0);
}

function rebuildTimelineDuration(state: AppState): AppState {
  return {
    ...state,
    timeline: {
      ...state.timeline,
      totalDuration: calculateTimelineDuration(state.timeline, state.clips)
    }
  };
}

function getTimelineClipDuration(placement: TimelineClip, source: Clip) {
  return Math.max(0.5, source.duration - placement.trimStart - placement.trimEnd);
}

function findTrackForPlacement(timeline: TimelineState, placementId: string | null) {
  if (!placementId) return null;
  return timeline.tracks.find((track) => track.clips.some((clip) => clip.id === placementId)) ?? null;
}

function duplicateClip(source: Clip): Clip {
  return {
    ...source,
    id: createId("clip"),
    name: `${source.name} copy`,
    createdAt: now(),
    jobId: source.jobId === "demo" ? "demo" : createId("job"),
    editHistory: [...source.editHistory]
  };
}

function normalizeState(state: AppState): AppState {
  const fallback = buildInitialState();
  const hasActiveJobs = (state.jobs ?? []).some((job) =>
    ["pending", "queued", "processing"].includes(job.status)
  );
  return {
    ...fallback,
    ...state,
    apiConfig: { ...fallback.apiConfig, ...state.apiConfig },
    project: { ...fallback.project, ...state.project },
    timeline: { ...fallback.timeline, ...state.timeline },
    ui: {
      ...fallback.ui,
      ...state.ui,
      isQueueOpen: hasActiveJobs ? (state.ui?.isQueueOpen ?? fallback.ui.isQueueOpen) : false,
      generationSettings: {
        ...fallback.ui.generationSettings,
        ...state.ui?.generationSettings,
        duration: normalizeGenerationDuration(state.ui?.generationSettings?.duration)
      }
    }
  };
}

export function buildInitialState(): AppState {
  const createdAt = now();

  return {
    apiConfig: {
      apiKey: "",
      useProxy: true,
      proxyUrl: "/api/sora",
      mockMode: false,
      connectionStatus: "unknown"
    },
    project: {
      id: createId("proj"),
      name: "Untitled Hyperce Cut",
      createdAt,
      updatedAt: createdAt,
      saveStatus: "saved"
    },
    clips: [],
    timeline: {
      tracks: [
        {
          id: "track_v1",
          name: "V1",
          color: "#58BCCB",
          clips: []
        }
      ],
      totalDuration: 0,
      playheadPosition: 0
    },
    jobs: [],
    promptLibrary: [],
    ui: {
      activeTab: "generate",
      selectedClipId: null,
      selectedTimelineClipId: null,
      isPlaying: false,
      isQueueOpen: false,
      isExportOpen: false,
      toast: null,
      generationSettings: defaultGenerationSettings
    }
  };
}

function markUnsaved(state: AppState): AppState {
  return {
    ...state,
    project: {
      ...state.project,
      updatedAt: now(),
      saveStatus: "unsaved"
    }
  };
}

export function editorReducer(state: AppState, action: EditorAction): AppState {
  switch (action.type) {
    case "HYDRATE":
      return normalizeState(action.state);
    case "SET_ACTIVE_TAB":
      return { ...state, ui: { ...state.ui, activeTab: action.tab } };
    case "UPDATE_API_CONFIG":
      return markUnsaved({
        ...state,
        apiConfig: { ...state.apiConfig, ...action.config }
      });
    case "UPDATE_PROJECT":
      return markUnsaved({
        ...state,
        project: { ...state.project, ...action.project }
      });
    case "UPDATE_GENERATION_SETTINGS":
      return {
        ...state,
        ui: {
          ...state.ui,
          generationSettings: {
            ...state.ui.generationSettings,
            ...action.settings,
            duration:
              action.settings.duration === undefined
                ? state.ui.generationSettings.duration
                : normalizeGenerationDuration(action.settings.duration)
          }
        }
      };
    case "SUBMIT_JOB":
      return markUnsaved({
        ...state,
        jobs: [action.job, ...state.jobs],
        ui: { ...state.ui, isQueueOpen: true }
      });
    case "UPDATE_JOB":
      return {
        ...state,
        jobs: state.jobs.map((job) =>
          job.id === action.jobId ? { ...job, ...action.patch } : job
        )
      };
    case "COMPLETE_JOB": {
      const clips = [action.clip, ...state.clips];
      const timeline = {
        ...state.timeline,
        totalDuration: calculateTimelineDuration(state.timeline, clips)
      };
      return markUnsaved({
        ...state,
        clips,
        timeline,
        jobs: state.jobs.map((job) =>
          job.id === action.jobId
            ? {
                ...job,
                status: "completed",
                progress: 1,
                completedAt: now(),
                resultClipId: action.clip.id
              }
            : job
        ),
        ui: { ...state.ui, selectedClipId: action.clip.id }
      });
    }
    case "FAIL_JOB":
      return {
        ...state,
        jobs: state.jobs.map((job) =>
          job.id === action.jobId
            ? { ...job, status: "failed", error: action.error, completedAt: now() }
            : job
        )
      };
    case "CANCEL_JOB":
      return markUnsaved({
        ...state,
        jobs: state.jobs.map((job) =>
          job.id === action.jobId && ["pending", "queued", "processing"].includes(job.status)
            ? { ...job, status: "cancelled", completedAt: now(), error: "Cancelled by user." }
            : job
        )
      });
    case "DELETE_JOB":
      return markUnsaved({
        ...state,
        jobs: state.jobs.filter((job) => job.id !== action.jobId)
      });
    case "CLEAR_FINISHED_JOBS":
      return markUnsaved({
        ...state,
        jobs: state.jobs.filter((job) => ["pending", "queued", "processing"].includes(job.status))
      });
    case "SELECT_CLIP":
      return { ...state, ui: { ...state.ui, selectedClipId: action.clipId, selectedTimelineClipId: null } };
    case "SELECT_TIMELINE_CLIP": {
      const track = findTrackForPlacement(state.timeline, action.placementId);
      const placement = track?.clips.find((clip) => clip.id === action.placementId);
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedTimelineClipId: action.placementId,
          selectedClipId: placement?.clipId ?? state.ui.selectedClipId
        }
      };
    }
    case "DELETE_CLIP": {
      const clips = state.clips.filter((clip) => clip.id !== action.clipId);
      const timeline = {
        ...state.timeline,
        tracks: state.timeline.tracks.map((track) => ({
          ...track,
          clips: track.clips.filter((placement) => placement.clipId !== action.clipId)
        }))
      };
      return markUnsaved(
        rebuildTimelineDuration({
          ...state,
          clips,
          timeline,
          ui: {
            ...state.ui,
            selectedClipId: state.ui.selectedClipId === action.clipId ? clips[0]?.id ?? null : state.ui.selectedClipId,
            selectedTimelineClipId: timeline.tracks.some((track) =>
              track.clips.some((placement) => placement.id === state.ui.selectedTimelineClipId)
            )
              ? state.ui.selectedTimelineClipId
              : null
          }
        })
      );
    }
    case "DUPLICATE_CLIP": {
      const source = state.clips.find((clip) => clip.id === action.clipId);
      if (!source) return state;
      const copy = duplicateClip(source);
      return markUnsaved({
        ...state,
        clips: [copy, ...state.clips],
        ui: { ...state.ui, selectedClipId: copy.id }
      });
    }
    case "ADD_CLIP_TO_TIMELINE": {
      const timeline = {
        ...state.timeline,
        tracks: state.timeline.tracks.map((track) =>
          track.id === action.trackId
            ? { ...track, clips: [...track.clips, action.placement] }
            : track
        )
      };
      return markUnsaved({
        ...state,
        timeline: {
          ...timeline,
          totalDuration: calculateTimelineDuration(timeline, state.clips)
        },
        ui: {
          ...state.ui,
          selectedClipId: action.placement.clipId,
          selectedTimelineClipId: action.placement.id
        }
      });
    }
    case "REMOVE_TIMELINE_CLIP": {
      const timeline = {
        ...state.timeline,
        tracks: state.timeline.tracks.map((track) =>
          track.id === action.trackId
            ? {
                ...track,
                clips: track.clips.filter((clip) => clip.id !== action.placementId)
              }
            : track
        )
      };
      return markUnsaved({
        ...state,
        timeline: {
          ...timeline,
          totalDuration: calculateTimelineDuration(timeline, state.clips)
        }
      });
    }
    case "MOVE_TIMELINE_CLIP": {
      const fromTrack = state.timeline.tracks.find((track) => track.id === action.trackId);
      const placement = fromTrack?.clips.find((clip) => clip.id === action.placementId);
      if (!fromTrack || !placement) return state;
      const toTrackId = action.toTrackId ?? action.trackId;
      const moved = { ...placement, startTime: Math.max(0, action.startTime) };
      const timeline = {
        ...state.timeline,
        tracks: state.timeline.tracks.map((track) => {
          if (track.id === action.trackId && track.id === toTrackId) {
            return {
              ...track,
              clips: track.clips.map((clip) => (clip.id === action.placementId ? moved : clip))
            };
          }
          if (track.id === action.trackId) {
            return {
              ...track,
              clips: track.clips.filter((clip) => clip.id !== action.placementId)
            };
          }
          if (track.id === toTrackId) {
            return {
              ...track,
              clips: [...track.clips, moved]
            };
          }
          return track;
        })
      };
      return markUnsaved(
        rebuildTimelineDuration({
          ...state,
          timeline,
          ui: { ...state.ui, selectedTimelineClipId: action.placementId, selectedClipId: moved.clipId }
        })
      );
    }
    case "TRIM_TIMELINE_CLIP": {
      const sourcePlacement = state.timeline.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === action.placementId);
      const sourceClip = state.clips.find((clip) => clip.id === sourcePlacement?.clipId);
      if (!sourceClip) return state;
      const trimStart = Math.max(0, Math.min(action.trimStart, sourceClip.duration - 0.5));
      const trimEnd = Math.max(0, Math.min(action.trimEnd, sourceClip.duration - trimStart - 0.5));
      const timeline = {
        ...state.timeline,
        tracks: state.timeline.tracks.map((track) =>
          track.id === action.trackId
            ? {
                ...track,
                clips: track.clips.map((placement) =>
                  placement.id === action.placementId
                    ? { ...placement, trimStart, trimEnd }
                    : placement
                )
              }
            : track
        )
      };
      return markUnsaved(rebuildTimelineDuration({ ...state, timeline }));
    }
    case "DUPLICATE_TIMELINE_CLIP": {
      const track = state.timeline.tracks.find((item) => item.id === action.trackId);
      const placement = track?.clips.find((item) => item.id === action.placementId);
      const sourceClip = state.clips.find((clip) => clip.id === placement?.clipId);
      if (!track || !placement || !sourceClip) return state;
      const nextStart = placement.startTime + getTimelineClipDuration(placement, sourceClip);
      const duplicate = { ...placement, id: createId("place"), startTime: nextStart };
      const timeline = {
        ...state.timeline,
        tracks: state.timeline.tracks.map((item) =>
          item.id === action.trackId ? { ...item, clips: [...item.clips, duplicate] } : item
        )
      };
      return markUnsaved(
        rebuildTimelineDuration({
          ...state,
          timeline,
          ui: { ...state.ui, selectedTimelineClipId: duplicate.id, selectedClipId: duplicate.clipId }
        })
      );
    }
    case "SPLIT_TIMELINE_CLIP": {
      const track = state.timeline.tracks.find((item) => item.id === action.trackId);
      const placement = track?.clips.find((item) => item.id === action.placementId);
      const sourceClip = state.clips.find((clip) => clip.id === placement?.clipId);
      if (!track || !placement || !sourceClip) return state;
      const duration = getTimelineClipDuration(placement, sourceClip);
      const relativeSplit = action.splitTime - placement.startTime;
      if (relativeSplit <= 0.2 || relativeSplit >= duration - 0.2) return state;
      const left: TimelineClip = {
        ...placement,
        trimEnd: sourceClip.duration - placement.trimStart - relativeSplit
      };
      const right: TimelineClip = {
        ...placement,
        id: createId("place"),
        startTime: action.splitTime,
        trimStart: placement.trimStart + relativeSplit
      };
      const timeline = {
        ...state.timeline,
        tracks: state.timeline.tracks.map((item) =>
          item.id === action.trackId
            ? {
                ...item,
                clips: item.clips.flatMap((clip) =>
                  clip.id === action.placementId ? [left, right] : [clip]
                )
              }
            : item
        )
      };
      return markUnsaved(
        rebuildTimelineDuration({
          ...state,
          timeline,
          ui: { ...state.ui, selectedTimelineClipId: right.id, selectedClipId: right.clipId }
        })
      );
    }
    case "REPLACE_TIMELINE_SEGMENT": {
      const sourceTrack = state.timeline.tracks.find((track) => track.id === action.trackId);
      const sourcePlacement = sourceTrack?.clips.find((clip) => clip.id === action.placementId);
      const sourceClip = state.clips.find((clip) => clip.id === sourcePlacement?.clipId);
      if (!sourceTrack || !sourcePlacement || !sourceClip) {
        return editorReducer(state, { type: "COMPLETE_JOB", jobId: action.resultClip.jobId, clip: action.resultClip });
      }
      const clipDuration = getTimelineClipDuration(sourcePlacement, sourceClip);
      const rangeStart = Math.max(0, Math.min(action.rangeStart, clipDuration));
      const rangeEnd = Math.max(rangeStart + 0.5, Math.min(action.rangeEnd, clipDuration));
      const beforeDuration = rangeStart;
      const afterDuration = Math.max(0, clipDuration - rangeEnd);
      const parts: TimelineClip[] = [];
      if (beforeDuration > 0.2) {
        parts.push({
          ...sourcePlacement,
          id: createId("place"),
          trimEnd: sourceClip.duration - sourcePlacement.trimStart - beforeDuration
        });
      }
      parts.push({
        id: createId("place"),
        clipId: action.resultClip.id,
        startTime: sourcePlacement.startTime + rangeStart,
        trimStart: 0,
        trimEnd: 0
      });
      if (afterDuration > 0.2) {
        parts.push({
          ...sourcePlacement,
          id: createId("place"),
          startTime: sourcePlacement.startTime + rangeEnd,
          trimStart: sourcePlacement.trimStart + rangeEnd,
          trimEnd: sourcePlacement.trimEnd
        });
      }
      const editedOriginal: Clip = {
        ...sourceClip,
        editHistory: [
          ...sourceClip.editHistory,
          {
            id: createId("edit"),
            editPrompt: action.editPrompt,
            rangeStart,
            rangeEnd,
            resultClipId: action.resultClip.id,
            createdAt: now()
          }
        ]
      };
      const clips = [action.resultClip, ...state.clips.map((clip) => (clip.id === editedOriginal.id ? editedOriginal : clip))];
      const timeline = {
        ...state.timeline,
        tracks: state.timeline.tracks.map((track) =>
          track.id === action.trackId
            ? {
                ...track,
                clips: track.clips.flatMap((clip) =>
                  clip.id === action.placementId ? parts : [clip]
                )
              }
            : track
        )
      };
      return markUnsaved(
        rebuildTimelineDuration({
          ...state,
          clips,
          timeline,
          ui: {
            ...state.ui,
            selectedClipId: action.resultClip.id,
            selectedTimelineClipId: parts.find((part) => part.clipId === action.resultClip.id)?.id ?? null
          },
          jobs: state.jobs.map((job) =>
            job.id === action.resultClip.jobId
              ? {
                  ...job,
                  status: "completed",
                  progress: 1,
                  completedAt: now(),
                  resultClipId: action.resultClip.id
                }
              : job
          )
        })
      );
    }
    case "SET_PLAYHEAD":
      return {
        ...state,
        timeline: {
          ...state.timeline,
          playheadPosition: Math.max(0, Math.min(action.seconds, state.timeline.totalDuration || 0))
        }
      };
    case "SET_PLAYING":
      return {
        ...state,
        ui: {
          ...state.ui,
          isPlaying: action.playing ?? !state.ui.isPlaying
        }
      };
    case "TOGGLE_QUEUE":
      return {
        ...state,
        ui: {
          ...state.ui,
          isQueueOpen: action.open ?? !state.ui.isQueueOpen
        }
      };
    case "TOGGLE_EXPORT":
      return {
        ...state,
        ui: {
          ...state.ui,
          isExportOpen: action.open ?? !state.ui.isExportOpen
        }
      };
    case "SHOW_TOAST":
      return {
        ...state,
        ui: {
          ...state.ui,
          toast: action.toast
        }
      };
    case "SAVE_PROMPT":
      return markUnsaved({
        ...state,
        promptLibrary: [action.prompt, ...state.promptLibrary]
      });
    case "DELETE_PROMPT":
      return markUnsaved({
        ...state,
        promptLibrary: state.promptLibrary.filter((prompt) => prompt.id !== action.promptId)
      });
    case "DUPLICATE_PROMPT": {
      const prompt = state.promptLibrary.find((item) => item.id === action.promptId);
      if (!prompt) return state;
      return markUnsaved({
        ...state,
        promptLibrary: [
          {
            ...prompt,
            id: createId("prompt"),
            usageCount: 0,
            createdAt: now()
          },
          ...state.promptLibrary
        ]
      });
    }
    case "UPDATE_PROMPT":
      return markUnsaved({
        ...state,
        promptLibrary: state.promptLibrary.map((prompt) =>
          prompt.id === action.promptId ? { ...prompt, ...action.patch } : prompt
        )
      });
    case "ADD_TRACK": {
      const timeline = {
        ...state.timeline,
        tracks: [...state.timeline.tracks, action.track]
      };
      return markUnsaved({
        ...state,
        timeline
      });
    }
    case "DELETE_TRACK": {
      if (state.timeline.tracks.length <= 1) return state;
      const removedTrack = state.timeline.tracks.find((track) => track.id === action.trackId);
      const selectedPlacementWasRemoved = removedTrack?.clips.some(
        (clip) => clip.id === state.ui.selectedTimelineClipId
      );
      const timeline = {
        ...state.timeline,
        tracks: state.timeline.tracks.filter((track) => track.id !== action.trackId)
      };
      return markUnsaved(
        rebuildTimelineDuration({
          ...state,
          timeline,
          ui: selectedPlacementWasRemoved
            ? { ...state.ui, selectedTimelineClipId: null }
            : state.ui
        })
      );
    }
    case "MARK_SAVED":
      return {
        ...state,
        project: {
          ...state.project,
          updatedAt: now(),
          saveStatus: "saved"
        }
      };
    case "NEW_PROJECT":
      return action.state;
    default:
      return state;
  }
}

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, buildInitialState);
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);
  const undoRef = useRef<AppState[]>([]);
  const redoRef = useRef<AppState[]>([]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const saved = loadJson<AppState>(STORAGE_KEY);
    if (saved) {
      dispatch({ type: "HYDRATE", state: saved });
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveJson(STORAGE_KEY, {
      ...state,
      apiConfig: { ...state.apiConfig, apiKey: "" },
      project: { ...state.project, saveStatus: "saved" }
    });
  }, [hydrated, state]);

  const historyDispatch = useCallback((action: EditorAction) => {
    if (action.type === "UNDO") {
      const previous = undoRef.current.pop();
      if (!previous) return;
      redoRef.current.push(stateRef.current);
      dispatch({ type: "HYDRATE", state: previous });
      return;
    }

    if (action.type === "REDO") {
      const next = redoRef.current.pop();
      if (!next) return;
      undoRef.current.push(stateRef.current);
      dispatch({ type: "HYDRATE", state: next });
      return;
    }

    const nonHistoryActions: EditorAction["type"][] = [
      "HYDRATE",
      "SET_PLAYHEAD",
      "SET_PLAYING",
      "TOGGLE_QUEUE",
      "TOGGLE_EXPORT",
      "SHOW_TOAST",
      "UPDATE_JOB"
    ];

    if (!nonHistoryActions.includes(action.type)) {
      undoRef.current = [...undoRef.current.slice(-39), stateRef.current];
      redoRef.current = [];
    }

    dispatch(action);
  }, []);

  const value = useMemo(
    () => ({
      state,
      dispatch: historyDispatch,
      canUndo: undoRef.current.length > 0,
      canRedo: redoRef.current.length > 0
    }),
    [historyDispatch, state]
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used inside EditorProvider");
  }
  return context;
}
