import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import ScannerScreen from './ScannerScreen';
import { 
  obtenerTodosProductoInventariadoDrogueria, 
  iniciarInventarioDrogueria,
  finalizarInventarioDrogueria,
  eliminarProductoInventariadoDrogueria,
  exportarReporteExcelDrogueria,
  ObtenerTodosProductosSucursalDrogueria,
  getInventarioEstado
} from '../services/api';
import { useFocusEffect } from '@react-navigation/native';

export default function InventoryDrogueriaScreen({ navigation, route }) {
  const [groupedItems, setGroupedItems] = useState([]);
  const [rawItems, setRawItems] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [sessionId] = useState(`INV-DROG-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState('mis');
  
  // Estados para control de inventario
  const [tipoInventario, setTipoInventario] = useState('PARCIAL');
  const [inventarioEstado, setInventarioEstado] = useState('PENDIENTE');
  const [fechaInicioInventario, setFechaInicioInventario] = useState(null);
  const [fechaFinInventario, setFechaFinInventario] = useState(null);
  const [loadingAccion, setLoadingAccion] = useState(false);
  const [productosFaltantes, setProductosFaltantes] = useState([]);
  const [modalFaltantesVisible, setModalFaltantesVisible] = useState(false);
  
  const user = route.params?.user;
  const inventarioActivo = route.params?.inventarioActivo;
  const crearNuevo = route.params?.crearNuevo || false;
  
  // Guardar inventarioActivo e idaperturainventario en estado local para no perderlos entre navegaciones
  const [inventarioActivoState, setInventarioActivoState] = useState(
    crearNuevo ? null : (route.params?.inventarioActivo || null)
  );
  const [idAperturaState, setIdAperturaState] = useState(
    crearNuevo ? null : (
      route.params?.inventarioActivo?.idaperturainventario || 
      route.params?.inventarioActivo?.id || 
      route.params?.idaperturainventario || 
      null
    )
  );

  const isAdmin = user?.role === 'ADMINISTRADOR';

  useEffect(() => {
    cargarEstadoInventario();
  }, [route.params]);

  const cargarEstadoInventario = () => {
    if (crearNuevo) {
      setInventarioActivoState(null);
      setIdAperturaState(null);
      setInventarioEstado('PENDIENTE');
      setTipoInventario('PARCIAL');
      setFechaInicioInventario(null);
      setFechaFinInventario(null);
      setRawItems([]);
      setGroupedItems([]);
      return;
    }

    const inv = route.params?.inventarioActivo || inventarioActivoState;
    if (inv) {
      setInventarioActivoState(prev => ({
        ...(prev || {}),
        ...inv
      }));
      const idAp = inv.idaperturainventario || inv.id || route.params?.idaperturainventario || idAperturaState || null;
      console.log("[InventoryDrogueriaScreen] IDAPERTURAINVENTARIO: ", idAp, "ESTADO:", inv.estado || inventarioEstado, "TIPO:", inv.tipo || tipoInventario);
      if (idAp) {
        setIdAperturaState(idAp);
      }
      if (inv.estado) {
        setInventarioEstado(inv.estado);
      } else if (!inventarioEstado || inventarioEstado === 'PENDIENTE') {
        setInventarioEstado('INICIADO');
      }

      // CRÍTICO: Solo cambiar tipo si inv.tipo viene explícitamente definido.
      // Si no viene, conservar el tipoInventario que ya estaba seteado.
      if (inv.tipo) {
        setTipoInventario(inv.tipo);
      }
      if (inv.fecha_inicio) {
        setFechaInicioInventario(inv.fecha_inicio);
      }
      if (inv.fecha_fin) {
        setFechaFinInventario(inv.fecha_fin);
      }
    } else if (route.params?.idaperturainventario) {
      setIdAperturaState(route.params.idaperturainventario);
    } else if (!idAperturaState) {
      setInventarioEstado('PENDIENTE');
      setTipoInventario('PARCIAL');
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      if (user) {
        loadProducts();
      }
    }, [viewMode, user, idAperturaState, inventarioEstado])
  );

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const idaperturainventario = idAperturaState || inventarioActivoState?.idaperturainventario || inventarioActivoState?.id || route.params?.inventarioActivo?.idaperturainventario || route.params?.idaperturainventario || null;
      console.log("[InventoryDrogueriaScreen] IDAPERTURAINVENTARIO: ", idaperturainventario, "ESTADO:", inventarioEstado);
      
      // Si el inventario está pendiente o no existe una apertura activa, no hay productos
      if (!idaperturainventario || inventarioEstado === 'PENDIENTE') {
        setRawItems([]);
        setGroupedItems([]);
        setIsLoading(false);
        return;
      }

      // Sincronizar estado y tipo real desde la BD
      try {
        const estadoRes = await getInventarioEstado();
        if (estadoRes && estadoRes.success && Array.isArray(estadoRes.data)) {
          const invActual = estadoRes.data.find(
            item => String(item.idaperturainventario || item.id) === String(idaperturainventario)
          );
          if (invActual) {
            console.log('🔄 [DROGUERIA] Sincronizado con BD - Tipo:', invActual.tipo, 'Estado:', invActual.estado);
            if (invActual.tipo) setTipoInventario(invActual.tipo);
            if (invActual.estado) setInventarioEstado(invActual.estado);
            setInventarioActivoState(prev => ({
              ...(prev || {}),
              ...invActual
            }));
          }
        }
      } catch (eSync) {
        console.log('Error sincronizando estado de inventario en loadProducts:', eSync);
      }

      let productos = [];
      console.log('📦 Droguería - Cargando productos - ViewMode:', viewMode, 'Admin:', isAdmin);

      if (viewMode === 'mis') {
        const misProductos = await obtenerTodosProductoInventariadoDrogueria(user?.id, idaperturainventario);
        productos = (misProductos || []).filter(prod => String(prod.idaperturainventario) === String(idaperturainventario));
      } else if (isAdmin) {
        const todos = await obtenerTodosProductoInventariadoDrogueria(null, idaperturainventario);
        productos = (todos || []).filter(prod => String(prod.idaperturainventario) === String(idaperturainventario));
      }

      setRawItems(productos || []);

      // Agrupar productos por CodigoBarra + idproducto
      if (productos && productos.length > 0) {
        const mapa = {};

        productos.forEach(prod => {
          const key = `${prod.codigoBarra}_${prod.idproducto || ''}`;
          if (!mapa[key]) {
            mapa[key] = {
              key: key,
              codigobarra: prod.codigoBarra,
              idproducto: prod.idproducto,
              name: prod.descripcion || 'Sin descripción',
              usuario: prod.empleadoRegistro || prod.usuarioRegistro,
              lotes: [],
              totalUnidades: 0,
              idaperturainventario: prod.idaperturainventario
            };
          }
          const cant = parseFloat(prod.cant_nueva ?? 0) || 0;
          mapa[key].lotes.push({
            numLote: prod.numLote,
            cantidad: cant,
            idproductolote: prod.idproductolote
          });
          mapa[key].totalUnidades += cant;
        });

        const listaAgrupada = Object.values(mapa);
        setGroupedItems(listaAgrupada);
      } else {
        setGroupedItems([]);
      }
    } catch (error) {
      console.error('❌ Error cargando productos en Droguería:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Funciones de Administrador
  const handleCambiarTipo = (tipo) => {
    if (inventarioEstado === 'INICIADO') {
      Alert.alert('Inventario en curso', 'No se puede cambiar el tipo porque el inventario ya fue iniciado.');
      return;
    }
    setTipoInventario(tipo);
  };

  const handleIniciarInventario = async () => {
    if (!tipoInventario) {
      Alert.alert('Error', 'Seleccione un tipo de inventario');
      return;
    }

    setLoadingAccion(true);
    try {
      const estadoRes = await getInventarioEstado();
      if (estadoRes && estadoRes.success && Array.isArray(estadoRes.data)) {
        const invEnCurso = estadoRes.data.find(inv => {
          if (inv.estado !== 'INICIADO') return false;
          const nom = (inv.nombre_sucursal_inventario || '').toUpperCase();
          return nom.includes('DROGUERIA') || Number(inv.idsucursal_inventario) === 66;
        });

        if (invEnCurso) {
          setLoadingAccion(false);
          const tipoDesc = invEnCurso.tipo === 'TOTAL' ? 'GENERAL' : (invEnCurso.tipo || 'CICLICO');
          Alert.alert(
            '⚠️ Inventario en progreso',
            `Ya existe un inventario en curso (${tipoDesc}) para Q. F. DROGUERIA.\n\nDebe finalizarse ese inventario antes de iniciar uno nuevo.`
          );
          return;
        }
      }
    } catch (e) {
      console.log('Error verificando inventario en curso:', e);
    } finally {
      setLoadingAccion(false);
    }
    
    Alert.alert(
      'Iniciar Inventario',
      `¿Está seguro de INICIAR el inventario ${tipoInventario === 'TOTAL' ? 'GENERAL' : 'CICLICO'} en Q. F. DROGUERIA?\n\n` +
      `⚠️ Una vez iniciado, todos los usuarios podrán escanear productos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Iniciar', 
          onPress: async () => {
            setLoadingAccion(true);
            try {
              const result = await iniciarInventarioDrogueria(
                tipoInventario, 
                String(user?.id), 
                String(user?.sucursalId || '66')
              );
              if (result.success || result.Success === 1) {
                setInventarioEstado('INICIADO');
                const nuevoId = result.idaperturainventario || result.id || result.Id || result.data?.id || result.data?.idaperturainventario || null;
                if (nuevoId) {
                  setIdAperturaState(nuevoId);
                  setInventarioActivoState({
                    idaperturainventario: nuevoId,
                    estado: 'INICIADO',
                    tipo: tipoInventario,
                    idsucursal_inventario: user?.sucursalId || 66
                  });
                }
                setFechaInicioInventario(new Date().toLocaleString());
                Alert.alert('✅ Éxito', result.mensaje || result.message || `Inventario ${tipoInventario === 'TOTAL' ? 'GENERAL' : 'CICLICO'} iniciado correctamente`);
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

  const mostrarAvisoProductosFaltantes = (faltantes) => {
    const total = faltantes.length;
    const maxItemsEnAlerta = 8;
    const itemsPreview = faltantes.slice(0, maxItemsEnAlerta);

    let mensaje = itemsPreview.map((item) => {
      const codigo = item.codigoBarras || item.codigobarra || item.CodigoBarra || 'S/C';
      const desc = item.descripcion || item.Descripcion || 'Sin descripción';
      return `• [${codigo}] ${desc}`;
    }).join('\n');

    if (total > maxItemsEnAlerta) {
      mensaje += `\n\n... y ${total - maxItemsEnAlerta} producto(s) más pendientes.`;
    }

    Alert.alert(
      '⚠️ Productos Faltantes por Escanear',
      `Faltan escanear ${total} producto(s) con lotes en Droguería.\n\n` +
      `En el inventario GENERAL deben escanearse todos los productos antes de cerrar:\n\n` +
      mensaje,
      total > maxItemsEnAlerta 
        ? [
            { text: 'Entendido', style: 'cancel' },
            { text: '📋 Ver Lista Completa', onPress: () => setModalFaltantesVisible(true) }
          ]
        : [{ text: 'Entendido', style: 'default' }]
    );
  };

  const handleFinalizarInventario = async () => {
    const idaperturainventario = idAperturaState || inventarioActivoState?.idaperturainventario || inventarioActivoState?.id || route.params?.inventarioActivo?.idaperturainventario || route.params?.idaperturainventario || null;
    
    if (!idaperturainventario) {
      Alert.alert('Error', 'No se pudo identificar el inventario activo');
      return;
    }

    // Sincronizar el tipo real del inventario desde la BD antes de validar o finalizar
    let tipoActual = tipoInventario;
    try {
      const estadoRes = await getInventarioEstado();
      if (estadoRes && estadoRes.success && Array.isArray(estadoRes.data)) {
        const invActual = estadoRes.data.find(
          item => String(item.idaperturainventario || item.id) === String(idaperturainventario)
        );
        if (invActual && invActual.tipo) {
          tipoActual = invActual.tipo;
          setTipoInventario(tipoActual);
          if (invActual.estado) setInventarioEstado(invActual.estado);
        }
      }
    } catch (eTipo) {
      console.log('Error verificando tipo de inventario en BD antes de finalizar:', eTipo);
    }

    // =========================================================================
    // VALIDACIÓN PARA INVENTARIO GENERAL (TOTAL): VERIFICAR PRODUCTOS FALTANTES
    // =========================================================================
    if (tipoActual === 'TOTAL') {
      setLoadingAccion(true);
      try {
        console.log('🔍 [DROGUERIA] Validando productos para inventario TOTAL...');

        // 1. Obtener todos los productos con lotes en Droguería
        const resSucursal = await ObtenerTodosProductosSucursalDrogueria();
        const productosSucursal = Array.isArray(resSucursal) 
          ? resSucursal 
          : (resSucursal?.data && Array.isArray(resSucursal.data) ? resSucursal.data : []);

        if (productosSucursal && productosSucursal.length > 0) {
          // 2. Obtener todos los productos inventariados en esta apertura
          let productosInventariados = rawItems;
          if (viewMode === 'mis' || !productosInventariados || productosInventariados.length === 0) {
            const todosInv = await obtenerTodosProductoInventariadoDrogueria(null, idaperturainventario);
            if (Array.isArray(todosInv) && todosInv.length > 0) {
              productosInventariados = todosInv.filter(prod => String(prod.idaperturainventario) === String(idaperturainventario));
            }
          }

          // Crear conjunto de idproducto escaneados
          const idProductosEscaneados = new Set();
          (productosInventariados || []).forEach(p => {
            const id = Number(p.idproducto || p.idProducto);
            if (id) idProductosEscaneados.add(id);
          });
          (groupedItems || []).forEach(p => {
            const id = Number(p.idproducto || p.idProducto);
            if (id) idProductosEscaneados.add(id);
          });

          // 3. Filtrar los que faltan escanear
          const faltantes = productosSucursal.filter(prod => {
            const id = Number(prod.idproducto || prod.idProducto);
            return id && !idProductosEscaneados.has(id);
          });

          console.log(`📊 [DROGUERIA] Total sucursal: ${productosSucursal.length} | Escaneados: ${idProductosEscaneados.size} | Faltantes: ${faltantes.length}`);

          if (faltantes.length > 0) {
            setLoadingAccion(false);
            setProductosFaltantes(faltantes);
            mostrarAvisoProductosFaltantes(faltantes);
            return;
          }
        }
      } catch (errVal) {
        console.error('❌ Error en validación de inventario TOTAL:', errVal);
        Alert.alert('Advertencia', 'Ocurrió un error al validar los productos de la sucursal: ' + errVal.message);
      } finally {
        setLoadingAccion(false);
      }
    }

    const totalUnits = groupedItems.reduce((sum, i) => sum + (i.totalUnidades || 0), 0);
    
    Alert.alert(
      'Finalizar Inventario',
      `¿Está seguro de FINALIZAR el inventario de Droguería?\n\n` +
      `📋 Tipo: ${tipoInventario === 'TOTAL' ? 'GENERAL' : 'CICLICO'}\n` +
      `📦 Productos registrados: ${groupedItems.length}\n` +
      `📊 Unidades totales: ${totalUnits}\n\n` +
      `⚠️ Después de finalizar, NO se podrán agregar más productos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Finalizar', 
          style: 'destructive',
          onPress: async () => {
            setLoadingAccion(true);
            try {
              const result = await finalizarInventarioDrogueria(String(user?.id), idaperturainventario);
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

  const deleteItem = async (item) => {
    Alert.alert(
      'Eliminar producto',
      `¿Desea eliminar todos los lotes registrados de ${item.name} (${item.codigobarra})?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Eliminar', 
          style: 'destructive',
          onPress: async () => {
            try {
              const idaperturainventario = idAperturaState || inventarioActivoState?.idaperturainventario || inventarioActivoState?.id || null;
              console.log('🗑️ Droguería - Eliminando Inventario de Producto con Código de Barras:', item.codigobarra, 'Apertura:', idaperturainventario);
              const result = await eliminarProductoInventariadoDrogueria(item.codigobarra, idaperturainventario);
              
              if (result.success) {
                setGroupedItems(prev => prev.filter(i => i.codigobarra !== item.codigobarra));
                setRawItems(prev => prev.filter(i => (i.codigoBarra || i.CodigoBarra || i.codigobarra) !== item.codigobarra));
                await loadProducts();
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
    if (rawItems.length === 0) {
      Alert.alert('Error', 'No hay productos para exportar');
      return;
    }

    // Filtrar: si cantidad existencial es 0 y cantidad nueva también es 0, NO se incluye; caso contrario SÍ se incluye
    const itemsParaReporte = rawItems.filter(item => {
      const stockSistema = parseFloat(item.CantExistencial ?? item.cantExistencial ?? 0) || 0;
      const stockFisico = parseFloat(item.Cant_nueva ?? item.cant_Nueva ?? item.cant_nueva ?? 0) || 0;
      const ambosCero = Math.abs(stockSistema) < 0.0001 && Math.abs(stockFisico) < 0.0001;
      return !ambosCero;
    });

    if (itemsParaReporte.length === 0) {
      Alert.alert(
        'Aviso',
        'No se encontraron lotes para incluir en el reporte (ambas cantidades son 0).'
      );
      return;
    }

    setIsExporting(true);
    try {
      const payload = {
        fechaInicioInventario: fechaInicioInventario,
        fechaFinInventario: fechaFinInventario,
        tipoInventario: tipoInventario || 'PARCIAL',
        rows: itemsParaReporte.map((item, index) => {
          const stockSistema = parseFloat(item.CantExistencial ?? item.cantExistencial ?? 0) || 0;
          const stockFisico = parseFloat(item.Cant_nueva ?? item.cant_Nueva ?? item.cant_nueva ?? 0) || 0;
          const precioc = parseFloat(item.precioc) || 0;
          const diferencia = stockFisico - stockSistema;

          return {
            n: index + 1,
            codigoBarras: item.CodigoBarra || item.codigobarra || item.codigoBarra || '',
            descripcion: item.Descripcion || item.descripcion || '',
            laboratorio: item.laboratorio || '',
            numLote: item.NumLote || item.numLote || 'S/L',
            fechaVencimiento: item.fechavalidez ? String(item.fechavalidez).split('T')[0] : '',
            stockSistema: stockSistema,
            stockFisico: stockFisico,
            diferencia: diferencia,
            valorizado: diferencia * precioc,
            observaciones: ''
          };
        })
      };

      const result = await exportarReporteExcelDrogueria(payload);

      if (result.success && result.fileUri) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(result.fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Compartir Control de Inventarios Droguería'
          });
        } else {
          Alert.alert('✅ Éxito', 'Reporte generado correctamente en el dispositivo.');
        }
      } else {
        Alert.alert('❌ Error', result.message || 'No se pudo generar el reporte Excel en el servidor');
      }
    } catch (error) {
      console.error('Error al exportar reporte:', error);
      Alert.alert('❌ Error', 'Error al procesar la exportación: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const totalUnits = groupedItems.reduce((sum, i) => sum + (i.totalUnidades || 0), 0);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Text>Cargando productos de Droguería...</Text>
      </View>
    );
  }

  if (showScanner) {
    const idaperturainventario = idAperturaState || inventarioActivoState?.idaperturainventario || inventarioActivoState?.id || route.params?.inventarioActivo?.idaperturainventario || route.params?.idaperturainventario || null;
    const invActivoObj = inventarioActivoState || {
      idaperturainventario: idaperturainventario,
      tipo: tipoInventario,
      estado: inventarioEstado
    };
    return (
      <ScannerScreen 
        onScan={() => {}} 
        onClose={() => setShowScanner(false)} 
        navigation={navigation} 
        user={user}     
        idaperturainventario={idaperturainventario} 
        inventarioActivo={invActivoObj}
        tipoInventario={tipoInventario}
        existingProducts={rawItems}
      />
    );
  }

  const handleSalir = () => {
    Alert.alert(
      'Salir',
      '¿Qué acción desea realizar?',
      [
        {
          text: '📋 Menú Inventarios',
          onPress: () => navigation.replace('SelectInventory', { user })
        },
        {
          text: '🚪 Cerrar Sesión',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('@auth_credentials');
            } catch (e) {
              console.error('Error cerrando sesión:', e);
            }
            navigation.replace('Login');
          }
        },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.userName}>👤 {user?.empleado || user?.name || user?.username || 'Usuario'}</Text>
          <Text style={styles.userRole}>📛 Rol: {user?.role || 'Sin rol'}</Text>
          <Text style={styles.sucursalLogueado}>🏢 Sucursal: {user?.sucursalNombre || 'Q. F. DROGUERIA'}</Text>
        </View>
        <TouchableOpacity onPress={handleSalir}>
          <Text style={styles.logoutText}>🚪 Salir</Text>
        </TouchableOpacity>
      </View>
      
      {/* PANEL DE CONTROL - SOLO PARA ADMINISTRADOR */}
      {isAdmin && (
        <View style={styles.adminPanel}>
          <Text style={styles.adminTitle}>🎮 Panel de Control (Droguería)</Text>
          
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
                  📋 CICLICO
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
                  📦 GENERAL
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          
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
              </View>
            )}
          </View>
        </View>
      )}
      
      {/* Selector de vista - SOLO Administrador */}
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
      
      {/* Banner para operadores */}
      {!isAdmin && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoText}>📱 Mostrando solo tus productos de Droguería</Text>
          {inventarioEstado !== 'INICIADO' && (
            <Text style={styles.infoTextAdvertencia}>
              {inventarioEstado === 'PENDIENTE' ? '⏳ Inventario no iniciado. Espere al administrador.' : '🔒 Inventario finalizado.'}
            </Text>
          )}
        </View>
      )}
      
      {/* Métricas */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{groupedItems.length}</Text>
          <Text style={styles.statLabel}>Productos</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{totalUnits}</Text>
          <Text style={styles.statLabel}>Unidades</Text>
        </View>
      </View>
      
      {/* Lista de Productos Agrupados */}
      <FlatList
        data={groupedItems}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingBottom: 15 }}
        showsVerticalScrollIndicator={true}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.barcode}>📷 {item.codigobarra}</Text>
            <Text style={styles.productName}>📝 {item.name}</Text>
            <Text style={styles.lotesInfo}>
              📦 Lotes: {item.lotes.length} | ✨ Cantidad Total: {item.totalUnidades}
            </Text>
            
            <View style={styles.row}>
              <View style={styles.actionButtons}>
                <TouchableOpacity 
                  style={styles.editProductButton}
                  onPress={() => {
                    const idaperturainventario = idAperturaState || inventarioActivoState?.idaperturainventario || inventarioActivoState?.id || null;
                    navigation.navigate('EditProductDrogueria', { 
                      barcode: item.codigobarra,
                      isNew: false,
                      user: user,
                      idaperturainventario: idaperturainventario,
                      inventarioActivo: inventarioActivoState || { idaperturainventario }
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
            <Text style={styles.emptyText}>Presione "Escanear" para agregar productos de Droguería</Text>
          </View>
        }
      />
      
      {/* Botones Inferiores */}
      <View style={styles.buttonRow}>
        <TouchableOpacity 
          style={[styles.button, styles.scanButton]} 
          onPress={() => setShowScanner(true)}
          disabled={isExporting}
        >
          <Text style={styles.buttonText}>📷 Escanear</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.exportButton, isExporting && { opacity: 0.6 }]} 
          onPress={exportToExcel}
          disabled={isExporting}
        >
          <Text style={styles.buttonText}>
            {isExporting ? '⏳ Generando...' : '📎 Exportar Excel'}
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* Modal Lista Completa de Productos Faltantes */}
      <Modal
        visible={modalFaltantesVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalFaltantesVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                ⚠️ Productos Faltantes ({productosFaltantes.length})
              </Text>
              <TouchableOpacity onPress={() => setModalFaltantesVisible(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Los siguientes productos tienen lotes en Droguería pero aún no han sido escaneados en este inventario General:
            </Text>
            
            <FlatList
              data={productosFaltantes}
              keyExtractor={(item, index) => `${item.idproducto || index}_${item.codigoBarras || item.codigobarra || index}`}
              renderItem={({ item, index }) => (
                <View style={[styles.modalItemRow, index % 2 === 1 && styles.modalItemRowAlt]}>
                  <Text style={styles.modalItemBarcode}>📷 {item.codigoBarras || item.codigobarra || item.CodigoBarra || 'S/C'}</Text>
                  <Text style={styles.modalItemName}>{item.descripcion || item.Descripcion || 'Sin descripción'}</Text>
                  <Text style={styles.modalItemId}>ID Producto: {item.idproducto}</Text>
                </View>
              )}
              style={styles.modalList}
            />

            <TouchableOpacity 
              style={styles.modalCloseButton} 
              onPress={() => setModalFaltantesVisible(false)}
            >
              <Text style={styles.modalCloseButtonText}>Entendido / Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  sucursalLogueado: { fontSize: 12, color: '#27ae60', fontWeight: 'bold', marginTop: 2 },
  logoutText: { color: '#e74c3c', fontWeight: 'bold', fontSize: 12 },
  
  // Panel Admin
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
    padding: 8, 
    backgroundColor: '#fff', 
    marginBottom: 5 
  },
  statBox: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 16, fontWeight: 'bold', color: '#3498db' },
  statLabel: { fontSize: 11, color: '#7f8c8d', marginTop: 2 },
  card: { 
    backgroundColor: '#fff', 
    marginHorizontal: 10, 
    marginVertical: 6, 
    padding: 12, 
    borderRadius: 8, 
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  barcode: { fontWeight: 'bold', fontSize: 14, color: '#2c3e50' },
  productName: { fontSize: 13, color: '#34495e', marginTop: 3 },
  lotesInfo: { fontSize: 12, color: '#27ae60', fontWeight: 'bold', marginTop: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  editProductButton: {
    backgroundColor: '#9b59b6',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  deleteButton: {
    backgroundColor: '#e74c3c',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  editText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 11,
  },
  deleteText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 11,
  },
  emptyContainer: { justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },
  emptyText: { fontSize: 13, color: '#7f8c8d', textAlign: 'center', marginTop: 5 },
  buttonRow: { 
    flexDirection: 'row', 
    padding: 10, 
    backgroundColor: '#fff', 
    borderTopWidth: 1, 
    borderColor: '#ddd',
    gap: 10
  },
  button: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  scanButton: { backgroundColor: '#3498db' },
  exportButton: { backgroundColor: '#27ae60' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  bottomSpace: { height: 20 },

  // Estilos Modal Faltantes
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    maxHeight: '80%',
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e74c3c',
    flex: 1,
  },
  modalCloseIcon: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#7f8c8d',
    paddingHorizontal: 8,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 10,
  },
  modalList: {
    marginBottom: 12,
  },
  modalItemRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalItemRowAlt: {
    backgroundColor: '#f8fafc',
  },
  modalItemBarcode: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  modalItemName: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
  },
  modalItemId: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 1,
  },
  modalCloseButton: {
    backgroundColor: '#34495e',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
