import { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, 
  StyleSheet, Alert, ScrollView, ActivityIndicator 
} from 'react-native';
import { getProductByBarcode, updateProduct,insertTomaInventario,getTomaInventarioByBarcode,actualizarTomaInventario  } from '../services/api';

export default function EditProductScreen({ route, navigation }) {
  const { barcode, isNew , user } = route.params || {};
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
     cant_Nueva: ''
  
  });

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
        cant_Nueva: ''
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
  
  const result = await actualizarTomaInventario(product.codigobarra, nuevaCantidad);
  
  if (result.success) {
    // Crear objeto con los datos actualizados
    const productoActualizado = {
      codigobarra: product.codigobarra,
      descripcion: product.descripcion,
      numLote: product.numLote,
      cant_Nueva: nuevaCantidad,
      cantExistencial: parseFloat(product.cantExistencial) || 0
    };
    
    // Pasar los datos actualizados de vuelta
    navigation.navigate('Inventory', { 
      productoActualizado: productoActualizado,
      actualizarLista: true
    });
  } else {
    Alert.alert('Error', result.message);
  }
  setSaving(false);
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

        <Text style={styles.label}>📦 Cantidad Existencial</Text>
        <TextInput
          style={styles.input}
          value={product.cantExistencial}
          onChangeText={(text) => setProduct({...product, cantExistencial: text})}
          placeholder="Cantidad"
          keyboardType="numeric"
        />

          <Text style={styles.label}>📦 Cantidad Nueva</Text>
        <TextInput
          style={styles.input}
          value={product.cant_Nueva}
          onChangeText={(text) => setProduct({...product, cant_Nueva: text})}
          placeholder="Cantidad"
          keyboardType="numeric"
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
        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => navigation.goBack()}>
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