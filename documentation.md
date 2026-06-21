# Sora AI Video Editor — Full Product Documentation

> **Version:** 1.0.0  
> **Stack:** React (Node.js) + OpenAI Sora API  
> **Inspired by:** Higgsfield AI, Runway ML, Pika Labs  
> **Author:** Self-use personal tool  

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Tech Stack & Architecture](#2-tech-stack--architecture)
3. [Project Structure](#3-project-structure)
4. [Feature Specifications](#4-feature-specifications)
   - 4.1 [API Key Management](#41-api-key-management)
   - 4.2 [Text-to-Video Generation](#42-text-to-video-generation)
   - 4.3 [Image-to-Video Generation](#43-image-to-video-generation)
   - 4.4 [Video Timeline Editor](#44-video-timeline-editor)
   - 4.5 [Prompt-Based Timestamp Editing](#45-prompt-based-timestamp-editing)
   - 4.6 [Prompt Library & Presets](#46-prompt-library--presets)
   - 4.7 [Video Preview Player](#47-video-preview-player)
   - 4.8 [Project & Session Management](#48-project--session-management)
   - 4.9 [Export & Download](#49-export--download)
   - 4.10 [Generation Queue & Job Manager](#410-generation-queue--job-manager)
5. [UI Layout & Design System](#5-ui-layout--design-system)
6. [Sora API Integration](#6-sora-api-integration)
7. [State Management](#7-state-management)
8. [Component Breakdown](#8-component-breakdown)
9. [Data Models & Schemas](#9-data-models--schemas)
10. [User Flows](#10-user-flows)
11. [Error Handling Strategy](#11-error-handling-strategy)
12. [Local Storage & Persistence](#12-local-storage--persistence)
13. [Performance Considerations](#13-performance-considerations)
14. [Future Roadmap](#14-future-roadmap)
15. [Environment Setup & Running Locally](#15-environment-setup--running-locally)
16. [Glossary](#16-glossary)

---

## 1. Product Vision

This is a **personal self-use AI video creation and editing tool** that wraps the OpenAI Sora API into a polished, Higgsfield-style interface. The goal is to let a single user — you — generate, stitch, edit, and export AI videos using natural language prompts without any manual video editing skills.

### Core Philosophy

- **Prompt-first:** Every action is driven by natural language. You shouldn't need to know video editing terminology.
- **Non-destructive:** Edits are stored as instructions (prompts) attached to clips, not as permanent destructive changes to video files.
- **Fast iteration:** Generate → preview → tweak → regenerate in a tight loop.
- **Offline-capable UI:** The UI works fully offline; only generation calls need the internet.

### What Makes This Different from Plain API Calls

| Feature | Raw API | This Tool |
|---|---|---|
| Prompt history | ❌ | ✅ Full library |
| Timeline stitching | ❌ | ✅ Drag & drop |
| Timestamp-specific edits | ❌ | ✅ Per-segment prompt |
| Image-to-video upload | ❌ Manual | ✅ Drag & drop |
| Job queue management | ❌ | ✅ Background polling |
| Project save/load | ❌ | ✅ Local JSON |
| Preset prompt templates | ❌ | ✅ Categorized library |

---

## 2. Tech Stack & Architecture

### Frontend
| Layer | Technology |
|---|---|
| UI Framework | React 18 (functional components + hooks) |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Video Playback | Native HTML5 `<video>` element |
| Drag & Drop | `@dnd-kit/core` |
| State Management | React Context API + `useReducer` |
| Routing | React Router v6 |
| Local Storage | `localStorage` + custom hook |
| HTTP Client | Native `fetch` |

### Backend (Optional Proxy Server)
| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| API Proxy | `/api/sora/*` → OpenAI |
| File Serving | Static file server for generated videos |
| Environment | `.env` file for API keys |

> **Note:** A thin Express proxy is recommended so your Sora API key is never exposed in the browser. The React app calls `localhost:3001/api/...` which forwards to OpenAI.

### Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                  React Frontend                  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Sidebar  │  │ Timeline │  │ Preview Player │  │
│  │ Panels   │  │ Editor   │  │               │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │        Global App State (Context)         │   │
│  │  clips[] | jobs[] | library[] | project  │   │
│  └──────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────┘
                     │ fetch
                     ▼
┌─────────────────────────────────────────────────┐
│           Express Proxy (localhost:3001)          │
│   POST /api/generate   →   Sora API              │
│   GET  /api/jobs/:id   →   Sora API              │
│   GET  /api/videos/*   →   Local file cache      │
└─────────────────────────────────────────────────┘
```

---

## 3. Project Structure

```
sora-editor/
│
├── public/
│   └── index.html
│
├── src/
│   ├── index.js                    # App entry point
│   ├── App.jsx                     # Root component, routing
│   │
│   ├── context/
│   │   ├── AppContext.jsx           # Global state provider
│   │   └── reducer.js               # useReducer actions
│   │
│   ├── hooks/
│   │   ├── useSoraAPI.js            # Sora API calls
│   │   ├── useJobPoller.js          # Poll pending generation jobs
│   │   ├── useLocalStorage.js       # Persist state to localStorage
│   │   └── useTimeline.js           # Timeline clip operations
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── TopBar.jsx
│   │   │   └── MainLayout.jsx
│   │   │
│   │   ├── generation/
│   │   │   ├── TextToVideo.jsx       # T2V form panel
│   │   │   ├── ImageToVideo.jsx      # I2V upload + form panel
│   │   │   ├── GenerationSettings.jsx # Resolution, duration, FPS, etc.
│   │   │   └── GenerationQueue.jsx   # Live job status list
│   │   │
│   │   ├── timeline/
│   │   │   ├── Timeline.jsx          # Main timeline container
│   │   │   ├── TimelineTrack.jsx     # Single video track
│   │   │   ├── TimelineClip.jsx      # Individual clip block
│   │   │   ├── TimelineScrubber.jsx  # Playhead scrubber
│   │   │   ├── TimelineRuler.jsx     # Time ruler with timestamps
│   │   │   └── ClipEditModal.jsx     # Prompt-based timestamp edit
│   │   │
│   │   ├── player/
│   │   │   ├── VideoPlayer.jsx       # Preview player
│   │   │   ├── PlayerControls.jsx    # Play/pause/seek controls
│   │   │   └── FrameScrubber.jsx     # Frame-by-frame scrubber
│   │   │
│   │   ├── library/
│   │   │   ├── PromptLibrary.jsx     # Saved prompts sidebar
│   │   │   ├── PromptCard.jsx        # Single saved prompt card
│   │   │   ├── PromptPresets.jsx     # Built-in preset categories
│   │   │   └── MediaGallery.jsx      # All generated videos
│   │   │
│   │   └── ui/
│   │       ├── Button.jsx
│   │       ├── Input.jsx
│   │       ├── Textarea.jsx
│   │       ├── Modal.jsx
│   │       ├── Toast.jsx
│   │       ├── Spinner.jsx
│   │       ├── ProgressBar.jsx
│   │       ├── Tooltip.jsx
│   │       └── Badge.jsx
│   │
│   ├── utils/
│   │   ├── soraClient.js            # Raw Sora API wrapper
│   │   ├── timelineUtils.js         # Clip math / time calculations
│   │   ├── promptUtils.js           # Prompt helpers / formatters
│   │   ├── storageUtils.js          # localStorage helpers
│   │   └── exportUtils.js           # FFmpeg.wasm export helpers
│   │
│   └── constants/
│       ├── presets.js               # Built-in prompt presets
│       ├── resolutions.js           # Supported resolution options
│       └── apiConfig.js             # API endpoint config
│
├── server/                          # Optional Express proxy
│   ├── index.js
│   ├── routes/
│   │   ├── generate.js
│   │   ├── jobs.js
│   │   └── videos.js
│   └── .env                         # SORA_API_KEY=sk-...
│
├── .env.local                       # REACT_APP_API_BASE=http://localhost:3001
├── package.json
├── tailwind.config.js
└── README.md
```

---

## 4. Feature Specifications

---

### 4.1 API Key Management

#### Description
Users paste their OpenAI / Sora API key once. It is stored in `localStorage` and never sent to any server other than OpenAI directly (or through the local proxy).

#### UI
- **Settings Modal** accessible from the top bar
- Input field: `sk-...` format, masked by default, eye toggle to reveal
- "Test Connection" button — sends a lightweight status ping to verify key validity
- Key status badge: `✓ Connected`, `✗ Invalid Key`, `⚠ Rate Limited`
- Option to use the local proxy instead (recommended)

#### Behavior
- If no key is stored, a full-screen onboarding prompt is shown before any generation is possible
- Key is validated on app start and after every change
- If a 401 is returned during generation, the app surfaces a clear "Invalid API key" error and redirects to settings

#### Data Stored
```json
{
  "soraApiKey": "sk-...",
  "useProxy": true,
  "proxyUrl": "http://localhost:3001"
}
```

---

### 4.2 Text-to-Video Generation

#### Description
The primary creation flow. User writes a text prompt describing the video they want, configures generation parameters, and submits. The job is tracked and the resulting video clip appears in the Media Gallery and can be dragged onto the Timeline.

#### UI Panel (Left Sidebar — "Generate" Tab)

**Prompt Input Area**
- Large `<textarea>` with placeholder: *"A cinematic shot of mountains at golden hour, slow pan left, film grain..."*
- Character counter (Sora max: ~2000 chars)
- "Enhance Prompt" button — sends prompt to GPT-4o to rewrite it as a more cinematic, detailed description
- "Insert Preset" button — opens Prompt Library overlay

**Generation Parameters**
| Parameter | Type | Options | Default |
|---|---|---|---|
| Resolution | Dropdown | 480p, 720p, 1080p | 720p |
| Duration | Slider | 2s – 20s | 5s |
| Aspect Ratio | Toggle | 16:9, 9:16, 1:1, 4:3 | 16:9 |
| Motion Strength | Slider | 0.0 – 1.0 | 0.7 |
| Seed | Number input | any integer | random |
| Style Preset | Dropdown | Cinematic, Anime, Photorealistic, Watercolor, 3D Render | None |

**Action Buttons**
- `Generate Video` — primary CTA, triggers API call
- `Save Prompt` — saves current prompt + settings to library

**Advanced Options (collapsible)**
- Negative prompt field
- Frame rate: 24fps / 30fps / 60fps
- Loop: boolean toggle (makes video loop-friendly)
- Camera motion: Static / Pan Left / Pan Right / Zoom In / Zoom Out / Orbit

#### Generation Flow
1. User clicks "Generate Video"
2. App creates a Job object with status `pending`
3. API call is made to Sora: `POST /v1/videos/generations`
4. Job ID is stored; polling begins every 5 seconds
5. Job card shows spinner + estimated time remaining
6. On completion: video URL is fetched, thumbnail generated, clip added to Media Gallery
7. Toast notification: "✓ Video ready — click to preview"

---

### 4.3 Image-to-Video Generation

#### Description
Upload a still image (or select from previous generations) and animate it with a text prompt. Sora will use the image as the first frame and generate motion based on the prompt.

#### UI Panel

**Image Upload Zone**
- Drag-and-drop area (accepts JPG, PNG, WEBP up to 10MB)
- Click to open file picker
- After upload: thumbnail preview with "Remove" button
- Option to select from Media Gallery (previously generated frames)
- Option to use a video still frame (scrub to frame, click "Use this frame")

**Prompt Input**
- Same textarea as T2V but pre-populated with example: *"Camera slowly pulls back to reveal the full landscape..."*
- "What should happen to this image?" helper label

**Same generation parameters as T2V** plus:
- `Image Influence` slider (0.3 – 1.0): how strictly to follow the source image

#### API Mapping
```
POST /v1/videos/generations
{
  "prompt": "...",
  "image_url": "data:image/png;base64,...",  // base64 or hosted URL
  "duration": 5,
  "resolution": "1080p"
}
```

---

### 4.4 Video Timeline Editor

#### Description
A horizontal multi-track timeline where generated video clips can be arranged, trimmed, reordered, and stitched together to form a longer video sequence. This is the core editing workspace.

#### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Timeline Ruler:  0s    5s    10s   15s   20s   25s     │
├────┬────────────────────────────────────────────────────┤
│ V1 │  [Clip A: 0–5s]  [Clip B: 5–12s]  [Clip C: 12–20s]│
├────┤                                                     │
│ V2 │              [Overlay Clip: 6–9s]                  │
├────┴────────────────────────────────────────────────────┤
│  ▶ 00:08.3              Playhead scrubber               │
└─────────────────────────────────────────────────────────┘
```

#### Clip Operations

| Action | How |
|---|---|
| Add clip to timeline | Drag from Media Gallery to track |
| Reorder clips | Drag clip left/right on track |
| Trim clip start | Drag left edge of clip |
| Trim clip end | Drag right edge of clip |
| Delete clip | Select + press Delete / right-click → Remove |
| Duplicate clip | Right-click → Duplicate |
| Split clip at playhead | Right-click → Split here |
| Add new track | Click "+ Add Track" |
| Move clip to another track | Drag vertically to new track |

#### Snapping
- Clips snap to: timeline start, other clip edges, playhead position
- Hold `Alt` to disable snapping temporarily

#### Keyboard Shortcuts
| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `←` / `→` | Step backward / forward 1 frame |
| `Shift + ←/→` | Jump 1 second |
| `Home` | Go to 0:00 |
| `End` | Go to end |
| `Delete` | Delete selected clip |
| `Ctrl + Z` | Undo |
| `Ctrl + Shift + Z` | Redo |
| `Ctrl + D` | Duplicate selected clip |
| `S` | Split clip at playhead |

#### Clip Visual Design
Each clip block shows:
- Thumbnail strip (video frames sampled at regular intervals)
- Clip name (editable on double-click)
- Duration badge
- Status badge: `Generated`, `Edited`, `Rendering`
- Color-coded left border per track

---

### 4.5 Prompt-Based Timestamp Editing

#### Description
The most powerful feature. Users can select any clip on the timeline, click on a specific timestamp range within that clip, write a prompt, and Sora will regenerate just that segment with the described change applied. This allows surgical, non-destructive video editing entirely through natural language.

#### How It Works — Conceptually
Since Sora generates complete video clips, "timestamp editing" works by:
1. User selects a clip and marks a timestamp range (e.g., 2s–4s)
2. User writes a prompt: *"Make the sky turn stormy and dramatic"*
3. The app sends a new generation request using:
   - The frame immediately before the selected range (as an image anchor)
   - The edit prompt
   - The target duration (matching the selected range)
4. The new generated clip is dropped into the timeline replacing the selected segment
5. The original clip is preserved as a non-destructive "original" layer

#### UI: Clip Edit Modal

Triggered by: double-clicking a clip OR right-click → "Edit with prompt"

```
┌────────────────────────────────────────────────┐
│  Edit Clip: "Mountain Vista"                   │
│                                                 │
│  [Video Preview of clip]     ← mini player     │
│                                                 │
│  Select range to edit:                          │
│  [──────[====SELECTED====]──────────]           │
│   0s    2.1s          4.8s        8s           │
│                                                 │
│  Edit Prompt:                                   │
│  ┌─────────────────────────────────────────┐   │
│  │ Make the sky turn into a dramatic        │   │
│  │ thunderstorm with lightning flashes      │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ○ Replace selected segment                     │
│  ○ Insert before selected                       │
│  ○ Insert after selected                        │
│                                                 │
│  [Cancel]              [Generate Edit]          │
└────────────────────────────────────────────────┘
```

#### Technical Implementation Detail
```
Original Clip: [====A====|====B====|====C====]
                         ↑ edit here ↑

Step 1: Extract frame at start of B segment
Step 2: POST to Sora with frame as image + edit prompt + duration of B
Step 3: Result = new clip B'
Step 4: Timeline becomes: [====A====|====B'====|====C====]
Step 5: Original B stored as "edit history" node on clip object
```

#### Edit History Per Clip
Each clip maintains a stack of edit states:
- `original` — the first generated version
- `edit_1` — after first prompt edit
- `edit_2` — after second, etc.

Users can view edit history and revert to any prior version.

---

### 4.6 Prompt Library & Presets

#### Description
A panel that stores and organizes prompts for quick reuse. Includes user-saved prompts and built-in preset templates categorized by style, mood, shot type, etc.

#### Tabs

**My Prompts**
- Lists all saved prompts in reverse chronological order
- Each card shows: prompt text (truncated), date saved, generation settings used, preview thumbnail (if available)
- Search/filter bar
- Actions: Use, Edit, Duplicate, Delete

**Presets**
Pre-built prompt templates organized into categories:

| Category | Examples |
|---|---|
| **Cinematic Shots** | Aerial drone reveal, Dutch angle horror, Slow-motion splash |
| **Camera Movements** | Smooth dolly push-in, Epic crane shot, Whip pan transition |
| **Environments** | Cyberpunk city rain, Serene Japanese forest, Arctic tundra |
| **Styles** | 35mm film grain, Anime opening sequence, Vintage VHS look |
| **Transitions** | Smash cut to black, Match cut reveal, Light leak wipe |
| **Abstract / Artistic** | Liquid morphing geometry, Ink diffusing in water |
| **People & Action** | Confident walk toward camera, Slow motion dance |

**Clicking a preset** auto-populates the active prompt input field. User can then customize and generate.

#### Prompt Card Data
```json
{
  "id": "uuid",
  "text": "A lone figure walks through heavy rain on a neon-lit street...",
  "settings": {
    "duration": 6,
    "resolution": "1080p",
    "aspectRatio": "16:9",
    "motionStrength": 0.8
  },
  "tags": ["cinematic", "rain", "night"],
  "createdAt": "2025-01-15T10:22:00Z",
  "thumbnailUrl": "/cache/thumb_abc123.jpg",
  "usageCount": 3
}
```

---

### 4.7 Video Preview Player

#### Description
A full-featured video player embedded in the main workspace that previews either individual clips or the full stitched timeline in real time.

#### Modes
| Mode | Trigger |
|---|---|
| **Clip Preview** | Click clip in Media Gallery |
| **Timeline Preview** | Click Play in Timeline |
| **Compare Mode** | Compare two versions of same clip side by side |

#### Player Controls

```
┌─────────────────────────────────────────────────┐
│                                                  │
│              [VIDEO FRAME DISPLAY]               │
│                                                  │
│                                                  │
├──────────────────────────────────────────────────┤
│  ◀◀  ◀  ▶/⏸  ▶  ▶▶    🔊  ────── ⏱ 00:04.2/00:08.0
├──────────────────────────────────────────────────┤
│  [═══════════════●────────────────────────────]  │
│   Scrubber with frame-accurate seeking            │
└──────────────────────────────────────────────────┘
```

**Controls:**
- Skip to start / Step back 1 frame / Play-Pause / Step forward 1 frame / Skip to end
- Volume slider with mute toggle
- Current timecode / total duration
- Playback speed: 0.25x, 0.5x, 1x, 1.5x, 2x
- Fullscreen toggle
- Loop toggle
- "Use this frame" button — captures current frame as still image for Image-to-Video

#### Thumbnail Strip
Below the scrubber: a strip of video thumbnails (1 per second) for visual navigation.

---

### 4.8 Project & Session Management

#### Description
All work is organized into "Projects." A project contains a timeline, all its clips, generation settings, and prompt history. Projects are saved to `localStorage` as JSON and can be exported/imported as `.soraproject` files.

#### Project Operations
- **New Project** — clears workspace, creates blank project
- **Save Project** — saves to localStorage immediately (auto-save every 60 seconds)
- **Open Project** — load from localStorage list or import `.soraproject` file
- **Duplicate Project** — copy project with all clips
- **Export Project** — download as `.soraproject` JSON file
- **Import Project** — drag & drop or file picker

#### Project Metadata
```json
{
  "id": "proj_abc123",
  "name": "Mountain Commercial",
  "createdAt": "2025-01-10T08:00:00Z",
  "updatedAt": "2025-01-15T14:33:00Z",
  "timeline": { ... },
  "clips": [ ... ],
  "promptHistory": [ ... ],
  "settings": { ... },
  "thumbnailUrl": "..."
}
```

#### Recent Projects Screen
On app open (no active project): shows a grid of recent projects with thumbnails, names, and last-edited timestamps. "New Project" card at top-left.

---

### 4.9 Export & Download

#### Description
Users can export their timeline as a video file. Since browser-based video encoding is limited, the app offers multiple export strategies.

#### Export Options

| Option | Method | Quality | Speed |
|---|---|---|---|
| Download clips separately | Direct download links | Original | Instant |
| Stitched MP4 (client-side) | FFmpeg.wasm | Good | Slow (browser) |
| Copy clip URLs | Clipboard copy | N/A | Instant |
| Export edit instructions | JSON manifest | N/A | Instant |

#### Export Settings Panel
- Format: MP4 / WebM
- Quality: Low (720p), Medium (1080p), High (1080p high bitrate)
- Include audio: toggle
- Trim to: full timeline / selected region

#### JSON Manifest Export
For users who want to finalize stitching in a real video editor, the app can export a structured JSON file:
```json
{
  "totalDuration": 28.5,
  "clips": [
    { "clipId": "clip_001", "url": "...", "trimStart": 0, "trimEnd": 5, "trackPosition": 0 },
    { "clipId": "clip_002", "url": "...", "trimStart": 1.5, "trimEnd": 8, "trackPosition": 5 }
  ]
}
```
This can be fed into an ffmpeg script for lossless stitching.

---

### 4.10 Generation Queue & Job Manager

#### Description
All generation requests run as background jobs. The queue panel shows all active, pending, and completed jobs with live status updates.

#### Job States
```
pending → queued → processing → completed
                             ↘ failed
```

#### Queue Panel UI
Shown as a collapsible drawer at the bottom of the screen or as a sidebar panel.

Each job card shows:
- Job ID (truncated)
- Prompt preview (first 60 chars)
- Status badge with icon
- Progress bar (percentage when available from API)
- Elapsed time / estimated remaining time
- Thumbnail preview once available
- Actions: Cancel (if pending), Retry (if failed), Add to Timeline, Delete

#### Polling Strategy
- Poll every 5 seconds for `pending` or `processing` jobs
- Exponential backoff after 3 consecutive failures
- Stop polling after 10 minutes (timeout), mark job as `timed_out`
- Show notification badge on queue icon when new jobs complete

#### Concurrency
- Max 3 simultaneous generation requests (configurable in settings)
- Additional requests are queued locally and dispatched as slots open

---

## 5. UI Layout & Design System

### Overall Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  TopBar: [Logo] [Project Name] [Save] [Export]     [Settings] [?] │
├────────────┬─────────────────────────────────────┬───────────────┤
│            │                                     │               │
│  Left      │       Preview Player                │  Right        │
│  Sidebar   │                                     │  Sidebar      │
│            │                                     │               │
│  Tabs:     │                                     │  Media        │
│  Generate  ├─────────────────────────────────────┤  Gallery      │
│  Library   │                                     │               │
│  Settings  │       Timeline Editor               │  (All clips   │
│            │                                     │   generated)  │
│            │                                     │               │
├────────────┴─────────────────────────────────────┴───────────────┤
│  Job Queue Drawer (collapsible)                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Design Tokens

**Colors**
```
Background:       #0A0A0F  (near-black, deep space)
Surface:          #12121A  (card/panel bg)
Surface Elevated: #1C1C2A  (modals, dropdowns)
Border:           #2A2A3E  (subtle dividers)
Accent Primary:   #6C63FF  (purple — generation actions)
Accent Secondary: #00E5FF  (cyan — timeline/player)
Accent Success:   #00C48C  (green — completed jobs)
Accent Warning:   #FFB547  (orange — processing/pending)
Accent Danger:    #FF4D6A  (red — errors/delete)
Text Primary:     #F0F0FF  (near-white)
Text Secondary:   #8888AA  (muted)
Text Disabled:    #44445A
```

**Typography**
- Display/Headlines: `Space Grotesk` (Google Font) — modern, technical
- Body/UI: `Inter` — clean, readable
- Monospace (timestamps, IDs): `JetBrains Mono`

**Spacing Scale:** 4px base unit (4, 8, 12, 16, 20, 24, 32, 48, 64)

**Border Radius:** 
- Buttons: 8px
- Cards: 12px
- Modals: 16px
- Clips on timeline: 6px

### Signature Design Element
The **generation pulse animation**: when a job is processing, the generate button and the corresponding job card emit a slow, rhythmic purple pulse glow — like a heartbeat. This is the single memorable interaction that ties the "waiting for AI" experience into something that feels alive rather than just a spinner.

---

## 6. Sora API Integration

### Base Configuration
```javascript
// src/utils/soraClient.js
const SORA_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001';

export async function generateVideo(params) {
  const response = await fetch(`${SORA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!response.ok) throw new SoraAPIError(await response.json());
  return response.json();
}

export async function getJobStatus(jobId) {
  const response = await fetch(`${SORA_BASE}/api/jobs/${jobId}`);
  if (!response.ok) throw new SoraAPIError(await response.json());
  return response.json();
}
```

### Text-to-Video Request
```javascript
{
  model: "sora-1.5",                    // or latest available
  prompt: "A cinematic drone shot...",
  n: 1,                                  // number of videos
  size: "1920x1080",                     // resolution
  duration: 5,                           // seconds
  fps: 24,
  response_format: "url"                 // or "b64_json"
}
```

### Image-to-Video Request
```javascript
{
  model: "sora-1.5",
  prompt: "The camera slowly pulls back...",
  image: "data:image/png;base64,iVBOR...", // base64 image
  size: "1920x1080",
  duration: 5
}
```

### Polling Job Status
```javascript
// GET /v1/videos/generations/{job_id}
// Response:
{
  "id": "gen_abc123",
  "status": "processing",  // pending | processing | completed | failed
  "progress": 0.65,        // 0.0 – 1.0
  "created_at": 1705312800,
  "data": [
    {
      "url": "https://cdn.openai.com/...",  // available when completed
      "revised_prompt": "..."
    }
  ]
}
```

### Error Codes to Handle
| Code | Meaning | User Message |
|---|---|---|
| 401 | Invalid API key | "Check your API key in Settings" |
| 429 | Rate limit / quota exceeded | "Rate limit hit — retrying in 60s" |
| 400 | Invalid prompt or params | "Prompt violates content policy" |
| 500 | Sora server error | "Sora is having issues — try again" |
| timeout | Network timeout | "Request timed out — check connection" |

---

## 7. State Management

### Global App State Shape

```javascript
const initialState = {
  // API config
  apiKey: null,
  useProxy: true,

  // Current project
  project: {
    id: null,
    name: "Untitled Project",
    createdAt: null,
    updatedAt: null
  },

  // Media Gallery — all generated clips
  clips: [],
  // Shape of each clip:
  // {
  //   id, name, url, thumbnailUrl, duration,
  //   prompt, settings, status,
  //   editHistory: [],
  //   createdAt
  // }

  // Timeline state
  timeline: {
    tracks: [],
    // Shape of track:
    // { id, name, clips: [{ clipId, startTime, endTime, trimStart, trimEnd }] }
    totalDuration: 0,
    playheadPosition: 0
  },

  // Generation jobs
  jobs: [],
  // Shape: { id, prompt, status, progress, createdAt, completedAt, error }

  // Prompt library
  promptLibrary: [],

  // UI state
  ui: {
    activeTab: 'generate',        // 'generate' | 'library' | 'settings'
    selectedClipId: null,
    isPlaying: false,
    isQueueOpen: false,
    generationSettings: {
      resolution: '1080p',
      duration: 5,
      aspectRatio: '16:9',
      motionStrength: 0.7,
      fps: 24
    }
  }
};
```

### Reducer Actions
```javascript
// Generation
SUBMIT_GENERATION
UPDATE_JOB_STATUS
COMPLETE_JOB
FAIL_JOB
CANCEL_JOB

// Clips
ADD_CLIP
UPDATE_CLIP
DELETE_CLIP
ADD_CLIP_EDIT

// Timeline
ADD_CLIP_TO_TIMELINE
MOVE_CLIP
TRIM_CLIP
DELETE_CLIP_FROM_TIMELINE
SPLIT_CLIP
REORDER_CLIPS
SET_PLAYHEAD

// Library
SAVE_PROMPT
DELETE_PROMPT
UPDATE_PROMPT

// UI
SET_ACTIVE_TAB
SELECT_CLIP
TOGGLE_QUEUE
UPDATE_GENERATION_SETTINGS

// Project
LOAD_PROJECT
SAVE_PROJECT
NEW_PROJECT
```

---

## 8. Component Breakdown

### `<TextToVideo />`
**Props:** none (reads from context)  
**Responsibilities:** Renders the T2V form. Dispatches `SUBMIT_GENERATION` on submit. Reads `ui.generationSettings` from context.

### `<Timeline />`
**Props:** none  
**Responsibilities:** Renders the timeline ruler, all tracks, and the playhead. Manages drag-and-drop via `@dnd-kit`. Dispatches clip movement/trimming actions.

### `<TimelineClip />`
**Props:** `clip, trackId, position`  
**Responsibilities:** Renders a single clip block with thumbnail strip. Handles drag handles for trimming. Shows context menu on right-click.

### `<ClipEditModal />`
**Props:** `clipId, isOpen, onClose`  
**Responsibilities:** Shows clip preview, timestamp range selector, edit prompt input. On submit: extracts anchor frame → dispatches new generation job → on completion, replaces segment in timeline.

### `<VideoPlayer />`
**Props:** `src, startTime?, endTime?`  
**Responsibilities:** HTML5 video element with custom controls. Synced to timeline playhead when in timeline-preview mode.

### `<GenerationQueue />`
**Props:** none  
**Responsibilities:** Reads `jobs` from context. Renders job cards. Starts/stops polling via `useJobPoller` hook.

### `<PromptLibrary />`
**Props:** `onSelect: (prompt) => void`  
**Responsibilities:** Shows user's saved prompts + preset categories. Calls `onSelect` when user picks one.

---

## 9. Data Models & Schemas

### Clip
```typescript
interface Clip {
  id: string;                    // uuid
  name: string;
  url: string;                   // hosted or blob URL
  thumbnailUrl: string;
  duration: number;              // seconds (float)
  width: number;
  height: number;
  fps: number;
  prompt: string;                // original generation prompt
  settings: GenerationSettings;
  status: 'generating' | 'ready' | 'error';
  editHistory: ClipEdit[];
  jobId: string;
  createdAt: string;             // ISO 8601
}

interface ClipEdit {
  id: string;
  editPrompt: string;
  rangeStart: number;
  rangeEnd: number;
  resultClipId: string;
  createdAt: string;
}
```

### TimelineClip
```typescript
interface TimelineClip {
  id: string;                    // placement ID (different from Clip.id)
  clipId: string;                // reference to Clip
  startTime: number;             // where on the timeline this clip starts (seconds)
  trimStart: number;             // how many seconds trimmed from clip start
  trimEnd: number;               // how many seconds trimmed from clip end
}
```

### Job
```typescript
interface Job {
  id: string;
  type: 'text_to_video' | 'image_to_video' | 'clip_edit';
  prompt: string;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'timed_out';
  progress: number;              // 0.0 – 1.0
  soraJobId: string | null;
  resultClipId: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  settings: GenerationSettings;
}
```

### SavedPrompt
```typescript
interface SavedPrompt {
  id: string;
  text: string;
  tags: string[];
  settings: Partial<GenerationSettings>;
  thumbnailUrl: string | null;
  usageCount: number;
  createdAt: string;
}
```

### GenerationSettings
```typescript
interface GenerationSettings {
  resolution: '480p' | '720p' | '1080p';
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  fps: 24 | 30 | 60;
  motionStrength: number;        // 0.0 – 1.0
  seed: number | null;
  negativePrompt: string;
  loop: boolean;
  cameraMotion: 'static' | 'pan_left' | 'pan_right' | 'zoom_in' | 'zoom_out' | 'orbit';
  stylePreset: string | null;
}
```

---

## 10. User Flows

### Flow 1: First-time Setup
```
App opens → No API key detected
→ Full-screen Welcome screen
→ User pastes API key → "Test Connection"
→ Success: "Connected to Sora API ✓"
→ New empty project workspace opens
```

### Flow 2: Generate First Video
```
Left sidebar: "Generate" tab
→ Write prompt in textarea
→ Adjust settings (duration, resolution)
→ Click "Generate Video"
→ Job card appears in queue with spinner
→ [5–60 seconds of generation]
→ Toast: "Video ready!"
→ Clip appears in Media Gallery (right sidebar)
→ User clicks clip → Video Player previews it
```

### Flow 3: Build a Timeline Sequence
```
User has 3 clips in Media Gallery
→ Drags Clip A to Track 1 at 0s
→ Drags Clip B to Track 1 after Clip A
→ Drags Clip C to Track 1 after Clip B
→ Clips auto-snap together
→ Presses Space → timeline plays through all 3 clips
→ Playhead moves in sync with player
```

### Flow 4: Timestamp Edit
```
User watches Clip B → at 3s in, the sky looks wrong
→ Double-clicks Clip B on timeline → ClipEditModal opens
→ Scrubs to 2.5s–5s range on mini timeline
→ Types: "Replace the clear sky with dramatic storm clouds and lightning"
→ Clicks "Generate Edit"
→ New job is created and queued
→ On completion: original Clip B is split into:
     [Clip B: 0–2.5s] + [Edit Result: 2.5–5s] + [Clip B: 5–end]
→ Timeline updates automatically
```

### Flow 5: Save and Export
```
User is happy with 20-second timeline
→ Ctrl+S → saved to localStorage
→ Click "Export"
→ Export panel opens
→ Choose "Stitch to MP4 (client-side)"
→ Progress bar runs (FFmpeg.wasm encoding)
→ "Download final_video.mp4" button appears
```

---

## 11. Error Handling Strategy

### API Errors
- All API calls wrapped in `try/catch`
- Errors stored on Job object as `error` field
- Toast notification for non-critical errors
- Modal for critical errors (invalid key, content policy violation)
- Retry button on failed jobs

### Video Playback Errors
- HTML5 `<video>` `onerror` handler
- Fallback: show thumbnail + "Preview unavailable" text
- Suggest re-downloading or re-generating

### Storage Errors
- `localStorage` quota exceeded: warn user, offer to delete old projects
- Corrupt project JSON: show recovery screen, offer to start fresh

### Network Errors
- Detect offline state via `navigator.onLine`
- Show offline banner: "No internet connection — generation paused"
- Queue resumes automatically when connection restores

---

## 12. Local Storage & Persistence

### Keys Used
| Key | Content | Max Size |
|---|---|---|
| `sora_api_config` | API key + proxy settings | ~200 bytes |
| `sora_projects` | Array of project metadata | ~50KB |
| `sora_project_{id}` | Full project data per project | ~500KB each |
| `sora_prompt_library` | All saved prompts | ~100KB |
| `sora_settings` | App preferences | ~2KB |

### Auto-Save
- Project auto-saved every 60 seconds (if changes detected)
- Save indicator in top bar: `Saved ✓` / `Saving...` / `Unsaved changes`

### Clip Video Caching
- Generated video URLs (hosted by OpenAI) are stored
- URLs eventually expire — app checks URL validity on load and flags expired clips
- Option to "Re-download" clip to local cache (as blob URL)

---

## 13. Performance Considerations

### Timeline Performance
- Clips rendered with `React.memo` to avoid unnecessary re-renders
- Thumbnail strips lazy-loaded
- Timeline virtualized if > 20 clips (only render visible range)

### Video Memory
- Only one `<video>` element exists; `src` is swapped on clip change
- Blob URLs released with `URL.revokeObjectURL` when clips are deleted

### API Call Efficiency
- Job polling consolidated: single `setInterval` polls all active jobs in one call pattern
- Exponential backoff on failures (5s → 10s → 20s → 40s → stop)
- Duplicate generation prevention: hash prompt + settings to detect identical requests

### Bundle Size
- FFmpeg.wasm loaded lazily only when user initiates export
- Google Fonts loaded via CSS `@import` with `font-display: swap`

---

## 14. Future Roadmap

### v1.1
- [ ] Audio track support (background music upload)
- [ ] Text overlay on timeline clips
- [ ] Batch generation (generate multiple variations of same prompt)

### v1.2
- [ ] Cloud sync via personal backend (Docker compose setup)
- [ ] Collaborative sharing — share project link with another person
- [ ] Custom style fine-tuning prompts (store your "look" as a reusable modifier)

### v1.3
- [ ] Sora video-to-video (use existing video + prompt to restyle entire clip)
- [ ] Automatic scene detection + auto-split
- [ ] Voice-to-prompt: speak your edit instruction

### v2.0
- [ ] Multi-modal: generate audio with ElevenLabs, images with DALL-E, video with Sora — all in one timeline
- [ ] AI-assisted storyboard: describe a full video idea, AI breaks it into scene prompts automatically
- [ ] Export to DaVinci Resolve / Premiere XML

---

## 15. Environment Setup & Running Locally

### Prerequisites
- Node.js 18+
- npm or yarn
- OpenAI API key with Sora access

### Step 1: Clone & Install
```bash
git clone https://github.com/yourusername/sora-editor
cd sora-editor
npm install
```

### Step 2: Set Up Proxy Server
```bash
cd server
npm install
cp .env.example .env
# Edit .env: SORA_API_KEY=sk-your-key-here
```

### Step 3: Environment Variables
```bash
# .env.local (in root)
REACT_APP_API_BASE=http://localhost:3001
```

### Step 4: Run
```bash
# Terminal 1: Start proxy server
cd server && node index.js
# → Running on http://localhost:3001

# Terminal 2: Start React app
npm start
# → Opens http://localhost:3000
```

### Step 5: Verify
- Open `http://localhost:3000`
- Enter your API key in Settings
- Click "Test Connection" → should show `✓ Connected`
- Write a test prompt → click Generate Video

### Build for Production
```bash
npm run build
# Outputs to /build — serve with any static file server
# e.g.: npx serve -s build
```

---

## 16. Glossary

| Term | Definition |
|---|---|
| **Clip** | A single AI-generated video segment stored in the Media Gallery |
| **Timeline** | The horizontal editor where clips are arranged in sequence |
| **Track** | A single horizontal lane in the timeline (like layers in Photoshop) |
| **Playhead** | The vertical marker showing the current playback position |
| **Trim** | Shortening a clip from its start or end without deleting content |
| **Job** | A background Sora generation request with tracked status |
| **T2V** | Text-to-Video: generating a video from a text prompt only |
| **I2V** | Image-to-Video: animating a still image using a text prompt |
| **Timestamp Edit** | Prompt-based regeneration of a specific time range within a clip |
| **Preset** | A pre-written, reusable prompt template |
| **Edit History** | The stack of all prompt-based edits applied to a clip, allowing revert |
| **Anchor Frame** | The video frame extracted at the start of a timestamp edit range, used as the I2V starting image |
| **Proxy** | A local Express server that forwards API calls so the API key stays server-side |
| **Snapping** | Clips on the timeline automatically aligning to the edges of other clips |

---

*Documentation written for: Sora AI Video Editor v1.0.0*  
*Last updated: June 2026*