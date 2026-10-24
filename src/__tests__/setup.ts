import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Web Audio API
const mockAudioContext = {
  sampleRate: 16000,
  decodeAudioData: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  createBuffer: vi.fn(),
  createBufferSource: vi.fn(),
};

const mockOfflineAudioContext = {
  createBuffer: vi.fn(),
  createBufferSource: vi.fn(),
  startRendering: vi.fn(),
};

global.AudioContext = vi.fn(() => mockAudioContext) as unknown as typeof AudioContext;
global.OfflineAudioContext = vi.fn(() => mockOfflineAudioContext) as unknown as typeof OfflineAudioContext;

// Mock fetch
global.fetch = vi.fn();

// Mock HTMLMediaElement play/pause in jsdom
window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(() => Promise.resolve());
window.HTMLMediaElement.prototype.pause = vi.fn();
