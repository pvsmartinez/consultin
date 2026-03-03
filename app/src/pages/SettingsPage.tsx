import { useState } from 'react'
import { Gear, CalendarBlank, Sliders, Clock, Door, CurrencyDollar, WhatsappLogo, Users, ClipboardText, Stethoscope } from '@phosphor-icons/react'
import { useClinic } from '../hooks/useClinic'
import DadosTab from './settings/DadosTab'
import AgendaTab from './settings/AgendaTab'
import CamposTab from './settings/CamposTab'
import DisponibilidadeTab from './settings/DisponibilidadeTab'
import SalasTab from './settings/SalasTab'
import ServicosTab from './settings/ServicosTab'
import PagamentoTab from './settings/PagamentoTab'
import FinanceiroTab from './settings/FinanceiroTab'
import WhatsAppTab from './settings/WhatsAppTab'
import UsuariosTab from './settings/UsuariosTab'
import AnamnesisTab from './settings/AnamnesisTab'

type Tab = 'dados' | 'agenda' | 'servicos' | 'pagamento' | 'campos' | 'disponibilidade' | 'salas' | 'anamnese' | 'whatsapp' | 'meu-plano' | 'usuarios'

const TABS: { id: Tab; label: string; icon: typeof Gear }[] = [
  { id: 'dados',           label: 'Dados da clínica',      icon: Gear          },
  { id: 'agenda',          label: 'Agenda',                icon: CalendarBlank  },
  { id: 'servicos',        label: 'Serviços',             icon: Stethoscope    },
  { id: 'salas',           label: 'Salas / Espaços',       icon: Door           },
  { id: 'pagamento',       label: 'Pagamentos',            icon: CurrencyDollar  },
  { id: 'disponibilidade', label: 'Horários',               icon: Clock          },
  { id: 'campos',          label: 'Campos personalizados', icon: Sliders        },
  { id: 'anamnese',        label: 'Anamnese',              icon: ClipboardText  },
  { id: 'whatsapp',        label: 'WhatsApp',              icon: WhatsappLogo   },
  { id: 'usuarios',        label: 'Usuários',              icon: Users          },
  { id: 'meu-plano',       label: 'Meu plano',             icon: CurrencyDollar },
]

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('dados')
  const { data: clinic, isLoading } = useClinic()

  if (isLoading) return <div className="text-sm text-gray-400 py-8 text-center">Carregando...</div>
  if (!clinic) return null

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-800 mb-6">Configurações</h1>

      <div className="flex gap-8 items-start">
        {/* Vertical nav */}
        <nav className="w-44 flex-shrink-0 space-y-0.5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 px-3 py-2 w-full text-sm rounded-lg transition-colors text-left ${
                tab === t.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0 max-w-xl">
          {tab === 'dados'           && <DadosTab clinic={clinic} />}
          {tab === 'agenda'          && <AgendaTab clinic={clinic} />}
          {tab === 'servicos'        && <ServicosTab />}
          {tab === 'salas'           && <SalasTab />}
          {tab === 'pagamento'       && <PagamentoTab clinic={clinic} />}
          {tab === 'campos'          && <CamposTab clinic={clinic} />}
          {tab === 'disponibilidade' && <DisponibilidadeTab />}
          {tab === 'anamnese'        && <AnamnesisTab clinic={clinic} />}
          {tab === 'meu-plano'       && <FinanceiroTab clinic={clinic} />}
          {tab === 'whatsapp'        && <WhatsAppTab clinic={clinic} />}
          {tab === 'usuarios'        && <UsuariosTab />}
        </div>
      </div>
    </div>
  )
}
