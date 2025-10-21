# Instant Camera Flow

## Purpose
Mila UX v0.9 emphasizes a camera-first capture workflow: the camera should open live, frame detection should be automatic, and the user must be able to refine the crop before OCR kicks in. This document captures the implementation plan that replaces the legacy upload-only experience.

## Solution Overview
- Mount a dedicated `CameraCapture` component on `/camera` that immediately requests `getUserMedia` with `facingMode: 'environment'`.
- Display a full-screen preview with a tactile shutter button and capture progress.
- On capture:
  1. Freeze the frame into a canvas.
  2. Run a lightweight boundary detector that looks for high-contrast regions to suggest an initial quadrilateral.
  3. Let users drag the four corner handles to perfect the crop.
  4. Apply perspective correction plus binarisation to the selected region.
  5. Hand the normalised image to the existing OCR pipeline (`processImage`).
- Provide fallbacks (upload/gallery) for browsers that block camera access.

## Key Components
- `CameraCapture` – handles media stream lifecycle, rendering, and capture toggles.
- `CapturePreview` – shows the frozen frame, auto-detected polygon, draggable handles, and action buttons.
- `imageUtils` – shared helpers for edge finding, homography, and grayscale binarisation.

## UX Notes
- Show a modal-level loading indicator while OCR runs, reusing the progress feedback already used for uploads.
- Give immediate error guidance (permissions denied, no camera, OCR failure).
- Pause and resume the stream appropriately to conserve resources between captures.

## Open Enhancements
- Plug in OpenCV.js for more robust contour detection when bundle size budgets allow.
- Add multi-page capture sequencing.
- Cache the last-used polygon to speed up successive captures.
