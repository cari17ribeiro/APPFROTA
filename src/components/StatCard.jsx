import React from 'react';

export default function StatCard({ icon, color, title, value, subtitle, extraContent }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    teal: 'bg-teal-50 text-teal-600',
    cyan: 'bg-cyan-50 text-cyan-600'
  };
  return (
    <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200/60 hover:shadow-lg transition-all duration-300 group flex items-start space-x-4">
      <div className={`${colors[color]} p-3.5 sm:p-4 rounded-2xl group-hover:scale-110 transition-transform duration-300 shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center min-h-[56px]">
        <p className="text-sm text-slate-500 font-semibold mb-0.5 truncate">{title}</p>
        <p className="text-2xl font-black text-slate-800 tracking-tight truncate">
          {value} {subtitle && <span className="text-sm font-medium text-slate-400 ml-1">{subtitle}</span>}
        </p>
        {extraContent}
      </div>
    </div>
  );
}