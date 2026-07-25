import React from 'react'
import { View, Text } from 'react-native'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  accent?: boolean
}

export function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <View className={`flex-1 rounded-2xl p-4 ${accent ? 'bg-primary-600' : 'bg-white'} shadow-sm`}>
      <Text className={`text-xs font-medium mb-1 ${accent ? 'text-primary-100' : 'text-slate-500'}`}>
        {label}
      </Text>
      <Text className={`text-2xl font-bold ${accent ? 'text-white' : 'text-slate-800'}`}>
        {value}
      </Text>
      {sub ? (
        <Text className={`text-xs mt-1 ${accent ? 'text-primary-200' : 'text-slate-400'}`}>{sub}</Text>
      ) : null}
    </View>
  )
}
