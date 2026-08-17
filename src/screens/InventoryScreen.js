import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import ScannerScreen from './ScannerScreen';
import { 
  getTomaInventario, 
  iniciarInventario,
  finalizarInventario,
  eliminarTomaInventario  
} from '../services/api';
import { useFocusEffect } from '@react-navigation/native';

export default function InventoryScreen({ navigation, route }) {
  const [items, setItems] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [sessionId] = useState(`INV-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState('mis');
  
  // ESTADOS PARA CONTROL DE INVENTARIO
  const [tipoInventario, setTipoInventario] = useState('PARCIAL');
  const [inventarioEstado, setInventarioEstado] = useState('PENDIENTE');
  const [fechaInicioInventario, setFechaInicioInventario] = useState(null);
  const [fechaFinInventario, setFechaFinInventario] = useState(null);
  const [loadingAccion, setLoadingAccion] = useState(false);
  
  const user = route.params?.user;
const inventarioActivo = route.params?.inventarioActivo;
const sucursalInventario = inventarioActivo?.nombre_sucursal_inventario || '';
const idSucursalInventario = inventarioActivo?.idsucursal_inventario || '';
  const crearNuevo = route.params?.crearNuevo || false;
  
  // Verificar si es ADMINISTRADOR por el ROLE
  const isAdmin = user?.role === 'ADMINISTRADOR';

  // ============================================
  // CARGAR ESTADO DEL INVENTARIO
  // ============================================
  const cargarEstadoInventario = () => {
    if (inventarioActivo) {
      // Si venimos de SelectInventoryScreen con un inventario activo
      setInventarioEstado(inventarioActivo.estado || 'INICIADO');
      setTipoInventario(inventarioActivo.tipo || 'PARCIAL');
      if (inventarioActivo.fecha_inicio) {
        setFechaInicioInventario(inventarioActivo.fecha_inicio);
      }
      if (inventarioActivo.fecha_fin) {
        setFechaFinInventario(inventarioActivo.fecha_fin);
      }
    } else if (crearNuevo) {
      // Si venimos a crear un nuevo inventario
      setInventarioEstado('PENDIENTE');
      setTipoInventario('PARCIAL');
    }
  };

  // Cargar estado al montar
  useEffect(() => {
    cargarEstadoInventario();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        loadProducts();
      }
    }, [viewMode, user])
  );

  const loadProducts = async () => {
  setIsLoading(true);
  try {
    let productos;
    const esAdmin = user?.role === 'ADMINISTRADOR';
    
    const inventarioActivo = route.params?.inventarioActivo;
    const idaperturainventario = inventarioActivo?.idaperturainventario || inventarioActivo?.id || null;
    
    console.log('📦 Cargando productos - Admin:', esAdmin);
    console.log('📦 idaperturainventario:', idaperturainventario);
    
    if (viewMode === 'mis') {
      productos = await getTomaInventario(user?.id);
      console.log('Mis productos:', productos?.length || 0);
    } else if (esAdmin) {
      const todos = await getTomaInventario();
      console.log('Todos los productos (sin filtrar):', todos?.length || 0);
      
      // ✅ FILTRAR SOLO POR idaperturainventario
      if (idaperturainventario) {
        productos = todos.filter(prod => prod.idaperturainventario === idaperturainventario);
        console.log('📦 Productos filtrados por idaperturainventario:', productos?.length || 0);
      } else {
        productos = todos;
        console.log('📦 Mostrando TODOS los productos (sin filtro)');
      }
    }
    
    if (productos && productos.length > 0) {
      const itemsList = productos.map(prod => ({
        idTomaInventario: prod.idTomaInventario,
        codigobarra: prod.codigoBarra,
        name: prod.descripcion,
        lote: prod.numLote || 'N/A',
        cantidad_nueva: prod.cant_Nueva || 0,
        usuario: prod.empleadoRegistro || prod.usuarioRegistro || 'Usuario',
        fecha_edicion: prod.fechaActualizacion ? new Date(prod.fechaActualizacion).toLocaleString() : new Date().toLocaleString(),
        nombresucursal: prod.nombresucursal,
        sucursal_destino: prod.sucursal_destino || 'N/A',
        ubicacion: prod.ubicacion || 'N/A',
        idproducto: prod.idProducto || 0,
        idaperturainventario: prod.idaperturainventario,
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
                cantidad_nueva: productoEditado.cant_Nueva ,
                ubicacion:productoEditado.ubicacion
              }
            : item
        )
      );
      
      navigation.setParams({ productoActualizado: null, actualizarLista: false });
    }
  }, [route.params]);

  // ============================================
  // FUNCIONES PARA ADMINISTRADOR
  // ============================================
  
  const handleCambiarTipo = (tipo) => {
    if (inventarioEstado === 'INICIADO') {
      Alert.alert('Inventario en curso', 'No se puede cambiar el tipo porque el inventario ya fue iniciado.');
      return;
    }
    setTipoInventario(tipo);
  };

  const handleIniciarInventario = () => {
    if (!tipoInventario) {
      Alert.alert('Error', 'Seleccione un tipo de inventario');
      return;
    }
    
    Alert.alert(
      'Iniciar Inventario',
      `¿Está seguro de INICIAR el inventario ${tipoInventario === 'TOTAL' ? 'TOTAL' : 'PARCIAL'}?\n\n` +
      `🏢 Sucursal: ${user?.sucursalNombre || 'N/A'}\n\n` +
      `⚠️ Una vez iniciado, todos los usuarios podrán escanear productos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Iniciar', 
          onPress: async () => {
            setLoadingAccion(true);
            try {
              const result = await iniciarInventario(
                tipoInventario, 
                String(user?.id), 
                String(user?.sucursalId || '')
              );
              console.log(user?.sucursalId);
              if (result.success) {
                setInventarioEstado('INICIADO');
                setFechaInicioInventario(new Date().toLocaleString());
                Alert.alert('✅ Éxito', result.mensaje || `Inventario ${tipoInventario === 'TOTAL' ? 'TOTAL' : 'PARCIAL'} iniciado correctamente`);
                loadProducts();
              } else {
                Alert.alert('Error', result.message || 'No se pudo iniciar el inventario');
              }
            } catch (error) {
              console.error('Error:', error);
              Alert.alert('Error', 'No se pudo iniciar el inventario');
            } finally {
              setLoadingAccion(false);
            }
          }
        }
      ]
    );
  };

 const handleFinalizarInventario = () => {
  const totalUnits = items.reduce((sum, i) => sum + (i.cantidad_nueva || 0), 0);
  
  // ✅ OBTENER EL ID DEL INVENTARIO
  const inventarioActivo = route.params?.inventarioActivo;
  const idaperturainventario = inventarioActivo?.idaperturainventario || inventarioActivo?.id || null;
  
  if (!idaperturainventario) {
    Alert.alert('Error', 'No se pudo identificar el inventario');
    return;
  }
  
  Alert.alert(
    'Finalizar Inventario',
    `¿Está seguro de FINALIZAR el inventario?\n\n📋 Tipo: ${tipoInventario === 'TOTAL' ? 'INVENTARIO TOTAL' : 'INVENTARIO PARCIAL'}\n📦 Productos registrados: ${items.length}\n📊 Unidades totales: ${totalUnits}\n\n⚠️ Después de finalizar, NO se podrán agregar más productos.`,
    [
      { text: 'Cancelar', style: 'cancel' },
      { 
        text: 'Finalizar', 
        style: 'destructive',
        onPress: async () => {
          setLoadingAccion(true);
          try {
            console.log('🏁 Finalizando inventario ID:', idaperturainventario);
            
            const result = await finalizarInventario(
              String(user?.id),
              idaperturainventario  // ✅ SOLO EL ID
            );
            
            if (result && result.success) {
              setInventarioEstado('FINALIZADO');
              setFechaFinInventario(new Date().toLocaleString());
              Alert.alert('✅ Éxito', result.mensaje || 'Inventario finalizado correctamente');
              navigation.replace('SelectInventory', { user: user });
            } else {
              Alert.alert('❌ Error', result?.mensaje || result?.message || 'No se pudo finalizar');
            }
          } catch (error) {
            console.error('Error:', error);
            Alert.alert('❌ Error', error?.message || 'Error al finalizar');
          } finally {
            setLoadingAccion(false);
          }
        }
      }
    ]
  );
};
  const addItem = (product) => {
    // VALIDAR si el inventario está INICIADO
    if (inventarioEstado !== 'INICIADO') {
      Alert.alert(
        '⛔ Inventario no activo',
        inventarioEstado === 'PENDIENTE' 
          ? 'El inventario aún no ha sido iniciado por el administrador.'
          : 'El inventario ya fue finalizado. No se pueden agregar más productos.'
      );
      return;
    }
    
    const barcodeValue = product.codigoBarra || product.codigobarra;
    const existingIndex = items.findIndex(i => i.codigobarra === barcodeValue);
    
    if (existingIndex !== -1) {
      const newItems = [...items];
      newItems[existingIndex] = {
        ...newItems[existingIndex],
        cantidad_nueva: product.cant_Nueva || 0,
        fecha_edicion: new Date().toLocaleString()
      };
      setItems(newItems);
      Alert.alert('Éxito', `Cantidad actualizada a: ${product.cant_Nueva || 0}`);
    } else {
      const newItem = {
        idTomaInventario: product.idTomaInventario, 
        codigobarra: barcodeValue,
        name: product.descripcion,
        lote: product.numLote || 'N/A',
        cantidad_nueva: product.cant_Nueva || 0,
        fecha_edicion: new Date().toLocaleString(),
        usuario: user?.empleado || user?.name || user?.username || 'Usuario',
        nombresucursal: product.nombresucursal || user?.sucursalNombre || 'N/A',
        sucursal_destino: product.sucursal_destino || user?.sucursalId || 'N/A',
        ubicacion: product.ubicacion || 'N/A',
        idproducto: product.idProducto || 0,
      };
      setItems([...items, newItem]);
      Alert.alert('Éxito', 'Producto agregado');
    }
  };
  
  const deleteItem = async (item) => {
  console.log('Estado del inventario:', inventarioEstado);
  console.log('Item a eliminar:', item);
  
  Alert.alert(
    'Eliminar producto',
    `¿Desea eliminar ${item.name}?`,
    [
      { text: 'Cancelar', style: 'cancel' },
      { 
        text: 'Eliminar', 
        style: 'destructive',
        onPress: async () => {
          try {
            console.log('Enviando a eliminar ID:', item.idTomaInventario);
            const result = await eliminarTomaInventario(item.idTomaInventario);
            console.log('Resultado:', result);
            
            if (result.success) {
              const newItems = items.filter(i => i.idTomaInventario !== item.idTomaInventario);
              setItems(newItems);
              Alert.alert('✅ Éxito', result.message || 'Producto eliminado correctamente');
            } else {
              Alert.alert('❌ Error', result.message || 'No se pudo eliminar el producto');
            }
          } catch (error) {
            console.error('Error al eliminar:', error);
            Alert.alert('❌ Error', 'Error al conectar con el servidor');
          }
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
        'idproducto': item.idproducto,
        'Codigo_Barras': item.codigobarra,
        'Producto': item.name,
        'Lote': item.lote,
        'Cantidad_Nueva': item.cantidad_nueva,
        'Usuario': item.usuario,
        'Fecha_Edicion': item.fecha_edicion,
        'Tipo_Inventario': tipoInventario || 'N/A',
        'sucursal_destino':item.sucursal_destino || 'N/A',
        'ubicacion':item.ubicacion || 'N/A'
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
     console.log('📤 Enviando a Scanner - inventarioActivo:', inventarioActivo);
  console.log('📤 Enviando a Scanner - idaperturainventario:', inventarioActivo?.id);
    return <ScannerScreen onScan={addItem} onClose={() => setShowScanner(false)} navigation={navigation} user={user}     idaperturainventario={inventarioActivo?.idaperturainventario  || null} />;
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.userName}>👤 {user?.empleado || user?.name || user?.username || 'Usuario'}</Text>
          <Text style={styles.userRole}>📛 Rol: {user?.role || 'Sin rol'}</Text>
          {user?.sucursalNombre && (
            <Text style={styles.sucursalLogueado}>🏢 Sucursal: {user.sucursalNombre}</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={styles.logoutText}>🚪 Salir</Text>
        </TouchableOpacity>
      </View>
      
      {/* PANEL DE CONTROL - SOLO PARA ADMINISTRADOR */}
      {isAdmin && (
        <View style={styles.adminPanel}>
          <Text style={styles.adminTitle}>🎮 Panel de Control</Text>
          
          {/* Estado actual del inventario */}
          <View style={styles.estadoBadge}>
            <Text style={[
              styles.estadoBadgeText,
              inventarioEstado === 'INICIADO' && styles.estadoBadgeVerde,
              inventarioEstado === 'FINALIZADO' && styles.estadoBadgeRojo,
              inventarioEstado === 'PENDIENTE' && styles.estadoBadgeAmarillo
            ]}>
              {inventarioEstado === 'INICIADO' ? '🟢 INICIADO' : 
               inventarioEstado === 'FINALIZADO' ? '🔴 FINALIZADO' : '🟡 PENDIENTE'}
            </Text>
          </View>
          
          {/* Selector de tipo de inventario */}
          <View style={styles.tipoSelector}>
            <Text style={styles.tipoLabel}>Tipo de inventario:</Text>
            <View style={styles.tipoButtons}>
              <TouchableOpacity 
                style={[
                  styles.tipoButton, 
                  tipoInventario === 'PARCIAL' && styles.tipoButtonActive,
                  inventarioEstado === 'INICIADO' && styles.tipoButtonDisabled
                ]}
                onPress={() => handleCambiarTipo('PARCIAL')}
                disabled={inventarioEstado === 'INICIADO'}
              >
                <Text style={[styles.tipoButtonText, tipoInventario === 'PARCIAL' && styles.tipoButtonTextActive]}>
                  📋 PARCIAL
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.tipoButton, 
                  tipoInventario === 'TOTAL' && styles.tipoButtonActive,
                  inventarioEstado === 'INICIADO' && styles.tipoButtonDisabled
                ]}
                onPress={() => handleCambiarTipo('TOTAL')}
                disabled={inventarioEstado === 'INICIADO'}
              >
                <Text style={[styles.tipoButtonText, tipoInventario === 'TOTAL' && styles.tipoButtonTextActive]}>
                  📦 TOTAL
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Botones de acción */}
          <View style={styles.adminButtons}>
             {(inventarioEstado === 'PENDIENTE' || inventarioEstado === 'FINALIZADO') && (
              <TouchableOpacity 
                style={styles.iniciarButton} 
                onPress={handleIniciarInventario}
                disabled={loadingAccion}
              >
                <Text style={styles.adminButtonText}>
                  {loadingAccion ? '⏳ Procesando...' : '🚀 INICIAR INVENTARIO'}
                </Text>
              </TouchableOpacity>
            )}
            
            {inventarioEstado === 'INICIADO' && (
              <TouchableOpacity 
                style={styles.finalizarButton} 
                onPress={handleFinalizarInventario}
                disabled={loadingAccion}
              >
                <Text style={styles.adminButtonText}>
                  {loadingAccion ? '⏳ Procesando...' : '🏁 FINALIZAR INVENTARIO'}
                </Text>
              </TouchableOpacity>
            )}
            
            {inventarioEstado === 'FINALIZADO' && (
              <View style={styles.finalizadoMensajeContainer}>
                <Text style={styles.finalizadoMensajeTexto}>
                  🔒 El inventario ya fue finalizado.
                </Text>
                <Text style={styles.finalizadoMensajeSubtexto}>
                  Inicie un nuevo inventario presionando "INICIAR INVENTARIO".
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
      
      {/* Selector de vista - SOLO si el ROLE es ADMINISTRADOR */}
      {isAdmin && (
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
      )}
      
      {/* Mensaje para usuarios que no son ADMINISTRADOR */}
      {!isAdmin && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoText}>📱 Mostrando solo tus productos</Text>
          {inventarioEstado !== 'INICIADO' && (
            <Text style={styles.infoTextAdvertencia}>
              {inventarioEstado === 'PENDIENTE' ? '⏳ Inventario no iniciado. Espere al administrador.' : '🔒 Inventario finalizado. Ya no se pueden agregar productos.'}
            </Text>
          )}
        </View>
      )}
      
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
            <Text style={styles.quantityNew}>✨ Cantidad: {item.cantidad_nueva}</Text>
            <View style={styles.row}>
              <View style={styles.actionButtons}>
                <TouchableOpacity 
                  style={styles.editProductButton}
                  onPress={() => {
                    navigation.navigate('EditProduct', { 
                      barcode: item.codigobarra,
                      ubicacion:item.ubicacion ,
                      isNew: false,
                      user: user
                    });
                  }}
                >
                  <Text style={styles.editText}>✏️ Editar</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.deleteButton}
                  onPress={() => deleteItem(item)}
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
  userRole: { fontSize: 12, color: '#7f8c8d', marginTop: 2 },
  sucursalLogueado: { fontSize: 12, color: '#3498db', marginTop: 2 },
  logoutText: { color: '#e74c3c', fontWeight: 'bold', fontSize: 12 },
  
  // Estilos para Panel de Admin
  adminPanel: {
    backgroundColor: '#2c3e50',
    margin: 10,
    padding: 12,
    borderRadius: 10,
    elevation: 3,
  },
  adminTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  estadoBadge: {
    alignItems: 'center',
    marginBottom: 12,
  },
  estadoBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: 'hidden',
  },
  estadoBadgeVerde: {
    backgroundColor: '#27ae60',
    color: '#fff',
  },
  estadoBadgeRojo: {
    backgroundColor: '#e74c3c',
    color: '#fff',
  },
  estadoBadgeAmarillo: {
    backgroundColor: '#f39c12',
    color: '#fff',
  },
  tipoSelector: {
    backgroundColor: '#34495e',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  tipoLabel: {
    color: '#fff',
    fontSize: 12,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  tipoButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  tipoButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: '#ecf0f1',
  },
  tipoButtonActive: {
    backgroundColor: '#3498db',
  },
  tipoButtonDisabled: {
    opacity: 0.5,
  },
  tipoButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#7f8c8d',
  },
  tipoButtonTextActive: {
    color: '#fff',
  },
  adminButtons: {
    marginBottom: 0,
  },
  iniciarButton: {
    backgroundColor: '#27ae60',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  finalizarButton: {
    backgroundColor: '#e74c3c',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  adminButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  finalizadoMensajeContainer: {
    backgroundColor: '#34495e',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  finalizadoMensajeTexto: {
    color: '#f39c12',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
  },
  finalizadoMensajeSubtexto: {
    color: '#ecf0f1',
    fontSize: 11,
    textAlign: 'center',
  },
  
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
  infoBanner: {
    backgroundColor: '#e8f4fd',
    padding: 10,
    marginHorizontal: 10,
    marginVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  infoText: {
    color: '#2c3e50',
    fontSize: 12,
  },
  infoTextAdvertencia: {
    color: '#e74c3c',
    fontSize: 11,
    marginTop: 4,
  },
  statsRow: { 
    flexDirection: 'row', 
    padding: 5, 
    backgroundColor: '#fff', 
    marginBottom: 5 
  },
  statBox: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 10, fontWeight: 'bold', color: '#3498db' },
  statLabel: { fontSize: 6, color: '#7f8c8d', marginTop: 3 },
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
    padding: 3, 
    paddingBottom: 10,
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