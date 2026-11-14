import './src/utils/appConfig';
import { View, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import GlobalHeader from './src/components/GlobalHeader';
import LoginScreen from './src/screens/LoginScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import EditProductScreen from './src/screens/EditProductScreen';
import SelectInventoryScreen from './src/screens/SelectInventoryScreen';
import InventoryDrogueriaScreen from './src/screens/InventoryDrogueriaScreen';
import EditProductDrogueriaScreen from './src/screens/EditProductDrogueriaScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
        <GlobalHeader />
        <View style={{ flex: 1 }}>
          <NavigationContainer>
            <Stack.Navigator
              initialRouteName="Login"
              screenOptions={{
                headerStatusBarHeight: 0,
                headerStyle: {
                  backgroundColor: '#f8fafc',
                  elevation: 1,
                  shadowOpacity: 0.06,
                },
                headerTitleStyle: {
                  fontSize: 16,
                  fontWeight: '700',
                  color: '#1e293b',
                },
                headerTintColor: '#1e293b',
              }}
            >
              <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
              <Stack.Screen name="SelectInventory" component={SelectInventoryScreen} options={{ title: '📋 Inventario Activo' }} />
              <Stack.Screen
                name="Inventory"
                component={InventoryScreen}
                options={({ route }) => ({
                  title: `Inventario ${route.params?.user?.sucursalNombre || ''}`.trim()
                })}
              />
              <Stack.Screen name="EditProduct" component={EditProductScreen} options={{ title: '✏️ Editar Producto' }} />
              <Stack.Screen name="InventoryDrogueria" component={InventoryDrogueriaScreen} options={{ title: 'Inventario Droguería' }} />
              <Stack.Screen name="EditProductDrogueria" component={EditProductDrogueriaScreen} options={{ title: '✏️ Editar Producto Droguería' }} />
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </View>
    </SafeAreaProvider>
  );
}
