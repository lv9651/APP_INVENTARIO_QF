import { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, 
  StyleSheet, Alert, ScrollView, ActivityIndicator, BackHandler 
} from 'react-native';
import { 
  getTomaInventarioByBarcode, 
  actualizarTomaInventario, 
  insertTomaInventario ,
  getTomaInventarioByBarcodeAndUbicacion
} from '../services/api';

export default function EditProductScreen({ route, navigation }) {
  const { 
    barcode, 
    ubicacion,
    isNew, 
    user, 
    esObligatorio, 
    fromScanner, 
    productoData,idaperturainventario  
  } = route.params || {};
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState({
    idProducto: '',
    descripcion: '',
    numLote: '',
    cantExistencial: '',
    fechaFabricacion: '',
    fechaValidez: '',
    fechaRecepcion: '',
    cant_Nueva: '',
    codigobarra: '',
    nombresucursal: '',
    sucursal_destino: '',
    ubicacion: ''
  });

  // Deshabilitar el botón de retroceder si es obligatorio
  useEffect(() => {
    if (esObligatorio) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        Alert.alert(
          'Atención',
          'Debe guardar la cantidad antes de salir',
          [{ text: 'OK' }]
        );
        return true;
      });

      navigation.setOptions({
        headerLeft: () => null,
        gestureEnabled: false,
      });

      return () => backHandler.remove();
    }
  }, [esObligatorio, navigation]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // ✅ CASO 1: Viene del escáner con datos (NUEVO PRODUCTO)
      if (fromScanner && productoData) {
        console.log('📱 Viene del escáner - Cargando datos:', productoData);
        
        setProduct({
          idProducto: productoData.idProducto?.toString() || '',
          descripcion: productoData.descripcion || '',
          numLote: productoData.numLote || '',
          cantExistencial: productoData.cantExistencial?.toString() || '',
          fechaFabricacion: productoData.fechaFabricacion ? formatDate(productoData.fechaFabricacion) : '',
          fechaValidez: productoData.fechaValidez ? formatDate(productoData.fechaValidez) : '',
          fechaRecepcion: productoData.fechaRecepcion ? formatDate(productoData.fechaRecepcion) : '',
          codigobarra: barcode || productoData.codigobarra,
          nombresucursal: productoData.nombresucursal || user?.sucursalNombre || '',
          sucursal_destino: productoData.sucursal_destino || '',
          ubicacion: '',
          cant_Nueva: ''
        });
        
        setLoading(false);
        return;
      }
      
      // ✅ CASO 2: Es nuevo pero sin datos (solo código)
      if (isNew && !fromScanner) {
        console.log('📝 Producto nuevo - Solo código');
        setProduct({
          idProducto: '',
          descripcion: '',
          numLote: '',
          cantExistencial: '',
          fechaFabricacion: '',
          fechaValidez: '',
          fechaRecepcion: '',
          cant_Nueva: '',
          codigobarra: barcode || '',
          nombresucursal: user?.sucursalNombre || '',
          sucursal_destino: '',
          ubicacion: ''
        });
        setLoading(false);
        return;
      }
      
      // ✅ CASO 3: Editar producto existente (carga desde BD)
      console.log('✏️ Editando producto existente - Cargando desde BD');
      const existingTake = await getTomaInventarioByBarcodeAndUbicacion(barcode,ubicacion);
      
      if (existingTake && existingTake.codigobarra) {
        setProduct({
          idProducto: existingTake.idProducto?.toString() || '',
          descripcion: existingTake.descripcion || '',
          numLote: existingTake.numLote || '',
          cantExistencial: existingTake.cantExistencial?.toString() || '',
          cant_Nueva: existingTake.cant_Nueva?.toString() || '',
          fechaFabricacion: existingTake.fechaFabricacion ? formatDate(existingTake.fechaFabricacion) : '',
          fechaValidez: existingTake.fechaValidez ? formatDate(existingTake.fechaValidez) : '',
          fechaRecepcion: existingTake.fechaRecepcion ? formatDate(existingTake.fechaRecepcion) : '',
          codigobarra: existingTake.codigobarra || barcode,
          nombresucursal: existingTake.nombresucursal || user?.sucursalNombre || '',
          sucursal_destino: existingTake.sucursal_destino || '',
          ubicacion: existingTake.ubicacion || '',
        });
      } else {
        Alert.alert('Error', 'No se encontró el producto');
        navigation.goBack();
      }
      
    } catch (error) {
      console.error('Error al cargar:', error);
      Alert.alert('Error', 'No se pudo cargar la información');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
  const nuevaCantidad = parseFloat(product.cant_Nueva) || 0;
  const nubicacion = product.ubicacion || "";
  
  console.log('📦 Cantidad a guardar:', nuevaCantidad);
  console.log('📍 Ubicación a guardar:', nubicacion);
  
  if (nuevaCantidad <= 0 && esObligatorio) {
    Alert.alert('Atención', 'Debe ingresar una cantidad mayor a 0');
    return;
  }
  
  if (!nubicacion.trim() && esObligatorio) {
    Alert.alert('Atención', 'Debe ingresar una ubicación');
    return;
  }
  
  setSaving(true);
  
  try {
    let result;
    
    // ✅ CASO 1: Viene del escáner - INSERTAR nuevo producto
    if (fromScanner && route.params?.productoData) {
      console.log('💾 Insertando nuevo producto desde escáner...');
        console.log('📥 idaperturainventario en EditProduct:', idaperturainventario);
      const nuevoProducto = {
        codigobarra: product.codigobarra,
        descripcion: product.descripcion,
        numLote: product.numLote,
        cantExistencial: product.cantExistencial,
        fechaFabricacion: product.fechaFabricacion,
        fechaValidez: product.fechaValidez,
        fechaRecepcion: product.fechaRecepcion,
        idProducto: product.idProducto,
        nombresucursal: product.nombresucursal,
        idsucursal: route.params.productoData.idsucursal,
        idsucursal_destino: route.params.productoData.idsucursal_destino,
        sucursal_destino: product.sucursal_destino,
        ubicacion: nubicacion,
        cant_Nueva: nuevaCantidad
      };
      
      result = await insertTomaInventario(nuevoProducto, user,idaperturainventario);
    } 
    // ✅ CASO 2: Es nuevo pero no del escáner - INSERTAR
    else if (isNew && !fromScanner) {
      console.log('💾 Insertando nuevo producto...');
      
      const nuevoProducto = {
        codigobarra: product.codigobarra,
        descripcion: product.descripcion,
        numLote: product.numLote,
        cantExistencial: product.cantExistencial,
        fechaFabricacion: product.fechaFabricacion,
        fechaValidez: product.fechaValidez,
        fechaRecepcion: product.fechaRecepcion,
        idProducto: product.idProducto,
        nombresucursal: product.nombresucursal,
        sucursal_destino: product.sucursal_destino,
        ubicacion: nubicacion,
        cant_Nueva: nuevaCantidad
      };
      
      result = await insertTomaInventario(nuevoProducto, user,idaperturainventario);
    }
    // ✅ CASO 3: Producto existente - ACTUALIZAR
    else {
      console.log('✏️ Actualizando producto existente...');
      result = await actualizarTomaInventario(
        product.codigobarra, 
        nuevaCantidad,
        nubicacion
      );
    }
    
    console.log('📊 Resultado de guardado:', result);
    
    // ✅ CORRECCIÓN: Verificar tanto Success (mayúscula) como success (minúscula)
    const isSuccess = result?.Success === 1 || result?.success === true;
    
    if (isSuccess) {
      // Preparar datos del producto actualizado
      const productoActualizado = {
        codigobarra: product.codigobarra,
        cant_Nueva: nuevaCantidad,
        ubicacion: nubicacion,
        descripcion: product.descripcion,
        numLote: product.numLote,
        nombresucursal: product.nombresucursal,
        sucursal_destino: product.sucursal_destino
      };
      
      // ✅ Mostrar mensaje de éxito
      Alert.alert('✅ Éxito', result?.Message || result?.message || 'Producto guardado correctamente');
      
      // Navegar de vuelta a InventoryScreen
      navigation.navigate('Inventory', {
        user: user,
        productoActualizado: productoActualizado,
        actualizarLista: true
      });
    } else {
      // ✅ Mostrar mensaje de error del SP (ej: "Ya existe el código de barras")
      const errorMessage = result?.Message || result?.message || 'No se pudo guardar';
      console.log('❌ Error del servidor:', errorMessage);
      Alert.alert('❌ Error', errorMessage);
    }
  } catch (error) {
    console.error('❌ Error al guardar:', error);
    Alert.alert('Error', 'Ocurrió un error al guardar: ' + error.message);
  } finally {
    setSaving(false);
  }
};
  const handleCancel = () => {
    if (esObligatorio) {
      Alert.alert('Atención', 'Debe guardar la cantidad antes de salir');
    } else {
      // ✅ Pasar el usuario al cancelar también
      navigation.navigate('Inventory', {
        user: user
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Cargando producto...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>
        {fromScanner ? '📷 Nuevo Producto Escaneado' : (isNew ? '📝 Nuevo Producto' : '✏️ Editar Producto')}
      </Text>
      
      <View style={styles.badgeContainer}>
        <Text style={styles.badgeText}>📷 Código: {product.codigobarra}</Text>
      </View>
      
      <View style={styles.card}>
        <Text style={styles.label}>🆔 ID Producto</Text>
        <TextInput
          style={[styles.input, styles.disabledInput]}
          value={product.idProducto}
          editable={false}
          placeholder="ID (automático)"
        />
        
        <Text style={styles.label}>📝 Sucursal Origen</Text>
        <TextInput
          style={[styles.input, styles.disabledInput]}
          value={product.nombresucursal}
          editable={false}
          placeholder="Sucursal origen"
        />

        <Text style={styles.label}>🚚 Sucursal Destino</Text>
        <TextInput
          style={[styles.input, styles.disabledInput]}
          value={product.sucursal_destino}
          editable={false}
          placeholder="Sucursal destino"
        />

        <Text style={styles.label}>📝 Descripción *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={product.descripcion}
          onChangeText={(text) => setProduct({...product, descripcion: text})}
          placeholder="Descripción del producto"
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>🔢 Número de Lote</Text>
        <TextInput
          style={styles.input}
          value={product.numLote}
          onChangeText={(text) => setProduct({...product, numLote: text})}
          placeholder="Número de lote"
        />

        <Text style={[styles.label, styles.requiredLabel]}>📦 Cantidad *</Text>
        <TextInput
          style={[styles.input, styles.cantidadInput]}
          value={product.cant_Nueva}
          onChangeText={(text) => setProduct({...product, cant_Nueva: text})}
          placeholder="Ingrese la cantidad"
          keyboardType="numeric"
          autoFocus={esObligatorio}
        />

        <Text style={styles.label}>📍 Ubicación</Text>
        <TextInput
          style={styles.input}
          value={product.ubicacion}
          onChangeText={(text) => setProduct({...product, ubicacion: text})}
          placeholder="Ej: Estante A-1, Pasillo 3"
        />

        <Text style={styles.sectionTitle}>📅 Información adicional (opcional)</Text>
        
        <Text style={styles.label}>🏭 Fecha de Fabricación</Text>
        <TextInput
          style={styles.input}
          value={product.fechaFabricacion}
          onChangeText={(text) => setProduct({...product, fechaFabricacion: text})}
          placeholder="YYYY-MM-DD"
        />

        <Text style={styles.label}>⏰ Fecha de Validez</Text>
        <TextInput
          style={styles.input}
          value={product.fechaValidez}
          onChangeText={(text) => setProduct({...product, fechaValidez: text})}
          placeholder="YYYY-MM-DD"
        />

        <Text style={styles.label}>📅 Fecha de Recepción</Text>
        <TextInput
          style={styles.input}
          value={product.fechaRecepcion}
          onChangeText={(text) => setProduct({...product, fechaRecepcion: text})}
          placeholder="YYYY-MM-DD"
        />
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={handleCancel}>
          <Text style={styles.buttonText}>Cancelar</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleSave} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Guardando...' : '💾 Guardar'}</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 15 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#7f8c8d' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: '#2c3e50', textAlign: 'center' },
  badgeContainer: {
    backgroundColor: '#34495e',
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 15, marginBottom: 20, elevation: 2 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#2c3e50', marginTop: 10, marginBottom: 5 },
  requiredLabel: { color: '#e74c3c' },
  sectionTitle: { 
    fontSize: 16, 
    fontWeight: 'bold', 
    color: '#2c3e50', 
    marginTop: 20, 
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd'
  },
  input: { 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    padding: 12, 
    fontSize: 16, 
    backgroundColor: '#fff' 
  },
  cantidadInput: {
    borderColor: '#27ae60',
    borderWidth: 2,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  disabledInput: { backgroundColor: '#f5f5f5', color: '#999' },
  textArea: { height: 80, textAlignVertical: 'top' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 30 },
  button: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center' },
  saveButton: { backgroundColor: '#27ae60' },
  cancelButton: { backgroundColor: '#95a5a6' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  bottomSpace: { height: 30 }
});