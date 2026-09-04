import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from './src/screens/LoginScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import EditProductScreen from './src/screens/EditProductScreen';
import SelectInventoryScreen from './src/screens/SelectInventoryScreen'; 
import InventoryDrogueriaScreen from './src/screens/InventoryDrogueriaScreen';
import EditProductDrogueriaScreen from './src/screens/EditProductDrogueriaScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SelectInventory" component={SelectInventoryScreen} options={{ title: '📋 Inventario Activo' }} />
        <Stack.Screen name="Inventory" component={InventoryScreen} options={{ title: 'Inventario ORVIT' }} />
        <Stack.Screen name="EditProduct" component={EditProductScreen} options={{ title: '✏️ Editar Producto' }} />
        <Stack.Screen name="InventoryDrogueria" component={InventoryDrogueriaScreen} options={{ title: 'Inventario Droguería' }} />
        <Stack.Screen name="EditProductDrogueria" component={EditProductDrogueriaScreen} options={{ title: '✏️ Editar Producto Droguería' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}