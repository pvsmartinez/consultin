import { ChartBar, WhatsappLogo, ShieldCheck } from '@phosphor-icons/react'
import RelatoriosContent from '../pages-v1/RelatoriosPage'

export default function RelatoriosPage() {
	return (
		<div className="space-y-6">
			<section className="rounded-[28px] bg-[#f4f8f8] border border-gray-200/80 shadow-sm px-6 py-6">
				<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500 mb-2">
					Área administrativa
				</p>
				<div className="flex items-start justify-between gap-4 flex-wrap">
					<div>
						<h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-1">
							Relatórios e estatísticas
						</h1>
						<p className="text-sm text-gray-600 max-w-2xl">
							Esta área é secundária no fluxo do Consultin. Use para acompanhar operação,
							faturamento e exportações sem tirar o foco da agenda no dia a dia.
						</p>
					</div>
					<div className="flex flex-wrap gap-2 text-xs text-gray-600">
						<span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5">
							<ChartBar size={13} /> Uso gerencial
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5">
							<WhatsappLogo size={13} /> Compatível com consultas via WhatsApp
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5">
							<ShieldCheck size={13} /> Foco administrativo interno
						</span>
					</div>
				</div>
			</section>

			<div className="rounded-2xl border border-gray-200 bg-white/80 p-4 text-sm text-gray-600 shadow-sm">
				O operacional continua na agenda. Aqui ficam visão consolidada, análise por período e exportações.
			</div>

			<RelatoriosContent hideHeader />
		</div>
	)
}