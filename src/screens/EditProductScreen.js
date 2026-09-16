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

const existeLoteEnLista = (lotes, numeroLote, fechaValidez) => {
  if (!numeroLote) return false;
  const numNorm = String(numeroLote).trim().toUpperCase();
  const fValNorm = normalizarFecha(fechaValidez);

  return lotes.some(lote => {
    const numLoteGrupo = String(lote.numeroLote || '').trim().toUpperCase();
    const fValGrupo = normalizarFecha(lote.fechaValidez);
    return numLoteGrupo === numNorm && fValGrupo === fValNorm;
  });
};

const crearLoteDesdeScanner = (productoData, defaultSucursalId, defaultSucursalNombre) => {
  const numLote = String(productoData.numLote || 'S/L').trim();
  const fValidezRaw = productoData.fechaValidez || null;
  const fValidezNorm = normalizarFecha(fValidezRaw);
  const idAlmSuc = productoData.idalmacensucursal !== null && productoData.idalmacensucursal !== undefined
    ? String(productoData.idalmacensucursal).trim()
    : '0';

  const groupKey = `${numLote.toUpperCase()}__${fValidezNorm}__${idAlmSuc}`;
  const cantExistNum = parseFloat(productoData.cantExistencial ?? 0) || 0;

  return {
    key: groupKey,
    groupKey: groupKey,
    numeroLote: numLote,
    fechaValidez: fValidezRaw,
    idalmacensucursal: productoData.idalmacensucursal,
    idsucursal: productoData.idsucursal || defaultSucursalId,
    nombresucursal: productoData.nombresucursal || defaultSucursalNombre,
    cantidadExistencial: cantExistNum,
    subLotes: [{
      key: `scanner-${Date.now()}`,
      idproductolote: productoData.idproductolote || null,
      idalmacensucursal: productoData.idalmacensucursal,
      numeroLote: numLote,
      fechaRecepcion: productoData.fechaRecepcion || null,
      fechaValidez: fValidezRaw,
      fechaFabricacion: productoData.fechaFabricacion || null,
      cantidadExistencial: cantExistNum,
      idsucursal: productoData.idsucursal || defaultSucursalId,
      nombresucursal: productoData.nombresucursal || defaultSucursalNombre
    }],
    cantInput: '',
    ubicacionInput: '',
    isModified: false,
    esDelScanner: true
  };
};

export default function EditProductScreen({ route, navigation }) {
  const { 
    barcode, 
    ubicacion,
    isNew, 
    user, 
    esObligatorio, 
    fromScanner, 
    productoData,
    idaperturainventario  
  } = route.params || {};
  
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

  // Bloquear botón atrás si es obligatorio
  useEffect(() => {
    if (esObligatorio) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        Alert.alert('Atención', 'Debe guardar la cantidad antes de salir', [{ text: 'OK' }]);
        return true;
      });

      navigation.setOptions({
        headerLeft: () => null,
        gestureEnabled: false,
      });

      return () => backHandler.remove();
    }
  }, [esObligatorio, navigation]);

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
  // - Modo EDITAR: usa almacen.TomaInventario (prellenado + lote del scanner marcado)
  // - Modo SCANNER/NUEVO: usa catálogo del almacén
  // ==========================================
  const loadLotes = async (codigoBarra, loteScanner = null, isEditMode = false) => {
    const idsucursal = user?.sucursalId;

    console.log('🔍 [LOTES] === INICIO ===');
    console.log('   codigoBarra:', codigoBarra);
    console.log('   isEditMode:', isEditMode);
    console.log('   user.id:', user?.id);
    console.log('   loteScanner.numLote:', loteScanner?.numLote);

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
        console.log('📦 [LOTES] Data:', JSON.stringify(registrosProducto, null, 2));

        let grupos = registrosProducto.map((reg, idx) => {
          const cantNueva = parseFloat(reg.cant_Nueva) || 0;
          const ubic = reg.ubicacion || '';
          const numLote = String(reg.numLote || 'S/L').trim();
          const idToma = reg.idTomaInventario || reg.IdTomaInventario || reg.idtomainventario || null;

          // 👇 ¿Este registro corresponde al lote del scanner?
          const esDelScanner = loteScanner && loteScanner.numLote
            ? numLote.toUpperCase() === String(loteScanner.numLote).trim().toUpperCase()
            : false;

          console.log(`   Lote "${numLote}" → esDelScanner: ${esDelScanner}`);

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
            esDelScanner: esDelScanner,  // 👈 MARCA el lote del scanner
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

        // Si viene un lote del scanner que NO está en TomaInventario, lo agregamos
        if (loteScanner && loteScanner.numLote) {
          const yaExiste = existeLoteEnLista(grupos, loteScanner.numLote, loteScanner.fechaValidez);
          if (!yaExiste) {
            console.log('➕ [LOTES] Agregando lote del scanner que no estaba:', loteScanner.numLote);
            const loteNuevo = crearLoteDesdeScanner(loteScanner, idsucursal, user?.sucursalNombre);
            grupos = [loteNuevo, ...grupos];
          }
        }

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
    // ==========================================
    if (!idsucursal) {
      setLotes([]);
      setLoadingLotes(false);
      return;
    }

    try {
      console.log('📦 [LOTES] Modo SCANNER/NUEVO - catálogo del almacén');
      const res = await obtenerLotesGeneral(codigoBarra, idsucursal);

      let agrupados = [];

      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        agrupados = agruparLotesGeneral(res.data, idsucursal, user?.sucursalNombre);
      }

      if (loteScanner && loteScanner.numLote) {
        const yaExiste = existeLoteEnLista(agrupados, loteScanner.numLote, loteScanner.fechaValidez);
        if (!yaExiste) {
          console.log('➕ [LOTES] Agregando lote del scanner:', loteScanner.numLote);
          agrupados = [crearLoteDesdeScanner(loteScanner, idsucursal, user?.sucursalNombre), ...agrupados];
        }
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

        const loteScanner = {
          numLote: productoData.numLote,
          fechaValidez: productoData.fechaValidez,
          fechaRecepcion: productoData.fechaRecepcion,
          fechaFabricacion: productoData.fechaFabricacion,
          cantExistencial: productoData.cantExistencial,
          cant_Nueva: productoData.cant_Nueva,
          ubicacion: productoData.ubicacion,
          idproductolote: productoData.idproductolote,
          idalmacensucursal: productoData.idalmacensucursal,
          idsucursal: productoData.idsucursal,
          nombresucursal: productoData.nombresucursal
        };

        // Detectar si el producto ya existe en TomaInventario
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
          await loadLotes(codigoBarraFinal, loteScanner, true);
        } else {
          console.log('📷 [EDIT] Producto NUEVO → modo SCANNER');
          setModoEditarReal(false);
          await loadLotes(codigoBarraFinal, loteScanner, false);
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

        let loteScanner = null;
        if (productoData && productoData.numLote) {
          loteScanner = {
            numLote: productoData.numLote,
            fechaValidez: productoData.fechaValidez,
            fechaRecepcion: productoData.fechaRecepcion,
            fechaFabricacion: productoData.fechaFabricacion,
            cantExistencial: productoData.cantExistencial,
            cant_Nueva: productoData.cant_Nueva,
            ubicacion: productoData.ubicacion,
            idproductolote: productoData.idproductolote,
            idalmacensucursal: productoData.idalmacensucursal,
            idsucursal: productoData.idsucursal,
            nombresucursal: productoData.nombresucursal
          };
        } else if (existingTake.numLote) {
          loteScanner = {
            numLote: existingTake.numLote,
            fechaValidez: existingTake.fechaValidez,
            fechaRecepcion: existingTake.fechaRecepcion,
            fechaFabricacion: existingTake.fechaFabricacion,
            cantExistencial: existingTake.cantExistencial,
            cant_Nueva: existingTake.cant_Nueva,
            ubicacion: existingTake.ubicacion,
            idproductolote: existingTake.idproductolote,
            idalmacensucursal: existingTake.idalmacensucursal,
            idsucursal: existingTake.idsucursal,
            nombresucursal: existingTake.nombresucursal
          };
        }

        setModoEditarReal(true);
        await loadLotes(existingTake.codigobarra || barcode, loteScanner, true);
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

  // ==========================================
  // GUARDAR
  // ==========================================
  const handleSave = async () => {
    if (!lotes || lotes.length === 0) {
      Alert.alert('Atención', 'No hay lotes para registrar');
      return;
    }

    setSaving(true);
    let exitoTotal = true;
    const errores = [];

    try {
      // ==========================================
      // EDITAR: eliminar previos + reinsertar
      // ==========================================
      if (modoEditarReal) {
        // PASO 1: Eliminar registros previos
        console.log('🗑️ Eliminando registros previos...');
        for (const lote of lotes) {
          if (lote.idTomaInventario) {
            try {
              console.log('   Eliminando idTomaInventario:', lote.idTomaInventario);
              await eliminarTomaInventario(lote.idTomaInventario);
            } catch (errDel) {
              console.error('   ❌ Error eliminando:', lote.idTomaInventario, errDel);
            }
          }
        }
        console.log('✅ Registros previos eliminados');

        // PASO 2: Reinsertar
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
            sucursal_destino: product.sucursal_destino,
            ubicacion: ubicacionLote,
            cant_Nueva: cantNueva
          };

          console.log('💾 Reinsertando lote:', lote.numeroLote, '| cant:', cantNueva, '| ubic:', ubicacionLote);
          const res = await insertTomaInventario(payload, user, idaperturainventario);

          const isSuccess = res?.Success === 1 || res?.success === true;
          if (!isSuccess) {
            exitoTotal = false;
            errores.push(`Lote ${lote.numeroLote}: ${res?.Message || res?.message || 'Error'}`);
          }
        }
      }
      // ==========================================
      // INSERTAR: nuevo (scanner o manual)
      // ==========================================
      else {
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

          console.log('💾 Insertando lote:', lote.numeroLote, '| cant:', cantNueva, '| ubic:', ubicacionLote);
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
        navigation.navigate('Inventory', { user, actualizarLista: true });
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
    if (esObligatorio) {
      Alert.alert('Atención', 'Debe guardar la cantidad antes de salir');
    } else {
      navigation.navigate('Inventory', { user });
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
      
      {/* DATOS DEL PRODUCTO */}
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

      {/* TABLA DE LOTES */}
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
                ? 'No se encontraron lotes para este producto'
                : filtroCantidad === 'CON_CANTIDAD'
                  ? 'No hay lotes con cantidad > 0'
                  : filtroCantidad === 'SIN_CANTIDAD'
                    ? 'No hay lotes con cantidad en 0'
                    : 'Sin lotes para mostrar'}
            </Text>
          </View>
        ) : (
          lotesFiltrados.map((lote, index) => (
            <View 
              key={lote.key || index} 
              style={[
                styles.tableRow, 
                index % 2 === 1 && styles.tableRowAlt,
                lote.esDelScanner && styles.tableRowScanner
              ]}
            >
              <View style={styles.colLote}>
                <Text style={styles.loteText}>
                  {lote.numeroLote}
                  {lote.esDelScanner ? '  📷' : ''}
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
  tableRowScanner: {
    backgroundColor: '#fff7e6',
    borderLeftWidth: 3,
    borderLeftColor: '#f39c12',
  },
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