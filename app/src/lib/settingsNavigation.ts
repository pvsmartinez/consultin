export type SettingsTab =
  | 'dados'
  | 'agenda'
  | 'servicos'
  | 'anamnese'
  | 'campos'
  | 'disponibilidade'
  | 'salas'
  | 'pagamento'
  | 'whatsapp'
  | 'notificacoes'
  | 'usuarios'
  | 'pagina-publica'

export type SettingsEntity = 'pacientes' | 'profissionais'

export function buildSettingsPath(tab?: SettingsTab, entity?: SettingsEntity) {
  const params = new URLSearchParams()

  if (tab) params.set('tab', tab)
  if (entity) params.set('entity', entity)

  const query = params.toString()
  return query ? `/configuracoes?${query}` : '/configuracoes'
}