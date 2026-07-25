import React from 'react'
import { View, ActivityIndicator } from 'react-native'

export function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50">
      <ActivityIndicator size="large" color="#4f46e5" />
    </View>
  )
}
