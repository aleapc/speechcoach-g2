/**
 * G2 Display renderer — builds TextContainerProperty objects
 * and calls bridge.createStartUpPageContainer / bridge.rebuildPageContainer.
 *
 * Display: 576x288 pixels, 4-bit greyscale (16 shades of green).
 *
 * v0.4.0: adds image-container support for the pixel-art mascot, plus
 * textContainerUpgrade for flicker-free in-place text updates during
 * live coaching (WPM + VU meter at ~300ms cadence).
 */

import {
  TextContainerProperty,
  ImageContainerProperty,
  ImageRawDataUpdate,
  TextContainerUpgrade,
  CreateStartUpPageContainer,
  RebuildPageContainer,
} from '@evenrealities/even_hub_sdk';

declare const bridge: {
  createStartUpPageContainer(page: CreateStartUpPageContainer): void;
  rebuildPageContainer(page: RebuildPageContainer): void;
  textContainerUpgrade(upgrade: TextContainerUpgrade): void;
  updateImageRawData(update: ImageRawDataUpdate): Promise<unknown> | unknown;
};

let isFirstRender = true;
let lastContentHash = '';
let lastImageKey = '';
let imageBusy = false;

function computeContentHash(blocks: TextBlock[]): string {
  let hash = '';
  for (const b of blocks) {
    hash += `${b.id}:${b.text}|`;
  }
  return hash;
}

export interface TextBlock {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  isEventCapture?: boolean;
}

export interface ImageBlock {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** PNG bytes (from generateMascotPNG) */
  data: number[];
  /** Stable key identifying this image; rebuild only if it changes */
  key: string;
}

function buildTextContainer(block: TextBlock): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: block.x,
    yPosition: block.y,
    width: block.width,
    height: block.height,
    containerID: block.id,
    containerName: block.name,
    content: block.text,
    isEventCapture: block.isEventCapture ? 1 : 0,
  });
}

function buildImageContainer(block: ImageBlock): ImageContainerProperty {
  return new ImageContainerProperty({
    xPosition: block.x,
    yPosition: block.y,
    width: block.width,
    height: block.height,
    containerID: block.id,
    containerName: block.name,
  });
}

export function renderScreen(blocks: TextBlock[]): void {
  // Skip rebuild if content hasn't changed (avoid unnecessary bridge calls)
  const hash = computeContentHash(blocks);
  if (!isFirstRender && hash === lastContentHash && lastImageKey === '') {
    return;
  }

  // Ensure exactly one container has isEventCapture
  let hasCapture = false;
  for (const b of blocks) {
    if (b.isEventCapture) hasCapture = true;
  }
  if (!hasCapture && blocks.length > 0) {
    blocks[0].isEventCapture = true;
  }

  const textObjects = blocks.map(buildTextContainer);

  if (isFirstRender) {
    bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
      containerTotalNum: textObjects.length,
      textObject: textObjects,
    }));
    isFirstRender = false;
  } else {
    bridge.rebuildPageContainer(new RebuildPageContainer({
      containerTotalNum: textObjects.length,
      textObject: textObjects,
    }));
  }

  lastContentHash = hash;
  lastImageKey = '';
}

/**
 * Full rebuild with both a pixel-art image (mascot) and text blocks.
 * Use this when the image itself needs to change (e.g. pace zone changed)
 * or when first entering the live coaching screen.
 *
 * Follows the proven fabioglimb/even-toolkit flow:
 *   1. rebuildPageContainer declaring both image + text containers
 *   2. updateImageRawData to inject the PNG bytes
 * Subsequent text-only updates go through renderTextUpgrade.
 */
export async function renderScreenWithImage(
  image: ImageBlock,
  blocks: TextBlock[],
): Promise<void> {
  if (imageBusy) return;
  imageBusy = true;

  try {
    // Ensure a dummy page exists first — createStartUpPageContainer must
    // happen before rebuildPageContainer can be used with image objects.
    if (isFirstRender) {
      const dummy = new TextContainerProperty({
        xPosition: 0, yPosition: 0, width: 576, height: 288,
        containerID: 0, containerName: 'boot',
        content: ' ',
        isEventCapture: 1,
      });
      bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
        containerTotalNum: 1, textObject: [dummy],
      }));
      isFirstRender = false;
      await new Promise(r => setTimeout(r, 100));
    }

    // Ensure exactly one text container has isEventCapture
    let hasCapture = false;
    for (const b of blocks) {
      if (b.isEventCapture) hasCapture = true;
    }
    if (!hasCapture && blocks.length > 0) {
      blocks[0].isEventCapture = true;
    }

    const textObjects = blocks.map(buildTextContainer);
    const imageObject = buildImageContainer(image);

    bridge.rebuildPageContainer(new RebuildPageContainer({
      containerTotalNum: textObjects.length + 1,
      textObject: textObjects,
      imageObject: [imageObject],
    }));

    // Give the host a moment to lay out the page before pushing pixels.
    await new Promise(r => setTimeout(r, 100));

    try {
      await bridge.updateImageRawData(new ImageRawDataUpdate({
        containerID: image.id,
        containerName: image.name,
        imageData: image.data,
      }));
    } catch (e) {
      console.error('updateImageRawData failed:', e);
    }

    lastContentHash = computeContentHash(blocks);
    lastImageKey = image.key;
  } finally {
    imageBusy = false;
  }
}

/**
 * Update a single text container's content in-place via textContainerUpgrade.
 * Used for the ~300ms WPM + VU meter updates during live coaching so the
 * display doesn't flicker from full rebuilds.
 */
export function renderTextUpgrade(containerID: number, containerName: string, content: string): void {
  try {
    bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID, containerName, content,
    }));
  } catch (e) {
    console.error('textContainerUpgrade failed:', e);
  }
}

/** Last pushed image key, used by screens to decide whether to full-rebuild. */
export function getLastImageKey(): string {
  return lastImageKey;
}

export function resetRenderer(): void {
  isFirstRender = true;
  lastContentHash = '';
  lastImageKey = '';
}
