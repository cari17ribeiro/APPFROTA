import React, { useState, useRef, useEffect } from 'react';
import { Camera, Image as ImageIcon, CheckCircle, AlertCircle, Loader2, XCircle, ArrowRight, Truck, Search } from 'lucide-react';

// Função utilitária para calcular a Distância de Levenshtein (Fuzzy Matching)
const getLevenshteinDistance = (a, b) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // Substituição
          matrix[i][j - 1] + 1,     // Inserção
          matrix[i - 1][j] + 1      // Deleção
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

export default function ExtraTripScreen({ currentUser, onClose, onSave, supabase }) {
  // Passos: 1 = Câmera Unificada, 2 = Formulário/Processamento
  const [step, setStep] = useState(1);
  
  // Arquivo Único
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [photoSource, setPhotoSource] = useState(null);
  const [justificativa, setJustificativa] = useState('');
  
  // Metadados
  const [dataFoto, setDataFoto] = useState('');
  const [horaFoto, setHoraFoto] = useState('');
  
  // Estado único do OCR (Google Vision)
  const [isVisionLoading, setIsVisionLoading] = useState(false);

  // Dados Extraídos
  const [container, setContainer] = useState('');
  const [placa, setPlaca] = useState('');
  const [frota, setFrota] = useState('');
  const [carreta, setCarreta] = useState('');

  // Formulário da Viagem
  const operacoesExtra = ['REMOÇÃO', 'PESAGEM', 'TRANSFERÊNCIA', 'SCANNER - TRA', 'OUTRO'];
  const locaisPadrao = ['CLIA', 'IPA', 'BK', 'DIGITAR MANUALMENTE'];
  const [tipoOperacao, setTipoOperacao] = useState('');
  const [outroOperacao, setOutroOperacao] = useState('');
  const [origemSelect, setOrigemSelect] = useState('');
  const [origemManual, setOrigemManual] = useState('');
  const [destinoSelect, setDestinoSelect] = useState('');
  const [destinoManual, setDestinoManual] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Controle de Câmera
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  
  const GOOGLE_VISION_API_KEY = import.meta.env.VITE_GOOGLE_VISION_API_KEY;

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
    } catch (error) {
      alert("Não foi possível abrir a câmera. Certifique-se de dar permissão ou use a Galeria.");
      setIsCameraActive(false);
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
    setMetadados(mockFile);
    stopCamera();
    setStep(2); 

    runVisionOCR(base64Image); 
  };

  const setMetadados = (selectedFile = null) => {
    if (dataFoto) return; 
    const dateToUse = selectedFile && selectedFile.lastModified ? new Date(selectedFile.lastModified) : new Date();
    setDataFoto(dateToUse.toISOString().split('T')[0]);
    setHoraFoto(dateToUse.toTimeString().split(' ')[0].substring(0, 5));
  };

  // 1. GOOGLE VISION (Contêiner Vertical e Placa Simultâneos)
  const runVisionOCR = async (base64Image) => {
    setIsVisionLoading(true);
    try {
      const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ image: { content: base64Image }, features: [{ type: 'TEXT_DETECTION' }] }]
        })
      });

      if (!response.ok) throw new Error('Falha API Vision');
      const data = await response.json();
      const detectedText = data.responses[0]?.fullTextAnnotation?.text;

      if (!detectedText) throw new Error('Sem texto na imagem');

      const originalUpper = detectedText.toUpperCase();
      
      // ==========================================
      // A) EXTRAÇÃO DO CONTÊINER (Suporte para Horizontal e Vertical)
      // ==========================================
      let finalContainer = null;
      let cleanText = originalUpper.replace(/[\n\r\s-]/g, '');
      const perfectMatch = cleanText.match(/[A-Z]{4}\d{7}/);

      if (perfectMatch) {
        finalContainer = perfectMatch[0];
      } else {
        const soLetras = cleanText.replace(/[^A-Z]/g, '');
        const prefixMatch = soLetras.match(/[A-Z]{3}[UJZ]/);

        if (prefixMatch) {
          const prefix = prefixMatch[0];
          const regexPrefix = new RegExp(prefix.split('').join('[\\s\\n\\r-]*'));
          const matchOriginal = originalUpper.match(regexPrefix);

          if (matchOriginal) {
            const remainder = originalUpper.substring(matchOriginal.index + matchOriginal[0].length).substring(0, 50);
            let combined = matchOriginal[0] + remainder;

            combined = combined.replace(/\b\d{2}[A-Z][A-Z0-9]\b/g, ''); // Remove ISO Codes
            combined = combined.replace(/\b(?:TARE|MAX|GROSS|PAYLOAD|NET|WT|LBS|KGS|KG)\s*\d+\b/g, ''); // Remove pesos

            let cleanedCombined = combined.replace(/[\n\r\s-]/g, '')
              .replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1')
              .replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');

            const numbersMatch = cleanedCombined.match(/\d{7}/);
            if (numbersMatch) {
              finalContainer = prefix + numbersMatch[0];
            } else {
              const justNumbers = cleanedCombined.replace(/[^\d]/g, '');
              if (justNumbers.length >= 7) {
                finalContainer = prefix + justNumbers.slice(0, 7);
              }
            }
          }
        }
      }
      
      if (finalContainer) setContainer(finalContainer);

      // ==========================================
      // B) EXTRAÇÃO DA PLACA
      // ==========================================
      const plateRegex = /\b[A-Z]{3}\s*-?\s*[0-9][A-Z0-9][0-9]{2}\b/g;
      const plateMatches = originalUpper.match(plateRegex);

      if (plateMatches && plateMatches.length > 0) {
        const placaEncontrada = plateMatches[0].replace(/[\n\r\s-]/g, '');
        setPlaca(placaEncontrada);
        // Dispara a busca inteligente com Fuzzy Matching
        buscarDadosVeiculo(placaEncontrada);
      }

    } catch (error) {
      console.log("Falha ao processar OCR:", error);
    } finally {
      setIsVisionLoading(false);
    }
  };

  // 2. BUSCA NO BANCO + INTELIGÊNCIA FUZZY MATCHING
  const buscarDadosVeiculo = async (placaLida) => {
    try {
      // Passo A: Tenta o match exato tradicional
      const { data: exactData, error: exactError } = await supabase
        .from('veiculos')
        .select('placa, frota, carreta')
        .or(`carreta.ilike.%${placaLida}%,placa.ilike.%${placaLida}%`)
        .limit(1);

      if (!exactError && exactData && exactData.length > 0) {
        const v = exactData[0];
        setFrota(v.frota);
        setPlaca(v.placa); 
        setCarreta(v.carreta);
        return;
      }

      // Passo B: Se não achou exato, roda o Fuzzy Matching contra a frota cadastrada
      const { data: frotaCompleta, error: fetchError } = await supabase
        .from('veiculos')
        .select('placa, frota, carreta');

      if (fetchError) throw fetchError;

      if (frotaCompleta && frotaCompleta.length > 0) {
        let melhorMatch = null;
        let menorDistancia = 999;

        for (const veiculo of frotaCompleta) {
          const distPlaca = getLevenshteinDistance(placaLida, veiculo.placa || '');
          const distCarreta = getLevenshteinDistance(placaLida, veiculo.carreta || '');
          const distMinima = Math.min(distPlaca, distCarreta);

          if (distMinima < menorDistancia) {
            menorDistancia = distMinima;
            melhorMatch = veiculo;
          }
        }

        // Aplica correção se houver apenas 1 ou 2 caracteres divergentes
        if (menorDistancia <= 2 && melhorMatch) {
          setFrota(melhorMatch.frota);
          setPlaca(melhorMatch.placa); 
          setCarreta(melhorMatch.carreta);
          console.log(`Fuzzy Match: Corrigido com distância ${menorDistancia}. (${placaLida} -> ${melhorMatch.carreta})`);
        } else {
          // Mantém o valor original lido caso seja um veículo externo (terceiros)
          console.log("Veículo externo detectado ou fora do limite Fuzzy. Mantendo leitura original.");
        }
      }
    } catch (error) {
      console.log("Erro ao processar validação de frota por aproximação:", error);
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
      
      alert("Sucesso! Viagem Extra enviada para a equipa de validação.");
      onClose(); 

    } catch (error) {
      alert("Erro ao salvar viagem Extra: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDestinoBloqueado = tipoOperacao === 'REMOÇÃO' || tipoOperacao === 'PESAGEM';

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full window-height max-w-2xl my-auto flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5 flex justify-between items-center text-white">
          <div className="flex items-center space-x-3">
            <div className="bg-white/20 p-2 rounded-xl"><Truck className="w-5 h-5 text-teal-300" /></div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Registo de Extra</h2>
              <p className="text-xs text-slate-300 font-medium mt-0.5">Captura Unificada (Contêiner e Placa)</p>
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
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">Enquadre o número do contêiner e a placa do veículo em uma única foto usando os guias.</p>

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
                    
                    <div className="absolute inset-0 flex flex-col justify-between p-6 pb-12">
                      <div className="w-full h-[40%] border-4 border-dashed border-yellow-400 rounded-xl bg-yellow-400/20 flex flex-col items-center justify-end pb-4 shadow-[0_0_0_999px_rgba(15,23,42,0.4)]">
                        <span className="text-white text-[10px] font-black tracking-widest uppercase bg-slate-900/80 px-3 py-1.5 rounded-full shadow-lg">
                          Alinhe o Contêiner Aqui
                        </span>
                      </div>
                      
                      <div className="flex-1"></div>

                      <div className="w-full h-[25%] border-4 border-dashed border-blue-400 rounded-xl bg-blue-500/20 flex flex-col items-center justify-end pb-3">
                        <span className="text-white text-[10px] font-black tracking-widest uppercase bg-slate-900/80 px-3 py-1.5 rounded-full shadow-lg">
                          Alinhe a Placa Aqui
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 w-full max-w-md">
                    <button type="button" onClick={stopCamera} className="flex-1 bg-white border border-slate-300 text-slate-700 py-3.5 rounded-xl font-bold hover:bg-slate-50 transition-colors">Cancelar</button>
                    <button type="button" onClick={takePhoto} className="flex-1 bg-indigo-600 text-white py-3.5 rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-colors">Capturar Foto Única</button>
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}

          {/* PASSO 2: FORMULÁRIO FINAL E PRÉ-VISUALIZAÇÃO */}
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

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                {isVisionLoading && (
                  <div className="flex items-center text-indigo-600 font-bold text-sm bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando inteligência artificial...
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row gap-5">
                  <div className="w-full sm:w-1/3 aspect-[3/4] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                    {previewUrl ? <img src={previewUrl} alt="Captura" className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-slate-400 text-xs font-bold">Sem foto</div>}
                  </div>

                  <div className="flex-1 flex flex-col justify-center space-y-3">
                    <div className={`p-3 rounded-xl border ${container ? 'bg-yellow-50 border-yellow-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider mb-0.5">Leitura do Contêiner</span>
                      <span className={`text-lg font-black tracking-wider ${!container && 'text-slate-400'}`}>{container || (isVisionLoading ? 'Analisando...' : 'NÃO LIDO')}</span>
                    </div>

                    <div className={`p-3 rounded-xl border ${placa ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider mb-0.5">Leitura da Placa</span>
                      <span className={`text-lg font-black tracking-wider ${!placa && 'text-slate-400'}`}>{placa || (isVisionLoading ? 'Analisando...' : 'NÃO LIDA')}</span>
                    </div>

                    {frota && (
                      <div className="text-xs bg-indigo-50 text-indigo-700 p-2.5 rounded-xl font-bold flex items-center border border-indigo-100 mt-2">
                        <Search className="w-4 h-4 mr-2 shrink-0" /> Vínculo Automático: {frota} | {carreta}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Formulário Interativo */}
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
