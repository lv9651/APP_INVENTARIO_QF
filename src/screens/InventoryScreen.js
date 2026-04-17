import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import ScannerScreen from './ScannerScreen';
import { getTomaInventario } from '../services/api';

export default function InventoryScreen({ navigation, route }) {
  const [items, setItems] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [sessionId] = useState(`INV-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState('mis'); // 'mis' o 'todos'
  
  const user = route.params?.user;

  // Cargar productos cuando cambie el modo de vista
  useEffect(() => {
    loadProducts();
  }, [viewMode]);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      let productos;
      if (viewMode === 'mis') {
        // Cargar solo productos del usuario actual
        productos = await getTomaInventario(user?.id);
        console.log('Mis productos:', productos);
      } else {
        // Cargar todos los productos de todos los usuarios
        productos = await getTomaInventario();
        console.log('Todos los productos:', productos);
      }
      
      if (productos && productos.length > 0) {
        const itemsList = productos.map(prod => ({
          codigobarra: prod.codigoBarra,
          name: prod.descripcion,
          lote: prod.numLote || 'N/A',
          cantidad_anterior: prod.cantExistencial || 0,
          cantidad_nueva: prod.cant_Nueva || 0,
          usuario: prod.empleadoRegistro || prod.usuarioRegistro || 'Usuario',
          fecha_edicion: prod.fechaActualizacion ? new Date(prod.fechaActualizacion).toLocaleString() : new Date().toLocaleString()
        }));
        setItems(itemsList);
      } else {
        setItems([]);
      }
    } catch (error) {
      console.error('Error cargando productos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Actualizar la lista cuando se edita un producto
  useEffect(() => {
    if (route.params?.productoActualizado && route.params?.actualizarLista) {
      const productoEditado = route.params.productoActualizado;
      
      setItems(prevItems => 
        prevItems.map(item => 
          item.codigobarra === productoEditado.codigobarra
            ? { 
                ...item, 
                cantidad_nueva: productoEditado.cant_Nueva 
              }
            : item
        )
      );
      
      // Limpiar parámetros
      navigation.setParams({ productoActualizado: null, actualizarLista: false });
    }
  }, [route.params]);

  const addItem = (product) => {
    const barcodeValue = product.codigoBarra || product.codigobarra;
    const existingIndex = items.findIndex(i => i.codigobarra === barcodeValue);
    
    if (existingIndex !== -1) {
      // Producto ya existe en la lista - actualizar cantidad
      const newItems = [...items];
      newItems[existingIndex] = {
        ...newItems[existingIndex],
        cantidad_nueva: product.cant_Nueva || 0,
        fecha_edicion: new Date().toLocaleString()
      };
      setItems(newItems);
      Alert.alert('Éxito', `Cantidad actualizada a: ${product.cant_Nueva || 0}`);
    } else {
      // Nuevo producto
      const newItem = {
        codigobarra: barcodeValue,
        name: product.descripcion,
        lote: product.numLote || 'N/A',
        cantidad_anterior: product.cantExistencial || 0,
        cantidad_nueva: product.cant_Nueva || 0,
        fecha_edicion: new Date().toLocaleString(),
        usuario: user?.name || user?.username || 'Usuario'
      };
      setItems([...items, newItem]);
      Alert.alert('Éxito', 'Producto agregado');
    }
  };

  const deleteItem = (barcode, name) => {
    Alert.alert(
      'Eliminar producto',
      `¿Desea eliminar ${name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Eliminar', 
          style: 'destructive',
          onPress: () => {
            const newItems = items.filter(i => i.codigobarra !== barcode);
            setItems(newItems);
            Alert.alert('Éxito', 'Producto eliminado');
          }
        }
      ]
    );
  };

  const exportToExcel = async () => {
    if (items.length === 0) {
      Alert.alert('Error', 'No hay productos para exportar');
      return;
    }

    try {
      const data = items.map((item, index) => ({
        '#': index + 1,
        'Codigo_Barras': item.codigobarra,
        'Producto': item.name,
        'Lote': item.lote,
        'Cantidad_Anterior': item.cantidad_anterior,
        'Cantidad_Nueva': item.cantidad_nueva,
        'Usuario': item.usuario,
        'Fecha_Edicion': item.fecha_edicion
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
      
      const excelBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileName = `Inventario_${sessionId}.xlsx`;
      const fileUri = FileSystem.cacheDirectory + fileName;
      
      await FileSystem.writeAsStringAsync(fileUri, excelBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Compartir inventario'
        });
      } else {
        Alert.alert('Error', 'No se puede compartir en este dispositivo');
      }
      
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'No se pudo exportar: ' + error.message);
    }
  };

  const totalUnits = items.reduce((sum, i) => sum + (i.cantidad_nueva || 0), 0);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Text>Cargando productos...</Text>
      </View>
    );
  }

  if (showScanner) {
    return <ScannerScreen onScan={addItem} onClose={() => setShowScanner(false)} navigation={navigation} user={user} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.userName}>👤 {user?.empleado || user?.name || user?.username || 'Usuario'}</Text>
          <Text style={styles.sessionText}>🆔 Sesión: {sessionId}</Text>
          <Text style={styles.dateText}>📅 Inicio: {new Date().toLocaleString()}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={styles.logoutText}>🚪 Salir</Text>
        </TouchableOpacity>
      </View>
      
      {/* Selector de vista */}
      <View style={styles.viewSelector}>
        <TouchableOpacity 
          style={[styles.viewButton, viewMode === 'mis' && styles.activeButton]}
          onPress={() => setViewMode('mis')}
        >
          <Text style={styles.viewButtonText}>📱 Mis Productos</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.viewButton, viewMode === 'todos' && styles.activeButton]}
          onPress={() => setViewMode('todos')}
        >
          <Text style={styles.viewButtonText}>🌐 Todos los Productos</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{items.length}</Text>
          <Text style={styles.statLabel}>Productos</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{totalUnits}</Text>
          <Text style={styles.statLabel}>Unidades</Text>
        </View>
      </View>
      
      <FlatList
        data={items}
        keyExtractor={(item, index) => `${item.codigobarra}-${index}`}
        contentContainerStyle={{ paddingBottom: 15 }}
        showsVerticalScrollIndicator={true}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.barcode}>📷 {item.codigobarra}</Text>
            <Text style={styles.productName}>📝 {item.name?.substring(0, 50)}</Text>
            <Text style={styles.lote}>🔢 Lote: {item.lote}</Text>
            <Text style={styles.usuario}>👤 Usuario: {item.usuario}</Text>
            <Text style={styles.quantityAnt}>📊 Cantidad Anterior: {item.cantidad_anterior}</Text>
            <Text style={styles.quantityNew}>✨ Cantidad Nueva: {item.cantidad_nueva}</Text>
            <View style={styles.row}>
              <View style={styles.actionButtons}>
                <TouchableOpacity 
                  style={styles.editProductButton}
                  onPress={() => {
                    navigation.navigate('EditProduct', { 
                      barcode: item.codigobarra,
                      isNew: false,
                      user: user
                    });
                  }}
                >
                  <Text style={styles.editText}>✏️ Editar</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.deleteButton}
                  onPress={() => deleteItem(item.codigobarra, item.name)}
                >
                  <Text style={styles.deleteText}>🗑️ Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>📭 Sin productos</Text>
            <Text style={styles.emptyText}>Presione "Escanear" para agregar productos</Text>
          </View>
        }
      />
      
      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.scanButton]} onPress={() => setShowScanner(true)}>
          <Text style={styles.buttonText}>📷 Escanear</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.button, styles.exportButton]} onPress={exportToExcel}>
          <Text style={styles.buttonText}>📎 Exportar Excel</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.bottomSpace} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    paddingTop: 40,
    backgroundColor: '#f5f5f5' 
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    padding: 12, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderColor: '#ddd' 
  },
  userName: { fontSize: 14, fontWeight: 'bold', color: '#2c3e50' },
  sessionText: { fontSize: 9, color: '#95a5a6', marginTop: 2 },
  dateText: { fontSize: 9, color: '#95a5a6', marginTop: 2 },
  logoutText: { color: '#e74c3c', fontWeight: 'bold', fontSize: 12 },
  viewSelector: {
    flexDirection: 'row',
    marginHorizontal: 10,
    marginVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
  },
  viewButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  activeButton: {
    backgroundColor: '#3498db',
  },
  viewButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  statsRow: { 
    flexDirection: 'row', 
    padding: 10, 
    backgroundColor: '#fff', 
    marginBottom: 5 
  },
  statBox: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: 'bold', color: '#3498db' },
  statLabel: { fontSize: 11, color: '#7f8c8d', marginTop: 3 },
  card: { 
    backgroundColor: '#fff', 
    margin: 8, 
    padding: 10, 
    borderRadius: 8, 
    elevation: 1 
  },
  barcode: { fontWeight: 'bold', fontSize: 13, color: '#2c3e50' },
  productName: { fontSize: 12, color: '#34495e', marginTop: 2 },
  lote: { fontSize: 10, color: '#7f8c8d', marginTop: 2 },
  usuario: { fontSize: 10, color: '#8e44ad', marginTop: 2 },
  quantityAnt: { fontSize: 11, color: '#e67e22', marginTop: 2 },
  quantityNew: { fontSize: 12, color: '#27ae60', fontWeight: 'bold', marginTop: 2 },
  row: { 
    flexDirection: 'row', 
    justifyContent: 'flex-end', 
    alignItems: 'center', 
    marginTop: 8 
  },
  actionButtons: { 
    flexDirection: 'row', 
    gap: 6 
  },
  editProductButton: { 
    backgroundColor: '#9b59b6', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 4 
  },
  deleteButton: { 
    backgroundColor: '#e74c3c', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 4 
  },
  editText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  deleteText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', padding: 30 },
  emptyTitle: { fontSize: 16, color: '#7f8c8d', marginBottom: 8 },
  emptyText: { fontSize: 13, color: '#95a5a6', textAlign: 'center' },
  buttonRow: { 
    flexDirection: 'row', 
    padding: 12, 
    paddingBottom: 15,
    backgroundColor: '#fff', 
    borderTopWidth: 1, 
    borderColor: '#ddd', 
    gap: 8 
  },
  button: { 
    flex: 1, 
    padding: 10, 
    borderRadius: 8, 
    alignItems: 'center' 
  },
  scanButton: { backgroundColor: '#3498db' },
  exportButton: { backgroundColor: '#27ae60' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  bottomSpace: {
    height: 60,
  }
});