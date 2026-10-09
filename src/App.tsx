import React, { useState } from 'react';
import { Image, Video, Sparkles, Check, ArrowRight, ShieldCheck, Zap, Sliders, Layers } from 'lucide-react';
import { PhotoCompressor } from './components/PhotoCompressor';
import { VideoCompressor } from './components/VideoCompressor';

type ActiveTab = 'photo' | 'video';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('photo');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className={`absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full blur-[140px] opacity-20 transition-colors duration-700 ${
            activeTab === 'photo' ? 'bg-emerald-500' : 'bg-indigo-600'
          }`}
        />
        <div className="absolute top-1/2 left-10 w-96 h-96 rounded-full blur-[160px] opacity-10 bg-blue-600" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl sticky top-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-indigo-500 p-0.5 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-white">
                <Sliders className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">OptiSqueeze</span>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60 font-mono">
                  Target-Size Engine
                </span>
              </div>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-900/90 border border-slate-800 rounded-xl p-1 shadow-inner">
            <button
              type="button"
              onClick={() => setActiveTab('photo')}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'photo'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Image className="w-4 h-4" />
              <span>Photo Compressor</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('video')}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'video'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Video Compressor</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border bg-slate-900/80 border-slate-800 text-slate-300">
            <span
              className={`w-2 h-2 rounded-full animate-ping ${
                activeTab === 'photo' ? 'bg-emerald-400' : 'bg-indigo-400'
              }`}
            />
            {activeTab === 'photo'
              ? 'Real-Time Client-Side Photo Compression'
              : 'Server-Side FFmpeg 2-Pass Video Compression'}
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
            {activeTab === 'photo' ? (
              <>
                Compress Photos to{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                  Exact Target Size
                </span>
              </>
            ) : (
              <>
                Compress Videos to{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                  Exact Target Size
                </span>
              </>
            )}
          </h1>

          <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
            {activeTab === 'photo'
              ? 'Upload JPEG, PNG, WebP, or AVIF. Enter your desired file size in KB or MB, and our adaptive bisection engine compresses the photo while preserving visual fidelity.'
              : 'Upload MP4, MOV, WebM, MKV, or AVI. Enter your desired target size in KB or MB, and genuine FFmpeg calculates bitrates and encodes playable video.'}
          </p>
        </div>

        {/* Feature Component */}
        <div className="pt-2">
          {activeTab === 'photo' ? <PhotoCompressor /> : <VideoCompressor />}
        </div>
      </main>

      {/* Minimal, Purpose-Built Footer */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">OptiSqueeze</span>
            <span>•</span>
            <span>Accurate Target-Size Photo &amp; Video Compression</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400 text-[11px]">
            <span>No Fake Progress</span>
            <span>•</span>
            <span>Zero Watermarks</span>
            <span>•</span>
            <span>Exact Byte Accounting</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
