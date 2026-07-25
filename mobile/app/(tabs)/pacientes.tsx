import React, { useState } from 'react'
import { View, Text, FlatList, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { formatCPF, formatPhone } from '@pvsmartinez/shared'
import { usePatientSearch } from '@/hooks/usePatientSearch'
import { useDebounce } from '@pvsmartinez/shared'
import type { Patient } from '@/types'

export default function PacientesScreen() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const { data: patients = [], isLoading } = usePatientSearch(debouncedSearch)

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-2xl font-bold text-slate-800">Pacientes</Text>
      </View>

      {/* Search */}
      <View className="px-4 pb-3">
        <TextInput
          className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-base"
          placeholder="Buscar por nome..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList<Patient>
        data={patients}
        keyExtractor={p => p.id}
        contentContainerClassName="px-4 pb-8"
        renderItem={({ item: p }) => (
          <View className="bg-white rounded-2xl p-4 mb-2 shadow-sm flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-primary-100 items-center justify-center">
              <Text className="text-primary-700 font-bold text-base">
                {p.name[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-slate-800" numberOfLines={1}>{p.name}</Text>
              {p.phone ? (
                <Text className="text-slate-400 text-sm mt-0.5">{formatPhone(p.phone)}</Text>
              ) : p.cpf ? (
                <Text className="text-slate-400 text-sm mt-0.5">{formatCPF(p.cpf)}</Text>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          isLoading ? (
            <Text className="text-slate-400 text-sm text-center mt-8">Carregando...</Text>
          ) : (
            <View className="items-center mt-12">
              <Text className="text-3xl mb-3">👤</Text>
              <Text className="text-slate-500">
                {search ? 'Nenhum paciente encontrado.' : 'Nenhum paciente cadastrado.'}
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  )
}
