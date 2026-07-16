export function getAppointmentSaveErrorMessage(error: unknown, fallback = 'Erro ao salvar consulta') {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const normalized = message.toLowerCase()

  if (normalized.includes('no_overlap')) {
    return 'Conflito de horário — profissional já tem consulta nesse horário'
  }

  if (normalized.includes('room_overlap')) {
    return 'Conflito de sala — já existe consulta nessa sala nesse horário'
  }

  if (normalized.includes('appointment_has_payments')) {
    return 'Essa consulta possui cobrança vinculada e não pode ser excluída. Cancele-a para preservar o histórico financeiro.'
  }

  if (normalized.includes('appointments_room_id_fkey') || normalized.includes('clinic_rooms')) {
    return 'Sala inválida — selecione uma sala ativa antes de salvar'
  }

  if (normalized.includes('row-level security') || normalized.includes('permission denied')) {
    return 'Você não tem permissão para salvar essa consulta'
  }

  if (message && message !== 'Error' && message !== '[object Object]') {
    return message
  }

  return fallback
}
