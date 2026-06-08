import React, { useState, useMemo } from 'react';
import { 
  Lock, Unlock, FileSpreadsheet, Users, UserPlus, AlertCircle, 
  Loader2, CheckCircle, Download, ArrowUpDown, MessageSquare, 
  XCircle, Image as ImageIcon, Upload
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';

export default function AdminDashboard({ viagens, pendentes, setPendentes, premiosLiberados, setPremiosLiberados, correcoesBloqueadas, setCorrecoesBloqueadas, refreshData, supabase }) {
  const [activeTab, setActiveTab] = useState('Em Análise'); 
  const [actionState, setActionState] = useState({ id: null, type: null }); 
  const [actionMessage, setActionMessage] = useState('');
  const [viewImageUrl, setViewImageUrl] = useState(null);
  const [mesImportacao, setMesImportacao] = useState('');
  const [isImportingUnificado, setIsImportingUnificado] = useState(false);
  const [isExportExtraOpen, setIsExportExtraOpen] = useState(false);
  const [dataInicioExtra, setDataInicioExtra] = useState('');
  const [dataFimExtra, setDataFimExtra] = useState('');
  const [isExportingExtra, setIsExportingExtra] = useState(false);

  const [nomeMotorista, setNomeMotorista] = useState('');
  const [emailMotorista, setEmailMotorista] = useState('');
  const [usuarioMotorista, setUsuarioMotorista] = useState('');
  const [senhaMotorista, setSenhaMotorista] = useState(''); 
  const [isRegistering, setIsRegistering] = useState(false);

  const [sortBy, setSortBy] = useState('data_desc');
  const [filterMotorista, setFilterMotorista] = useState('');
  const [filterMes, setFilterMes] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const toggleSort = (type) => setSortBy(sortBy === `${type}_desc` ? `${type}_asc` : `${type}_desc`);

  const aguardando = pendentes.filter(p => p.status === 'Em Análise');
  const historico = pendentes.filter(p => p.status !== 'Em Análise');

  const aguardandoSorted = useMemo(() => {
    let list = [...aguardando];
    if (sortBy === 'data_desc') list.sort((a, b) => new Date(b.data) - new Date(a.data));
    if (sortBy === 'data_asc') list.sort((a, b) => new Date(a.data) - new Date(b.data));
    if (sortBy === 'nome_asc') list.sort((a, b) => a.nome.localeCompare(b.nome));
    if (sortBy === 'nome_desc') list.sort((a, b) => b.nome.localeCompare(a.nome));
    return list;
  }, [aguardando, sortBy]);

  const uniqueMotoristas = useMemo(() => [...new Set(viagens.map(v => v.motorista))], [viagens]);
  const uniqueMeses = useMemo(() => [...new Set(viagens.map(v => v.mes))], [viagens]);
  const uniqueTipos = useMemo(() => [...new Set(viagens.map(v => v.tipo).filter(Boolean))], [viagens]);

  const todasViagensFiltradas = useMemo(() => {
    return viagens.filter(v => {
      const matchMotorista = filterMotorista ? v.motorista === filterMotorista : true;
      const matchMes = filterMes ? v.mes === filterMes : true;
      const matchTipo = filterTipo ? v.tipo === filterTipo : true;
      return matchMotorista && matchMes && matchTipo;
    }).sort((a, b) => new Date(b.data) - new Date(a.data));
  }, [viagens, filterMotorista, filterMes, filterTipo]);

  let displayedTrips = activeTab === 'Em Análise' ? aguardandoSorted : activeTab === 'historico' ? historico : todasViagensFiltradas;

  const handleToggleBloqueio = async () => {
    const novoValor = !correcoesBloqueadas;
    setCorrecoesBloqueadas(novoValor); 
    await supabase.from('configuracoes').update({ correcoes_bloqueadas: novoValor }).eq('id', 1);
  };

  const handleTogglePremios = async () => {
    const novoValor = !premiosLiberados;
    setPremiosLiberados(novoValor); 
    await supabase.from('configuracoes').update({ premios_liberados: novoValor }).eq('id', 1);
  };

  const confirmAction = async (item) => {
    if (actionState.type === 'reject' && !actionMessage.trim()) {
      alert("Por favor, insira o motivo da reprovação."); return;
    }

    const novoStatus = actionState.type === 'approve' ? 'Aprovado' : 'Reprovado';
    const msg = actionMessage.trim() || null;
    
    setPendentes(pendentes.map(p => p.id === item.id ? { ...p, status: novoStatus, resposta: msg } : p));

    try {
      const { error: errUpdate } = await supabase.from('viagens_pendentes')
        .update({ status: novoStatus, resposta: msg })
        .eq('id', item.id);
        
      if (errUpdate) throw new Error("Falha ao atualizar pendência: " + errUpdate.message);

      setActionState({ id: null, type: null });
      setActionMessage('');
      refreshData(); 
    } catch (error) {
      alert("Erro ao processar ação: " + error.message);
      console.error(error);
      refreshData();
    }
  };

  const handleCadastrarMotorista = async (e) => {
    e.preventDefault();
    setIsRegistering(true);
    
    try {
      const tempClient = window.supabase.createClient(supabase.supabaseUrl, supabase.supabaseKey, {
        auth: { persistSession: false }
      });

      const { data: authData, error: authError } = await tempClient.auth.signUp({
        email: emailMotorista,
        password: senhaMotorista,
      });

      if (authError) throw new Error('Erro ao criar credenciais de acesso: ' + authError.message);
      
      const authUserId = authData?.user?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now());

      const { error: dbError } = await supabase.from('motoristas_cadastrados').insert([{
        id: authUserId,
        motorista: nomeMotorista,
        email: emailMotorista,
        usuario: usuarioMotorista || null,
        precisa_trocar_senha: true,
        admin: false
      }]);

      if (dbError) throw new Error('Erro ao guardar informações na tabela: ' + dbError.message);

      alert('Motorista cadastrado com sucesso! A conta de acesso já está ativa.');
      setNomeMotorista('');
      setEmailMotorista('');
      setUsuarioMotorista('');
      setSenhaMotorista('');
    } catch (error) {
      alert(error.message);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleExportarMotoristas = async () => {
    const { data, error } = await supabase.from('motoristas_cadastrados').select('motorista, email');
    
    if (error) {
      alert('Erro ao buscar a lista de motoristas cadastrados.');
      return;
    }

    if (!window.XLSX) {
      alert('A biblioteca do Excel está a carregar. Tente novamente.');
      return;
    }

    const ws = window.XLSX.utils.json_to_sheet(data);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Motoristas Cadastrados");
    window.XLSX.writeFile(wb, "motoristas_cadastrados.xlsx");
  };

  const formatarDataExcel = (valorData) => {
    if (!valorData) return null;
    if (!isNaN(valorData) && typeof valorData === 'number') {
      const dateObj = new Date((valorData - (25567 + 2)) * 86400 * 1000);
      return dateObj.toISOString().split('T')[0];
    }
    if (typeof valorData === 'string' && valorData.includes('/')) {
      const [d, m, a] = valorData.split(' ')[0].split('/');
      if (d && m && a) return `${a}-${m}-${d}`;
    }
    return valorData;
  };

  const handleImportacaoUnificada = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!mesImportacao.trim()) {
      alert("Por favor, preencha o Mês de Referência (Ex: 03/2026) antes de importar o ficheiro.");
      e.target.value = null;
      return;
    }

    if (!window.XLSX) return alert("A biblioteca Excel ainda está a carregar...");
    setIsImportingUnificado(true);

    try {
      const { data: motoristasDb, error: errMot } = await supabase
        .from('motoristas_cadastrados')
        .select('motorista, email');
      
      if (errMot) throw new Error("Erro ao buscar base de motoristas.");

      const mapMotoristas = {};
      motoristasDb.forEach(m => {
        if (m.motorista) mapMotoristas[m.motorista.trim().toUpperCase()] = m.email;
      });

      const reader = new FileReader();
      
      reader.onload = async (evt) => {
        try {
          const data = evt.target.result;
          const workbook = window.XLSX.read(data, { type: 'binary' });

          let viagensParaInserir = [];
          let resumosParaInserir = [];
          let dieselParaInserir = [];

          const processarAbaViagens = (nomeAba, tipoViagem, mapaColunas) => {
            const sheet = workbook.Sheets[nomeAba];
            if (!sheet) return;

            const json = window.XLSX.utils.sheet_to_json(sheet, { header: "A", range: 12, blankrows: false });

            json.forEach(row => {
              const nomeMotorista = row[mapaColunas.mot];
              if (!nomeMotorista || String(nomeMotorista).trim() === '') return; 

              const nomeNorm = String(nomeMotorista).trim().toUpperCase();
              const email = mapMotoristas[nomeNorm] || 'sem_email@bdflow.com';

              viagensParaInserir.push({
                email: email,
                motorista: String(nomeMotorista).trim(),
                origem: row[mapaColunas.orig] ? String(row[mapaColunas.orig]).trim() : '',
                destino: row[mapaColunas.dest] ? String(row[mapaColunas.dest]).trim() : '',
                container: row[mapaColunas.cont] ? String(row[mapaColunas.cont]).trim() : '',
                data: formatarDataExcel(row[mapaColunas.data]),
                tipo: tipoViagem,
                mes: mesImportacao.trim(),
                status: 'confirmada'
              });
            });
          };

          processarAbaViagens('IMP', 'IMPO', { mot: 'J', orig: 'C', dest: 'P', cont: 'D', data: 'L' });
          processarAbaViagens('EXP', 'EXPO', { mot: 'I', orig: 'B', dest: 'C', cont: 'D', data: 'L' });
          processarAbaViagens('EXT', 'EXTRA', { mot: 'G', orig: 'C', dest: 'D', cont: 'E', data: 'H' });

          const sheetResultado = workbook.Sheets['RESULTADO'];
          if (sheetResultado) {
            const jsonResumo = window.XLSX.utils.sheet_to_json(sheetResultado, { header: "A", range: 19, blankrows: false });
            jsonResumo.forEach(row => {
              const nomeMotorista = row['E']; 
              if (!nomeMotorista || String(nomeMotorista).trim() === '') return;

              const nomeNorm = String(nomeMotorista).trim().toUpperCase();
              const email = mapMotoristas[nomeNorm] || 'sem_email@bdflow.com';

              let valorPremio = row['AA'];
              let premioFormatado = 'R$ 0,00';
              
              if (valorPremio !== undefined && valorPremio !== '') {
                if (typeof valorPremio === 'number') {
                  premioFormatado = valorPremio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                } else {
                  premioFormatado = String(valorPremio).trim();
                }
              }

              resumosParaInserir.push({
                email: email,
                motorista: String(nomeMotorista).trim(),
                impo: row['I'] || 0,
                expo: row['K'] || 0,
                extra: row['M'] || 0,
                total_viagens: row['P'] || 0,
                premio: premioFormatado
              });
            });
          }

          const sheetDiesel = workbook.Sheets['MÉDIA COMBUSTIVEL'];
          if (sheetDiesel) {
            const jsonDiesel = window.XLSX.utils.sheet_to_json(sheetDiesel, { header: "A", range: 42, blankrows: false });
            jsonDiesel.forEach(row => {
              const nomeMotorista = row['C']; 
              if (!nomeMotorista || String(nomeMotorista).trim() === '') return;

              const nomeNorm = String(nomeMotorista).trim().toUpperCase();
              const email = mapMotoristas[nomeNorm] || 'sem_email@bdflow.com';

              dieselParaInserir.push({
                email: email,
                motorista: String(nomeMotorista).trim(),
                media: row['F'] || null, 
                competencia: mesImportacao.trim()
              });
            });
          }

          if (viagensParaInserir.length === 0) {
            throw new Error("Nenhum dado de viagem encontrado nas abas IMP, EXP ou EXT.");
          }

          const promessasDelete = [];
          
          promessasDelete.push(supabase.from('minhas_viagens').delete().eq('mes', mesImportacao.trim()));
          
          if (dieselParaInserir.length > 0) {
            promessasDelete.push(supabase.from('diesel').delete().eq('competencia', mesImportacao.trim()));
          }

          if (resumosParaInserir.length > 0) {
            promessasDelete.push(supabase.from('resumo').delete().not('id', 'is', null));
          }

          const resultadosDelete = await Promise.all(promessasDelete);
          const erroDelete = resultadosDelete.find(r => r.error);
          if (erroDelete) throw new Error("Erro ao limpar dados anteriores: " + erroDelete.error.message);

          const promessasInsert = [];
          
          promessasInsert.push(supabase.from('minhas_viagens').insert(viagensParaInserir));
          
          if (resumosParaInserir.length > 0) {
            promessasInsert.push(supabase.from('resumo').insert(resumosParaInserir));
          }
          if (dieselParaInserir.length > 0) {
            promessasInsert.push(supabase.from('diesel').insert(dieselParaInserir));
          }

          const resultadosInsert = await Promise.all(promessasInsert);
          const erroInsert = resultadosInsert.find(r => r.error);
          
          if (erroInsert) {
            console.error("ERRO DO SUPABASE:", erroInsert.error);
            throw new Error(`Erro ao gravar dados: ${erroInsert.error.message}`);
          }

          const dataAtual = new Date().toISOString();
          await supabase.from('configuracoes').update({ ultima_atualizacao: dataAtual }).eq('id', 1);
          let msgSucesso = `Sucesso! Base de dados atualizada:\n`;
          msgSucesso += `🚛 ${viagensParaInserir.length} viagens adicionadas (Mês: ${mesImportacao})\n`;
          if (resumosParaInserir.length > 0) msgSucesso += `🏆 ${resumosParaInserir.length} resumos atualizados (Substituição Total)\n`;
          if (dieselParaInserir.length > 0) msgSucesso += `⛽ ${dieselParaInserir.length} médias de diesel (Mês: ${mesImportacao})`;

          alert(msgSucesso);
          refreshData();
          setMesImportacao('');

        } catch (err) {
          console.error(err);
          alert(err.message);
        } finally {
          setIsImportingUnificado(false);
          e.target.value = null;
        }
      };
      
      reader.readAsBinaryString(file);

    } catch (error) {
      alert(error.message);
      setIsImportingUnificado(false);
      e.target.value = null;
    }
  };

 const handleExportarExtras = async () => {
    if (!dataInicioExtra || !dataFimExtra) {
      alert("Por favor, selecione a data inicial e final.");
      return;
    }

    setIsExportingExtra(true);
    try {
      
      const { data, error } = await supabase
        .from('viagens_extra')
        .select('tipo_operacao, origem, destino, container, placa, motorista, data, hora, status');

      if (error) throw error;

      if (!data || data.length === 0) {
        alert("A tabela de viagens extras está vazia no banco de dados.");
        setIsExportingExtra(false);
        return;
      }

      const dataInicio = new Date(`${dataInicioExtra}T00:00:00`);
      const dataFim = new Date(`${dataFimExtra}T23:59:59`);

      const dadosFiltrados = data.filter(item => {
        if (!item.data) return false;
        
        let dataItem;
        if (item.data.includes('/')) {
          const [d, m, a] = item.data.split(' ')[0].split('/');
          dataItem = new Date(a, m - 1, d);
        } 
        else if (item.data.includes('-')) {
          const [a, m, d] = item.data.split(' ')[0].split('-');
          dataItem = new Date(a, m - 1, d);
        } else {
          dataItem = new Date(item.data);
        }

        return dataItem >= dataInicio && dataItem <= dataFim;
      });

      if (dadosFiltrados.length === 0) {
        alert("Nenhuma viagem extra encontrada neste período.");
        setIsExportingExtra(false);
        return;
      }

      if (!window.XLSX) {
        alert('A biblioteca do Excel está a carregar. Tente novamente.');
        setIsExportingExtra(false);
        return;
      }

      const ws = window.XLSX.utils.json_to_sheet(dadosFiltrados);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Viagens Extras");
      
      const formatNome = (dt) => dt.split('-').reverse().join('-');
      window.XLSX.writeFile(wb, `Extras_${formatNome(dataInicioExtra)}_ate_${formatNome(dataFimExtra)}.xlsx`);
      
      setIsExportExtraOpen(false);
    } catch (error) {
      alert("Erro ao exportar extras: " + error.message);
    } finally {
      setIsExportingExtra(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Painel de Controle </h1>
          <p className="text-slate-500 mt-1 font-medium text-lg">Faça a gestão das solicitações e operações da frota.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <button
            onClick={handleToggleBloqueio}
            className={`flex items-center justify-center space-x-2.5 px-6 py-3 rounded-2xl font-bold transition-all shadow-sm border ${
              correcoesBloqueadas 
                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 ring-4 ring-blue-500/10' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            {correcoesBloqueadas ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
            <span>{correcoesBloqueadas ? 'Correções Bloqueadas' : 'Bloquear Correções'}</span>
          </button>

          <button
            onClick={handleTogglePremios}
            className={`flex items-center justify-center space-x-2.5 px-6 py-3 rounded-2xl font-bold transition-all shadow-sm border ${
              premiosLiberados 
                ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100 ring-4 ring-teal-500/10' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            {premiosLiberados ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            <span>{premiosLiberados ? 'Prémios Visíveis' : 'Libertar Prémios (Oculto)'}</span>
          </button>

          <button
            onClick={() => setIsExportExtraOpen(true)}
            className="flex items-center justify-center space-x-2.5 px-6 py-3 rounded-2xl font-bold transition-all shadow-sm border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 ring-4 ring-indigo-500/10"
          >
            <Download className="w-5 h-5" />
            <span>Exportar Extras</span>
          </button>
          
        </div>
      </div>

      <div className="bg-white p-1.5 rounded-2xl flex overflow-x-auto hide-scrollbar border border-slate-200 shadow-sm w-fit">
        {[
          { id: 'Em Análise', label: 'Pendentes', badge: aguardando.length },
          { id: 'historico', label: 'Histórico' },
          { id: 'todas', label: 'Base Completa' },
          { id: 'importar', label: 'Importar Lotes', icon: <FileSpreadsheet className="w-4 h-4 mr-2" /> },
          { id: 'motoristas', label: 'Motoristas', icon: <Users className="w-4 h-4 mr-2" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center justify-center px-6 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50/50'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge > 0 && (
              <span className={`ml-2 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider ${
                activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden">
        
        {activeTab === 'importar' && (
          <div className="p-10">
            <div className="max-w-4xl mx-auto space-y-10">
              <div className="text-center">
                <h3 className="text-2xl font-black text-slate-800">Sincronização Direta do Excel</h3>
                <p className="text-slate-500 mt-2 font-medium">Baixe o modelo, preencha os dados e importe diretamente para o sistema.</p>
              </div>

              <div className="bg-white border-2 border-indigo-100 p-8 rounded-3xl shadow-sm mb-10">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="bg-indigo-100 text-indigo-600 p-2.5 rounded-xl"><FileSpreadsheet className="w-6 h-6"/></div>
                      <h4 className="text-xl font-black text-slate-800">Planilha Operacional Completa</h4>
                    </div>
                    <p className="text-sm text-slate-500 font-medium">
                      Lê automaticamente as abas <strong className="text-indigo-600">IMP, EXP e EXT</strong>, cruza os e-mails com a base de motoristas e substitui as viagens do mês selecionado.
                    </p>
                  </div>

                  <div className="flex-1 w-full bg-slate-50 p-5 rounded-2xl border border-slate-200/60">
                    <label className="block text-sm font-bold text-slate-700 mb-2">Mês de Referência</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input 
                        type="text" 
                        placeholder="Ex: 03/2026" 
                        value={mesImportacao}
                        onChange={e => setMesImportacao(e.target.value)}
                        className="flex-1 border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 border"
                      />
                      <label className={`cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md flex items-center justify-center whitespace-nowrap ${!mesImportacao.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {isImportingUnificado ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Upload className="w-5 h-5 mr-2" />}
                        Importar Planilha
                        <input 
                          type="file" 
                          accept=".xlsx, .xls" 
                          className="hidden" 
                          onChange={handleImportacaoUnificada} 
                          disabled={isImportingUnificado || !mesImportacao.trim()} 
                        />
                      </label>
                    </div>
                  </div>

                </div>
              </div>
              </div> 
          </div>
        )} 
    
        {activeTab === 'motoristas' && (
          <div className="p-6 sm:p-10">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-10">
                <h3 className="text-2xl font-black text-slate-800">Gestão de Motoristas</h3>
                <p className="text-slate-500 mt-2 font-medium">Cadastre novos membros da equipa e exporte a base atual.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-slate-50 p-6 sm:p-8 rounded-3xl border border-slate-200/60 shadow-sm">
                  <h4 className="font-bold text-slate-800 text-lg mb-6 flex items-center">
                    <UserPlus className="w-5 h-5 mr-2 text-blue-600" /> Cadastrar Novo Motorista
                  </h4>
                  <form onSubmit={handleCadastrarMotorista} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Nome Completo</label>
                        <input type="text" required value={nomeMotorista} onChange={e => setNomeMotorista(e.target.value)} className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 p-3.5 border outline-none transition-all bg-white" placeholder="Ex: João Silva" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">E-mail</label>
                        <input type="email" required value={emailMotorista} onChange={e => setEmailMotorista(e.target.value)} className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 p-3.5 border outline-none transition-all bg-white" placeholder="joao@empresa.com" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Nome de Utilizador</label>
                        <input type="text" value={usuarioMotorista} onChange={e => setUsuarioMotorista(e.target.value)} className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 p-3.5 border outline-none transition-all bg-white" placeholder="joao.silva" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Senha Inicial</label>
                        <input type="password" required value={senhaMotorista} onChange={e => setSenhaMotorista(e.target.value)} className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 p-3.5 border outline-none transition-all bg-white" placeholder="Mínimo 6 caracteres" minLength={6} />
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 p-4 rounded-xl flex items-start space-x-3 border border-blue-100">
                      <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-blue-800 leading-relaxed font-medium">
                        <strong>Aviso:</strong> Este formulário cria a conta do motorista diretamente na <strong>Autenticação do Supabase</strong> para garantir o login, e guarda o seu perfil na tabela <code>motoristas_cadastrados</code>.
                      </p>
                    </div>

                    <div className="pt-2">
                      <button type="submit" disabled={isRegistering} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-xl font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-70 flex items-center justify-center">
                        {isRegistering ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle className="w-5 h-5 mr-2" />}
                        {isRegistering ? 'A Registar...' : 'Confirmar Cadastro'}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="bg-teal-50 p-6 sm:p-8 rounded-3xl border border-teal-100 flex flex-col justify-center items-center text-center shadow-sm">
                  <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                    <Download className="w-8 h-8 text-teal-600" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-lg mb-2">Base de Motoristas</h4>
                  <p className="text-sm text-slate-600 mb-6 font-medium">Exporte um ficheiro Excel contendo o nome e o e-mail de todos os motoristas registados na base de dados.</p>
                  <button onClick={handleExportarMotoristas} className="w-full bg-teal-600 hover:bg-teal-700 text-white px-6 py-3.5 rounded-xl font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center">
                    <FileSpreadsheet className="w-5 h-5 mr-2" />
                    Exportar para Excel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {['Em Análise', 'historico', 'todas'].includes(activeTab) && displayedTrips.length > 0 && (
          <div className="flex items-center space-x-3 p-5 bg-slate-50/50 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center mr-2">
               Ordenar:
            </span>
            <button onClick={() => toggleSort('data')} className={`px-4 py-2 text-xs font-bold rounded-xl border transition-colors flex items-center ${sortBy.includes('data') ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              Data Envio <ArrowUpDown className="w-3 h-3 ml-1.5 opacity-50"/>
            </button>
            <button onClick={() => toggleSort('nome')} className={`px-4 py-2 text-xs font-bold rounded-xl border transition-colors flex items-center ${sortBy.includes('nome') ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              Motorista <ArrowUpDown className="w-3 h-3 ml-1.5 opacity-50"/>
            </button>
          </div>
        )}

        {activeTab === 'todas' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 bg-slate-50/50 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center mr-2">
               Filtrar:
            </span>
            <select value={filterMotorista} onChange={e => setFilterMotorista(e.target.value)} className="text-sm font-semibold border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white">
              <option value="">Todos os Motoristas</option>
              {uniqueMotoristas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={filterMes} onChange={e => setFilterMes(e.target.value)} className="text-sm font-semibold border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white">
              <option value="">Todos os Meses</option>
              {uniqueMeses.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} className="text-sm font-semibold border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white">
              <option value="">Todos os Tipos</option>
              {uniqueTipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        {['Em Análise', 'historico', 'todas'].includes(activeTab) && displayedTrips.length === 0 ? (
          <div className="p-20 text-center flex flex-col items-center">
            <div className="bg-slate-50 p-6 rounded-full mb-4"><CheckCircle className="h-10 w-10 text-slate-300" /></div>
            <p className="text-slate-500 text-lg font-medium">Nenhum registo pendente nesta vista.</p>
          </div>
        ) : ['Em Análise', 'historico', 'todas'].includes(activeTab) && (
          <ul className="divide-y divide-slate-100">
            {displayedTrips.map(item => {
              const isPendente = item.status === 'Em Análise';
              const nomeExibicao = item.nome || item.motorista; 

              return (
                <li key={item.id} className="p-6 sm:p-8 hover:bg-blue-50/10 transition-colors group">
                  <div className="flex flex-col lg:flex-row justify-between gap-8">
                    <div className="flex-1">
                      <div className="flex items-center space-x-4 mb-4">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                          {nomeExibicao.substring(0,2).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-black text-slate-900 text-lg block leading-none">{nomeExibicao}</span>
                          <span className="text-xs font-semibold text-slate-400">{item.email}</span>
                        </div>
                        <div className="ml-auto lg:ml-4"><StatusBadge status={item.status} /></div>
                      </div>

                      {item.mensagem && isPendente && (
                        <div className="bg-blue-50/50 text-blue-800 p-4 rounded-2xl text-sm mb-5 border border-blue-100">
                          <span className="font-bold flex items-center mb-1 text-[11px] uppercase tracking-wider text-blue-500"><MessageSquare className="w-3 h-3 mr-1"/> Mensagem Recebida</span>
                          <span className="font-medium">{item.mensagem}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                          <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Data / Mês</span>
                         <span className="font-bold text-slate-800">{new Date(item.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} <span className="text-slate-400 ml-1">({item.mes || '-'})</span></span>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                          <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Rota</span>
                          <span className="font-bold text-slate-800 truncate block">
                            {item.origem.split(',')[0]} <span className="text-slate-300 mx-1">➔</span> {item.destino.split(',')[0]}
                          </span>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                          <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Contentor</span>
                          <span className="font-bold text-slate-800">{item.container || '-'}</span>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                          <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Tipo</span>
                          <span className="font-bold text-slate-800">{item.tipo || '-'}</span>
                        </div>
                      </div>

                      {item.comprovante_url && (
                        <div className="mt-5">
                          <button 
                            onClick={() => setViewImageUrl(item.comprovante_url)}
                            className="inline-flex items-center space-x-2 text-sm font-bold text-slate-600 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 hover:text-blue-700 px-5 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md"
                          >
                            <ImageIcon className="w-4 h-4 text-blue-500" />
                            <span>Ver Comprovante</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {isPendente && (
                      <div className="flex flex-col justify-start gap-3 lg:w-[280px] shrink-0">
                        {actionState.id === item.id ? (
                          <div className="w-full flex flex-col gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
                            <textarea 
                              className={`w-full text-sm p-3 border rounded-xl focus:ring-4 outline-none transition-all resize-none ${
                                actionState.type === 'approve' 
                                  ? 'border-blue-200 focus:ring-blue-500/10 focus:border-blue-400 bg-white' 
                                  : 'border-rose-200 focus:ring-rose-500/10 focus:border-rose-400 bg-white'
                              }`}
                              placeholder={actionState.type === 'approve' ? "Nota (Opcional)..." : "Motivo da recusa..."}
                              value={actionMessage}
                              onChange={(e) => setActionMessage(e.target.value)}
                              rows={3}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button 
                                onClick={() => confirmAction(item)}
                                className={`flex-1 text-white text-sm py-2.5 rounded-xl font-bold transition-all shadow-sm hover:shadow-md ${
                                  actionState.type === 'approve' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-500 hover:bg-rose-600'
                                }`}
                              >
                                Confirmar
                              </button>
                              <button 
                                onClick={() => { setActionState({ id: null, type: null }); setActionMessage(''); }}
                                className="flex-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-sm py-2.5 rounded-xl font-bold transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <button 
                              onClick={() => { setActionState({ id: item.id, type: 'approve' }); setActionMessage(''); }}
                              className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-bold transition-colors shadow-sm hover:shadow-md"
                            >
                              <CheckCircle className="h-4 w-4 opacity-70" />
                              <span>Aprovar Viagem</span>
                            </button>
                            <button 
                              onClick={() => { setActionState({ id: item.id, type: 'reject' }); setActionMessage(''); }}
                              className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-600 border border-slate-200 hover:border-rose-200 px-5 py-3 rounded-xl font-bold transition-colors"
                            >
                              <XCircle className="h-4 w-4 opacity-70" />
                              <span>Rejeitar</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {item.resposta && !isPendente && (
                      <div className={`lg:w-1/3 p-5 rounded-2xl border flex items-start space-x-3 h-fit shadow-sm ${
                        item.status === 'Reprovado' ? 'bg-rose-50 border-rose-100' : 'bg-teal-50 border-teal-100'
                      }`}>
                        <AlertCircle className={`h-6 w-6 flex-shrink-0 mt-0.5 ${item.status === 'Reprovado' ? 'text-rose-500' : 'text-teal-500'}`} />
                        <div>
                          <span className={`block text-[10px] font-black uppercase tracking-wider mb-1 ${item.status === 'Reprovado' ? 'text-rose-700' : 'text-teal-700'}`}>
                            {item.status === 'Reprovado' ? 'Motivo da Recusa' : 'Nota da Fidelidade'}
                          </span>
                          <p className={`text-sm font-medium leading-relaxed ${item.status === 'Reprovado' ? 'text-rose-800' : 'text-teal-800'}`}>{item.resposta}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {viewImageUrl && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={() => setViewImageUrl(null)}>
          <div className="relative max-w-5xl w-full flex flex-col items-center justify-center h-full animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewImageUrl(null)} className="absolute top-4 right-4 sm:top-8 sm:right-8 text-slate-800 bg-white hover:bg-slate-100 transition-colors flex items-center space-x-2 px-4 py-2.5 rounded-full shadow-xl font-bold z-10">
              <XCircle className="w-5 h-5" /> <span className="hidden sm:inline">Fechar</span>
            </button>
            <img src={viewImageUrl} alt="Comprovante" className="max-h-[85vh] w-auto rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] object-contain ring-4 ring-white" />
          </div>
        </div>
      )}

      {isExportExtraOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={() => setIsExportExtraOpen(false)}>
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col gap-6 animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-xl font-black text-slate-800 flex items-center">
                <FileSpreadsheet className="w-6 h-6 mr-2 text-indigo-600" />
                Exportar Extras
              </h3>
              <button onClick={() => setIsExportExtraOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Período Inicial</label>
                <input type="date" value={dataInicioExtra} onChange={e => setDataInicioExtra(e.target.value)} className="w-full border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 border bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Período Final</label>
                <input type="date" value={dataFimExtra} onChange={e => setDataFimExtra(e.target.value)} className="w-full border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20 border bg-slate-50" />
              </div>
            </div>
            
            <div className="pt-2 flex gap-3">
              <button onClick={() => setIsExportExtraOpen(false)} className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 py-3 rounded-xl font-bold transition-colors">
                Cancelar
              </button>
              <button onClick={handleExportarExtras} disabled={isExportingExtra} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-all shadow-md flex items-center justify-center">
                {isExportingExtra ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Download className="w-5 h-5 mr-2" />}
                {isExportingExtra ? 'A Extrair...' : 'Extrair Relatório'}
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
