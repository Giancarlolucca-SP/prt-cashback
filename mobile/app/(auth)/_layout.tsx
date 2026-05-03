import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1e3a5f' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: '#f8fafc' },
      }}
    >
      <Stack.Screen name="welcome"   options={{ headerShown: false }} />
      <Stack.Screen name="login"     options={{ headerShown: false }} />
      <Stack.Screen name="reinstall" options={{ headerShown: false }} />
      <Stack.Screen name="register"  options={{ title: 'Criar conta',       headerBackTitle: 'Voltar' }} />
      <Stack.Screen name="otp"       options={{ title: 'Verificação',       headerBackTitle: 'Voltar' }} />
      <Stack.Screen name="selfie"    options={{ headerShown: false }} />
      <Stack.Screen name="recovery"  options={{ title: 'Recuperar acesso', headerBackTitle: 'Voltar' }} />
      <Stack.Screen name="success"   options={{ headerShown: false, gestureEnabled: false }} />
    </Stack>
  );
}
