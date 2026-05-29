import React, { useState } from 'react';
import { XCircle, CheckCircle, Upload, Loader2 } from 'lucide-react';

export default function AddTripModal({ currentUser, onClose, onSave, supabase }) {
  const [formData, setFormData] = useState({
    data: '', origem: '', destino: '', container: '', tipo: 'Importação', mensagem: ''
  });
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsUploading(true);
    let comprovanteUrlFinal = null;

    try {
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;
        const { error } = await supabase.storage.from('comprovantes').upload(fileName, file);
        if (error) throw error;
        const { data: publicUrlData } = supabase.storage.from('comprovantes').getPublicUrl(fileName);
        comprovanteUrlFinal = publicUrlData.publicUrl;
      }
      await onSave({ ...formData, comprovante_url: comprovanteUrlFinal });
    } catch {
      alert("Falha ao anexar ficheiro. Tente sem ficheiro.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 duration-300">
        <div className="flex justify-between items-center px-8 py-6 border-b border-slate-100 bg-white">
          <div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">Registar Viagem</h3>
            <p className="text-sm font-medium text-slate-500 mt-1">Preencha os dados da viagem em falta.</p>
          </div>
          <button onClick={onClose} disabled={isUploading} className="text-slate-400 hover:text-slate-700 transition-colors bg-slate-50 hover:bg-slate-100 p-2 rounded-full">
            <XCircle className="h-6 w-6" />
          </button>
        </div>
        
        <div className="overflow-y-auto p-8 bg-slate-50/50">
          <form id="add-trip-form" onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Data da Viagem</label>
              <input type="date" required value={formData.data} onChange={e => setFormData({...formData, data: e.target.value})}
                className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 p-3.5 border outline-none transition-all" />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Origem</label>
                <input type="text" required placeholder="Ex: Santos, SP" value={formData.origem} onChange={e => setFormData({...formData, origem: e.target.value})}
                  className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 p-3.5 border outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Destino</label>
                <input type="text" required placeholder="Ex: Campinas, SP" value={formData.destino} onChange={e => setFormData({...formData, destino: e.target.value})}
                  className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 p-3.5 border outline-none transition-all" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Contentor</label>
                <input type="text" placeholder="Ex: MSKU1234567" value={formData.container} onChange={e => setFormData({...formData, container: e.target.value.toUpperCase()})}
                  className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 p-3.5 border uppercase outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Tipo Operação</label>
                <select required value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})}
                  className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 p-3.5 border outline-none transition-all bg-white">
                  <option value="Importação">Importação</option>
                  <option value="Exportação">Exportação</option>
                  <option value="Transferência">Transferência</option>
                  <option value="Vazio">Vazio</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Comprovativo</label>
              <div className="relative">
                <input type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" id="file-upload" />
                <label htmlFor="file-upload" className={`flex items-center justify-center space-x-3 w-full border-2 border-dashed rounded-xl p-5 cursor-pointer transition-all ${file ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-400'}`}>
                  {file ? <CheckCircle className="w-6 h-6 text-blue-500" /> : <Upload className="w-6 h-6" />}
                  <span className="font-bold text-sm truncate">{file ? file.name : 'Clique para anexar foto (Opcional)'}</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Mensagem</label>
              <textarea placeholder="Motivo do não registo automático..." rows="2" value={formData.mensagem} onChange={e => setFormData({...formData, mensagem: e.target.value})}
                className="w-full border-slate-200 rounded-xl shadow-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 p-3.5 border outline-none transition-all resize-none"></textarea>
            </div>
          </form>
        </div>

        <div className="flex p-6 border-t border-slate-100 bg-white gap-3">
          <button type="button" onClick={onClose} disabled={isUploading} className="flex-1 py-3.5 text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl font-bold transition-all disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" form="add-trip-form" disabled={isUploading} className="flex-[2] py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-70 flex justify-center items-center">
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Enviar Solicitação</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
