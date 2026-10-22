import { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, 
  StyleSheet, Alert, ScrollView, ActivityIndicator, BackHandler 
} from 'react-native';
import { 
  getTomaInventario, 
  insertTomaInventario,
  getTomaInventarioByBarcodeAndUbicacion,
  obtenerLotesGeneral,
  eliminarTomaInventario
} from '../services/api';

/**
 * Normaliza una fecha a formato YYYY-MM-DD para agrupación consistente.
 */
const normalizarFecha = (fecha) => {
  if (!fecha) return 'SIN_FECHA';
  try {
    const str = String(fecha).trim();
    const part = str.split('T')[0].split(' ')[0].trim();
    if (part.length === 10 && part.includes('-')) return part;
    const d = new Date(fecha);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return part;
  } catch (e) {
    return String(fecha);
  }
};

const obtenerTimestamp = (fecha) => {
  if (!fecha) return 0;
  try {
    const d = new Date(fecha);
    const t = d.getTime();
    return isNaN(t) ? 0 : t;
  } catch (e) {
    return 0;
  }
};

/**
 * Agrupa los lotes del CATÁLOGO (obtenerLotesGeneral).
 * Solo se usa en modo Scanner / Nuevo.
 */
const agruparLotesGeneral = (rawList, defaultSucursalId = 66, defaultSucursalNombre = 'Q. F. DROGUERIA') => {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const gruposMap = new Map();

  rawList.forEach((item, idx) => {
    const numLote = String(item.numeroLote || item.numLote || 'S/L').trim();
    const fValidezRaw = item.fechavalidez || item.fechaValidez || null;
    const fValidezNorm = normalizarFecha(fValidezRaw);
    const idAlmSuc = item.idalmacensucursal !== null && item.idalmacensucursal !== undefined
      ? String(item.idalmacensucursal).trim()
      : '0';

    const groupKey = `${numLote.toUpperCase()}__${fValidezNorm}__${idAlmSuc}`;

    const cantExistNum = parseFloat(item.cantidadExistencial ?? item.cantExistencial ?? 0) || 0;

    const subLoteObj = {
      key: `${item.idproductolote || idx}`,
      idproductolote: item.idproductolote,
      idalmacensucursal: item.idalmacensucursal,
      numeroLote: numLote,
      fechaRecepcion: item.fecharecepcion || item.fechaRecepcion || null,
      fechaValidez: fValidezRaw,
      fechaFabricacion: item.fechafabricacion || item.fechaFabricacion || null,
      cantidadExistencial: cantExistNum,
      idsucursal: item.idsucursal || defaultSucursalId,
      nombresucursal: item.nombresucursal || defaultSucursalNombre
    };

    if (!gruposMap.has(groupKey)) {
      gruposMap.set(groupKey, {
        key: groupKey,
        groupKey: groupKey,
        numeroLote: numLote,
        fechaValidez: fValidezRaw,
        idalmacensucursal: item.idalmacensucursal,
        idsucursal: item.idsucursal || defaultSucursalId,
        nombresucursal: item.nombresucursal || defaultSucursalNombre,
        cantidadExistencial: cantExistNum,
        subLotes: [subLoteObj],
        cantInput: '',
        ubicacionInput: '',
        isModified: false,
        esDelScanner: false
      });
    } else {
      const grupo = gruposMap.get(groupKey);
      grupo.cantidadExistencial += cantExistNum;
      grupo.subLotes.push(subLoteObj);
    }
  });

  const grupos = Array.from(gruposMap.values());
  grupos.forEach(grupo => {
    grupo.subLotes.sort((a, b) => {
      const tA = obtenerTimestamp(a.fechaRecepcion);
      const tB = obtenerTimestamp(b.fechaRecepcion);
      if (tB !== tA) return tB - tA;
      return (Number(b.idproductolote) || 0) - (Number(a.idproductolote) || 0);
    });
  });

  return grupos;
};

export default function EditProductScreen({ route, navigation }) {
  const params = route?.params || {};
  const { 
    barcode, 
    ubicacion,
    isNew, 
    user, 
    esObligatorio, 
    fromScanner, 
    productoData,
    idaperturainventario ,
      idtipoalmacen,          // 👈 AGREGAR
  inventarioActivo 
  } = params;
  
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

  const [lotes, setLotes] = useState([]);
  const [loadingLotes, setLoadingLotes] = useState(false);
  const [filtroCantidad, setFiltroCantidad] = useState('CON_CANTIDAD');
  const [modoEditarReal, setModoEditarReal] = useState(false);

  // Bloquear botón atrás solo si es obligatorio Y hay lotes
  useEffect(() => {
    if (esObligatorio && lotes.length > 0) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        Alert.alert('Atención', 'Debe guardar la cantidad antes de salir', [{ text: 'OK' }]);
        return true;
      });

      navigation.setOptions({
        headerLeft: () => null,
        gestureEnabled: false,
      });

      return () => backHandler.remove();
    } else {
      navigation?.setOptions?.({ headerLeft: undefined, gestureEnabled: true });
    }
  }, [esObligatorio, lotes.length, navigation]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  // ==========================================
  // CARGAR LOTES
  // - Modo EDITAR: usa almacen.TomaInventario
  // - Modo SCANNER/NUEVO: usa catálogo del almacén (SOLO lo que devuelve el API)
  // ==========================================
  const loadLotes = async (codigoBarra, loteScanner = null, isEditMode = false) => {
    const idsucursal = user?.sucursalId;

    console.log('🔍 [LOTES] === INICIO ===');
    console.log('   codigoBarra:', codigoBarra);
    console.log('   isEditMode:', isEditMode);
    console.log('   user.id:', user?.id);

    if (!codigoBarra) {
      setLotes([]);
      return;
    }

    setLoadingLotes(true);

    // ==========================================
    // MODO EDITAR: leer almacen.TomaInventario
    // ==========================================
    if (isEditMode) {
      try {
        console.log('✏️ [LOTES] Modo EDITAR - trayendo de TomaInventario');

        const todosLosRegistros = await getTomaInventario(user?.id);
        console.log('📦 [LOTES] Total registros usuario:', todosLosRegistros?.length || 0);

        const registrosProducto = (todosLosRegistros || []).filter(r => {
          const codReg = String(r.codigoBarra || r.codigobarra || '').trim();
          const codBuscar = String(codigoBarra || '').trim();
          return codReg === codBuscar;
        });

        console.log('📦 [LOTES] Registros del producto:', registrosProducto.length);

        const grupos = registrosProducto.map((reg, idx) => {
          const cantNueva = parseFloat(reg.cant_Nueva) || 0;
          const ubic = reg.ubicacion || '';
          const numLote = String(reg.numLote || 'S/L').trim();
          const idToma = reg.idTomaInventario || reg.IdTomaInventario || reg.idtomainventario || null;

          return {
            key: `reg-${idToma || idx}`,
            groupKey: `reg-${idToma || idx}`,
            idTomaInventario: idToma,
            numeroLote: numLote,
            fechaValidez: reg.fechaValidez || null,
            fechaFabricacion: reg.fechaFabricacion || null,
            fechaRecepcion: reg.fechaRecepcion || null,
            cantidadExistencial: parseFloat(reg.cantExistencial) || 0,
            idsucursal: reg.idsucursal || idsucursal,
            nombresucursal: reg.nombresucursal || user?.sucursalNombre || '',
            cantInput: cantNueva > 0 ? String(cantNueva) : '',
            ubicacionInput: ubic && ubic !== '-' ? ubic : '',
            isModified: false,
            esDelScanner: false,
            subLotes: [{
              key: `sub-${idToma || idx}`,
              numeroLote: numLote,
              cantidadExistencial: parseFloat(reg.cantExistencial) || 0,
              fechaRecepcion: reg.fechaRecepcion || null,
              fechaValidez: reg.fechaValidez || null,
              fechaFabricacion: reg.fechaFabricacion || null,
              idsucursal: reg.idsucursal || idsucursal,
              nombresucursal: reg.nombresucursal || user?.sucursalNombre || ''
            }]
          };
        });

        console.log(`✅ [LOTES] ${grupos.length} registros para editar`);
        setLotes(grupos);

      } catch (error) {
        console.error('❌ [LOTES] Error en modo editar:', error);
        setLotes([]);
      } finally {
        setLoadingLotes(false);
      }
      return;
    }

    // ==========================================
    // MODO SCANNER / NUEVO: catálogo del almacén
    // SOLO lo que devuelve el API. NO se agrega nada extra.
    // ==========================================
    if (!idsucursal) {
      setLotes([]);
      setLoadingLotes(false);
      return;
    }

    try {
      const idtipoalmacen = route?.params?.inventarioActivo?.idtipoalmacen 
        || route?.params?.idtipoalmacen 
        || null;

      console.log('🏬 idtipoalmacen enviado a lotes:', idtipoalmacen);

      const res = await obtenerLotesGeneral(codigoBarra, idsucursal, idtipoalmacen);

      let agrupados = [];

      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        agrupados = agruparLotesGeneral(res.data, idsucursal, user?.sucursalNombre);
      } else {
        console.log('⚠️ [LOTES] El API no devolvió lotes para este producto/almacén');
        agrupados = [];
      }

      setLotes(agrupados);
      console.log(`✅ [LOTES] ${agrupados.length} grupos en pantalla`);

    } catch (error) {
      console.error('❌ [LOTES] Error:', error);
      setLotes([]);
    } finally {
      setLoadingLotes(false);
    }
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      console.log('🔍 [EDIT] === INICIANDO loadInitialData ===');
      console.log('   barcode:', barcode);
      console.log('   ubicacion:', ubicacion);
      console.log('   isNew:', isNew);
      console.log('   fromScanner:', fromScanner);
      console.log('   user.id:', user?.id);

      // ==========================================
      // CASO 1: Viene del escáner
      // ==========================================
      if (fromScanner && productoData) {
        console.log('📱 Viene del escáner');

        const codigoBarraFinal = barcode || productoData.codigobarra || '';

        setProduct({
          idProducto: productoData.idProducto?.toString() || '',
          descripcion: productoData.descripcion || '',
          numLote: productoData.numLote || '',
          cantExistencial: productoData.cantExistencial?.toString() || '',
          fechaFabricacion: productoData.fechaFabricacion ? formatDate(productoData.fechaFabricacion) : '',
          fechaValidez: productoData.fechaValidez ? formatDate(productoData.fechaValidez) : '',
          fechaRecepcion: productoData.fechaRecepcion ? formatDate(productoData.fechaRecepcion) : '',
          codigobarra: codigoBarraFinal,
          nombresucursal: productoData.nombresucursal || user?.sucursalNombre || '',
          sucursal_destino: productoData.sucursal_destino || '',
          ubicacion: '',
          cant_Nueva: ''
        });

        console.log('🔍 [EDIT] Verificando si el producto ya tiene registros...');
        let yaExiste = false;
        try {
          const todosLosRegistros = await getTomaInventario(user?.id);
          console.log('📦 [EDIT] Total registros usuario:', todosLosRegistros?.length || 0);

          const registrosProducto = (todosLosRegistros || []).filter(r => {
            const codReg = String(r.codigoBarra || r.codigobarra || '').trim();
            const codBuscar = String(codigoBarraFinal).trim();
            return codReg === codBuscar;
          });

          console.log('📦 [EDIT] Registros del producto escaneado:', registrosProducto.length);
          yaExiste = registrosProducto.length > 0;
        } catch (err) {
          console.error('❌ [EDIT] Error verificando registros:', err);
        }

        if (yaExiste) {
          console.log('✏️ [EDIT] Producto YA inventariado → modo EDITAR');
          setModoEditarReal(true);
          await loadLotes(codigoBarraFinal, null, true);
        } else {
          console.log('📷 [EDIT] Producto NUEVO → modo SCANNER');
          setModoEditarReal(false);
          await loadLotes(codigoBarraFinal, null, false);
        }

        setLoading(false);
        return;
      }
      
      // ==========================================
      // CASO 2: Nuevo sin scanner (solo código)
      // ==========================================
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

        if (barcode) {
          await loadLotes(barcode, null, false);
        } else {
          setLotes([]);
        }

        setModoEditarReal(false);
        setLoading(false);
        return;
      }
      
      // ==========================================
      // CASO 3: Editar producto existente (desde lista)
      // ==========================================
      console.log('✏️ === MODO EDITAR ===');
      const existingTake = await getTomaInventarioByBarcodeAndUbicacion(barcode, ubicacion);
      console.log('✏️ [EDIT] existingTake:', JSON.stringify(existingTake, null, 2));

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

        setModoEditarReal(true);
        await loadLotes(existingTake.codigobarra || barcode, null, true);
      } else {
        console.log('❌ [EDIT] existingTake vacío o sin codigobarra');
        Alert.alert('Error', 'No se encontró el producto');
        navigation.goBack();
      }
      
    } catch (error) {
      console.error('❌ Error en loadInitialData:', error);
      Alert.alert('Error', 'No se pudo cargar la información');
    } finally {
      setLoading(false);
    }
  };

  const handleCantidadChange = (text, keyOrGroupKey) => {
    setLotes(prev =>
      prev.map(lote =>
        (lote.key === keyOrGroupKey || lote.groupKey === keyOrGroupKey)
          ? { ...lote, cantInput: text, isModified: true }
          : lote
      )
    );
  };

  const handleUbicacionChange = (text, keyOrGroupKey) => {
    setLotes(prev =>
      prev.map(lote =>
        (lote.key === keyOrGroupKey || lote.groupKey === keyOrGroupKey)
          ? { ...lote, ubicacionInput: text, isModified: true }
          : lote
      )
    );
  };
const invActivoParaVolver =
  inventarioActivo ||
  (idaperturainventario
    ? {
        idaperturainventario,
        idtipoalmacen: idtipoalmacen ?? null,
        estado: 'INICIADO',
        tipo: route.params?.tipoInventario || 'PARCIAL',
        idsucursal_inventario: String(user?.sucursalId || ''),
        nombre_sucursal_inventario: user?.sucursalNombre || '',
      }
    : undefined);
  const handleSave = async () => {
    if (!lotes || lotes.length === 0) {
      Alert.alert('Atención', 'No hay lotes para registrar');
      return;
    }

    setSaving(true);
    let exitoTotal = true;
    const errores = [];

    try {
      if (modoEditarReal) {
        console.log('🗑️ Eliminando registros previos...');
        for (const lote of lotes) {
          if (lote.idTomaInventario) {
            try {
              await eliminarTomaInventario(lote.idTomaInventario);
            } catch (errDel) {
              console.error('   ❌ Error eliminando:', lote.idTomaInventario, errDel);
            }
          }
        }
        console.log('✅ Registros previos eliminados');

        for (const lote of lotes) {
          const cantNueva = lote.cantInput !== '' && !isNaN(parseFloat(lote.cantInput))
            ? parseFloat(lote.cantInput) : 0;
          const ubicacionLote = lote.ubicacionInput && lote.ubicacionInput.trim() !== ''
            ? lote.ubicacionInput.trim() : '-';

          const payload = {
            codigobarra: product.codigobarra,
            descripcion: product.descripcion,
            numLote: lote.numeroLote,
            cantExistencial: lote.cantidadExistencial,
            fechaFabricacion: lote.fechaFabricacion || product.fechaFabricacion || '',
            fechaValidez: lote.fechaValidez || product.fechaValidez || '',
            fechaRecepcion: lote.fechaRecepcion || product.fechaRecepcion || '',
            idProducto: product.idProducto,
            nombresucursal: lote.nombresucursal || product.nombresucursal,
            idsucursal: lote.idsucursal || user?.sucursalId,
             idsucursal_destino: route.params?.productoData?.idsucursal_destino 
    || lote.idsucursal_destino 
    || product.idsucursal_destino 
    || user?.sucursalId, 
            sucursal_destino: product.sucursal_destino,
            ubicacion: ubicacionLote,
            cant_Nueva: cantNueva
          };

          const res = await insertTomaInventario(payload, user, idaperturainventario);

          const isSuccess = res?.Success === 1 || res?.success === true;
          if (!isSuccess) {
            exitoTotal = false;
            errores.push(`Lote ${lote.numeroLote}: ${res?.Message || res?.message || 'Error'}`);
          }
        }
      } else {
        for (const lote of lotes) {
          const cantNueva = lote.cantInput !== '' && !isNaN(parseFloat(lote.cantInput))
            ? parseFloat(lote.cantInput) : 0;
          const ubicacionLote = lote.ubicacionInput && lote.ubicacionInput.trim() !== ''
            ? lote.ubicacionInput.trim() : '-';

          const payload = {
            codigobarra: product.codigobarra,
            descripcion: product.descripcion,
            numLote: lote.numeroLote,
            cantExistencial: lote.cantidadExistencial,
            fechaFabricacion: lote.fechaFabricacion || product.fechaFabricacion || '',
            fechaValidez: lote.fechaValidez || product.fechaValidez || '',
            fechaRecepcion: lote.fechaRecepcion || product.fechaRecepcion || '',
            idProducto: product.idProducto,
            nombresucursal: lote.nombresucursal || product.nombresucursal,
            idsucursal: lote.idsucursal || user?.sucursalId,
            idsucursal_destino: route.params?.productoData?.idsucursal_destino,
            sucursal_destino: product.sucursal_destino,
            ubicacion: ubicacionLote,
            cant_Nueva: cantNueva
          };

          const res = await insertTomaInventario(payload, user, idaperturainventario);

          const isSuccess = res?.Success === 1 || res?.success === true;
          if (!isSuccess) {
            exitoTotal = false;
            errores.push(`Lote ${lote.numeroLote}: ${res?.Message || res?.message || 'Error'}`);
          }
        }
      }

      if (exitoTotal) {
        Alert.alert('✅ Éxito', 'Producto(s) registrado(s) correctamente');
        navigation.navigate('Inventory', { user, actualizarLista: true ,   inventarioActivo: invActivoParaVolver });
      } else {
        Alert.alert('⚠️ Advertencia', 'Algunos lotes no pudieron guardarse:\n' + errores.join('\n'));
      }

    } catch (error) {
      console.error('❌ Error al guardar:', error);
      Alert.alert('Error', 'Ocurrió un error al guardar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (esObligatorio && lotes.length > 0) {
      Alert.alert('Atención', 'Debe guardar la cantidad antes de salir');
    } else {
      navigation.navigate('Inventory', { user,
  inventarioActivo: invActivoParaVolver    });
    }
  };

  const formatFechaValidez = (fecha) => {
    if (!fecha) return null;
    try {
      const dateStr = String(fecha).split('T')[0].split(' ')[0];
      const parts = dateStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        const [yyyy, mm, dd] = parts;
        return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
      }
      const d = new Date(fecha);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      }
    } catch (e) {
      console.log('Error formateando fecha validez:', e);
    }
    return String(fecha);
  };

  const lotesFiltrados = lotes.filter(lote => {
    const cantExistencial = parseFloat(lote.cantidadExistencial) || 0;
    if (filtroCantidad === 'CON_CANTIDAD') return cantExistencial > 0;
    if (filtroCantidad === 'SIN_CANTIDAD') return cantExistencial <= 0;
    return true;
  });

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
        {modoEditarReal 
          ? '✏️ Editar Producto' 
          : (fromScanner ? '📷 Nuevo Producto Escaneado' : (isNew ? '📝 Nuevo Producto' : '✏️ Editar Producto'))}
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
        />
        
        <Text style={styles.label}>📝 Sucursal Origen</Text>
        <TextInput
          style={[styles.input, styles.disabledInput]}
          value={product.nombresucursal}
          editable={false}
        />

        <Text style={styles.label}>🚚 Sucursal Destino</Text>
        <TextInput
          style={[styles.input, styles.disabledInput]}
          value={product.sucursal_destino}
          editable={false}
        />

        <Text style={styles.label}>📝 Descripción *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={product.descripcion}
          onChangeText={(text) => setProduct({...product, descripcion: text})}
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>🔢 Número de Lote (del producto escaneado)</Text>
        <TextInput
          style={[styles.input, styles.disabledInput]}
          value={product.numLote}
          editable={false}
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

      <View style={styles.tableCard}>
        <Text style={styles.tableTitle}>📦 Lotes del Producto</Text>

        <View style={styles.filterContainer}>
          <TouchableOpacity 
            style={[styles.filterTab, filtroCantidad === 'CON_CANTIDAD' && styles.filterTabActive]}
            onPress={() => setFiltroCantidad('CON_CANTIDAD')}
          >
            <Text style={[styles.filterTabText, filtroCantidad === 'CON_CANTIDAD' && styles.filterTabTextActive]}>
              Con cantidad
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.filterTab, filtroCantidad === 'TODOS' && styles.filterTabActive]}
            onPress={() => setFiltroCantidad('TODOS')}
          >
            <Text style={[styles.filterTabText, filtroCantidad === 'TODOS' && styles.filterTabTextActive]}>
              Todos
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.colLote]}>Lote</Text>
          <Text style={[styles.headerCell, styles.colCantidad]}>Cant.</Text>
          <Text style={[styles.headerCell, styles.colUbicacion]}>Ubicación</Text>
        </View>

        {loadingLotes ? (
          <View style={styles.emptyTable}>
            <ActivityIndicator size="small" color="#3498db" />
            <Text style={[styles.emptyTableText, { marginTop: 8 }]}>Cargando lotes...</Text>
          </View>
        ) : lotesFiltrados.length === 0 ? (
          <View style={styles.emptyTable}>
            <Text style={styles.emptyTableText}>
              {lotes.length === 0
                ? 'No se encontraron lotes para este producto en el almacén seleccionado'
                : filtroCantidad === 'CON_CANTIDAD'
                  ? 'No hay lotes con cantidad > 0'
                  : 'Sin lotes para mostrar'}
            </Text>

            {lotes.length === 0 && (
              <TouchableOpacity
                style={styles.volverButton}
                onPress={() => navigation.navigate('Inventory', { user ,
    inventarioActivo: invActivoParaVolver     })}
              >
                <Text style={styles.volverButtonText}>← Volver al inventario</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          lotesFiltrados.map((lote, index) => (
            <View 
              key={lote.key || index} 
              style={[
                styles.tableRow, 
                index % 2 === 1 && styles.tableRowAlt
              ]}
            >
              <View style={styles.colLote}>
                <Text style={styles.loteText}>
                  {lote.numeroLote}
                </Text>
                {formatFechaValidez(lote.fechaValidez) ? (
                  <Text style={styles.vencimientoText}>
                    📅 {formatFechaValidez(lote.fechaValidez)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.colCantidad}>
                <TextInput
                  style={styles.ajustarInput}
                  value={lote.cantInput}
                  onChangeText={(text) => handleCantidadChange(text, lote.key || lote.groupKey)}
                  placeholder="0"
                  placeholderTextColor="#bbb"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.colUbicacion}>
                <TextInput
                  style={styles.ubicacionInputLote}
                  value={lote.ubicacionInput}
                  onChangeText={(text) => handleUbicacionChange(text, lote.key || lote.groupKey)}
                  placeholder="-"
                  placeholderTextColor="#bbb"
                />
              </View>
            </View>
          ))
        )}

        {!loadingLotes && lotes.length > 0 && (
          <View style={styles.resumenContainer}>
            <Text style={styles.resumenText}>
              Total: {lotes.length} lote(s) · Mostrando: {lotesFiltrados.length}
            </Text>
          </View>
        )}
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
  disabledInput: { backgroundColor: '#f5f5f5', color: '#999' },
  textArea: { height: 80, textAlignVertical: 'top' },
  tableCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  tableTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  filterTabActive: { backgroundColor: '#3498db', elevation: 1 },
  filterTabText: { fontSize: 12, fontWeight: '600', color: '#64748b', textAlign: 'center' },
  filterTabTextActive: { color: '#fff', fontWeight: 'bold' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2c3e50',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  headerCell: { color: '#fff', fontWeight: 'bold', fontSize: 11, textAlign: 'center' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tableRowAlt: { backgroundColor: '#f8fafc' },
  colLote: { flex: 1.3, paddingRight: 6, justifyContent: 'center' },
  colCantidad: { flex: 0.9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  colUbicacion: { flex: 1.2, paddingLeft: 4, alignItems: 'center', justifyContent: 'center' },
  loteText: { fontSize: 11, fontWeight: 'bold', color: '#334155', flexWrap: 'wrap' },
  vencimientoText: { fontSize: 9, color: '#64748b', marginTop: 2, fontWeight: '500' },
  ajustarInput: {
    borderWidth: 1.5,
    borderColor: '#27ae60',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: '#fff',
    width: '100%',
    color: '#27ae60'
  },
  ubicacionInputLote: {
    borderWidth: 1.5,
    borderColor: '#3498db',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: '#fff',
    width: '100%',
    color: '#2c3e50'
  },
  emptyTable: { padding: 20, alignItems: 'center' },
  emptyTableText: { color: '#94a3b8', fontSize: 13, fontStyle: 'italic', textAlign: 'center' },
  volverButton: {
    marginTop: 15,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#95a5a6',
    borderRadius: 8,
  },
  volverButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  resumenContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
  },
  resumenText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 30 },
  button: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center' },
  saveButton: { backgroundColor: '#27ae60' },
  cancelButton: { backgroundColor: '#95a5a6' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  bottomSpace: { height: 30 }
});