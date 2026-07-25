import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/services/supabase'

export default function LoginScreen() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleLogin() {
    const e = email.trim()
    if (!e || !password) {
      Alert.alert('Atenção', 'Preencha e-mail e senha.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: e, password })
    setLoading(false)
    if (error) Alert.alert('Erro ao entrar', error.message)
    // Success: onAuthStateChange fires → RootNavigator redirects to (tabs)
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-1 justify-center px-6">
          {/* Logo / brand */}
          <View className="items-center mb-10">
            <View className="w-16 h-16 bg-primary-600 rounded-2xl items-center justify-center mb-4">
              <Text className="text-white text-2xl font-bold">C</Text>
            </View>
            <Text className="text-3xl font-bold text-slate-800">Consultin</Text>
            <Text className="text-slate-500 mt-1">Gestão da sua clínica</Text>
          </View>

          {/* Form */}
          <View className="gap-3">
            <TextInput
              className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-slate-800 text-base"
              placeholder="E-mail"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-slate-800 text-base"
              placeholder="Senha"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleLogin}
            />

            <TouchableOpacity
              className={`bg-primary-600 rounded-xl py-4 items-center mt-2 ${loading ? 'opacity-60' : ''}`}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="white" />
                : <Text className="text-white font-semibold text-base">Entrar</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
