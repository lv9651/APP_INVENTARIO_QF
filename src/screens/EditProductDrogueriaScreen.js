import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ScrollView, 
  ActivityIndicator, 
  BackHandler 
} from 'react-native';
import { 
  obtenerProductoInfoByCodigoBarras,
  obtenerLotesProductoByCodigoBarra,
  insertProductoInventariadoDrogueria,
  obtenerProductoInventariadoDrogueria,
  updateProductoInventariadoDrogueria,
  GuardarEditarSububicacion,
  ObtenerSububicacion
} from '../services/api';

/**
 * Normaliza una fecha a formato YYYY-MM-DD para evitar fallos de agrupación por hora/zona.
 */
const normalizarFecha = (fecha) => {
  if (!fecha) return 'SIN_FECHA';
  try {
    const str = String(fecha).trim();
    const part = str.split('T')[0].split(' ')[0].trim();
    if (part.length === 10 && part.includes('-')) {
      return part;
    }
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

/**
 * Obtiene el timestamp numérico de una fecha para ordenar de más reciente a más antigua.
 */
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
 * Agrupa los lotes con características idénticas (numeroLote, fechaValidez, idalmacensucursal).
 * La cantidadExistencial del grupo es la suma de los sublotes (para filtros).
 * En la tabla visual, cantidadExistencial permanece oculta.
 */
const agruparLotes = (rawList, isEditMode = false, defaultSucursalId = 66, defaultSucursalNombre = 'Q. F. DROGUERIA') => {
  const gruposMap = new Map();

  rawList.forEach((item, idx) => {
    const numLote = String(item.numeroLote || item.numLote || 'S/L').trim();
    const fValidezRaw = item.fechaValidez || item.fechavalidez || null;
    const fValidezNorm = normalizarFecha(fValidezRaw);
    const idAlmSuc = item.idalmacensucursal !== null && item.idalmacensucursal !== undefined
      ? String(item.idalmacensucursal).trim()
      : '0';

    const groupKey = `${numLote.toUpperCase()}__${fValidezNorm}__${idAlmSuc}`;

    const cantExistNum = parseFloat(item.cantidadExistencial ?? item.cantExistencial ?? 0) || 0;
    const cantNuevaNum = parseFloat(item.cant_nueva ?? item.cantNueva ?? 0) || 0;

    const subLoteObj = {
      key: `${item.idproductolote || idx}`,
      idproductolote: item.idproductolote,
      idalmacensucursal: item.idalmacensucursal,
      numeroLote: numLote,
      fechaRecepcion: item.fechaRecepcion || item.fecharecepcion || null,
      fechaValidez: fValidezRaw,
      fechaFabricacion: item.fechaFabricacion || item.fechafabricacion || null,
      cantidadExistencial: cantExistNum,
      cantNueva: String(cantNuevaNum),
      cant_nueva: cantNuevaNum,
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
        subLotes: [subLoteObj]
      });
    } else {
      const grupo = gruposMap.get(groupKey);
      grupo.cantidadExistencial += cantExistNum;
      grupo.subLotes.push(subLoteObj);
    }
  });

  return Array.from(gruposMap.values()).map(grupo => {
    // Ordenar sublotes: fechaRecepcion más reciente primero. Desempate por idproductolote desc.
    grupo.subLotes.sort((a, b) => {
      const tA = obtenerTimestamp(a.fechaRecepcion);
      const tB = obtenerTimestamp(b.fechaRecepcion);
      if (tB !== tA) return tB - tA;
      return (Number(b.idproductolote) || 0) - (Number(a.idproductolote) || 0);
    });

    let cantInputInicial = '0';
    if (isEditMode) {
      // En modo edición, el sublote más reciente contiene el valor asignado previamente
      const cantMasReciente = grupo.subLotes[0]?.cantNueva;
      cantInputInicial = cantMasReciente !== undefined && cantMasReciente !== null ? String(cantMasReciente) : '0';
    }

    return {
      ...grupo,
      cantInput: cantInputInicial,
      cantNueva: cantInputInicial,
      isModified: false
    };
  });
};

export default function EditProductDrogueriaScreen({ route, navigation }) {
  const { 
    barcode, 
    isNew, 
    user, 
    fromScanner, 
    idaperturainventario,
    inventarioActivo,
    idubicacion
  } = route.params || {};

  const idUbicacionFinal = idubicacion || route.params?.inventarioActivo?.idubicacion || inventarioActivo?.idubicacion || null;
  const idAperturaFinal = idaperturainventario || route.params?.inventarioActivo?.idaperturainventario || route.params?.inventarioActivo?.id || inventarioActivo?.idaperturainventario || inventarioActivo?.id || null;

  const invActivoParaRegreso = route.params?.inventarioActivo || inventarioActivo || (
    idAperturaFinal ? { idaperturainventario: idAperturaFinal, idubicacion: idUbicacionFinal } : null
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Información de cabecera del producto
  const [productInfo, setProductInfo] = useState({
    codigoBarras: barcode || '',
    idproducto: '',
    descripcion: '',
    idlaboratorio: null,
    laboratorio: '',
    precioc: 0,
    sucursal: user?.sucursalNombre || 'Q. F. DROGUERIA',
    multiplo: 1
  });

  // Lista de lotes para la tabla
  const [lotes, setLotes] = useState([]);
  // Copia de los lotes originales para detectar qué filas cambiaron al editar
  const [lotesOriginales, setLotesOriginales] = useState([]);
  // Filtro visual: 'CON_CANTIDAD' (por defecto) | 'SIN_CANTIDAD' | 'TODOS'
  const [filtroCantidad, setFiltroCantidad] = useState('CON_CANTIDAD');
  // Sububicaciones del producto
  const [sububicacion, setSububicacion] = useState('');
  const [sububicacionOriginal, setSububicacionOriginal] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      if (fromScanner || isNew) {
        // ==========================================
        // CASO 1: VIENE DEL ESCÁNER / NUEVO PRODUCTO
        // ==========================================
        console.log('📱 Droguería - Cargando datos para nuevo escaneo:', barcode, 'idubicacion:', idUbicacionFinal);

        const [infoRes, lotesRes] = await Promise.all([
          obtenerProductoInfoByCodigoBarras(barcode, idUbicacionFinal),
          obtenerLotesProductoByCodigoBarra(barcode, idUbicacionFinal)
        ]);

        console.log('📦 Info producto recibida:', infoRes);
        console.log('📦 Lotes recibidos:', lotesRes);

        // Extraer objeto de información del producto
        const rawInfo = Array.isArray(infoRes) ? infoRes[0] : infoRes;

        if (!rawInfo || (!rawInfo.idproducto && !rawInfo.idProducto && !rawInfo.codigoBarras && !rawInfo.descripcion)) {
          Alert.alert(
            '❌ NO ENCONTRADO', 
            `No se encontró información del producto para el código escaneado:\n\nCódigo: ${barcode}`
          );
          navigation.goBack();
          return;
        }

        const codigo = rawInfo.codigoBarras || barcode;
        const idProd = rawInfo.idproducto || '';
        const desc = rawInfo.descripcion || '';
        const idlab = rawInfo.idlaboratorio || null;
        const lab = rawInfo.laboratorio || '';
        const precioc = rawInfo.precioc || 0;
        const multiplo = rawInfo.multiplo || 1;

        setProductInfo({
          codigoBarras: codigo,
          idproducto: String(idProd),
          descripcion: desc,
          idlaboratorio: idlab,
          laboratorio: lab,
          precioc: precioc,
          sucursal: user?.sucursalNombre || 'Q. F. DROGUERIA',
          multiplo: multiplo
        });

        // Extraer lista de lotes
        const rawLotesList = Array.isArray(lotesRes) ? lotesRes : (lotesRes ? [lotesRes] : []);

        if (!rawLotesList || rawLotesList.length === 0) {
          Alert.alert('⚠️ Advertencia', `El producto (Código: ${barcode}) no tiene lotes registrados.`);
        }

        const lotesAgrupados = agruparLotes(
          rawLotesList, 
          false, 
          user?.sucursalId || 66, 
          user?.sucursalNombre || 'Q. F. DROGUERIA'
        );

        setLotes(lotesAgrupados);
        setLotesOriginales([]);
        setSububicacion('');
        setSububicacionOriginal('');
      } else {
        // ==========================================
        // CASO 2: EDITAR PRODUCTO YA INVENTARIADO
        // ==========================================
        console.log('✏️ Droguería - Cargando producto ya inventariado:', barcode, 'Apertura:', idaperturainventario);

        const data = await obtenerProductoInventariadoDrogueria(barcode, idaperturainventario);
        console.log('📦 Producto inventariado obtenido:', data);

        const rawList = Array.isArray(data) ? data : (data ? [data] : []);

        if (!rawList || rawList.length === 0) {
          Alert.alert(
            'Error', 
            `No se encontraron registros de inventario para el producto.\n\nCódigo: ${barcode}`
          );
          navigation.goBack();
          return;
        }

        const primerReg = rawList[0];
        const idProd = primerReg.idproducto || '';
        setProductInfo({
          codigoBarras: primerReg.codigoBarra || barcode,
          idproducto: String(idProd),
          descripcion: primerReg.descripcion || '',
          idlaboratorio: primerReg.idlaboratorio,
          laboratorio: primerReg.laboratorio,
          precioc: primerReg.precioc,
          sucursal: primerReg.nombresucursal || user?.sucursalNombre || 'Q. F. DROGUERIA',
          multiplo: primerReg.multiplo
        });

        // Obtener sububicación existente para el producto en edición
        if (idProd) {
          try {
            console.log('🔍 Consultando sububicación para idapertura:', idAperturaFinal, 'idproducto:', idProd);
            const subRes = await ObtenerSububicacion(idAperturaFinal, idProd);
            console.log('📍 Sububicación obtenida:', subRes);
            const subTexto = subRes?.descripcion || subRes?.Descripcion || '';
            setSububicacion(String(subTexto || ''));
            setSububicacionOriginal(String(subTexto || ''));
          } catch (errSub) {
            console.error('❌ Error al obtener sububicación:', errSub);
            setSububicacion('');
            setSububicacionOriginal('');
          }
        } else {
          setSububicacion('');
          setSububicacionOriginal('');
        }

        const lotesAgrupados = agruparLotes(
          rawList, 
          true, 
          primerReg.idsucursal || user?.sucursalId || 66, 
          primerReg.nombresucursal || user?.sucursalNombre || 'Q. F. DROGUERIA'
        );

        setLotes(lotesAgrupados);
        // Guardamos copia de los valores iniciales para comparar cambios
        setLotesOriginales(JSON.parse(JSON.stringify(lotesAgrupados)));
      }
    } catch (error) {
      console.error('❌ Error en loadInitialData:', error);
      Alert.alert('Error', `Ocurrió un problema al cargar los datos para el código "${barcode}": ${error.message}`, [
        { 
          text: 'Volver', 
          onPress: () => navigation.navigate('InventoryDrogueria', {
            user: user,
            inventarioActivo: invActivoParaRegreso,
            idaperturainventario: idaperturainventario
          }) 
        }
      ]);
    } finally {
      setLoading(false);
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

  const handleCantidadChange = (text, keyOrId) => {
    setLotes(prevLotes =>
      prevLotes.map(lote =>
        (lote.key === keyOrId || lote.groupKey === keyOrId || lote.idproductolote === keyOrId)
          ? { 
              ...lote, 
              cantInput: text,
              cantNueva: text,
              isModified: true
            }
          : lote
      )
    );
  };

  // Filtrar lotes según el filtro seleccionado
  const lotesFiltrados = lotes.filter(lote => {
    const cantExistencial = parseFloat(lote.cantidadExistencial) || 0;
    if (filtroCantidad === 'CON_CANTIDAD') {
      return cantExistencial > 0;
    } else if (filtroCantidad === 'SIN_CANTIDAD') {
      return cantExistencial <= 0;
    }
    return true; // 'TODOS'
  });

  const handleSave = async () => {
    // Validar que exista al menos un lote
    if (lotes.length === 0) {
      Alert.alert('Atención', 'No hay lotes disponibles para registrar.');
      return;
    }

    setSaving(true);

    try {
      if (fromScanner || isNew) {
        // ==========================================
        // GUARDAR: INSERCIÓN (NUEVO ESCANEO)
        // ==========================================
        console.log('💾 Droguería - Insertando todos los registros de lotes cargados...');
        console.log("[EditProductDrogueria] IDAPERTURAINVENTARIO: ", idaperturainventario);

        let exitoTotal = true;
        let errores = [];

        for (const grupo of lotes) {
          const cantNuevaTotal = grupo.isModified
            ? (grupo.cantInput !== '' && !isNaN(parseFloat(grupo.cantInput)) ? parseFloat(grupo.cantInput) : 0)
            : 0;
          const precioc = parseFloat(productInfo.precioc) || 0;

          // Asegurar orden de sublotes: fechaRecepcion más reciente primero
          const sortedSubLotes = [...grupo.subLotes].sort((a, b) => {
            const tA = obtenerTimestamp(a.fechaRecepcion);
            const tB = obtenerTimestamp(b.fechaRecepcion);
            if (tB !== tA) return tB - tA;
            return (Number(b.idproductolote) || 0) - (Number(a.idproductolote) || 0);
          });

          for (let i = 0; i < sortedSubLotes.length; i++) {
            const subLote = sortedSubLotes[i];
            const cantExist = parseFloat(subLote.cantidadExistencial ?? subLote.cantExistencial ?? 0) || 0;
            // Solo el lote con la fechaRecepcion más reciente recibe la cantidad a ajustar; los demás reciben 0
            const cantNuevaVal = (i === 0) ? cantNuevaTotal : 0;

            const payload = {
              codigobarra: productInfo.codigoBarras,
              idProducto: productInfo.idproducto,
              NombreProducto: productInfo.descripcion,
              idlaboratorio: productInfo.idlaboratorio,
              laboratorio: productInfo.laboratorio,
              precioc: precioc,
              multiplo: productInfo.multiplo,
              idproductolote: subLote.idproductolote,
              idalmacensucursal: subLote.idalmacensucursal,
              numLote: subLote.numeroLote,
              fecharecepcion: subLote.fechaRecepcion,
              fechavalidez: subLote.fechaValidez,
              fechafabricacion: subLote.fechaFabricacion,
              cantExistencial: cantExist,
              cant_Nueva: cantNuevaVal,
              idsucursal: subLote.idsucursal || user?.sucursalId || 66,
              nombresucursal: subLote.nombresucursal || 'Q. F. DROGUERIA'
            };

            const res = await insertProductoInventariadoDrogueria(payload, user, idaperturainventario);
            if (!res || !res.success) {
              exitoTotal = false;
              errores.push(`Lote ${subLote.numeroLote}: ${res?.message || 'Error al guardar'}`);
            }
          }
        }

        // Si el usuario ingresó texto en sububicación, se guarda con GuardarEditarSububicacion
        if (productInfo.idproducto && sububicacion.trim() !== '') {
          try {
            console.log('📍 Guardando sububicación para nuevo producto:', idAperturaFinal, productInfo.idproducto, sububicacion.trim());
            const subRes = await GuardarEditarSububicacion(
              idAperturaFinal,
              Number(productInfo.idproducto),
              sububicacion.trim()
            );
            console.log('📍 Resultado GuardarEditarSububicacion:', subRes);
            if (!subRes || !subRes.success) {
              errores.push(`Sububicación: ${subRes?.message || 'Error al guardar sububicación'}`);
              exitoTotal = false;
            }
          } catch (errSub) {
            console.error('❌ Error guardando sububicacion en nuevo escaneo:', errSub);
            errores.push(`Sububicación: ${errSub.message || 'Error al guardar'}`);
            exitoTotal = false;
          }
        }

        if (exitoTotal) {
          Alert.alert('✅ Éxito', 'Lotes registrados correctamente en el inventario.');
          navigation.navigate('InventoryDrogueria', {
            user: user,
            inventarioActivo: invActivoParaRegreso,
            idaperturainventario: idaperturainventario,
            actualizarLista: true
          });
        } else {
          Alert.alert('⚠️ Advertencia', 'Algunos registros no pudieron guardarse:\n' + errores.join('\n'));
          navigation.navigate('InventoryDrogueria', {
            user: user,
            inventarioActivo: invActivoParaRegreso,
            idaperturainventario: idaperturainventario,
            actualizarLista: true
          });
        }
      } else {
        // ==========================================
        // GUARDAR: ACTUALIZACIÓN (EDICIÓN)
        // ==========================================
        console.log('✏️ Droguería - Actualizando filas modificadas...');

        const sububicacionCambio = sububicacion.trim() !== sububicacionOriginal.trim();
        // Identificar qué filas fueron modificadas por el usuario
        const filasModificadas = lotes.filter(lote => lote.isModified);

        if (filasModificadas.length === 0 && !sububicacionCambio) {
          Alert.alert('Información', 'No se realizaron cambios en las cantidades ni en las sububicaciones.');
          navigation.navigate('InventoryDrogueria', { 
            user: user,
            inventarioActivo: invActivoParaRegreso,
            idaperturainventario: idaperturainventario 
          });
          setSaving(false);
          return;
        }

        let exitoTotal = true;
        let errores = [];

        // 1. Si cambió la sububicación, actualizarla
        if (sububicacionCambio && productInfo.idproducto) {
          try {
            console.log('📍 Actualizando sububicación en edición:', idAperturaFinal, productInfo.idproducto, sububicacion.trim());
            const subRes = await GuardarEditarSububicacion(
              idAperturaFinal,
              Number(productInfo.idproducto),
              sububicacion.trim()
            );
            console.log('📍 Resultado GuardarEditarSububicacion (edición):', subRes);
            if (!subRes || !subRes.success) {
              exitoTotal = false;
              errores.push(`Sububicación: ${subRes?.message || 'Error al actualizar sububicación'}`);
            }
          } catch (errSub) {
            console.error('❌ Error actualizando sububicación:', errSub);
            exitoTotal = false;
            errores.push(`Sububicación: ${errSub.message || 'Error al actualizar'}`);
          }
        }

        // 2. Si hay grupos de lotes modificados, actualizarlos
        for (const grupo of filasModificadas) {
          const cantNuevaNum = grupo.cantInput !== '' && !isNaN(parseFloat(grupo.cantInput))
            ? parseFloat(grupo.cantInput)
            : 0;

          const sortedSubLotes = [...grupo.subLotes].sort((a, b) => {
            const tA = obtenerTimestamp(a.fechaRecepcion);
            const tB = obtenerTimestamp(b.fechaRecepcion);
            if (tB !== tA) return tB - tA;
            return (Number(b.idproductolote) || 0) - (Number(a.idproductolote) || 0);
          });

          // El lote con la fechaRecepcion más reciente recibe la cantidad a ajustar
          const loteMasReciente = sortedSubLotes[0];
          const res = await updateProductoInventariadoDrogueria(
            productInfo.codigoBarras,
            loteMasReciente.idproductolote,
            cantNuevaNum,
            idaperturainventario
          );

          if (!res || !res.success) {
            exitoTotal = false;
            errores.push(`Lote ${loteMasReciente.numeroLote} (ID: ${loteMasReciente.idproductolote}): ${res?.message || 'Error al actualizar'}`);
          }

          // Los demás sublotes del grupo se aseguran en 0 si no estaban ya en 0
          for (let i = 1; i < sortedSubLotes.length; i++) {
            const sub = sortedSubLotes[i];
            const currentCant = parseFloat(sub.cantNueva ?? sub.cant_nueva ?? 0) || 0;
            if (currentCant !== 0) {
              const resSub = await updateProductoInventariadoDrogueria(
                productInfo.codigoBarras,
                sub.idproductolote,
                0,
                idaperturainventario
              );
              if (!resSub || !resSub.success) {
                exitoTotal = false;
                errores.push(`Lote ${sub.numeroLote} (ID: ${sub.idproductolote}): ${resSub?.message || 'Error al actualizar a 0'}`);
              }
            }
          }
        }

        if (exitoTotal) {
          Alert.alert('✅ Éxito', 'Cambios actualizados correctamente.');
          navigation.navigate('InventoryDrogueria', {
            user: user,
            inventarioActivo: invActivoParaRegreso,
            idaperturainventario: idaperturainventario,
            actualizarLista: true
          });
        } else {
          Alert.alert('⚠️ Advertencia', 'Algunos datos no pudieron actualizarse:\n' + errores.join('\n'));
          navigation.navigate('InventoryDrogueria', {
            user: user,
            inventarioActivo: invActivoParaRegreso,
            idaperturainventario: idaperturainventario,
            actualizarLista: true
          });
        }
      }
    } catch (error) {
      console.error('❌ Error al guardar en Droguería:', error);
      Alert.alert('Error', 'Ocurrió un error al procesar la solicitud: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigation.navigate('InventoryDrogueria', { 
      user: user,
      inventarioActivo: invActivoParaRegreso,
      idaperturainventario: idaperturainventario
    });
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Cargando información del producto...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>
        {fromScanner || isNew ? '📷 Registro por Lotes' : '✏️ Editar Lotes del Producto'}
      </Text>

      {/* Badge Código de Barras */}
      <View style={styles.badgeContainer}>
        <Text style={styles.badgeText}>📷 Código: {productInfo.codigoBarras}</Text>
      </View>

      {/* Tarjeta de Información General */}
      <View style={styles.card}>
        {/* Fila Horizontal: ID Producto y Sucursal */}
        <View style={styles.rowInputs}>
          <View style={styles.colInput}>
            <Text style={styles.label}>🆔 ID Producto</Text>
            <TextInput
              style={[styles.input, styles.disabledInput]}
              value={productInfo.idproducto}
              editable={false}
              placeholder="ID de Producto"
            />
          </View>

          <View style={styles.colInput}>
            <Text style={styles.label}>🏢 Sucursal</Text>
            <TextInput
              style={[styles.input, styles.disabledInput]}
              value={productInfo.sucursal}
              editable={false}
              placeholder="Sucursal"
            />
          </View>
        </View>

        <Text style={styles.label}>📝 Descripción</Text>
        <TextInput
          style={[styles.input, styles.disabledInput, styles.textArea]}
          value={productInfo.descripcion}
          editable={false}
          multiline
          numberOfLines={2}
          placeholder="Descripción del producto"
        />

        <Text style={styles.label}>📍 Sububicaciones</Text>
        <TextInput
          style={styles.input}
          value={sububicacion}
          onChangeText={setSububicacion}
          placeholder="Ingresar sububicaciones..."
          placeholderTextColor="#94a3b8"
          editable={true}
        />
      </View>

      {/* Sección Tabla de Lotes */}
      <View style={styles.tableCard}>
        <Text style={styles.tableTitle}>📦 Lotes del Producto</Text>

        {/* Combo / Selector de Filtro */}
        <View style={styles.filterContainer}>
          <TouchableOpacity 
            style={[
              styles.filterTab, 
              filtroCantidad === 'CON_CANTIDAD' && styles.filterTabActive
            ]}
            onPress={() => setFiltroCantidad('CON_CANTIDAD')}
          >
            <Text style={[
              styles.filterTabText, 
              filtroCantidad === 'CON_CANTIDAD' && styles.filterTabTextActive
            ]}>
              Con cantidad
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.filterTab, 
              filtroCantidad === 'SIN_CANTIDAD' && styles.filterTabActive
            ]}
            onPress={() => setFiltroCantidad('SIN_CANTIDAD')}
          >
            <Text style={[
              styles.filterTabText, 
              filtroCantidad === 'SIN_CANTIDAD' && styles.filterTabTextActive
            ]}>
              Sin Cantidad
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.filterTab, 
              filtroCantidad === 'TODOS' && styles.filterTabActive
            ]}
            onPress={() => setFiltroCantidad('TODOS')}
          >
            <Text style={[
              styles.filterTabText, 
              filtroCantidad === 'TODOS' && styles.filterTabTextActive
            ]}>
              Todos
            </Text>
          </TouchableOpacity>
        </View>

        {/* Cabecera de la Tabla */}
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.colLote]}>Lote</Text>
          <Text style={[styles.headerCell, styles.colAjustar]}>Cantidad a Ajustar</Text>
        </View>

        {/* Filas de la Tabla */}
        {lotesFiltrados.length === 0 ? (
          <View style={styles.emptyTable}>
            <Text style={styles.emptyTableText}>
              {filtroCantidad === 'CON_CANTIDAD'
                ? 'No hay lotes con cantidad actual > 0'
                : filtroCantidad === 'SIN_CANTIDAD'
                  ? 'No hay lotes con cantidad actual en 0'
                  : 'No se encontraron lotes para este producto'}
            </Text>
          </View>
        ) : (
          lotesFiltrados.map((lote, index) => (
            <View 
              key={lote.key || lote.idproductolote || index} 
              style={[
                styles.tableRow, 
                index % 2 === 1 && styles.tableRowAlt
              ]}
            >
              {/* Columna Lote con Fecha de Validez debajo */}
              <View style={styles.colLote}>
                <Text style={styles.loteText}>{lote.numeroLote}</Text>
                {formatFechaValidez(lote.fechaValidez) ? (
                  <Text style={styles.vencimientoText}>
                    📅 {formatFechaValidez(lote.fechaValidez)}
                  </Text>
                ) : null}
              </View>

              {/* Columna Cantidad Ajustar */}
              <View style={styles.colAjustar}>
                <TextInput
                  style={styles.ajustarInput}
                  value={lote.cantInput}
                  onChangeText={(text) => handleCantidadChange(text, lote.key || lote.groupKey || lote.idproductolote)}
                  placeholder="0"
                  placeholderTextColor="#bbb"
                  keyboardType="numeric"
                />
              </View>
            </View>
          ))
        )}
      </View>

      {/* Botones de Acción */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={handleCancel}>
          <Text style={styles.buttonText}>Cancelar</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.saveButton]} 
          onPress={handleSave} 
          disabled={saving}
        >
          <Text style={styles.buttonText}>{saving ? 'Guardando...' : '💾 Guardar'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { padding: 15 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#7f8c8d', fontSize: 14 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12, color: '#2c3e50', textAlign: 'center' },
  badgeContainer: {
    backgroundColor: '#34495e',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 10, 
    padding: 14, 
    marginBottom: 15, 
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  rowInputs: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    gap: 10 
  },
  colInput: { 
    flex: 1 
  },
  label: { fontSize: 13, fontWeight: 'bold', color: '#2c3e50', marginTop: 8, marginBottom: 4 },
  input: { 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    padding: 10, 
    fontSize: 14, 
    backgroundColor: '#fff',
    color: '#2c3e50'
  },
  disabledInput: { backgroundColor: '#f8fafc', color: '#475569' },
  textArea: { minHeight: 50, textAlignVertical: 'top' },

  // Estilos de la tabla
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
  filterTabActive: {
    backgroundColor: '#3498db',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  filterTabTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2c3e50',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  headerCell: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tableRowAlt: {
    backgroundColor: '#f8fafc',
  },
  colLote: {
    flex: 1.4,
    paddingRight: 8,
    justifyContent: 'center',
  },
  colAjustar: {
    flex: 1,
    paddingLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loteText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
    flexWrap: 'wrap',
  },
  vencimientoText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  actualText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
  },
  ajustarInput: {
    borderWidth: 1.5,
    borderColor: '#27ae60',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: '#fff',
    width: '90%',
    color: '#27ae60'
  },
  emptyTable: {
    padding: 20,
    alignItems: 'center',
  },
  emptyTableText: {
    color: '#94a3b8',
    fontSize: 13,
    fontStyle: 'italic',
  },

  // Botones
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 20 },
  button: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  saveButton: { backgroundColor: '#27ae60' },
  cancelButton: { backgroundColor: '#95a5a6' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  bottomSpace: { height: 30 }
});
