import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X, Check, RotateCcw, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { compressImageToPassportSize } from '../../utils/storageHelper';

interface LiveCameraModalProps {
  isOpen: boolean;
  title?: string;
  defaultFacing?: 'user' | 'environment';
  onCapture: (compressedDataUrl: string) => void;
  onClose: () => void;
}

export const LiveCameraModal: React.FC<LiveCameraModalProps> = ({
  isOpen,
  title = 'ক্যামেরা দিয়ে মুখমণ্ডলের ছবি তুলুন',
  defaultFacing = 'user',
  onCapture,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facing, setFacing] = useState<'user' | 'environment'>(defaultFacing);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {}
    }
  };

  const startStream = async (desiredFacing: 'user' | 'environment') => {
    const hadStream = Boolean(streamRef.current);
    stopStream();
    setIsStarting(true);
    setCameraError(null);

    if (hadStream) {
      await new Promise((r) => setTimeout(r, 320));
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsStarting(false);
      setCameraError('এই ব্রাউজারে সরাসরি ক্যামেরা সমর্থিত নয়। নিচের "ফাইল থেকে ছবি নিন" ব্যবহার করুন।');
      return;
    }

    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { exact: desiredFacing } }, audio: false },
      { video: { facingMode: desiredFacing }, audio: false },
    ];

    let stream: MediaStream | null = null;
    let lastError: any = null;

    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err: any) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    if (!stream) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput' && Boolean(d.deviceId && d.deviceId.trim()));
        const matched =
          desiredFacing === 'user'
            ? videoInputs.find((d) => /front|user|selfie|facetime/i.test(d.label || ''))
            : videoInputs.find((d) => /back|rear|environment/i.test(d.label || ''));
        const candidates = [matched, ...videoInputs].filter(
          (d, idx, arr): d is MediaDeviceInfo => Boolean(d) && arr.indexOf(d) === idx
        );
        for (const dev of candidates) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: dev.deviceId } },
              audio: false,
            });
            break;
          } catch (e) {
            lastError = e;
          }
        }
      } catch {}
    }

    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (err) {
        lastError = err;
      }
    }

    if (!stream) {
      setIsStarting(false);
      const msg = String(lastError?.message || lastError || '');
      setCameraError(
        msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')
          ? 'ক্যামেরা পারমিশন দেওয়া হয়নি। নিচের "গ্যালারি/ফাইল থেকে ছবি" বাটনে চাপ দিয়ে ছবি নিন।'
          : `ক্যামেরা চালু করা যায়নি (${msg || 'Device busy'})। গ্যালারি/ফাইল থেকে ছবি নিতে পারেন।`
      );
      return;
    }

    streamRef.current = stream;
    try {
      const videoTrack = stream.getVideoTracks()[0];
      const settingsFacing = videoTrack?.getSettings?.()?.facingMode;
      const trackLabel = videoTrack?.label || '';
      if (settingsFacing === 'user' || settingsFacing === 'environment') {
        setFacing(settingsFacing);
      } else if (/front|user|selfie|facetime|integrated/i.test(trackLabel)) {
        setFacing('user');
      } else if (/back|rear|environment/i.test(trackLabel)) {
        setFacing('environment');
      }
    } catch {}
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch {}
    }
    setIsStarting(false);
  };

  useEffect(() => {
    if (isOpen) {
      setCapturedPreview(null);
      setFacing(defaultFacing);
      startStream(defaultFacing);
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen, defaultFacing]);

  if (!isOpen) return null;

  const handleToggleFacing = () => {
    const next: 'user' | 'environment' = facing === 'user' ? 'environment' : 'user';
    setFacing(next);
    setCapturedPreview(null);
    startStream(next);
  };

  const handleSnapFrame = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    // Center crop to 4:5 passport portrait aspect ratio
    const targetRatio = 4 / 5;
    let cropW = vw;
    let cropH = Math.round(vw / targetRatio);
    if (cropH > vh) {
      cropH = vh;
      cropW = Math.round(vh * targetRatio);
    }
    const sx = Math.max(0, Math.floor((vw - cropW) / 2));
    const sy = Math.max(0, Math.floor((vh - cropH) / 2));

    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);

    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.82);
    const compressed = await compressImageToPassportSize(rawDataUrl, 240, 300, 0.72);
    setCapturedPreview(compressed || rawDataUrl);
  };

  const handleFileFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const compressed = await compressImageToPassportSize(file, 240, 300, 0.72);
    if (compressed) {
      setCapturedPreview(compressed);
    }
  };

  const handleConfirm = () => {
    if (!capturedPreview) return;
    stopStream();
    onCapture(capturedPreview);
    onClose();
  };

  const handleClose = () => {
    stopStream();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 text-white rounded-3xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black">{title}</h4>
              <p className="text-[10px] text-slate-400">মুখমণ্ডল ওভাল ফ্রেমের ভেতরে সোজা রাখুন</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-700/70 hover:bg-slate-600 flex items-center justify-center text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera / Preview Viewport */}
        <div className="relative bg-black aspect-[4/5] max-h-[60vh] w-full flex items-center justify-center overflow-hidden">
          {capturedPreview ? (
            <img
              src={capturedPreview}
              alt="Captured Face"
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`w-full h-full object-cover ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
              />
              {/* Face alignment oval */}
              {!cameraError && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-60 border-2 border-dashed border-cyan-400/80 rounded-[50%] shadow-[0_0_40px_rgba(34,211,238,0.2)]" />
                </div>
              )}
              {isStarting && (
                <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center text-xs text-cyan-300 font-bold gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  <span>ক্যামেরা চালু হচ্ছে...</span>
                </div>
              )}
              {cameraError && (
                <div className="absolute inset-0 bg-slate-950/95 p-6 flex flex-col items-center justify-center text-center gap-3">
                  <AlertCircle className="w-10 h-10 text-amber-400" />
                  <p className="text-xs text-slate-200 leading-relaxed">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => startStream(facing)}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-xl text-xs font-bold"
                  >
                    আবার চেষ্টা করুন
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Controls */}
        <div className="p-3.5 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          {capturedPreview ? (
            <>
              <button
                type="button"
                onClick={() => setCapturedPreview(null)}
                className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>আবার তুলুন</span>
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-lg"
              >
                <Check className="w-4 h-4" />
                <span>ছবি সেভ করুন</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleToggleFacing}
                disabled={isStarting}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isStarting ? 'animate-spin' : ''}`} />
                <span>{facing === 'user' ? 'ব্যাক ক্যামেরা' : 'সেলফি ক্যামেরা'}</span>
              </button>

              <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                <span>গ্যালারি</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileFallback}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleSnapFrame}
                disabled={isStarting || !!cameraError}
                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md disabled:opacity-40"
              >
                <Camera className="w-4 h-4" />
                <span>ছবি তুলুন</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
