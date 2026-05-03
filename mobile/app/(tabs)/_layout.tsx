import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IoniconsName, focusedName: IoniconsName) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} color={color} size={size} />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   '#F59E0B',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
        tabBarStyle: {
          backgroundColor: '#1e3a5f',
          borderTopWidth:  0,
          elevation:       8,
          height:          60,
          paddingBottom:   8,
        },
        tabBarLabelStyle: {
          fontSize:   11,
          fontWeight: '600',
        },
        headerStyle:      { backgroundColor: '#1e3a5f' },
        headerTintColor:  '#fff',
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title:       'Início',
          headerTitle: 'PRT Cashback',
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
