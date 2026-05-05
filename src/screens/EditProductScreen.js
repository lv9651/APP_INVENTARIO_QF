import { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, 
  StyleSheet, Alert, ScrollView, ActivityIndicator, BackHandler 
} from 'react-native';
import { getTomaInventarioByBarcode, actualizarTomaInventario } from '../services/api';

export default function EditProductScreen({ route, navigation }) {
  const { barcode, isNew, user, esObligatorio } = route.params || {};
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
    sucursal_destino: ''
  });

  // Deshabilitar el botón de retroceder del celular si es obligatorio
  useEffect(() => {
    if (esObligatorio) {
      // Deshabilitar el botón de retroceder del celular
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        Alert.alert(
          'Atención',
          'Debe guardar la cantidad antes de salir',
          [{ text: 'OK' }]
        );
        return true; // Retorna true para evitar que navegue hacia atrás
      });

      // Deshabilitar el gesto de deslizar hacia atrás en iOS
      navigation.setOptions({
        headerLeft: () => null,
        gestureEnabled: false,
      });

      return () => backHandler.remove();
    }
  }, [esObligatorio, navigation]);

  useEffect(() => {
    if (isNew) {
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
        nombresucursal: '',
        sucursal_destino: ''
      });
      setLoading(false);
    } else {
      loadProduct();
    }
  }, []);

  const loadProduct = async () => {
    setLoading(true);
    const data = await getTomaInventarioByBarcode(barcode);
    
    if (data) {
      setProduct({
        idProducto: data.idProducto ? String(data.idProducto) : '',
        descripcion: data.descripcion || '',
        numLote: data.numLote || '',
        cantExistencial: data.cantExistencial ? String(data.cantExistencial) : '',
        cant_Nueva: data.cant_Nueva ? String(data.cant_Nueva) : '',
        fechaFabricacion: data.fechaFabricacion ? formatDate(data.fechaFabricacion) : '',
        fechaValidez: data.fechaValidez ? formatDate(data.fechaValidez) : '',
        fechaRecepcion: data.fechaRecepcion ? formatDate(data.fechaRecepcion) : '',
        codigobarra: data.codigobarra || barcode,
        nombresucursal: data.nombresucursal || '',
        sucursal_destino: data.sucursal_destino || '',
      });
    }
    setLoading(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  const handleSave = async () => {
    setSaving(true);
    
    const nuevaCantidad = parseFloat(product.cant_Nueva) || 0;
    
    if (nuevaCantidad <= 0 && esObligatorio) {
      Alert.alert('Atención', 'Debe ingresar una cantidad mayor a 0');
      setSaving(false);
      return;
    }
    
    const result = await actualizarTomaInventario(product.codigobarra, nuevaCantidad);
    
    if (result.success) {
      if (route.params?.onProductUpdated) {
        route.params.onProductUpdated({
          codigobarra: product.codigobarra,
          cant_Nueva: nuevaCantidad
        });
      }
      navigation.goBack();
    } else {
      Alert.alert('Error', result.message);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    if (esObligatorio) {
      Alert.alert('Atención', 'Debe guardar la cantidad antes de salir');
    } else {
      navigation.goBack();
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
      <Text style={styles.title}>✏️ {isNew ? 'Nuevo Producto' : 'Editar Producto'}</Text>
      
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
          style={[styles.input, styles.textArea]}
          value={product.nombresucursal}
          onChangeText={(text) => setProduct({...product, nombresucursal: text})}
          placeholder="Sucursal"
          multiline
          numberOfLines={3}
        />
           <Text style={styles.label}>📝 Sucursal Destino</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={product.sucursal_destino}
          onChangeText={(text) => setProduct({...product, sucursal_destino: text})}
          placeholder="Sucursal"
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>📝 Descripción</Text>
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

        {/* Campo Cantidad Existencial - OCULTO */}
        
        <Text style={styles.label}>📦 Cantidad Nueva</Text>
        <TextInput
          style={styles.input}
          value={product.cant_Nueva}
          onChangeText={(text) => setProduct({...product, cant_Nueva: text})}
          placeholder="Cantidad"
          keyboardType="numeric"
          autoFocus={esObligatorio}
        />

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 15 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#7f8c8d' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#2c3e50', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 15, marginBottom: 20, elevation: 2 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#2c3e50', marginTop: 10, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fff' },
  disabledInput: { backgroundColor: '#f5f5f5', color: '#999' },
  textArea: { height: 80, textAlignVertical: 'top' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 30 },
  button: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center' },
  saveButton: { backgroundColor: '#27ae60' },
  cancelButton: { backgroundColor: '#95a5a6' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});