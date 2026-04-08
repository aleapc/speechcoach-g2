/**
 * G2 Display renderer — builds TextContainerProperty objects
 * and calls bridge.createStartUpPageContainer / bridge.rebuildPageContainer.
 *
 * Display: 576x288 pixels, 4-bit greyscale (16 shades of green).
 */

import {
  TextContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
} from '@evenrealities/even_hub_sdk';

declare const bridge: {
  createStartUpPageContainer(page: CreateStartUpPageContainer): void;
  rebuildPageContainer(page: RebuildPageContainer): void;
};

let isFirstRender = true;

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

export function renderScreen(blocks: TextBlock[]): void {
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
}

export function resetRenderer(): void {
  isFirstRender = true;
}
