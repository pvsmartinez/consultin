import React from 'react'
import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatBRL } from '@pvsmartinez/shared'
import { useAuthContext } from '@/contexts/AuthContext'
import { useTodayAppointments } from '@/hooks/useTodayAppointments'
import { useFinancialSummary } from '@/hooks/useFinancialSummary'
import { AppointmentCard } from '@/components/AppointmentCard'
import { StatCard } from '@/components/StatCard'

const today = new Date()

export default function DashboardScreen() {
  const { profile, signOut } = useAuthContext()
  const { data: appts = [], isLoading: apptLoading } = useTodayAppointments()
  const { data: fin, isLoading: finLoading } = useFinancialSummary(today)

  const dateLabel = format(today, "EEEE, d 'de' MMMM", { locale: ptBR })
  const completedToday = appts.filter(a => a.status === 'completed').length

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8">
        {/* Header */}
        <View className="flex-row items-center justify-between pt-4 pb-6">
          <View>
            <Text className="text-slate-500 text-sm capitalize">{dateLabel}</Text>
            <Text className="text-2xl font-bold text-slate-800">
              Olá, {profile?.name?.split(' ')[0] ?? 'dono'} 👋
            </Text>
          </View>
          <TouchableOpacity
            onPress={signOut}
            className="w-9 h-9 rounded-full bg-slate-200 items-center justify-center"
          >
            <Text className="text-slate-600 text-xs font-semibold">
              {profile?.name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View className="flex-row gap-3 mb-6">
          <StatCard
            label="Consultas hoje"
            value={apptLoading ? '—' : String(appts.length)}
            sub={`${completedToday} concluídas`}
            accent
          />
          <StatCard
            label="Receita do mês"
            value={finLoading ? '—' : formatBRL(fin?.totalPaidCents ?? 0)}
            sub={`${fin?.pendingCount ?? 0} pendentes`}
          />
        </View>

        {/* Today's appointments preview */}
        <Text className="text-base font-semibold text-slate-700 mb-3">
          Próximas consultas de hoje
        </Text>

        {apptLoading ? (
          <Text className="text-slate-400 text-sm">Carregando...</Text>
        ) : appts.length === 0 ? (
          <View className="bg-white rounded-2xl p-6 items-center shadow-sm">
            <Text className="text-slate-400 text-sm">Nenhuma consulta hoje.</Text>
          </View>
        ) : (
          appts.slice(0, 5).map(a => (
            <AppointmentCard key={a.id} appointment={a} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
