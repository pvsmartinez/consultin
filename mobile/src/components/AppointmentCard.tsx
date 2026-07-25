import React from 'react'
import { View, Text } from 'react-native'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Appointment, AppointmentStatus } from '../types'

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled:  'Agendado',
  confirmed:  'Confirmado',
  completed:  'Concluído',
  cancelled:  'Cancelado',
  no_show:    'Não compareceu',
}

const STATUS_BG: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-100',
  confirmed: 'bg-green-100',
  completed: 'bg-slate-100',
  cancelled: 'bg-red-100',
  no_show:   'bg-orange-100',
}

const STATUS_TEXT: Record<AppointmentStatus, string> = {
  scheduled: 'text-blue-700',
  confirmed: 'text-green-700',
  completed: 'text-slate-600',
  cancelled: 'text-red-600',
  no_show:   'text-orange-700',
}

interface Props {
  appointment: Appointment
}

export function AppointmentCard({ appointment: a }: Props) {
  const time = format(new Date(a.startsAt), 'HH:mm', { locale: ptBR })

  return (
    <View className="bg-white rounded-2xl p-4 mb-3 shadow-sm flex-row items-center gap-3">
      <View className="items-center w-12">
        <Text className="text-lg font-bold text-slate-800">{time}</Text>
      </View>

      <View className="flex-1">
        <Text className="text-base font-semibold text-slate-800" numberOfLines={1}>
          {a.patient?.name ?? 'Paciente'}
        </Text>
        {a.professional?.name ? (
          <Text className="text-sm text-slate-500 mt-0.5" numberOfLines={1}>
            {a.professional.name}
            {a.professional.specialty ? ` · ${a.professional.specialty}` : ''}
          </Text>
        ) : null}
      </View>

      <View className={`px-2 py-1 rounded-full ${STATUS_BG[a.status]}`}>
        <Text className={`text-xs font-medium ${STATUS_TEXT[a.status]}`}>
          {STATUS_LABEL[a.status]}
        </Text>
      </View>
    </View>
  )
}
