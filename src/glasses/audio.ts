/**
 * Audio analysis engine for WPM estimation from PCM 16kHz mono audio.
 *
 * Strategy:
 * - Receive PCM chunks (16kHz, signed 16-bit LE, mono)
 * - Compute RMS energy per chunk
 * - Auto-calibrate silence threshold from ambient noise (first 3 seconds)
 * - Classify frames as speech or silence using calibrated threshold
 * - Count speech-to-silence transitions (word boundaries)
 * - Estimate WPM using sliding window of 10 seconds
 */

const FRAME_SIZE = 1600; // 100ms frames at 16kHz
const DEFAULT_SILENCE_THRESHOLD = 500;
const WORD_GAP_FRAMES = 2; // >= 200ms silence = word boundary
const WINDOW_SEC = 10; // Sliding window for WPM smoothing
const CALIBRATION_DURATION_MS = 3000;
const THRESHOLD_FLOOR = 200;
const THRESHOLD_CEILING = 2000;

interface AudioFrame {
  timestamp: number;
  rms: number;
  isSpeech: boolean;
}

export interface CalibrationStatus {
  isCalibrated: boolean;
  threshold: number;
}

export class AudioAnalyzer {
  private frames: AudioFrame[] = [];
  private pendingSamples: number[] = [];
  private silenceFrameCount = 0;
  private inSpeech = false;
  private wordCount = 0;
  private windowWordTimestamps: number[] = [];
  private startTime = 0;

  // Calibration
  private silenceThreshold = DEFAULT_SILENCE_THRESHOLD;
  private calibrationRmsValues: number[] = [];
  private isCalibrated = false;

  reset(): void {
    this.frames = [];
    this.pendingSamples = [];
    this.silenceFrameCount = 0;
    this.inSpeech = false;
    this.wordCount = 0;
    this.windowWordTimestamps = [];
    this.startTime = Date.now();

    // Reset calibration
    this.silenceThreshold = DEFAULT_SILENCE_THRESHOLD;
    this.calibrationRmsValues = [];
    this.isCalibrated = false;
  }

  /**
   * Feed raw PCM data from audioEvent callback.
   * Data is ArrayBuffer of signed 16-bit LE samples at 16kHz.
   */
  feedPcmData(data: ArrayBuffer): void {
    const samples = new Int16Array(data);
    for (let i = 0; i < samples.length; i++) {
      this.pendingSamples.push(samples[i]);
    }

    // Process complete frames
    while (this.pendingSamples.length >= FRAME_SIZE) {
      const frameSamples = this.pendingSamples.splice(0, FRAME_SIZE);
      this.processFrame(frameSamples);
    }
  }

  private processFrame(samples: number[]): void {
    const rms = computeRms(samples);
    const now = Date.now();
    const elapsed = now - this.startTime;

    // Calibration phase: collect ambient noise for first 3 seconds
    if (!this.isCalibrated && elapsed < CALIBRATION_DURATION_MS) {
      this.calibrationRmsValues.push(rms);
      const frame: AudioFrame = { timestamp: now, rms, isSpeech: false };
      this.frames.push(frame);
      return;
    }

    // Finalize calibration on first frame after 3 seconds
    if (!this.isCalibrated && this.calibrationRmsValues.length > 0) {
      this.isCalibrated = true;
      const mean = this.calibrationRmsValues.reduce((a, b) => a + b, 0) / this.calibrationRmsValues.length;
      const variance = this.calibrationRmsValues.reduce((a, v) => a + (v - mean) ** 2, 0) / this.calibrationRmsValues.length;
      const stddev = Math.sqrt(variance);
      this.silenceThreshold = Math.max(THRESHOLD_FLOOR, Math.min(THRESHOLD_CEILING, Math.round(mean + 2 * stddev)));
    }

    // Edge case: no calibration data but past duration (shouldn't happen normally)
    if (!this.isCalibrated) {
      this.isCalibrated = true;
    }

    const isSpeech = rms > this.silenceThreshold;

    const frame: AudioFrame = { timestamp: now, rms, isSpeech };
    this.frames.push(frame);

    // Keep only recent frames (window + buffer)
    const cutoff = now - (WINDOW_SEC + 5) * 1000;
    while (this.frames.length > 0 && this.frames[0].timestamp < cutoff) {
      this.frames.shift();
    }

    if (isSpeech) {
      if (!this.inSpeech && this.silenceFrameCount >= WORD_GAP_FRAMES) {
        // Transition from silence to speech = new word segment
        this.wordCount++;
        this.windowWordTimestamps.push(now);
      }
      this.inSpeech = true;
      this.silenceFrameCount = 0;
    } else {
      this.silenceFrameCount++;
      if (this.silenceFrameCount >= WORD_GAP_FRAMES) {
        this.inSpeech = false;
      }
    }

    // Prune old word timestamps outside window
    const windowCutoff = now - WINDOW_SEC * 1000;
    while (this.windowWordTimestamps.length > 0 && this.windowWordTimestamps[0] < windowCutoff) {
      this.windowWordTimestamps.shift();
    }
  }

  /**
   * Get current smoothed WPM estimate based on sliding window.
   */
  getWpm(): number {
    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000;

    if (elapsed < 2) return 0; // Need at least 2 seconds

    // Words in the sliding window
    const windowCutoff = now - WINDOW_SEC * 1000;
    const wordsInWindow = this.windowWordTimestamps.filter(t => t >= windowCutoff).length;

    // Effective window duration (min of elapsed or window size)
    const windowDuration = Math.min(elapsed, WINDOW_SEC);

    if (windowDuration <= 0) return 0;

    const wpm = Math.round((wordsInWindow / windowDuration) * 60);
    return Math.min(wpm, 300); // Cap at 300 to avoid crazy spikes
  }

  /**
   * Get calibration status and computed threshold.
   */
  getCalibrationStatus(): CalibrationStatus {
    return { isCalibrated: this.isCalibrated, threshold: this.silenceThreshold };
  }

  /**
   * Get total word count for the session.
   */
  getTotalWords(): number {
    return this.wordCount;
  }

  /**
   * Check if currently detecting speech.
   */
  isSpeaking(): boolean {
    return this.inSpeech;
  }

  /**
   * Get current RMS energy (for debug/display).
   */
  getCurrentRms(): number {
    if (this.frames.length === 0) return 0;
    return this.frames[this.frames.length - 1].rms;
  }
}

function computeRms(samples: number[]): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / samples.length);
}

// Singleton
export const audioAnalyzer = new AudioAnalyzer();
