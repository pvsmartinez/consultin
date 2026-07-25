import React, { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { format, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatBRL } from '@pvsmartinez/shared'
import { useFinancialSummary } from '@/hooks/useFinancialSummary'
import { StatCard } from '@/components/StatCard'
import type { Appointment } from '@/types'

export default function FinanceiroScreen() {
  const [month, setMonth] = useState(new Date())
  const { data: fin, isLoading, refetch, isFetching } = useFinancialSummary(month)

  const monthLabel = format(month, 'MMMM yyyy', { locale: ptBR })

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-slate-800">Financeiro</Text>
      </View>

      {/* Month nav */}
      <View className="flex-row items-center justify-between px-4 py-2">
        <TouchableOpacity onPress={() => setMonth(m => subMonths(m, 1))} className="p-2">
          <Text className="text-primary-600 text-xl font-bold">‹</Text>
        </TouchableOpacity>
        <Text className="text-slate-700 font-semibold capitalize">{monthLabel}</Text>
        <TouchableOpacity onPress={() => setMonth(m => addMonths(m, 1))} className="p-2">
          <Text className="text-primary-600 text-xl font-bold">›</Text>
        </TouchableOpacity>
      </View>

      {/* Summary cards */}
      <View className="flex-row gap-3 px-4 mb-4">
        <StatCard
          label="Receita total"
          value={isLoading ? '—' : formatBRL(fin?.totalChargeCents ?? 0)}
          accent
        />
        <StatCard
          label="Recebido"
          value={isLoading ? '—' : formatBRL(fin?.totalPaidCents ?? 0)}
          sub={`${fin?.pendingCount ?? 0} pendentes`}
        />
      </View>

      {/* Appointment list */}
      <FlatList<Appointment>
        data={fin?.rows ?? []}
        keyExtractor={a => a.id}
        contentContainerClassName="px-4 pb-8"
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => { void refetch() }}
            tintColor="#4f46e5"
          />
        }
        ListHeaderComponent={
          <Text className="text-sm font-semibold text-slate-500 mb-2">
            {fin?.rows.length ?? 0} consulta{fin?.rows.length !== 1 ? 's' : ''}
          </Text>
        }
        renderItem={({ item: a }) => (
          <View className="bg-white rounded-2xl p-4 mb-2 shadow-sm flex-row items-center">
            <View className="flex-1">
              <Text className="font-semibold text-slate-800" numberOfLines={1}>
                {a.patient?.name ?? 'Paciente'}
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5">
                {format(new Date(a.startsAt), "d MMM · HH:mm", { locale: ptBR })}
              </Text>
            </View>
            <View className="items-end">
              <Text className="font-bold text-slate-800">
                {formatBRL(a.chargeAmountCents ?? 0)}
              </Text>
              {a.paidAt ? (
                <Text className="text-xs text-green-600 font-medium mt-0.5">Pago</Text>
              ) : (
                <Text className="text-xs text-orange-500 font-medium mt-0.5">Pendente</Text>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          isLoading ? (
            <Text className="text-slate-400 text-sm text-center mt-8">Carregando...</Text>
          ) : (
            <View className="items-center mt-12">
              <Text className="text-3xl mb-3">💰</Text>
              <Text className="text-slate-500">Nenhuma consulta neste mês.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  )
}
