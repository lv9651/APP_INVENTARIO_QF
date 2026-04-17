import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { getProductByBarcode, insertTomaInventario } from '../services/api';

export default function ScannerScreen({ onScan, onClose, navigation, user }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Solicitando permiso...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>🔒 Se necesita permiso de cámara</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>📷 Dar permiso</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonCancel} onPress={onClose}>
          <Text style={styles.buttonText}>❌ Cancelar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleScan = async (result) => {
  if (scanned || loading) return;
  setScanned(true);
  setLoading(true);
  
  const barcode = result.data;
  console.log('Código escaneado:', barcode);
  
  try {
    // 1. Obtener producto de la API de producción
    const product = await getProductByBarcode(barcode);
    
    if (product) {

      console.log(product);
      // 2. Intentar guardar en tomaInventario
      const saved = await insertTomaInventario(product, user);
      
      if (saved.success) {
        Alert.alert(
          '✅ Producto guardado',
          `${product.descripcion}\nLote: ${product.numLote || 'N/A'}\nCantidad: ${product.cantExistencial || 0}`,
          [
            { text: 'OK', onPress: () => {
              // Pasar el producto con la cantidad actual
              onScan({
                ...product,
                cantExistencial: product.cantExistencial || 0
              });
              onClose();
            }}
          ]
        );
      } else {
        // Si falla, puede ser que ya existe. Mostrar opción de editar
        Alert.alert(
          '⚠️ Producto ya existe',
          `${product.descripcion}\n¿Desea editar la cantidad?`,
          [
            { text: 'Cancelar', onPress: () => setScanned(false) },
            { text: 'Editar', onPress: () => {
              onClose();
              navigation.navigate('EditProduct', { 
                barcode: barcode, 
                isNew: false,
                user: user
              });
            }}
          ]
        );
      }
    } else {
      Alert.alert(
        '❌ Producto no encontrado',
        `Código: ${barcode}\n¿Desea crear un nuevo producto?`,
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => setScanned(false) },
          { text: 'Crear', onPress: () => {
            onClose();
            navigation.navigate('EditProduct', { 
              barcode: barcode, 
              isNew: true,
              user: user
            });
          }}
        ]
      );
    }
  } catch (error) {
    console.error('Error:', error);
    Alert.alert('Error', 'Error al procesar el producto');
    setScanned(false);
  } finally {
    setLoading(false);
  }
};

  return (
    <View style={styles.container}>
      <CameraView 
        style={styles.camera} 
        facing="back" 
        onBarcodeScanned={handleScan}
        barcodeScannerSettings={{
          barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39"]
        }}
      />
      <View style={styles.overlay}>
        <View style={styles.scanArea} />
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>Cerrar Escáner</Text>
        </TouchableOpacity>
      </View>
      {loading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Guardando...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', alignItems: 'center', paddingBottom: 50 },
  scanArea: { width: 250, height: 250, marginTop: 100, borderWidth: 2, borderColor: '#fff', borderRadius: 10, backgroundColor: 'transparent' },
  closeButton: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 15, borderRadius: 10, marginBottom: 30 },
  closeText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  button: { backgroundColor: '#3498db', padding: 15, borderRadius: 10, margin: 10 },
  buttonCancel: { backgroundColor: '#e74c3c', padding: 15, borderRadius: 10, margin: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  text: { fontSize: 18, textAlign: 'center', marginTop: 50 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', fontSize: 18 }
});