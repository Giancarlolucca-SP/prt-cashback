import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBranding } from '../../src/hooks/useBranding';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IoniconsName, focusedName: IoniconsName) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} color={color} size={size} />
  );
}

export default function TabLayout() {
  const { primaryColor, secondaryColor } = useBranding();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   primaryColor,
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth:  1,
          borderTopColor:  '#f1f5f9',
          elevation:       8,
          height:          60,
          paddingBottom:   8,
        },
        tabBarLabelStyle: {
          fontSize:   11,
          fontWeight: '600',
        },
        headerStyle:      { backgroundColor: secondaryColor },
        headerTintColor:  '#fff',
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title:       'Início',
          headerTitle: 'PostoCash',
          tabBarIcon:  tabIcon('home-outline', 'home'),
        }}
      />
      <Tabs.Screen
        name="resgatar"
        options={{
          title:      'Resgatar',
          tabBarIcon: tabIcon('card-outline', 'card'),
        }}
      />
      <Tabs.Screen
        name="historico"
        options={{
          title:      'Histórico',
          tabBarIcon: tabIcon('receipt-outline', 'receipt'),
        }}
      />
      <Tabs.Screen
        name="validar"
        options={{
          title:      'Validar',
          tabBarIcon: tabIcon('qr-code-outline', 'qr-code'),
        }}
      />
      <Tabs.Screen
        name="configuracoes"
        options={{
          title:      'Configurações',
          tabBarIcon: tabIcon('settings-outline', 'settings'),
        }}
      />

      {/* abastecer still exists as a file but is not shown in the tab bar */}
      <Tabs.Screen name="abastecer" options={{ href: null }} />
    </Tabs>
  );
}
