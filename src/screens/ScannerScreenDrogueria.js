import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  validarPuedeEscanear,
  obtenerProductoInventariadoDrogueria
} from '../services/api';

export default function ScannerScreenDrogueria({
  onClose,
  navigation,
  user,
  idaperturainventario,
  existingProducts = [],
  inventarioActivo: inventarioActivoParam,
  tipoInventario,
  idubicacion
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inventarioActivo, setInventarioActivo] = useState(true);

  useEffect(() => {
    const verificarEstado = async () => {
      try {
        const idSucursal = user?.sucursalId || user?.idsucursal || null;
        const validacion = await validarPuedeEscanear(idSucursal);
        console.log('Validación escaneo Droguería:', validacion);

        if (!validacion.permitido) {
          setInventarioActivo(false);
          Alert.alert(
            '⛔ Inventario no disponible',
            validacion.mensaje,
            [{ text: 'OK', onPress: onClose }]
          );
        }
      } catch (error) {
        console.error('Error al verificar estado en Droguería:', error);
      }
    };

    verificarEstado();
  }, [user]);

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
    console.log('📷 [Droguería] Código escaneado:', barcode);

    try {
      // 1. Verificar si el producto ya existe en los registros locales en memoria
      let yaExiste = Array.isArray(existingProducts) && existingProducts.some(p =>
        (p.CodigoBarra || p.codigobarra || p.codigoBarra) === barcode
      );

      // 2. Si no se encuentra en memoria, verificar directamente en BD
      if (!yaExiste) {
        try {
          const checkDb = await obtenerProductoInventariadoDrogueria(barcode, idaperturainventario);
          const rawDbList = Array.isArray(checkDb) ? checkDb : (checkDb ? [checkDb] : []);
          if (rawDbList && rawDbList.length > 0) {
            yaExiste = true;
          }
        } catch (e) {
          console.log('Error verificando existencia de producto en BD:', e);
        }
      }

      console.log(`📤 Scanner Droguería - Barcode: ${barcode} - Modo: ${yaExiste ? 'EDICIÓN' : 'NUEVO'}`);
      onClose();

      const ubiFinal = idubicacion || inventarioActivoParam?.idubicacion || null;
      const invActivoCompleto = (inventarioActivoParam && typeof inventarioActivoParam === 'object')
        ? {
            ...inventarioActivoParam,
            tipo: inventarioActivoParam.tipo || tipoInventario || 'TOTAL',
            idubicacion: ubiFinal
          }
        : {
            idaperturainventario: idaperturainventario,
            tipo: tipoInventario || 'TOTAL',
            estado: 'INICIADO',
            idubicacion: ubiFinal
          };

      if (yaExiste) {
        // Redirigir en modo EDICIÓN para evitar duplicados
        navigation.navigate('EditProductDrogueria', {
          barcode: barcode,
          isNew: false,
          user: user,
          fromScanner: false,
          idaperturainventario: idaperturainventario,
          inventarioActivo: invActivoCompleto,
          idubicacion: ubiFinal
        });
      } else {
        // Redirigir en modo NUEVO ESCANEO (INSERT)
        navigation.navigate('EditProductDrogueria', {
          barcode: barcode,
          isNew: true,
          user: user,
          fromScanner: true,
          idaperturainventario: idaperturainventario,
          inventarioActivo: invActivoCompleto,
          idubicacion: ubiFinal
        });
      }
    } catch (error) {
      console.error('❌ Error en escáner Droguería:', error);
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
