import React from 'react'
import { View, Text, FlatList, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useTodayAppointments } from '@/hooks/useTodayAppointments'
import { AppointmentCard } from '@/components/AppointmentCard'
import type { Appointment } from '@/types'

export default function AgendaScreen() {
  const { data: appts = [], isLoading, refetch, isFetching } = useTodayAppointments()

  const dateLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-slate-800">Agenda</Text>
        <Text className="text-slate-500 text-sm capitalize">{dateLabel}</Text>
      </View>

      <FlatList<Appointment>
        data={appts}
        keyExtractor={a => a.id}
        contentContainerClassName="px-4 pb-8 pt-3"
        renderItem={({ item }) => <AppointmentCard appointment={item} />}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => { void refetch() }}
            tintColor="#4f46e5"
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <Text className="text-slate-400 text-sm text-center mt-8">Carregando...</Text>
          ) : (
            <View className="items-center mt-16">
              <Text className="text-4xl mb-3">📅</Text>
              <Text className="text-slate-600 font-medium">Sem consultas hoje</Text>
              <Text className="text-slate-400 text-sm mt-1">Aproveite o dia livre!</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  )
}
