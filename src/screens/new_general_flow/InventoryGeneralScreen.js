import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Temporal: se reemplazará por ./ScannerGeneralScreen cuando se cree en new_general_flow
import ScannerScreen from '../ScannerScreen';
import {
  ObtenerTotalTomaInventarioGeneral,
  iniciarInventario,
  finalizarInventario,
  eliminarTomaInventario,
  listarAlmacenes,
  getInventarioEstado
} from '../../services/api';

const normalizeInvParam = (raw) => {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] || null : raw;
};

const estaHabilitado = (alm) => {
  if (!alm) return false;
  const valor = alm.Habilitado ?? alm.habilitado;
  return valor === 1 || valor === true || valor === '1' || valor === 'true';
};

const esMismaSucursal = (inv, user) => {
  if (!inv || !user) return false;
  if (inv.idsucursal_inventario && user.sucursalId) {
    if (String(inv.idsucursal_inventario) === String(user.sucursalId)) return true;
  }
  const nombreInv = (inv.nombre_sucursal_inventario || '').toLowerCase().trim();
  const nombreUser = (user.sucursalNombre || '').toLowerCase().trim();
  if (!nombreInv || !nombreUser) return false;
  return nombreInv === nombreUser || nombreInv.includes(nombreUser) || nombreUser.includes(nombreInv);
};

/**
 * Agrupa los registros devueltos por TomaInventario en tarjetas por producto.
 * En el proceso general, los códigos escaneados corresponden al idproductolote,
 * por lo que múltiples lotes comparten un mismo idproducto. Se prioriza idproducto
 * como clave de agrupación y se usa codigoBarra como respaldo.
 */
const agruparProductosGenerales = (productos) => {
  if (!Array.isArray(productos) || productos.length === 0) return [];

  const gruposMap = new Map();

  productos.forEach((prod) => {
    const codigo = String(prod.codigoBarra || prod.codigobarra || prod.CodigoBarra || '').trim();
    const idProd = Number(prod.idProducto ?? prod.idproducto ?? 0) || 0;
    if (!idProd && !codigo) return;

    const groupKey = idProd > 0 ? `PROD_${idProd}` : `BAR_${codigo}`;
    const cantNueva = parseFloat(prod.cant_Nueva ?? prod.cant_nueva ?? 0) || 0;
    const numLote = String(prod.numLote || 'N/A').trim();
    const ubicacion = prod.ubicacion || '-';
    const idToma = prod.idTomaInventario ?? prod.IdTomaInventario ?? prod.idtomainventario ?? null;
    const idProductoLote = prod.idproductolote ?? prod.idProductoLote ?? null;

    if (!gruposMap.has(groupKey)) {
      gruposMap.set(groupKey, {
        key: groupKey,
        idTomaInventario: idToma,
        codigobarra: codigo,
        name: prod.descripcion || 'Sin descripción',
        usuario: prod.empleadoRegistro || prod.usuarioRegistro || 'Usuario',
        fecha_edicion: prod.fechaActualizacion
          ? new Date(prod.fechaActualizacion).toLocaleString()
          : new Date().toLocaleString(),
        nombresucursal: prod.nombresucursal || '',
        sucursal_destino: prod.sucursal_destino || 'N/A',
        idproducto: idProd,
        idaperturainventario: prod.idaperturainventario,
        cantidad_nueva: 0,
        lotes: [],
        ubicaciones: [],
        registroIds: [],
      });
    }

    const grupo = gruposMap.get(groupKey);
    grupo.cantidad_nueva += cantNueva;

    if (idToma && !grupo.registroIds.includes(idToma)) {
      grupo.registroIds.push(idToma);
    }

    const loteKey = idProductoLote
      ? `LOTEID_${idProductoLote}`
      : `LOTE_${numLote.toUpperCase()}__${ubicacion}`;

    const loteExistente = grupo.lotes.find((l) => l.loteKey === loteKey);
    if (!loteExistente) {
      grupo.lotes.push({
        loteKey,
        idTomaInventario: idToma,
        idproductolote: idProductoLote,
        numLote,
        cant_Nueva: cantNueva,
        ubicacion,
      });
    } else {
      loteExistente.cant_Nueva += cantNueva;
    }

    if (ubicacion && ubicacion !== '-' && !grupo.ubicaciones.includes(ubicacion)) {
      grupo.ubicaciones.push(ubicacion);
    }
  });

  return Array.from(gruposMap.values()).map((grupo) => ({
    ...grupo,
    ubicacion: grupo.ubicaciones.length > 0 ? grupo.ubicaciones.join(', ') : '-',
    lote: grupo.lotes.length === 1 ? grupo.lotes[0].numLote : `${grupo.lotes.length} lotes`,
  }));
};

export default function InventoryGeneralScreen({ navigation, route }) {
  const user = route.params?.user;
  const crearNuevoParam = route.params?.crearNuevo || false;
  const initialInv = crearNuevoParam ? null : normalizeInvParam(route.params?.inventarioActivo);

  const isAdmin = user?.role === 'ADMINISTRADOR';
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState([]);
  const [rawItems, setRawItems] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [sessionId] = useState(`INV-GEN-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState(isAdmin ? 'todos' : 'mis');

  // Persistencia local del inventario activo para no perderlo entre navegaciones
  const [inventarioActivoState, setInventarioActivoState] = useState(initialInv);
  const [idAperturaState, setIdAperturaState] = useState(
    initialInv?.idaperturainventario || initialInv?.id || route.params?.idaperturainventario || null
  );
  const [tipoInventario, setTipoInventario] = useState(initialInv?.tipo || 'PARCIAL');
  const [idTipoAlmacen, setIdTipoAlmacen] = useState(
    initialInv?.idtipoalmacen !== null && initialInv?.idtipoalmacen !== undefined
      ? Number(initialInv.idtipoalmacen)
      : null
  );
  const [inventarioEstado, setInventarioEstado] = useState(
    crearNuevoParam ? 'PENDIENTE' : (initialInv?.estado || 'PENDIENTE')
  );
  const [fechaInicioInventario, setFechaInicioInventario] = useState(initialInv?.fecha_inicio || null);
  const [fechaFinInventario, setFechaFinInventario] = useState(initialInv?.fecha_fin || null);
  const [loadingAccion, setLoadingAccion] = useState(false);

  // Almacenes (el proceso general trabaja con idtipoalmacen)
  const [almacenes, setAlmacenes] = useState([]);
  const [almacenSeleccionado, setAlmacenSeleccionado] = useState(null);
  const [cargandoAlmacenes, setCargandoAlmacenes] = useState(false);
  const [modalAlmacenVisible, setModalAlmacenVisible] = useState(false);

  // UI: expandir/colapsar lotes y panel de control
  const [productosExpandidos, setProductosExpandidos] = useState({});
  const [adminPanelExpanded, setAdminPanelExpanded] = useState(true);

  const getIdAperturaActual = () => {
    const paramInv = normalizeInvParam(route.params?.inventarioActivo);
    return (
      idAperturaState ||
      inventarioActivoState?.idaperturainventario ||
      inventarioActivoState?.id ||
      paramInv?.idaperturainventario ||
      paramInv?.id ||
      route.params?.idaperturainventario ||
      null
    );
  };

  // Sincronizar cambios en route.params al volver de otras pantallas
  useEffect(() => {
    const paramInv = normalizeInvParam(route.params?.inventarioActivo);

    if (route.params?.crearNuevo && !paramInv && !idAperturaState) {
      setInventarioActivoState(null);
      setIdAperturaState(null);
      setInventarioEstado('PENDIENTE');
      setTipoInventario('PARCIAL');
      setIdTipoAlmacen(null);
      setFechaInicioInventario(null);
      setFechaFinInventario(null);
      setRawItems([]);
      setItems([]);
      return;
    }

    const inv = paramInv || inventarioActivoState;
    if (inv) {
      setInventarioActivoState((prev) => ({ ...(prev || {}), ...inv }));
      const idAp = inv.idaperturainventario || inv.id || route.params?.idaperturainventario || idAperturaState || null;
      if (idAp) setIdAperturaState(idAp);
      if (inv.estado) {
        setInventarioEstado(inv.estado);
      } else if (!inventarioEstado || inventarioEstado === 'PENDIENTE') {
        setInventarioEstado('INICIADO');
      }
      if (inv.tipo) setTipoInventario(inv.tipo);
      if (inv.idtipoalmacen !== null && inv.idtipoalmacen !== undefined) {
        setIdTipoAlmacen(Number(inv.idtipoalmacen));
      }
      if (inv.fecha_inicio) setFechaInicioInventario(inv.fecha_inicio);
      if (inv.fecha_fin) setFechaFinInventario(inv.fecha_fin);
    } else if (route.params?.idaperturainventario) {
      setIdAperturaState(route.params.idaperturainventario);
    }
  }, [route.params]);

  // Cargar almacenes (disponible también para mostrar nombre de almacén en reportes)
  useEffect(() => {
    const cargarAlmacenes = async () => {
      setCargandoAlmacenes(true);
      try {
        const data = await listarAlmacenes();
        setAlmacenes(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Error cargando almacenes:', e);
      } finally {
        setCargandoAlmacenes(false);
      }
    };
    cargarAlmacenes();
  }, []);

  // Sincronizar almacenSeleccionado con el idTipoAlmacen real de la apertura (o primero habilitado al crear)
  useEffect(() => {
    if (!almacenes || almacenes.length === 0) return;

    if (idTipoAlmacen !== null && idTipoAlmacen !== undefined) {
      const match = almacenes.find((a) => Number(a.idAlmacen) === Number(idTipoAlmacen));
      if (match) {
        setAlmacenSeleccionado(match);
        return;
      }
    }

    if (!almacenSeleccionado) {
      const primerHabilitado = almacenes.find((a) => estaHabilitado(a)) || almacenes[0];
      if (primerHabilitado) {
        setAlmacenSeleccionado(primerHabilitado);
        if (inventarioEstado === 'PENDIENTE') {
          setIdTipoAlmacen(Number(primerHabilitado.idAlmacen));
        }
      }
    }
  }, [almacenes, idTipoAlmacen, inventarioEstado]);

  const sincronizarEstadoConBD = async (idApertura) => {
    if (!idApertura) return null;
    try {
      const estadoRes = await getInventarioEstado();
      if (estadoRes && estadoRes.success && Array.isArray(estadoRes.data)) {
        const invActual = estadoRes.data.find(
          (item) => String(item.idaperturainventario || item.id) === String(idApertura)
        );
        if (invActual) {
          if (invActual.tipo) setTipoInventario(invActual.tipo);
          if (invActual.estado) setInventarioEstado(invActual.estado);
          if (invActual.idtipoalmacen !== null && invActual.idtipoalmacen !== undefined) {
            setIdTipoAlmacen(Number(invActual.idtipoalmacen));
          }
          if (invActual.fecha_inicio) setFechaInicioInventario(invActual.fecha_inicio);
          if (invActual.fecha_fin) setFechaFinInventario(invActual.fecha_fin);
          setInventarioActivoState((prev) => ({ ...(prev || {}), ...invActual }));
          return invActual;
        }
      }
    } catch (eSync) {
      console.log('Error sincronizando estado de inventario en General:', eSync);
    }
    return null;
  };

  const fetchProductosPorModo = async (idApertura) => {
    const idEmpleadoParam = viewMode === 'todos' && isAdmin ? null : user?.id;
    const productos = await ObtenerTotalTomaInventarioGeneral(idApertura, idEmpleadoParam);

    return (productos || []).filter(
      (prod) => String(prod.idaperturainventario) === String(idApertura)
    );
  };

  const loadProducts = async (isManualRefresh = false, idAperturaOverride = null) => {
    if (!isManualRefresh) {
      setIsLoading(true);
    }
    try {
      const idaperturainventario = idAperturaOverride ?? getIdAperturaActual();

      if (!idaperturainventario || (inventarioEstado === 'PENDIENTE' && !idAperturaOverride)) {
        setRawItems([]);
        setItems([]);
        return;
      }

      const invActual = await sincronizarEstadoConBD(idaperturainventario);
      if (invActual?.estado === 'PENDIENTE') {
        setRawItems([]);
        setItems([]);
        return;
      }

      const filtrados = await fetchProductosPorModo(idaperturainventario);
      setRawItems(filtrados);
      setItems(agruparProductosGenerales(filtrados));
    } catch (error) {
      console.error('❌ Error cargando productos en General:', error);
      setRawItems([]);
      setItems([]);
    } finally {
      if (!isManualRefresh) {
        setIsLoading(false);
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadProducts();
      }
    }, [viewMode, user, idAperturaState, inventarioEstado])
  );

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await loadProducts(true);
    } catch (error) {
      console.error('Error en refresco manual General:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleExpandir = (key) => {
    setProductosExpandidos((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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
    if (!almacenSeleccionado) {
      Alert.alert('Error', 'Seleccione un almacén');
      return;
    }
    if (!estaHabilitado(almacenSeleccionado)) {
      Alert.alert('🔒 Almacén bloqueado', 'El almacén seleccionado está temporalmente deshabilitado. Elija otro.');
      return;
    }

    // Verificar primero en BD si ya existe un inventario INICIADO en esta sucursal
    setLoadingAccion(true);
    try {
      const estadoRes = await getInventarioEstado();
      if (estadoRes && estadoRes.success && Array.isArray(estadoRes.data)) {
        const invEnCurso = estadoRes.data.find(
          (inv) => inv.estado === 'INICIADO' && esMismaSucursal(inv, user)
        );
        if (invEnCurso) {
          setLoadingAccion(false);
          const tipoDesc = invEnCurso.tipo === 'TOTAL' ? 'GENERAL' : (invEnCurso.tipo || 'CICLICO');
          const sucNombre = invEnCurso.nombre_sucursal_inventario || user?.sucursalNombre || 'esta sucursal';
          Alert.alert(
            '⚠️ Inventario en progreso',
            `Ya existe un inventario en curso (${tipoDesc}) para ${sucNombre}.\n\nDebe finalizarse ese inventario antes de iniciar uno nuevo.`
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
      `¿Está seguro de INICIAR el inventario ${tipoInventario === 'TOTAL' ? 'GENERAL' : 'CICLICO'}?\n\n` +
        `🏢 Sucursal: ${user?.sucursalNombre || 'N/A'}\n` +
        `🏬 Almacén: ${almacenSeleccionado.descripcion || 'N/A'}\n\n` +
        `⚠️ Una vez iniciado, todos los usuarios podrán escanear productos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Iniciar',
          onPress: async () => {
            setLoadingAccion(true);
            try {
              const idAlmacenNum = Number(almacenSeleccionado.idAlmacen);
              const result = await iniciarInventario(
                tipoInventario,
                String(user?.id),
                String(user?.sucursalId || ''),
                idAlmacenNum
              );

              if (result.success || result.Success === 1) {
                const nuevoId =
                  result.idaperturainventario ||
                  result.id ||
                  result.Id ||
                  result.data?.id ||
                  result.data?.idaperturainventario ||
                  null;

                const fechaInicioIso = new Date().toISOString();
                const nuevoInventario = {
                  idaperturainventario: nuevoId,
                  estado: 'INICIADO',
                  tipo: tipoInventario,
                  idtipoalmacen: idAlmacenNum,
                  idsucursal_inventario: String(user?.sucursalId || ''),
                  nombre_sucursal_inventario: user?.sucursalNombre || '',
                  fecha_inicio: fechaInicioIso,
                };

                setInventarioEstado('INICIADO');
                setIdTipoAlmacen(idAlmacenNum);
                setFechaInicioInventario(new Date().toLocaleString());
                if (nuevoId) setIdAperturaState(nuevoId);
                setInventarioActivoState(nuevoInventario);

                navigation.setParams({
                  crearNuevo: false,
                  inventarioActivo: nuevoInventario,
                });

                Alert.alert(
                  '✅ Éxito',
                  result.mensaje || result.message || `Inventario ${tipoInventario === 'TOTAL' ? 'GENERAL' : 'CICLICO'} iniciado correctamente`
                );
                await loadProducts(false, nuevoId);
              } else {
                Alert.alert('Error', result.message || 'No se pudo iniciar el inventario');
              }
            } catch (error) {
              console.error('Error iniciando inventario General:', error);
              Alert.alert('Error', 'No se pudo iniciar el inventario');
            } finally {
              setLoadingAccion(false);
            }
          },
        },
      ]
    );
  };

  const handleFinalizarInventario = async () => {
    const idaperturainventario = getIdAperturaActual();
    if (!idaperturainventario) {
      Alert.alert('Error', 'No se pudo identificar el inventario activo');
      return;
    }

    const invActual = await sincronizarEstadoConBD(idaperturainventario);
    const tipoActual = invActual?.tipo || tipoInventario;

    if (invActual?.estado === 'FINALIZADO') {
      Alert.alert('Aviso', 'Este inventario ya fue finalizado anteriormente.');
      navigation.replace('SelectInventory', { user });
      return;
    }

    const totalUnits = items.reduce((sum, i) => sum + (i.cantidad_nueva || 0), 0);

    Alert.alert(
      'Finalizar Inventario',
      `¿Está seguro de FINALIZAR el inventario?\n\n` +
        `📋 Tipo: ${tipoActual === 'TOTAL' ? 'GENERAL' : 'CICLICO'}\n` +
        `🏬 Almacén: ${almacenSeleccionado?.descripcion || 'N/A'}\n` +
        `📦 Productos registrados: ${items.length}\n` +
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
              const result = await finalizarInventario(String(user?.id), idaperturainventario);
              if (result && result.success) {
                setInventarioEstado('FINALIZADO');
                setFechaFinInventario(new Date().toLocaleString());
                Alert.alert('✅ Éxito', result.mensaje || 'Inventario finalizado correctamente');
                navigation.replace('SelectInventory', { user });
              } else {
                Alert.alert('❌ Error', result?.mensaje || result?.message || 'No se pudo finalizar');
              }
            } catch (error) {
              console.error('Error finalizando inventario:', error);
              Alert.alert('❌ Error', error?.message || 'Error al finalizar');
            } finally {
              setLoadingAccion(false);
            }
          },
        },
      ]
    );
  };

  const deleteItem = (item) => {
    const idsAEliminar =
      item.registroIds && item.registroIds.length > 0
        ? item.registroIds
        : item.lotes?.map((l) => l.idTomaInventario).filter(Boolean) || [];

    Alert.alert(
      'Eliminar producto',
      `¿Desea eliminar "${item.name}"?\n\nSe eliminarán ${idsAEliminar.length || 1} registro(s) de lote.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              let exitoTotal = true;
              const errores = [];

              if (idsAEliminar.length > 0) {
                for (const idToma of idsAEliminar) {
                  const result = await eliminarTomaInventario(idToma);
                  if (!result.success) {
                    exitoTotal = false;
                    errores.push(`ID ${idToma}: ${result.message || 'Error'}`);
                  }
                }
              } else if (item.idTomaInventario) {
                const result = await eliminarTomaInventario(item.idTomaInventario);
                if (!result.success) {
                  exitoTotal = false;
                  errores.push(result.message || 'Error');
                }
              }

              await loadProducts(true);
              if (exitoTotal) {
                Alert.alert('✅ Éxito', 'Producto(s) eliminado(s) correctamente');
              } else {
                Alert.alert('⚠️ Advertencia', 'Algunos registros no pudieron eliminarse:\n' + errores.join('\n'));
              }
            } catch (error) {
              console.error('Error al eliminar:', error);
              Alert.alert('❌ Error', 'Error al conectar con el servidor');
            }
          },
        },
      ]
    );
  };

  const exportToExcel = async () => {
    const idaperturainventario = getIdAperturaActual();
    if (!idaperturainventario) {
      Alert.alert('Error', 'No se pudo identificar el inventario activo.');
      return;
    }

    setIsExporting(true);
    try {
      const filtrados = await fetchProductosPorModo(idaperturainventario);
      const itemsFrescos = agruparProductosGenerales(filtrados);
      setRawItems(filtrados);
      setItems(itemsFrescos);

      if (itemsFrescos.length === 0) {
        Alert.alert('Error', 'No hay productos para exportar en este modo de vista.');
        return;
      }

      const data = [];
      let contador = 1;

      itemsFrescos.forEach((item) => {
        if (item.lotes && item.lotes.length > 0) {
          item.lotes.forEach((lote) => {
            data.push({
              '#': contador++,
              'idproducto': item.idproducto,
              'idproductolote': lote.idproductolote || '',
              'Codigo_Barras': item.codigobarra,
              'Producto': item.name,
              'Lote': lote.numLote,
              'Cantidad_Nueva': lote.cant_Nueva,
              'Usuario': item.usuario,
              'Fecha_Edicion': item.fecha_edicion,
              'Tipo_Inventario': tipoInventario || 'N/A',
              'Almacen': almacenSeleccionado?.descripcion || 'N/A',
              'sucursal_destino': item.sucursal_destino || 'N/A',
              'ubicacion': lote.ubicacion || 'N/A',
            });
          });
        } else {
          data.push({
            '#': contador++,
            'idproducto': item.idproducto,
            'idproductolote': '',
            'Codigo_Barras': item.codigobarra,
            'Producto': item.name,
            'Lote': item.lote,
            'Cantidad_Nueva': item.cantidad_nueva,
            'Usuario': item.usuario,
            'Fecha_Edicion': item.fecha_edicion,
            'Tipo_Inventario': tipoInventario || 'N/A',
            'Almacen': almacenSeleccionado?.descripcion || 'N/A',
            'sucursal_destino': item.sucursal_destino || 'N/A',
            'ubicacion': item.ubicacion || 'N/A',
          });
        }
      });

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
          dialogTitle: 'Compartir inventario',
        });
      } else {
        Alert.alert('Error', 'No se puede compartir en este dispositivo');
      }
    } catch (error) {
      console.error('Error al exportar:', error);
      Alert.alert('Error', 'No se pudo exportar: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSalir = () => {
    navigation.replace('SelectInventory', { user });
  };

  const totalUnits = items.reduce((sum, i) => sum + (i.cantidad_nueva || 0), 0);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Cargando productos...</Text>
      </View>
    );
  }

  const idaperturainventarioActual = getIdAperturaActual();
  const invActivoActual = inventarioActivoState || {
    idaperturainventario: idaperturainventarioActual,
    estado: inventarioEstado,
    tipo: tipoInventario,
    idtipoalmacen: idTipoAlmacen,
    idsucursal_inventario: String(user?.sucursalId || ''),
    nombre_sucursal_inventario: user?.sucursalNombre || '',
    fecha_inicio: fechaInicioInventario,
    fecha_fin: fechaFinInventario,
  };

  if (showScanner) {
    return (
      <ScannerScreen
        onScan={() => {}}
        onClose={() => setShowScanner(false)}
        navigation={navigation}
        user={user}
        idaperturainventario={idaperturainventarioActual}
        inventarioActivo={invActivoActual}
        tipoInventario={tipoInventario}
        idtipoalmacen={idTipoAlmacen}
        existingProducts={rawItems}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER COMPACTO */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.userName}>👤 {user?.empleado || user?.name || user?.username || 'Usuario'}</Text>
          <Text style={styles.userRole}>
            📛 {user?.role || 'Sin rol'}  •  🏢 {user?.sucursalNombre || 'Sin sucursal'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleManualRefresh}
            style={styles.refreshBtn}
            disabled={isRefreshing}
            activeOpacity={0.7}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#0284c7" />
            ) : (
              <Text style={styles.refreshBtnIcon}>🔄</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSalir} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>🚪 Salir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* LISTA AGRUPADA CON HEADER SCROLEABLE */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingBottom: 15 }}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
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
                    <Text style={styles.adminTitle}>🎮 Panel de Control</Text>
                    <View style={styles.collapseToggleBadge}>
                      <Text style={styles.collapseToggleText}>
                        {adminPanelExpanded ? '▲ Ocultar' : '▼ Ver panel'}
                      </Text>
                    </View>
                  </View>

                  {!adminPanelExpanded && (
                    <View style={styles.adminCompactSummary}>
                      <Text
                        style={[
                          styles.compactBadgeText,
                          inventarioEstado === 'INICIADO' && styles.compactBadgeVerde,
                          inventarioEstado === 'FINALIZADO' && styles.compactBadgeRojo,
                          inventarioEstado === 'PENDIENTE' && styles.compactBadgeAmarillo,
                        ]}
                      >
                        {inventarioEstado === 'INICIADO'
                          ? '🟢 INICIADO'
                          : inventarioEstado === 'FINALIZADO'
                            ? '🔴 FINALIZADO'
                            : '🟡 PENDIENTE'}
                      </Text>
                      <Text style={styles.compactDivider}>•</Text>
                      <Text style={styles.compactDetailText}>
                        {tipoInventario === 'TOTAL' ? '📦 GENERAL' : '📋 CICLICO'}
                      </Text>
                      <Text style={styles.compactDivider}>•</Text>
                      <Text style={[styles.compactDetailText, { flexShrink: 1 }]} numberOfLines={1}>
                        {almacenSeleccionado?.descripcion || 'Sin almacén'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {adminPanelExpanded && (
                  <>
                    <View style={styles.estadoBadge}>
                      <Text
                        style={[
                          styles.estadoBadgeText,
                          inventarioEstado === 'INICIADO' && styles.estadoBadgeVerde,
                          inventarioEstado === 'FINALIZADO' && styles.estadoBadgeRojo,
                          inventarioEstado === 'PENDIENTE' && styles.estadoBadgeAmarillo,
                        ]}
                      >
                        {inventarioEstado === 'INICIADO'
                          ? '🟢 INICIADO'
                          : inventarioEstado === 'FINALIZADO'
                            ? '🔴 FINALIZADO'
                            : '🟡 PENDIENTE'}
                      </Text>
                    </View>

                    <View style={styles.tipoSelector}>
                      <Text style={styles.tipoLabel}>Tipo de inventario:</Text>
                      <View style={styles.tipoButtons}>
                        <TouchableOpacity
                          style={[
                            styles.tipoButton,
                            tipoInventario === 'PARCIAL' && styles.tipoButtonActive,
                            inventarioEstado === 'INICIADO' && styles.tipoButtonDisabled,
                          ]}
                          onPress={() => handleCambiarTipo('PARCIAL')}
                          disabled={inventarioEstado === 'INICIADO'}
                        >
                          <Text
                            style={[
                              styles.tipoButtonText,
                              tipoInventario === 'PARCIAL' && styles.tipoButtonTextActive,
                            ]}
                          >
                            📋 CICLICO
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.tipoButton,
                            tipoInventario === 'TOTAL' && styles.tipoButtonActive,
                            inventarioEstado === 'INICIADO' && styles.tipoButtonDisabled,
                          ]}
                          onPress={() => handleCambiarTipo('TOTAL')}
                          disabled={inventarioEstado === 'INICIADO'}
                        >
                          <Text
                            style={[
                              styles.tipoButtonText,
                              tipoInventario === 'TOTAL' && styles.tipoButtonTextActive,
                            ]}
                          >
                            📦 GENERAL
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Selector de Almacén (idtipoalmacen) */}
                    <View style={styles.tipoSelector}>
                      <Text style={styles.tipoLabel}>Tipo de almacén:</Text>
                      <TouchableOpacity
                        style={[
                          styles.almacenSelector,
                          inventarioEstado === 'INICIADO' && styles.tipoButtonDisabled,
                        ]}
                        onPress={() => setModalAlmacenVisible(true)}
                        disabled={inventarioEstado === 'INICIADO' || cargandoAlmacenes || almacenes.length === 0}
                      >
                        <Text style={styles.almacenSelectorText} numberOfLines={1}>
                          {cargandoAlmacenes
                            ? 'Cargando...'
                            : almacenSeleccionado
                              ? `${estaHabilitado(almacenSeleccionado) ? '🏬' : '🔒'} ${almacenSeleccionado.descripcion}${
                                  estaHabilitado(almacenSeleccionado) ? '' : ' (Bloqueado)'
                                }`
                              : almacenes.length === 0
                                ? 'No hay almacenes'
                                : 'Seleccionar almacén'}
                        </Text>
                        <Text style={styles.almacenSelectorIcon}>▼</Text>
                      </TouchableOpacity>
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
                          <Text style={styles.finalizadoMensajeTexto}>🔒 El inventario ya fue finalizado.</Text>
                          <Text style={styles.finalizadoMensajeSubtexto}>
                            Inicie un nuevo inventario presionando "INICIAR INVENTARIO".
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

            {/* Banner para usuarios que no son ADMINISTRADOR */}
            {!isAdmin && (
              <View style={styles.infoBanner}>
                <Text style={styles.infoText}>📱 Mostrando solo tus productos</Text>
                {inventarioEstado !== 'INICIADO' && (
                  <Text style={styles.infoTextAdvertencia}>
                    {inventarioEstado === 'PENDIENTE'
                      ? '⏳ Inventario no iniciado. Espere al administrador.'
                      : '🔒 Inventario finalizado. Ya no se pueden agregar productos.'}
                  </Text>
                )}
              </View>
            )}

            {/* Métricas */}
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
          </>
        }
        renderItem={({ item }) => {
          const totalLotes = item.lotes?.length || 0;
          const mostrarTodos = productosExpandidos[item.key] === true;
          const lotesAMostrar = mostrarTodos || totalLotes <= 3 ? item.lotes : item.lotes.slice(0, 3);

          return (
            <View style={styles.card}>
              <Text style={styles.barcode}>
                {item.idproducto > 0 ? `🆔 ID: ${item.idproducto}  •  ` : ''}📷 {item.codigobarra || 'S/C'}
              </Text>
              <Text style={styles.productName}>📝 {item.name}</Text>

              {item.lotes && item.lotes.length > 0 ? (
                <View style={styles.lotesContainer}>
                  <Text style={styles.lotesTitle}>
                    📦 {totalLotes} lote{totalLotes > 1 ? 's' : ''}:
                  </Text>

                  {lotesAMostrar.map((lote, idx) => (
                    <View key={`${item.key}-${lote.loteKey}-${idx}`} style={styles.loteRow}>
                      <Text style={styles.loteRowText} numberOfLines={1}>
                        🔢 {lote.numLote}
                      </Text>
                      <Text style={styles.loteRowCant}>✨ {lote.cant_Nueva}</Text>
                      <Text style={styles.loteRowUbic} numberOfLines={1}>
                        📍 {lote.ubicacion || '-'}
                      </Text>
                    </View>
                  ))}

                  {totalLotes > 3 && (
                    <TouchableOpacity style={styles.verMasButton} onPress={() => toggleExpandir(item.key)}>
                      <Text style={styles.verMasText}>
                        {mostrarTodos ? '▲ Ver menos' : `▼ Ver ${totalLotes - 3} lote(s) más`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <Text style={styles.lote}>🔢 Lote: {item.lote}</Text>
              )}

              <Text style={styles.usuario}>👤 Usuario: {item.usuario}</Text>
              <Text style={styles.quantityNew}>✨ Cantidad total: {item.cantidad_nueva}</Text>

              <View style={styles.row}>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.editProductButton}
                    onPress={() => {
                      // Temporal: apunta a EditProduct hasta crear EditProductGeneralScreen en new_general_flow
                      navigation.navigate('EditProduct', {
                        barcode: item.codigobarra,
                        idproducto: item.idproducto,
                        ubicacion: item.ubicaciones?.[0] || '-',
                        isNew: false,
                        user: user,
                        idaperturainventario: item.idaperturainventario || idaperturainventarioActual,
                        idtipoalmacen: idTipoAlmacen,
                        tipoInventario: tipoInventario,
                        inventarioActivo: invActivoActual,
                      });
                    }}
                  >
                    <Text style={styles.editText}>✏️ Editar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.deleteButton} onPress={() => deleteItem(item)}>
                    <Text style={styles.deleteText}>🗑️ Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>📭 Sin productos</Text>
            <Text style={styles.emptyText}>Presione "Escanear" para agregar productos</Text>
          </View>
        }
      />

      {/* Botones Inferiores */}
      <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
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
          <Text style={styles.buttonText}>{isExporting ? '⏳ Generando...' : '📎 Exportar Excel'}</Text>
        </TouchableOpacity>
      </View>

      {/* MODAL PARA SELECCIONAR ALMACÉN */}
      <Modal
        visible={modalAlmacenVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalAlmacenVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Seleccionar Almacén</Text>

            <FlatList
              data={almacenes}
              keyExtractor={(item) => item.idAlmacen.toString()}
              renderItem={({ item }) => {
                const bloqueado = !estaHabilitado(item);
                const seleccionado = almacenSeleccionado?.idAlmacen === item.idAlmacen;

                return (
                  <TouchableOpacity
                    style={[
                      styles.almacenOption,
                      seleccionado && styles.almacenOptionSelected,
                      bloqueado && styles.almacenOptionBloqueado,
                    ]}
                    onPress={() => {
                      if (bloqueado) {
                        Alert.alert('🔒 Almacén bloqueado', 'Este almacén está temporalmente deshabilitado.');
                        return;
                      }
                      setAlmacenSeleccionado(item);
                      setIdTipoAlmacen(Number(item.idAlmacen));
                      setModalAlmacenVisible(false);
                    }}
                    activeOpacity={bloqueado ? 1 : 0.7}
                  >
                    <View style={styles.almacenOptionRow}>
                      <Text
                        style={[
                          styles.almacenOptionText,
                          seleccionado && styles.almacenOptionTextSelected,
                          bloqueado && styles.almacenOptionTextBloqueado,
                        ]}
                      >
                        {bloqueado ? '🔒 ' : '🏬 '}
                        {item.descripcion}
                      </Text>
                      {bloqueado && <Text style={styles.bloqueadoTag}>No disponible</Text>}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setModalAlmacenVisible(false)}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#64748b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#ddd',
  },
  headerInfo: {
    flex: 1,
    paddingRight: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshBtn: {
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    minHeight: 30,
  },
  refreshBtnIcon: {
    fontSize: 13,
  },
  userName: { fontSize: 14, fontWeight: 'bold', color: '#2c3e50' },
  userRole: { fontSize: 11, color: '#64748b', marginTop: 2 },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
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
  almacenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ecf0f1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
  },
  almacenSelectorText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2c3e50',
    flex: 1,
  },
  almacenSelectorIcon: {
    fontSize: 12,
    color: '#7f8c8d',
    marginLeft: 8,
  },
  adminButtons: {
    gap: 8,
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
    backgroundColor: '#c0392b',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  finalizadoMensajeTexto: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  finalizadoMensajeSubtexto: {
    color: '#fadbd8',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },

  // View selector & banner
  viewSelector: { flexDirection: 'row', backgroundColor: '#34495e', margin: 10, borderRadius: 10, padding: 3 },
  viewButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  activeButton: { backgroundColor: '#3498db' },
  viewButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  infoBanner: {
    backgroundColor: '#e8f4fd',
    marginHorizontal: 10,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  infoText: { color: '#2980b9', fontWeight: 'bold', fontSize: 13 },
  infoTextAdvertencia: { color: '#e67e22', fontSize: 11, marginTop: 4, textAlign: 'center' },

  // Stats
  statsRow: { flexDirection: 'row', margin: 10, gap: 10 },
  statBox: { flex: 1, backgroundColor: '#fff', padding: 12, borderRadius: 10, alignItems: 'center', elevation: 2 },
  statNumber: { fontSize: 22, fontWeight: 'bold', color: '#3498db' },
  statLabel: { fontSize: 11, color: '#7f8c8d' },

  // Product cards
  card: { backgroundColor: '#fff', marginHorizontal: 10, marginVertical: 5, padding: 12, borderRadius: 10, elevation: 2 },
  barcode: { fontSize: 11, color: '#7f8c8d' },
  productName: { fontSize: 15, fontWeight: 'bold', marginTop: 3, color: '#2c3e50' },
  lote: { fontSize: 12, color: '#2980b9', marginTop: 2 },
  lotesContainer: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  lotesTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 4,
  },
  loteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    marginBottom: 3,
  },
  loteRowText: {
    fontSize: 11,
    color: '#2980b9',
    fontWeight: 'bold',
    flex: 2,
  },
  loteRowCant: {
    fontSize: 11,
    color: '#27ae60',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  loteRowUbic: {
    fontSize: 11,
    color: '#7f8c8d',
    flex: 1.5,
    textAlign: 'right',
  },
  verMasButton: {
    marginTop: 4,
    paddingVertical: 5,
    alignItems: 'center',
    backgroundColor: '#e8f4fd',
    borderRadius: 5,
  },
  verMasText: {
    fontSize: 11,
    color: '#2980b9',
    fontWeight: 'bold',
  },
  usuario: { fontSize: 11, color: '#8e44ad', marginTop: 5 },
  quantityNew: { fontSize: 14, color: '#27ae60', fontWeight: 'bold', marginTop: 3 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8 },
  actionButtons: { flexDirection: 'row', gap: 15 },
  editProductButton: {
    backgroundColor: '#f39c12',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  editText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  deleteButton: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  deleteText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  // Empty & bottom buttons
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyTitle: { fontSize: 18, color: '#95a5a6' },
  emptyText: { fontSize: 13, color: '#bdc3c7', marginTop: 5 },
  buttonRow: {
    flexDirection: 'row',
    padding: 10,
    gap: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#ddd',
  },
  button: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  scanButton: { backgroundColor: '#3498db' },
  exportButton: { backgroundColor: '#27ae60' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  // Modal Almacén
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
    textAlign: 'center',
  },
  almacenOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    borderRadius: 6,
  },
  almacenOptionSelected: {
    backgroundColor: '#3498db',
  },
  almacenOptionText: {
    fontSize: 15,
    color: '#2c3e50',
  },
  almacenOptionTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  almacenOptionBloqueado: {
    backgroundColor: '#f2f3f4',
    opacity: 0.7,
  },
  almacenOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  almacenOptionTextBloqueado: {
    color: '#95a5a6',
    textDecorationLine: 'line-through',
  },
  bloqueadoTag: {
    fontSize: 11,
    color: '#e74c3c',
    fontWeight: 'bold',
    backgroundColor: '#fadbd8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modalCloseButton: {
    marginTop: 15,
    backgroundColor: '#7f8c8d',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
