import { useEffect, useRef, useState } from 'react';
import type { RecorderInit } from '../shared/types';

type Phase = 'loading' | 'ready' | 'recording' | 'paused' | 'saving' | 'error';

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? 'video/webm';
}

export function Recorder() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  const initRef = useRef<RecorderInit | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rawStreamsRef = useRef<MediaStream[]>([]);
  const drawTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const accumulatedRef = useRef(0);
  const tickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = window.zirtola.onRecorderInit(async (init) => {
      initRef.current = init;
      try {
        await setup(init);
        setPhase('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    });
    return unsub;
  }, []);

  async function setup(init: RecorderInit): Promise<void> {
    // Desktop video (and optionally system loopback audio) for the display.
    const constraints: MediaStreamConstraints = {
      audio: init.recordSystemAudio
        ? ({ mandatory: { chromeMediaSource: 'desktop' } } as unknown as MediaTrackConstraints)
        : false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: init.sourceId,
          maxFrameRate: init.fps,
        },
      } as unknown as MediaTrackConstraints,
    };
    const desktopStream = await navigator.mediaDevices.getUserMedia(constraints);
    rawStreamsRef.current.push(desktopStream);

    let micStream: MediaStream | null = null;
    if (init.recordMicrophone) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rawStreamsRef.current.push(micStream);
      } catch {
        // no microphone available — continue without it
      }
    }

    // Hidden video element playing the full-display stream.
    const video = document.createElement('video');
    video.srcObject = desktopStream;
    video.muted = true;
    await video.play();
    videoRef.current = video;

    // Crop canvas at the region's physical pixel size.
    const scale = init.scaleFactor;
    const cw = Math.max(2, Math.round(init.region.width * scale));
    const ch = Math.max(2, Math.round(init.region.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d')!;

    const sx = Math.round(init.region.x * scale);
    const sy = Math.round(init.region.y * scale);
    const draw = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) return;
      ctx.drawImage(video, sx, sy, cw, ch, 0, 0, cw, ch);
    };
    drawTimerRef.current = window.setInterval(draw, Math.max(10, Math.floor(1000 / init.fps)));

    const outStream = canvas.captureStream(init.fps);

    // Mix system + mic audio into a single track.
    const audioSources: MediaStream[] = [];
    if (desktopStream.getAudioTracks().length > 0) audioSources.push(desktopStream);
    if (micStream && micStream.getAudioTracks().length > 0) audioSources.push(micStream);
    if (audioSources.length > 0) {
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      for (const s of audioSources) audioCtx.createMediaStreamSource(s).connect(dest);
      for (const track of dest.stream.getAudioTracks()) outStream.addTrack(track);
    }

    const recorder = new MediaRecorder(outStream, {
      mimeType: pickMimeType(),
      videoBitsPerSecond: 8_000_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
  }

  function startTicker() {
    startedAtRef.current = performance.now();
    tickTimerRef.current = window.setInterval(() => {
      setElapsed(accumulatedRef.current + (performance.now() - startedAtRef.current));
    }, 250);
  }

  function stopTicker(accumulate: boolean) {
    if (tickTimerRef.current !== null) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    if (accumulate) {
      accumulatedRef.current += performance.now() - startedAtRef.current;
    }
  }

  function cleanup() {
    if (drawTimerRef.current !== null) clearInterval(drawTimerRef.current);
    stopTicker(false);
    for (const s of rawStreamsRef.current) s.getTracks().forEach((t) => t.stop());
  }

  const onRecord = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    chunksRef.current = [];
    accumulatedRef.current = 0;
    recorder.start(1000);
    startTicker();
    setPhase('recording');
  };

  const onPause = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (phase === 'recording') {
      recorder.pause();
      stopTicker(true);
      setPhase('paused');
    } else if (phase === 'paused') {
      recorder.resume();
      startTicker();
      setPhase('recording');
    }
  };

  const onStop = () => {
    const recorder = recorderRef.current;
    if (!recorder || (phase !== 'recording' && phase !== 'paused')) return;
    setPhase('saving');
    stopTicker(phase === 'recording');
    recorder.onstop = async () => {
      cleanup();
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      const buffer = await blob.arrayBuffer();
      try {
        await window.zirtola.saveRecording(buffer);
      } finally {
        window.zirtola.recordingClosed();
      }
    };
    recorder.stop();
  };

  const onCancel = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
    window.zirtola.recordingClosed();
  };

  const mm = Math.floor(elapsed / 60000);
  const ss = Math.floor((elapsed % 60000) / 1000);
  const time = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  const btn =
    'flex h-8 w-8 items-center justify-center rounded-full text-neutral-200 hover:bg-neutral-700 hover:text-white disabled:opacity-40';

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex h-12 items-center gap-2 rounded-full bg-neutral-900/95 px-3 shadow-xl ring-1 ring-white/15">
        {phase === 'error' ? (
          <span className="max-w-[240px] truncate px-1 text-xs text-red-400" title={error}>
            {error || 'Recording failed'}
          </span>
        ) : (
          <>
            {(phase === 'loading' || phase === 'ready') && (
              <button
                className={btn}
                onClick={onRecord}
                disabled={phase !== 'ready'}
                title="Record"
              >
                <span className="h-3.5 w-3.5 rounded-full bg-red-500" />
              </button>
            )}
            {(phase === 'recording' || phase === 'paused') && (
              <button
                className={btn}
                onClick={onPause}
                title={phase === 'paused' ? 'Resume' : 'Pause'}
              >
                {phase === 'paused' ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <polygon points="6,4 20,12 6,20" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <rect x="5" y="4" width="4.5" height="16" rx="1" />
                    <rect x="14.5" y="4" width="4.5" height="16" rx="1" />
                  </svg>
                )}
              </button>
            )}
            <button
              className={btn}
              onClick={onStop}
              disabled={phase !== 'recording' && phase !== 'paused'}
              title="Stop and save"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
            </button>
            <span
              className={`min-w-[52px] text-center font-mono text-sm ${
                phase === 'recording' ? 'text-red-400' : 'text-neutral-300'
              }`}
            >
              {phase === 'saving' ? 'Saving…' : time}
            </span>
          </>
        )}
        <div className="h-5 w-px bg-white/15" />
        <button className={btn} onClick={onCancel} title="Cancel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
