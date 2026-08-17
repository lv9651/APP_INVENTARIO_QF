import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { 
  getProductByBarcode, 
  validarPuedeEscanear 
} from '../services/api';

// IDs de sucursales según tu negocio
const SUCURSAL_QF_ALMACEN = 22;
const SUCURSAL_ALMACEN_ORVIT = 67;
const SUCURSAL_QF_CENTRAL = 18;

export default function ScannerScreen({ onScan, onClose, navigation, user,idaperturainventario}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inventarioActivo, setInventarioActivo] = useState(true);

  // Función para calcular la sucursal destino según la regla de negocio
  const calcularSucursalDestino = (user, productOrigenId, productOrigenNombre) => {
    const userBranchId = user?.sucursalId;
    const userBranchName = user?.sucursalNombre || '';
    
    console.log('Calculando sucursal destino:', {
      userBranchId,
      userBranchName,
      productOrigenId,
      productOrigenNombre
    });
    
    // Caso 1: Usuario es QF ALMACEN (22) o ALMACEN ORVIT (67)
    if (userBranchId === SUCURSAL_QF_ALMACEN || userBranchId === SUCURSAL_ALMACEN_ORVIT) {
      if (productOrigenId === SUCURSAL_QF_CENTRAL || 
          (productOrigenNombre && productOrigenNombre.toLowerCase().includes('qf central'))) {
        console.log('Producto origen QF CENTRAL -> Asignando ALMACEN ORVIT');
        return {
          idsucursal_destino: SUCURSAL_ALMACEN_ORVIT,
          sucursal_destino: 'ALMACEN ORVIT'
        };
      } else {
        console.log('Producto origen NO es QF CENTRAL -> Asignando el almacén del producto:', productOrigenNombre);
        return {
          idsucursal_destino: productOrigenId,
          sucursal_destino: productOrigenNombre
        };
      }
    } 
    else {
      console.log('Usuario es otra sucursal -> Asignando su propia sucursal:', userBranchName);
      return {
        idsucursal_destino: userBranchId,
        sucursal_destino: userBranchName
      };
    }
  };

  useEffect(() => {
    const verificarEstado = async () => {
      try {
        const validacion = await validarPuedeEscanear();
        console.log('Validación escaneo:', validacion);
        
        if (!validacion.permitido) {
          setInventarioActivo(false);
          Alert.alert(
            '⛔ Inventario no disponible',
            validacion.mensaje,
            [{ text: 'OK', onPress: onClose }]
          );
        }
      } catch (error) {
        console.error('Error al verificar estado:', error);
      }
    };
    
    verificarEstado();
  }, []);

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
    if (!inventarioActivo) {
      Alert.alert(
        '⛔ Inventario no disponible',
        'El inventario no está activo para escanear.',
        [{ text: 'OK', onPress: onClose }]
      );
      return;
    }
    
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);
    
    const barcode = result.data;
    console.log('📷 Código escaneado:', barcode);
    
    try {
      // ❌ ELIMINADO: Ya no verificamos existencia aquí
      // La validación se hará en EditProductScreen al guardar
      
      // Buscar en el catálogo de productos
      console.log('📦 Buscando producto en catálogo...');
      const productFromCatalog = await getProductByBarcode(barcode);
      console.log('📦 Producto del catálogo:', productFromCatalog);
      
      if (!productFromCatalog || !productFromCatalog.codigobarra) {
        Alert.alert(
          '❌ Producto no encontrado',
          `El código ${barcode} no está registrado en el catálogo.`
        );
        setScanned(false);
        return;
      }
      
      // Calcular la sucursal destino
      const productOrigenId = productFromCatalog.idsucursal || null;
      const productOrigenNombre = productFromCatalog.nombresucursal || '';
      const destino = calcularSucursalDestino(user, productOrigenId, productOrigenNombre);
      
      console.log('🎯 Sucursal destino calculada:', destino);
      
      // Cerrar el escáner
      onClose();
      
      // Abrir el formulario para registrar (la validación de existencia se hará al guardar)
        console.log('📤 Scanner enviando a EditProduct - idaperturainventario:', idaperturainventario);
  
      navigation.navigate('EditProduct', { 
        barcode: barcode, 
        isNew: true,
        user: user,
        esObligatorio: true,
        fromScanner: true,
          idaperturainventario: idaperturainventario, 
        productoData: {
          ...productFromCatalog,
          idsucursal_destino: destino.idsucursal_destino,
          sucursal_destino: destino.sucursal_destino
        }
      });
      
    } catch (error) {
      console.error('❌ Error:', error);
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
        <Text style={styles.scanText}>Enfoca el código de barras</Text>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>Cerrar Escáner</Text>
        </TouchableOpacity>
      </View>
      {loading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Procesando...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  overlay: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    bottom: 0, 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingBottom: 50 
  },
  scanArea: { 
    width: 280, 
    height: 280, 
    borderWidth: 2, 
    borderColor: '#4CAF50', 
    borderRadius: 10, 
    backgroundColor: 'transparent' 
  },
  scanText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 20
  },
  closeButton: { 
    backgroundColor: 'rgba(0,0,0,0.7)', 
    padding: 15, 
    borderRadius: 10, 
    marginTop: 30
  },
  closeText: { 
    color: '#fff', 
    fontSize: 16, 
    fontWeight: 'bold' 
  },
  button: { 
    backgroundColor: '#3498db', 
    padding: 15, 
    borderRadius: 10, 
    margin: 10 
  },
  buttonCancel: { 
    backgroundColor: '#e74c3c', 
    padding: 15, 
    borderRadius: 10, 
    margin: 10 
  },
  buttonText: { 
    color: '#fff', 
    fontSize: 16, 
    fontWeight: 'bold' 
  },
  text: { 
    fontSize: 18, 
    textAlign: 'center', 
    marginTop: 50 
  },
  loadingOverlay: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    bottom: 0, 
    backgroundColor: 'rgba(0,0,0,0.7)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  loadingText: { 
    color: '#fff', 
    fontSize: 18 
  }
});