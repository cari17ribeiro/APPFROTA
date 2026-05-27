import React from 'react';
import { CheckCircle, Clock, XCircle } from 'lucide-react';

export default function StatusBadge({ status }) {
  const styles = {
    confirmada: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Aprovada: 'bg-teal-100 text-teal-700 border-teal-200',
    Aprovado: 'bg-teal-100 text-teal-700 border-teal-200',
    Pendente: 'bg-amber-100 text-amber-700 border-amber-200',
    'Em Análise': 'bg-blue-100 text-blue-700 border-blue-200',
    Reprovado: 'bg-rose-100 text-rose-700 border-rose-200'
  };

  const icons = {
    confirmada: <CheckCircle className="w-3.5 h-3.5 mr-1.5" />,
    Aprovada: <CheckCircle className="w-3.5 h-3.5 mr-1.5" />,
    Aprovado: <CheckCircle className="w-3.5 h-3.5 mr-1.5" />,
    Pendente: <Clock className="w-3.5 h-3.5 mr-1.5" />,
    'Em Análise': <Clock className="w-3.5 h-3.5 mr-1.5" />,
    Reprovado: <XCircle className="w-3.5 h-3.5 mr-1.5" />
  };

  const labels = {
    confirmada: 'Confirmada',
    Aprovada: 'Aprovada ',
    Aprovado: 'Aprovada ',
    Pendente: 'À Conferir',
    'Em Análise': 'Em Análise',
    Reprovado: 'Reprovada'
  };

  const normalizedStatus = status === 'inclusa' ? 'Em Análise' : status;

  return (
    <span className={`flex items-center px-3 py-1 rounded-lg text-xs font-black tracking-wide border shadow-sm ${styles[normalizedStatus] || styles.Pendente}`}>
      {icons[normalizedStatus] || icons.Pendente}
      {labels[normalizedStatus] || normalizedStatus}
    </span>
  );
}