# Consultin

Plataforma de gestão para pequenas clínicas brasileiras.

## Sobre o Projeto

O **Consultin** é uma solução completa de gerenciamento voltada para pequenas clínicas e consultórios no Brasil. O objetivo é centralizar e simplificar as operações do dia a dia, oferecendo controle eficiente de agenda, pacientes e demais necessidades administrativas.

## Funcionalidades Previstas

- **Agenda / Calendário** — agendamento de consultas, controle de disponibilidade de profissionais e lembretes automáticos.
- **Cadastro de Pacientes (Clientes)** — histórico completo, dados pessoais e contatos.
- **Financeiro** — controle de pagamentos, emissão de recibos e relatórios financeiros.
- **Profissionais** — cadastro e gestão de médicos, dentistas e demais profissionais da clínica.
- **Notificações** — lembretes de consultas via SMS/e-mail/WhatsApp.
- **Relatórios** — geração de relatórios de atendimentos, ocupação e faturamento.
- **Multi-clínica** — suporte a múltiplas unidades de clínicas na mesma conta.

## Tecnologias

> Tecnologias a serem definidas conforme evolução do projeto.

## Operação Interna

### Mapping de campanhas públicas

Resumo operacional atual do Google Ads do Consultin:

- `Consultin - Clinicas` → final URL principal em `/para-clinicas`
- `Consultin - Profissional Liberal` → final URL principal em `/software-para-consultorios`
- `Consultin - Performance Max` → final URL principal em `/sistema-para-clinicas`

Leitura importante:

- `Profissional Liberal` mantém sitelinks por persona (`/para-medicos`, `/para-psicologos`, `/para-nutricionistas`) porque eles já têm clique e CTR reais; não foi feita convergência para uma LP única nesta rodada.
- O painel admin agora deve ler o funil por `landingPath`, para não misturar tráfego de sitelink/persona com a campanha principal.
- O fluxo de atribuição pública usa `seo-pages.js` nas LPs estáticas e `publicAttribution.ts` no SPA/signup para preservar `utm_*`, `gclid` e afins até o cadastro.

Documento detalhado:

- [docs/public-campaign-lp-mapping-2026-04-22.md](docs/public-campaign-lp-mapping-2026-04-22.md)

## Como Contribuir

1. Faça um fork do repositório.
2. Crie uma branch para sua feature: `git checkout -b feature/minha-feature`
3. Faça commit das suas alterações: `git commit -m 'feat: minha feature'`
4. Faça push para a branch: `git push origin feature/minha-feature`
5. Abra um Pull Request.

## Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

> Projeto desenvolvido para atender às necessidades de pequenas clínicas brasileiras.
