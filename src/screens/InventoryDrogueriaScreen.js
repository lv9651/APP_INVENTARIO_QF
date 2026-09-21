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
  agruparItemsParaExcelDrogueria,
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
  const [idUbicacion, setIdUbicacion] = useState(100); // 100: APROBADOS, 102: BAJAS, 248: DEVOLUCIONES
  const [inventarioEstado, setInventarioEstado] = useState('PENDIENTE');
  const [fechaInicioInventario, setFechaInicioInventario] = useState(null);
  const [fechaFinInventario, setFechaFinInventario] = useState(null);
  const [loadingAccion, setLoadingAccion] = useState(false);
  const [productosFaltantes, setProductosFaltantes] = useState([]);
  const [modalFaltantesVisible, setModalFaltantesVisible] = useState(false);
  const [adminPanelExpanded, setAdminPanelExpanded] = useState(true);
  
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
      setIdUbicacion(100);
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
      console.log("[InventoryDrogueriaScreen] IDAPERTURAINVENTARIO: ", idAp, "ESTADO:", inv.estado || inventarioEstado, "TIPO:", inv.tipo || tipoInventario, "UBICACION:", inv.idubicacion || idUbicacion);
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
      if (inv.idubicacion) {
        setIdUbicacion(Number(inv.idubicacion));
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
      setIdUbicacion(100);
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

  const handleCambiarUbicacion = (ubicacion) => {
    if (inventarioEstado === 'INICIADO') {
      Alert.alert('Inventario en curso', 'No se puede cambiar la ubicación porque el inventario ya fue iniciado.');
      return;
    }
    setIdUbicacion(ubicacion);
  };

  const handleIniciarInventario = async () => {
    if (!tipoInventario) {
      Alert.alert('Error', 'Seleccione un tipo de inventario (CICLICO o GENERAL)');
      return;
    }

    if (!idUbicacion) {
      Alert.alert('Error', 'Seleccione una ubicación (Aprobados, Bajas o Devoluciones)');
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
          if (invEnCurso.idubicacion) {
            setIdUbicacion(Number(invEnCurso.idubicacion));
          }
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
    
    const descUbicacion = idUbicacion === 100 ? 'APROBADOS' : (idUbicacion === 102 ? 'BAJAS' : 'DEVOLUCIONES');
    Alert.alert(
      'Iniciar Inventario',
      `¿Está seguro de INICIAR el inventario ${tipoInventario === 'TOTAL' ? 'GENERAL' : 'CICLICO'} - ${descUbicacion} en Q. F. DROGUERIA?\n\n` +
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
                String(user?.sucursalId || '66'),
                idUbicacion
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
                    idubicacion: idUbicacion,
                    idsucursal_inventario: user?.sucursalId || 66
                  });
                }
                setFechaInicioInventario(new Date().toLocaleString());
                Alert.alert('✅ Éxito', result.mensaje || result.message || `Inventario ${tipoInventario === 'TOTAL' ? 'GENERAL' : 'CICLICO'} - ${descUbicacion} iniciado correctamente`);
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

  const ejecutarFinalizacion = async (idaperturainventario) => {
    if (!idaperturainventario) {
      Alert.alert('Error', 'No se pudo identificar el inventario activo');
      return;
    }

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
      console.error('Error al finalizar inventario:', error);
      Alert.alert('❌ Error', error?.message || 'Error al finalizar');
    } finally {
      setLoadingAccion(false);
    }
  };

  const confirmarFinalizacionForzada = (cantidadFaltantes, idApertura) => {
    Alert.alert(
      '🚨 ALERTA MÁXIMA - RIESGO DE STOCK',
      `⚠️ SI FINALIZA EL INVENTARIO AHORA, EL STOCK DE TODOS LOS LOTES DE LOS PRODUCTOS FALTANTES SE REDUCIRÁ A 0.\n\n` +
      `Se detectaron ${cantidadFaltantes} producto(s) no escaneados.\n\n` +
      `Esta acción es IRREVERSIBLE y afectará existencias en el sistema.\n\n` +
      `¿Está absolutamente seguro de finalizar de todas maneras?`,
      [
        { text: 'Cancelar / Seguir Escaneando', style: 'cancel' },
        { 
          text: 'Sí, finalizar y reducir a 0', 
          style: 'destructive', 
          onPress: () => ejecutarFinalizacion(idApertura) 
        }
      ]
    );
  };

  const mostrarAvisoProductosFaltantes = (faltantes, idApertura) => {
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

    const idAperturaFinal = idApertura || idAperturaState || inventarioActivoState?.idaperturainventario || inventarioActivoState?.id;

    const botones = [
      { text: 'Cancelar', style: 'cancel' }
    ];

    if (total > maxItemsEnAlerta) {
      botones.push({ 
        text: '📋 Ver Lista', 
        onPress: () => setModalFaltantesVisible(true) 
      });
    }

    botones.push({
      text: 'Finalizar de todas maneras',
      style: 'destructive',
      onPress: () => confirmarFinalizacionForzada(total, idAperturaFinal)
    });

    Alert.alert(
      '⚠️ Productos Faltantes por Escanear',
      `Faltan escanear ${total} producto(s) con lotes en Droguería.\n\n` +
      `En el inventario GENERAL deben escanearse todos los productos antes de cerrar:\n\n` +
      mensaje,
      botones
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

        // 1. Obtener todos los productos con lotes en Droguería para la ubicación seleccionada
        const ubiParaValidacion = idUbicacion !== null && idUbicacion !== undefined
          ? idUbicacion
          : (inventarioActivoState?.idubicacion || null);
        const resSucursal = await ObtenerTodosProductosSucursalDrogueria(ubiParaValidacion);
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
            mostrarAvisoProductosFaltantes(faltantes, idaperturainventario);
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
          onPress: () => ejecutarFinalizacion(idaperturainventario)
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

    // Agrupar y filtrar lotes idénticos para el reporte Excel
    const itemsParaReporte = agruparItemsParaExcelDrogueria(rawItems);

    if (itemsParaReporte.length === 0) {
      Alert.alert(
        'Aviso',
        'No se encontraron lotes para incluir en el reporte (ambas cantidades son 0).'
      );
      return;
    }

    setIsExporting(true);
    try {
      const ubiFinal = idUbicacion !== null && idUbicacion !== undefined 
        ? Number(idUbicacion) 
        : (inventarioActivoState?.idubicacion ? Number(inventarioActivoState.idubicacion) : null);

      const payload = {
        fechaInicioInventario: fechaInicioInventario,
        fechaFinInventario: fechaFinInventario,
        tipoInventario: tipoInventario || 'PARCIAL',
        idubicacion: ubiFinal,
        rows: itemsParaReporte.map((item, index) => ({
          n: index + 1,
          codigoBarras: item.codigoBarras,
          descripcion: item.descripcion,
          laboratorio: item.laboratorio,
          numLote: item.numLote,
          fechaVencimiento: item.fechaVencimiento,
          stockSistema: item.stockSistema,
          stockFisico: item.stockFisico,
          diferencia: item.diferencia,
          valorizado: item.valorizado,
          observaciones: ''
        }))
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
      idubicacion: idUbicacion,
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
        idubicacion={idUbicacion}
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
      {/* HEADER COMPACTO */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.userName}>👤 {user?.empleado || user?.name || user?.username || 'Usuario'}</Text>
          <Text style={styles.userRole}>
            📛 {user?.role || 'Sin rol'}  •  🏢 {user?.sucursalNombre || 'Q. F. DROGUERIA'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleSalir} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>🚪 Salir</Text>
        </TouchableOpacity>
      </View>
      
      {/* Lista de Productos Agrupados con Header Scroleable */}
      <FlatList
        data={groupedItems}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingBottom: 15 }}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {/* PANEL DE CONTROL - SOLO PARA ADMINISTRADOR */}
            {isAdmin && (
              <View style={styles.adminPanel}>
                <TouchableOpacity 
                  style={styles.adminHeaderTouchable}
                  onPress={() => setAdminPanelExpanded(!adminPanelExpanded)}
                  activeOpacity={0.7}
                >
                  <View style={styles.adminTitleRow}>
                    <Text style={styles.adminTitle}>🎮 Panel de Control (Droguería)</Text>
                    <View style={styles.collapseToggleBadge}>
                      <Text style={styles.collapseToggleText}>
                        {adminPanelExpanded ? '▲ Ocultar' : '▼ Ver panel'}
                      </Text>
                    </View>
                  </View>

                  {!adminPanelExpanded && (
                    <View style={styles.adminCompactSummary}>
                      <Text style={[
                        styles.compactBadgeText,
                        inventarioEstado === 'INICIADO' && styles.compactBadgeVerde,
                        inventarioEstado === 'FINALIZADO' && styles.compactBadgeRojo,
                        inventarioEstado === 'PENDIENTE' && styles.compactBadgeAmarillo
                      ]}>
                        {inventarioEstado === 'INICIADO' ? '🟢 INICIADO' : 
                         inventarioEstado === 'FINALIZADO' ? '🔴 FINALIZADO' : '🟡 PENDIENTE'}
                      </Text>
                      <Text style={styles.compactDivider}>•</Text>
                      <Text style={styles.compactDetailText}>
                        {tipoInventario === 'TOTAL' ? '📦 GENERAL' : '📋 CICLICO'}
                      </Text>
                      <Text style={styles.compactDivider}>•</Text>
                      <Text style={styles.compactDetailText}>
                        {idUbicacion === 100 ? 'APROBADOS' : (idUbicacion === 102 ? 'BAJAS' : 'DEVOLUCIONES')}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                
                {adminPanelExpanded && (
                  <>
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

                    {/* Selector de Ubicación */}
                    <View style={styles.ubicacionSelector}>
                      <Text style={styles.ubicacionLabel}>Ubicación:</Text>
                      <View style={styles.ubicacionButtons}>
                        {/* APROBADOS (100) */}
                        <TouchableOpacity 
                          style={[
                            styles.checkboxItem, 
                            inventarioEstado === 'INICIADO' && styles.checkboxItemDisabled
                          ]}
                          onPress={() => handleCambiarUbicacion(100)}
                          disabled={inventarioEstado === 'INICIADO'}
                        >
                          <View style={[
                            styles.checkboxSquare, 
                            idUbicacion === 100 && styles.checkboxSquareSelected,
                            inventarioEstado === 'INICIADO' && styles.checkboxSquareDisabled
                          ]}>
                            {idUbicacion === 100 && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                          <Text style={[
                            styles.checkboxLabel, 
                            idUbicacion === 100 && styles.checkboxLabelSelected,
                            inventarioEstado === 'INICIADO' && styles.checkboxLabelDisabled
                          ]}>
                            APROBADOS
                          </Text>
                        </TouchableOpacity>

                        {/* BAJAS (102) */}
                        <TouchableOpacity 
                          style={[
                            styles.checkboxItem, 
                            inventarioEstado === 'INICIADO' && styles.checkboxItemDisabled
                          ]}
                          onPress={() => handleCambiarUbicacion(102)}
                          disabled={inventarioEstado === 'INICIADO'}
                        >
                          <View style={[
                            styles.checkboxSquare, 
                            idUbicacion === 102 && styles.checkboxSquareSelected,
                            inventarioEstado === 'INICIADO' && styles.checkboxSquareDisabled
                          ]}>
                            {idUbicacion === 102 && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                          <Text style={[
                            styles.checkboxLabel, 
                            idUbicacion === 102 && styles.checkboxLabelSelected,
                            inventarioEstado === 'INICIADO' && styles.checkboxLabelDisabled
                          ]}>
                            BAJAS
                          </Text>
                        </TouchableOpacity>

                        {/* DEVOLUCIONES (248) */}
                        <TouchableOpacity 
                          style={[
                            styles.checkboxItem, 
                            inventarioEstado === 'INICIADO' && styles.checkboxItemDisabled
                          ]}
                          onPress={() => handleCambiarUbicacion(248)}
                          disabled={inventarioEstado === 'INICIADO'}
                        >
                          <View style={[
                            styles.checkboxSquare, 
                            idUbicacion === 248 && styles.checkboxSquareSelected,
                            inventarioEstado === 'INICIADO' && styles.checkboxSquareDisabled
                          ]}>
                            {idUbicacion === 248 && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                          <Text style={[
                            styles.checkboxLabel, 
                            idUbicacion === 248 && styles.checkboxLabelSelected,
                            inventarioEstado === 'INICIADO' && styles.checkboxLabelDisabled
                          ]}>
                            DEVOLUCIONES
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
                  </>
                )}
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
          </>
        }
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
                      inventarioActivo: inventarioActivoState || { idaperturainventario, idubicacion: idUbicacion },
                      idubicacion: idUbicacion
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

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity 
                style={[styles.modalCloseButton, styles.modalSecondaryButton]} 
                onPress={() => setModalFaltantesVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>Cerrar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalCloseButton, styles.modalDangerButton]} 
                onPress={() => {
                  setModalFaltantesVisible(false);
                  const idApertura = idAperturaState || inventarioActivoState?.idaperturainventario || inventarioActivoState?.id || route.params?.inventarioActivo?.idaperturainventario || route.params?.idaperturainventario;
                  confirmarFinalizacionForzada(productosFaltantes.length, idApertura);
                }}
              >
                <Text style={styles.modalCloseButtonText}>Finalizar de todas maneras</Text>
              </TouchableOpacity>
            </View>
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
    alignItems: 'center',
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderColor: '#e2e8f0' 
  },
  headerInfo: {
    flex: 1,
    marginRight: 8,
  },
  userName: { fontSize: 13, fontWeight: 'bold', color: '#2c3e50' },
  userRole: { fontSize: 11, color: '#64748b', marginTop: 1 },
  logoutBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
  },
  logoutText: { color: '#dc2626', fontWeight: 'bold', fontSize: 12 },
  
  // Panel Admin
  adminPanel: {
    backgroundColor: '#2c3e50',
    margin: 10,
    padding: 12,
    borderRadius: 10,
    elevation: 3,
  },
  adminHeaderTouchable: {
    paddingVertical: 2,
  },
  adminTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  adminTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  collapseToggleBadge: {
    backgroundColor: '#1abc9c',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  collapseToggleText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  adminCompactSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#34495e',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  compactBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  compactBadgeVerde: {
    backgroundColor: '#27ae60',
    color: '#fff',
  },
  compactBadgeRojo: {
    backgroundColor: '#e74c3c',
    color: '#fff',
  },
  compactBadgeAmarillo: {
    backgroundColor: '#f39c12',
    color: '#fff',
  },
  compactDivider: {
    color: '#7f8c8d',
    fontSize: 12,
    marginHorizontal: 4,
  },
  compactDetailText: {
    color: '#ecf0f1',
    fontSize: 11,
    fontWeight: 'bold',
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
  ubicacionSelector: {
    backgroundColor: '#34495e',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  ubicacionLabel: {
    color: '#fff',
    fontSize: 12,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  ubicacionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  checkboxItemDisabled: {
    opacity: 0.8,
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#bdc3c7',
    backgroundColor: '#ecf0f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  checkboxSquareSelected: {
    backgroundColor: '#2ecc71',
    borderColor: '#27ae60',
  },
  checkboxSquareDisabled: {
    borderColor: '#95a5a6',
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    lineHeight: 15,
  },
  checkboxLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#bdc3c7',
  },
  checkboxLabelSelected: {
    color: '#fff',
  },
  checkboxLabelDisabled: {
    color: '#95a5a6',
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
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalSecondaryButton: {
    flex: 1,
    backgroundColor: '#64748b',
  },
  modalDangerButton: {
    flex: 1.4,
    backgroundColor: '#dc2626',
  },
});
