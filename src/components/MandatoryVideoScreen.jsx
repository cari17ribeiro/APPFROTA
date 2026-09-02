import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Play, ShieldCheck } from 'lucide-react';

let youtubeApiPromise;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve(window.YT);
    };

    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('Não foi possível carregar o player do YouTube.'));
      document.head.appendChild(script);
    }
  });

  return youtubeApiPromise;
}

export default function MandatoryVideoScreen({ videoId, driverName, onComplete }) {
  const playerElementRef = useRef(null);
  const playerRef = useRef(null);
  const completionStartedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const [isReady, setIsReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const saveCompletion = useCallback(async () => {
    if (completionStartedRef.current) return;

    completionStartedRef.current = true;
    setIsSaving(true);
    setError('');

    try {
      await onCompleteRef.current();
      setCompleted(true);
    } catch (saveError) {
      completionStartedRef.current = false;
      setError(saveError.message || 'O vídeo terminou, mas não foi possível salvar a confirmação.');
    } finally {
      setIsSaving(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !playerElementRef.current) return;

        playerRef.current = new YT.Player(playerElementRef.current, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            rel: 0
          },
          events: {
            onReady: (event) => {
              setIsReady(true);
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) {
                setHasStarted(true);
                setAutoplayBlocked(false);
              }

              if (event.data === YT.PlayerState.ENDED) {
                setVideoEnded(true);
                saveCompletion();
              }
            },
            onAutoplayBlocked: () => setAutoplayBlocked(true),
            onError: () => setError('Não foi possível reproduzir o vídeo. Verifique a conexão e tente novamente.')
          }
        });
      })
      .catch((loadError) => setError(loadError.message));

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [saveCompletion, videoId]);

  const startVideo = () => {
    setError('');
    setAutoplayBlocked(false);
    playerRef.current?.playVideo?.();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-500/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black">Vídeo obrigatório de orientação</h1>
          <p className="text-slate-300 mt-2">
            {driverName ? `${driverName}, assista` : 'Assista'} ao vídeo completo para acessar o BD FLOW.
          </p>
        </div>

        <div
          className="relative w-full aspect-video overflow-hidden rounded-2xl bg-black border border-slate-700 shadow-2xl"
          onContextMenu={(event) => event.preventDefault()}
        >
          <div ref={playerElementRef} className="absolute inset-0" />

          {!isReady && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
              <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
              <span className="mt-3 text-sm text-slate-300">Carregando vídeo...</span>
            </div>
          )}

          {isReady && !hasStarted && (autoplayBlocked || !completed) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <button
                type="button"
                onClick={startVideo}
                className="inline-flex items-center gap-3 rounded-2xl bg-blue-600 hover:bg-blue-500 px-7 py-4 text-lg font-bold shadow-xl transition-colors"
              >
                <Play className="w-6 h-6 fill-current" />
                Iniciar vídeo obrigatório
              </button>
            </div>
          )}

          {isSaving && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85">
              <Loader2 className="w-10 h-10 animate-spin text-teal-400" />
              <span className="mt-3 font-semibold">Salvando sua confirmação...</span>
            </div>
          )}

          {completed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950">
              <CheckCircle2 className="w-14 h-14 text-emerald-400" />
              <span className="mt-3 text-xl font-bold">Vídeo concluído</span>
            </div>
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
          O avanço está desativado. Se você fechar ou recarregar esta página antes do término, o vídeo continuará obrigatório no próximo acesso.
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-800 bg-rose-950/70 p-4 text-rose-100" role="alert">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{error}</p>
                {videoEnded && (
                  <button
                    type="button"
                    onClick={saveCompletion}
                    disabled={isSaving}
                    className="mt-3 rounded-xl bg-rose-700 hover:bg-rose-600 px-4 py-2 font-bold disabled:opacity-60"
                  >
                    Tentar salvar novamente
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
