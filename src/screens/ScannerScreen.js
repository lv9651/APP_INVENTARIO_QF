import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { getProductByBarcode, getTomaInventarioByBarcode, insertTomaInventario, validarPuedeEscanear } from '../services/api';

// IDs de sucursales según tu negocio
const SUCURSAL_QF_ALMACEN = 22;
const SUCURSAL_ALMACEN_ORVIT = 67;
const SUCURSAL_QF_CENTRAL = 18;

export default function ScannerScreen({ onScan, onClose, navigation, user }) {
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
    // Si el producto tiene origen Q.F. CENTRAL (18)
    if (productOrigenId === SUCURSAL_QF_CENTRAL || 
        (productOrigenNombre && productOrigenNombre.toLowerCase().includes('qf central'))) {
      console.log('Producto origen QF CENTRAL -> Asignando ALMACEN ORVIT');
      return {
        idsucursal_destino: SUCURSAL_ALMACEN_ORVIT,
        sucursal_destino: 'ALMACEN ORVIT'
      };
    } else {
      // Si NO es QF CENTRAL -> asignar el almacén/local que viene en el código de barra
      console.log('Producto origen NO es QF CENTRAL -> Asignando el almacén del producto:', productOrigenNombre);
      return {
        idsucursal_destino: productOrigenId,      // ← usar el id del producto
        sucursal_destino: productOrigenNombre     // ← usar el nombre del producto
      };
    }
  } 
  // Caso 2: Otra sucursal cualquiera
  else {
    console.log('Usuario es otra sucursal -> Asignando su propia sucursal:', userBranchName);
    return {
      idsucursal_destino: userBranchId,
      sucursal_destino: userBranchName
    };
  }
};

  // Verificar estado del inventario al abrir el escáner
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
    // VALIDAR que el inventario esté activo antes de escanear
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
    console.log('Código escaneado:', barcode);
    
    try {
      // Verificar si ya existe en tomaInventario
      const existingProduct = await getTomaInventarioByBarcode(barcode);
      console.log('Producto existente:', existingProduct);
      
      // Si el producto YA EXISTE - Solo mostrar mensaje, NO hacer nada más
      if (existingProduct && existingProduct.codigobarra) {
        console.log('Producto ya existe - Solo mostrar mensaje');
        Alert.alert(
          'ℹ️ Producto ya registrado',
          `${existingProduct.descripcion}\nCantidad actual: ${existingProduct.cant_Nueva || 0}\n\nNo es necesario volver a escanear.`,
          [{ text: 'OK', onPress: () => {
            onClose();
          }}]
        );
        return; // Salir sin agregar nada
      }
      
      // Si llegamos aquí, el producto NO existe - Es NUEVO
      console.log('Producto nuevo - Crear y abrir formulario');
      
      const product = await getProductByBarcode(barcode);
      
      if (product && product.codigobarra) {
        // Obtener la sucursal origen del producto (de donde viene)
        const productOrigenId = product.idsucursal || null;
        const productOrigenNombre = product.nombresucursal || '';
        
        // Calcular la sucursal destino según la regla de negocio
        const destino = calcularSucursalDestino(user, productOrigenId, productOrigenNombre);
        
        console.log('Sucursal destino calculada:', destino);
        
        // Agregar los campos de destino al producto antes de guardar
        const productWithDestination = {
          ...product,
          idsucursal_destino: destino.idsucursal_destino,
          sucursal_destino: destino.sucursal_destino
        };
        
        const saved = await insertTomaInventario(productWithDestination, user);
        
        if (saved && saved.success) {
          // Abrir formulario para ingresar cantidad del producto NUEVO
          Alert.alert(
            '✅ Producto nuevo',
            `Producto: ${product.descripcion}\n🏢 Sucursal destino: ${destino.sucursal_destino}\n\nIngrese la cantidad.`,
            [
              { text: 'Ingresar Cantidad', onPress: () => {
                navigation.navigate('EditProduct', { 
                  barcode: barcode, 
                  isNew: false,
                  user: user,
                  esObligatorio: true
                });
                onClose();
              }}
            ]
          );
        } else {
          Alert.alert('Error', saved?.message || 'Error al guardar');
          setScanned(false);
        }
      } else {
        Alert.alert(
          '❌ Producto no encontrado',
          `Código: ${barcode}`
        );
        setScanned(false);
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
          <Text style={styles.loadingText}>Procesando...</Text>
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