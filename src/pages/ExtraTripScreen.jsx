import React, { useState, useRef, useEffect } from 'react';
import { Camera, Image as ImageIcon, AlertCircle, Loader2, XCircle, ArrowRight, Truck, Search, ZoomIn, Download } from 'lucide-react';
import { runHybridOcrPipeline } from '../services/hybridOcrPipeline.js';
import { isValidContainerCode, normalizeOcrText } from '../utils/ocrNormalization.js';

const booleanFromEnv = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

const getValidContainerAlternatives = (alternatives = []) =>
  Array.from(
    new Map(
      alternatives
        .filter((candidate) =>
          candidate.text &&
          candidate.regexValid &&
          candidate.ownerCategoryValid &&
          candidate.freightContainerCategory &&
          candidate.checkDigitValid
        )
        .map((candidate) => [candidate.text, candidate])
    ).values()
  ).slice(0, 4);

export default function ExtraTripScreen({ currentUser, onClose, supabase }) {
  const [step, setStep] = useState(1);
  
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [photoSource, setPhotoSource] = useState(null);
  const [justificativa, setJustificativa] = useState('');
  
  
  const [dataFoto, setDataFoto] = useState('');
  const [horaFoto, setHoraFoto] = useState('');
  
  
  const [isVisionLoading, setIsVisionLoading] = useState(false);

  const [container, setContainer] = useState('');
  const [placa, setPlaca] = useState('');
  const [frota, setFrota] = useState('');
  const [carreta, setCarreta] = useState('');
  const [ocrResult, setOcrResult] = useState(null);
  const [containerConfirmed, setContainerConfirmed] = useState(false);

  
  const operacoesExtra = ['REMOÇÃO', 'PESAGEM', 'TRANSFERÊNCIA', 'SCANNER - TRA', 'OUTRO'];
  const locaisPadrao = ['CLIA', 'IPA', 'BK', 'DIGITAR MANUALMENTE'];
  const [tipoOperacao, setTipoOperacao] = useState('');
  const [outroOperacao, setOutroOperacao] = useState('');
  const [origemSelect, setOrigemSelect] = useState('');
  const [origemManual, setOrigemManual] = useState('');
  const [destinoSelect, setDestinoSelect] = useState('');
  const [destinoManual, setDestinoManual] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [isZoomSupported, setIsZoomSupported] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  
  useEffect(() => {
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    setIsCameraActive(true);
    setPhotoSource('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const track = stream.getVideoTracks()[0];
      setTimeout(() => {
        const capabilities = track.getCapabilities();
        if (capabilities.zoom) {
          setIsZoomSupported(true);
          setMaxZoom(capabilities.zoom.max);
          setZoom(capabilities.zoom.min || 1);
        }
      }, 500); 
      
    } catch {
      alert("Não foi possível abrir a câmera. Certifique-se de dar permissão ou use a Galeria.");
      setIsCameraActive(false);
    }
  };

  const handleZoomChange = (e) => {
    const newZoom = Number(e.target.value);
    setZoom(newZoom);
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      try {
        track.applyConstraints({ advanced: [{ zoom: newZoom }] });
      } catch (err) {
        console.log("Erro ao aplicar zoom", err);
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64Image = dataUrl.split(',')[1];

    canvas.toBlob((blob) => {
      if (blob) processImageCapture(blob, base64Image);
    }, 'image/jpeg', 0.85);
  };

  const handleGalleryCapture = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setPhotoSource('galeria');
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Image = reader.result.split(',')[1];
      processImageCapture(selectedFile, base64Image);
    };
    reader.readAsDataURL(selectedFile);
  };

  const processImageCapture = (fileOrBlob, base64Image) => {
    const mockFile = fileOrBlob instanceof File ? fileOrBlob : new File([fileOrBlob], `extra-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const imgUrl = URL.createObjectURL(mockFile);

    setFile(mockFile);
    setPreviewUrl(imgUrl);
    setContainer('');
    setPlaca('');
    setFrota('');
    setCarreta('');
    setOcrResult(null);
    setContainerConfirmed(false);
    setMetadados(mockFile);
    stopCamera();
    setStep(2); 

    runHybridOCR(base64Image); 
  };

  const downloadOfflinePhoto = () => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `viagem_extra_offline_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const setMetadados = (selectedFile = null) => {
    if (dataFoto) return; 
    const dateToUse = selectedFile && selectedFile.lastModified ? new Date(selectedFile.lastModified) : new Date();
    setDataFoto(dateToUse.toISOString().split('T')[0]);
    setHoraFoto(dateToUse.toTimeString().split(' ')[0].substring(0, 5));
  };

  const runHybridOCR = async (base64Image) => {
    setIsVisionLoading(true);

    try {
      const result = await runHybridOcrPipeline(base64Image);
      setOcrResult(result);
      if (import.meta.env.VITE_OCR_DEBUG === 'true') console.debug('OCR debug:', result.debug);

      const firstAlternative = getValidContainerAlternatives(result.alternatives)[0]?.text || '';
      const containerCandidate = result.containerCode || firstAlternative;
      if (containerCandidate) {
        setContainer(containerCandidate);
        setContainerConfirmed(false);
      }
      if (result.plate) setPlaca(result.plate);
      if (result.fleetNumber) buscarDadosVeiculo(result.fleetNumber);

    } catch (error) {
      console.log("Falha ao processar OCR:", error);
    } finally {
      setIsVisionLoading(false);
    }
  };

  const buscarDadosVeiculo = async (numeroFrotaLido) => {
    try {
      const { data, error } = await supabase
        .from('veiculos')
        .select('placa, frota, carreta')
        .eq('frota', numeroFrotaLido) 
        .limit(1)
        .single();
        
      if (error) throw error;

      if (data) {
        setFrota(data.frota);
        setPlaca(data.placa); 
        setCarreta(data.carreta); 
      }
    } catch {
      console.log(`Frota ${numeroFrotaLido} lida pela IA, mas não encontrada no banco de dados.`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let urlUnica = null;
      if (file) {
        const ext = file.name.split('.').pop() || 'jpg';
        const name = `foto-dupla-${currentUser.id}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('comprovantes').upload(name, file);
        if (!error) urlUnica = supabase.storage.from('comprovantes').getPublicUrl(name).data.publicUrl;
      }
      const origemFinal = origemSelect === 'DIGITAR MANUALMENTE' ? origemManual : origemSelect;
      let destinoFinal = destinoSelect === 'DIGITAR MANUALMENTE' ? destinoManual : destinoSelect;
      if (tipoOperacao === 'REMOÇÃO' || tipoOperacao === 'PESAGEM') destinoFinal = origemFinal;
      const operacaoFinal = tipoOperacao === 'OUTRO' ? outroOperacao.toUpperCase() : tipoOperacao;
      
      const viagemData = {
        user_id: currentUser.id,
        motorista: currentUser.motorista || currentUser.nome, 
        data: dataFoto,
        hora: horaFoto,
        tipo_operacao: operacaoFinal,
        origem: origemFinal.trim(),
        destino: destinoFinal.trim(),
        container: container, 
        placa: placa,         
        frota: frota,
        carreta: carreta,
        justificativa: justificativa,
        photo_source: photoSource,
        comprovante_url: urlUnica,
        status: 'Pendente Validação'
      };

      const { error: insertError } = await supabase.from('viagens_extra').insert([viagemData]);
      if (insertError) throw insertError;
      alert("Sucesso! Viagem Extra enviada para a equipe de validação.");
      onClose(); 
    } catch (error) {
      alert("Erro ao salvar viagem Extra: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDestinoBloqueado = tipoOperacao === 'REMOÇÃO' || tipoOperacao === 'PESAGEM';
  const showOcrDebugPanel = booleanFromEnv(import.meta.env.VITE_OCR_SHOW_DEBUG_PANEL, false);
  const showIsoAlternatives = booleanFromEnv(import.meta.env.VITE_OCR_SHOW_ISO_ALTERNATIVES, false);
  const containerAlternatives = getValidContainerAlternatives(ocrResult?.alternatives || []);
  const containerManualValid = container ? isValidContainerCode(container) : false;
  const showAmbiguousWarning = showIsoAlternatives && ocrResult?.ambiguous && !containerConfirmed;
  const showOcrDebug = Boolean(ocrResult?.debug) && showOcrDebugPanel;
  const debugAttempts = ocrResult?.debug?.rawOcrTexts || [];
  const debugCandidates = ocrResult?.debug?.candidates || [];
  const compactDebugText = (value) => {
    const compact = String(value || '').replace(/\s+/g, ' ').trim();
    return compact.length > 140 ? `${compact.slice(0, 140)}...` : compact;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full window-height max-w-2xl my-auto flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5 flex justify-between items-center text-white">
          <div className="flex items-center space-x-3">
            <div className="bg-white/20 p-2 rounded-xl"><Truck className="w-5 h-5 text-teal-300" /></div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Registro de Extra</h2>
              <p className="text-xs text-slate-300 font-medium mt-0.5">Captura Unificada (Contêiner e Frota)</p>
            </div>
          </div>
          <button onClick={() => { stopCamera(); onClose(); }} className="p-2 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 sm:p-8 bg-slate-50 flex-1 flex flex-col justify-center overflow-y-auto">
          
          {/* PASSO 1: MÁQUINA FOTOGRÁFICA UNIFICADA */}
          {step === 1 && (
            <div className="space-y-6 flex flex-col h-full justify-center">
              {!isCameraActive ? (
                <div className="space-y-6 text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-indigo-100 text-indigo-600">
                    <Camera className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Fotografe o Conjunto</h3>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">Posicione a frota do caminhão à esquerda e o código do contêiner à direita.</p>

                  <div className="grid grid-cols-1 gap-4 max-w-md mx-auto w-full">
                    <button type="button" onClick={startCamera} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl p-5 flex items-center justify-center space-x-3 shadow-md transition-colors">
                      <Camera className="w-6 h-6" /> <span className="font-bold text-lg">Abrir Câmera</span>
                    </button>
                    <div className="relative group">
                      <input type="file" accept="image/*" onChange={handleGalleryCapture} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                      <div className="bg-white border-2 border-slate-200 text-slate-700 rounded-2xl p-5 flex items-center justify-center space-x-3 shadow-sm hover:border-slate-300 transition-colors">
                        <ImageIcon className="w-6 h-6 text-slate-400" /> <span className="font-bold text-lg">Escolher da Galeria</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative w-full aspect-[3/4] max-w-md bg-black rounded-2xl overflow-hidden shadow-inner">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    
                    {/* GUIAS VISUAIS ATUALIZADAS: FROTA ESQUERDA, CONTÊINER DIREITA */}
                    <div className="absolute inset-0 flex p-6 pb-16 pointer-events-none gap-4">
                      
                      {/* Lado Esquerdo: Frota (Caminhão) */}
                      <div className="w-[45%] h-full flex flex-col justify-center">
                        <div className="w-full h-[40%] border-4 border-dashed border-blue-400 rounded-xl bg-blue-500/20 flex flex-col items-center justify-end pb-3 shadow-[0_0_0_999px_rgba(15,23,42,0.5)]">
                          <span className="text-white text-[10px] text-center font-black tracking-widest uppercase bg-slate-900/80 px-2 py-1.5 rounded-lg shadow-lg">
                            Nº FROTA<br/>AQUI
                          </span>
                        </div>
                      </div>

                      {/* Lado Direito: Contêiner (Vertical e Alto) */}
                      <div className="w-[55%] h-full flex flex-col justify-center">
                        <div className="w-full h-[85%] border-4 border-dashed border-yellow-400 rounded-xl bg-yellow-400/20 flex flex-col items-center justify-end pb-4 shadow-[0_0_0_999px_rgba(15,23,42,0.5)]">
                          <span className="text-white text-[10px] text-center font-black tracking-widest uppercase bg-slate-900/80 px-2 py-1.5 rounded-lg shadow-lg">
                            CÓDIGO<br/>CONTÊINER
                          </span>
                        </div>
                      </div>

                    </div>
                    
                    {isZoomSupported && (
                      <div className="absolute left-4 right-4 bottom-4 flex items-center space-x-3 bg-slate-900/60 p-3 rounded-full backdrop-blur-md">
                        <ZoomIn className="w-5 h-5 text-white shrink-0" />
                        <input 
                          type="range" 
                          min="1" 
                          max={maxZoom} 
                          step="0.1" 
                          value={zoom} 
                          onChange={handleZoomChange}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-4 w-full max-w-md">
                    <button type="button" onClick={stopCamera} className="flex-1 bg-white border border-slate-300 text-slate-700 py-3.5 rounded-xl font-bold hover:bg-slate-50 transition-colors">Cancelar</button>
                    <button type="button" onClick={takePhoto} className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-colors">Capturar Foto</button>
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}

          {/* PASSO 2: FORMULÁRIO FINAL El PRÉ-VISUALIZAÇÃO */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-right-4">
              
              {photoSource === 'galeria' && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-3">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-amber-900">Uso da Galeria Detectado</h4>
                    </div>
                  </div>
                  <textarea required value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder="Por que não tirou a foto na hora? (Obrigatório)" className="w-full text-sm bg-white border border-amber-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-amber-500/20" rows={2} />
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 relative">
                
                <button 
                  type="button" 
                  onClick={downloadOfflinePhoto}
                  className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-lg flex items-center text-xs font-bold transition-colors border border-slate-200 z-10"
                  title="Baixar foto para enviar depois (Modo Offline)"
                >
                  <Download className="w-4 h-4 mr-1" /> Salvar Offline
                </button>

                {isVisionLoading && (
                  <div className="flex items-center text-indigo-600 font-bold text-sm bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analisando Imagem...
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row gap-5 mt-4">
                  <div className="w-full sm:w-1/3 aspect-[3/4] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shrink-0 relative">
                    {previewUrl ? <img src={previewUrl} alt="Captura" className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-slate-400 text-xs font-bold">Sem foto</div>}
                  </div>

                  <div className="flex-1 flex flex-col justify-center space-y-3">
                    <div className={`p-3 rounded-xl border ${container ? 'bg-yellow-50 border-yellow-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider mb-0.5">Leitura do Contêiner</span>
                      <span className={`text-lg font-black tracking-wider ${!container && 'text-slate-400'}`}>{container || (isVisionLoading ? 'Analisando...' : 'NÃO LIDO')}</span>
                      <div className="mt-3">
                        <label className="text-[10px] font-black text-slate-400 block uppercase tracking-wider mb-1">
                          Confirmar / corrigir contêiner
                        </label>
                        <input
                          type="text"
                          value={container}
                          onChange={(e) => {
                            setContainer(normalizeOcrText(e.target.value).slice(0, 11));
                            setContainerConfirmed(true);
                          }}
                          placeholder="AAAA0000000"
                          maxLength={11}
                          className={`w-full rounded-lg border px-3 py-2 text-sm font-black tracking-wider outline-none transition-colors ${
                            !container
                              ? 'bg-white border-slate-200 focus:border-yellow-300'
                              : containerManualValid
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 focus:border-emerald-400'
                                : 'bg-amber-50 border-amber-200 text-amber-800 focus:border-amber-400'
                          }`}
                        />
                        {container && (
                          <span className={`mt-1 block text-[10px] font-bold ${containerManualValid ? 'text-emerald-600' : 'text-amber-700'}`}>
                            {containerManualValid ? 'Dígito verificador válido' : 'Confira o código: formato ou dígito verificador não bate'}
                          </span>
                        )}
                      </div>
                      {showAmbiguousWarning && (
                        <div className="mt-2 flex items-start text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                          <AlertCircle className="w-4 h-4 mr-1.5 mt-0.5 shrink-0" />
                          <span>Leitura ambígua. Confirme uma opção abaixo.</span>
                        </div>
                      )}
                      {showIsoAlternatives && containerAlternatives.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">Alternativas ISO</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {containerAlternatives.map((candidate) => (
                              <button
                                key={candidate.text}
                                type="button"
                                onClick={() => {
                                  setContainer(candidate.text);
                                  setContainerConfirmed(true);
                                }}
                                className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                                  container === candidate.text
                                    ? 'bg-yellow-100 border-yellow-300 text-slate-900'
                                    : 'bg-white border-slate-200 hover:border-yellow-300 hover:bg-yellow-50 text-slate-700'
                                }`}
                              >
                                <span className="block text-sm font-black tracking-wider">{candidate.text}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={`p-3 rounded-xl border ${frota ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider mb-0.5">Leitura da Frota</span>
                      <span className={`text-lg font-black tracking-wider ${!frota && 'text-slate-400'}`}>{frota || (isVisionLoading ? 'Analisando...' : 'NÃO LIDA')}</span>
                    </div>

                    {placa && (
                      <div className="text-xs bg-indigo-50 text-indigo-700 p-2.5 rounded-xl font-bold flex items-center border border-indigo-100 mt-2">
                        <Search className="w-4 h-4 mr-2 shrink-0" /> Vinculado: Placa {placa} | Carreta {carreta}
                      </div>
                    )}
                    {showOcrDebugPanel && ocrResult?.timing && (
                      <div className="text-[11px] bg-slate-50 text-slate-500 p-2.5 rounded-xl font-bold border border-slate-200">
                        <div className="flex justify-between gap-3">
                          <span>OCR atual</span>
                          <span>{(ocrResult.timing.optimizedTotalMs / 1000).toFixed(1)}s</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Original</span>
                          <span>
                            {ocrResult.timing.legacyFullImageMs
                              ? `${(ocrResult.timing.legacyFullImageMs / 1000).toFixed(1)}s`
                              : 'n/d'}
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          Roboflow {ocrResult.timing.roboflowMs ? `${(ocrResult.timing.roboflowMs / 1000).toFixed(1)}s` : 'n/d'} · Vision crop {ocrResult.timing.cropVisionCalls}x
                        </div>
                      </div>
                    )}
                    {showOcrDebug && (
                      <details className="text-[11px] bg-slate-900 text-slate-100 p-3 rounded-xl border border-slate-700">
                        <summary className="cursor-pointer font-black uppercase tracking-wider text-slate-300">
                          Debug OCR temporário
                        </summary>
                        <div className="mt-3 space-y-3">
                          <div>
                            <span className="block text-slate-400 font-black mb-1">Candidatos</span>
                            <div className="space-y-1">
                              {debugCandidates.slice(0, 8).map((candidate, index) => (
                                <div key={`${candidate.text}-${index}`} className="rounded-lg bg-slate-800 p-2">
                                  <div className="flex justify-between gap-2">
                                    <span className="font-black text-white">{candidate.text}</span>
                                    <span className="text-slate-400">score {Math.round(candidate.score || 0)}</span>
                                  </div>
                                  <div className="text-slate-400">
                                    {candidate.transform} · {candidate.candidateSource} · check {candidate.checkDigitValid ? 'ok' : 'falhou'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="block text-slate-400 font-black mb-1">Tentativas Vision</span>
                            <div className="space-y-1">
                              {debugAttempts.slice(0, 10).map((attempt, index) => (
                                <div key={`${attempt.transform}-${index}`} className="rounded-lg bg-slate-800 p-2">
                                  <div className="flex justify-between gap-2">
                                    <span className="font-black text-white">{attempt.transform}</span>
                                    <span className="text-slate-400">{attempt.durationMs ? `${(attempt.durationMs / 1000).toFixed(1)}s` : 'n/d'}</span>
                                  </div>
                                  <div className="text-slate-300">{compactDebugText(attempt.rawText || attempt.normalizedText)}</div>
                                  {attempt.spatialTexts?.length > 0 && (
                                    <div className="mt-1 text-slate-400">
                                      {attempt.spatialTexts.slice(0, 3).map((item) => `${item.kind}:${item.text}`).join(' | ')}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Data</label>
                    <input type="date" required value={dataFoto} onChange={e => setDataFoto(e.target.value)} className="w-full bg-slate-50 rounded-xl p-3 text-sm font-semibold border outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Hora</label>
                    <input type="time" required value={horaFoto} onChange={e => setHoraFoto(e.target.value)} className="w-full bg-slate-50 rounded-xl p-3 text-sm font-semibold border outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Operação</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {operacoesExtra.map(op => (
                      <button key={op} type="button" onClick={() => setTipoOperacao(op)} className={`p-3 text-[11px] font-bold rounded-xl border transition-all ${tipoOperacao === op ? 'bg-slate-800 text-white shadow-md border-slate-800' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{op}</button>
                    ))}
                  </div>
                  {tipoOperacao === 'OUTRO' && (
                    <input type="text" required value={outroOperacao} onChange={e => setOutroOperacao(e.target.value)} placeholder="Especifique a operação..." className="w-full mt-3 bg-slate-50 rounded-xl p-3 text-sm border outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">Origem</label>
                    <select value={origemSelect} onChange={e => setOrigemSelect(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none mb-2 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                      <option value="" disabled>Selecione...</option>
                      {locaisPadrao.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                    </select>
                    {origemSelect === 'DIGITAR MANUALMENTE' && (
                      <input type="text" required value={origemManual} onChange={e => setOrigemManual(e.target.value)} placeholder="Digite a origem..." className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 text-sm outline-none border focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5">
                      Destino {isDestinoBloqueado && <span className="text-indigo-500">(Automático)</span>}
                    </label>
                    <select value={isDestinoBloqueado ? origemSelect : destinoSelect} onChange={e => setDestinoSelect(e.target.value)} disabled={isDestinoBloqueado || (!origemSelect && isDestinoBloqueado)} required className={`w-full border rounded-xl p-3 text-sm font-bold outline-none mb-2 ${isDestinoBloqueado ? 'bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed' : 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500'}`}>
                      <option value="" disabled>Selecione...</option>
                      {locaisPadrao.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                    </select>
                    {destinoSelect === 'DIGITAR MANUALMENTE' && !isDestinoBloqueado && (
                      <input type="text" required value={destinoManual} onChange={e => setDestinoManual(e.target.value)} placeholder="Digite o destino..." className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 text-sm outline-none border focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(1)} className="px-6 py-4 text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-2xl font-bold transition-colors">Voltar</button>
                <button type="submit" disabled={isSubmitting || isVisionLoading || !tipoOperacao} className="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white py-4 rounded-2xl font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Submeter Viagem <ArrowRight className="w-5 h-5 ml-2" /></>}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
