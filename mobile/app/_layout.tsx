import '../global.css'
import React from 'react'
import { Stack, Redirect } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { View } from 'react-native'
import { AuthProvider, useAuthContext } from '@/contexts/AuthContext'
import { LoadingScreen } from '@/components/LoadingScreen'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

function RootNavigator() {
  const { session, loading } = useAuthContext()

  if (loading) return <LoadingScreen />
  if (!session) return <Redirect href="/(auth)/login" />

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <View style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </View>
  )
}
