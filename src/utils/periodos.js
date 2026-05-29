export const calcularPeriodoViagem = (dataStr) => {
  if (!dataStr) return '';
  try {
    const [anoStr, mesStr, diaStr] = dataStr.split('-');
    let ano = parseInt(anoStr, 10);
    let mes = parseInt(mesStr, 10);
    const dia = parseInt(diaStr, 10);

    if (dia >= 21) {
      mes += 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
    }
    return `${mes.toString().padStart(2, '0')}/${ano}`;
  } catch {
    return '';
  }
};
