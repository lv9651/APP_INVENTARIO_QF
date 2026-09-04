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
  updateProductoInventariadoDrogueria
} from '../services/api';

export default function EditProductDrogueriaScreen({ route, navigation }) {
  const { 
    barcode, 
    isNew, 
    user, 
    fromScanner, 
    idaperturainventario 
  } = route.params || {};

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
    sucursal: user?.sucursalNombre || 'Q. F. DROGUERIA'
  });

  // Lista de lotes para la tabla
  const [lotes, setLotes] = useState([]);
  // Copia de los lotes originales para detectar qué filas cambiaron al editar
  const [lotesOriginales, setLotesOriginales] = useState([]);
  // Filtro visual: 'CON_CANTIDAD' (por defecto) | 'SIN_CANTIDAD' | 'TODOS'
  const [filtroCantidad, setFiltroCantidad] = useState('CON_CANTIDAD');

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
        console.log('📱 Droguería - Cargando datos para nuevo escaneo:', barcode);

        const [infoRes, lotesRes] = await Promise.all([
          obtenerProductoInfoByCodigoBarras(barcode),
          obtenerLotesProductoByCodigoBarra(barcode)
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

        setProductInfo({
          codigoBarras: codigo,
          idproducto: String(idProd),
          descripcion: desc,
          idlaboratorio: idlab,
          laboratorio: lab,
          precioc: precioc,
          sucursal: user?.sucursalNombre || 'Q. F. DROGUERIA'
        });

        // Extraer lista de lotes
        const rawLotesList = Array.isArray(lotesRes) ? lotesRes : (lotesRes ? [lotesRes] : []);

        if (!rawLotesList || rawLotesList.length === 0) {
          Alert.alert('⚠️ Advertencia', `El producto (Código: ${barcode}) no tiene lotes registrados.`);
        }

        const lotesFormateados = rawLotesList.map((item, idx) => {
          const cantExist = item.cantidadExistencial ?? 0;
          return {
            key: `${item.idproductolote || idx}`,
            idproductolote: item.idproductolote,
            numeroLote: item.numeroLote || 'S/L',
            fechaRecepcion: item.fecharecepcion || null,
            fechaValidez: item.fechavalidez || null,
            fechaFabricacion: item.fechafabricacion || null,
            cantidadExistencial: cantExist,
            cantNueva: String(cantExist), // Valor interno por debajo
            cantInput: '0',               // Valor visual mostrado en pantalla
            isModified: false,            // Indica si el usuario editó este campo
            idsucursal: item.idsucursal || user?.sucursalId || 66,
            nombresucursal: item.nombresucursal || 'Q. F. DROGUERIA'
          };
        });

        setLotes(lotesFormateados);
        setLotesOriginales([]);
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
        setProductInfo({
          codigoBarras: primerReg.codigoBarra || barcode,
          idproducto: String(primerReg.idproducto || ''),
          descripcion: primerReg.descripcion || '',
          idlaboratorio: primerReg.idlaboratorio,
          laboratorio: primerReg.laboratorio,
          precioc: primerReg.precioc,
          sucursal: primerReg.nombresucursal || user?.sucursalNombre || 'Q. F. DROGUERIA'
        });

        const lotesCargados = rawList.map((item, idx) => {
          const cantExist = item.cantExistencial ?? 0;
          const yaModificado = item.cant_nueva !== null && item.cant_nueva !== undefined && Math.abs(parseFloat(item.cant_nueva) - parseFloat(cantExist)) > 0.0001;
          const cantNuevaVal = item.cant_nueva !== null && item.cant_nueva !== undefined
            ? String(item.cant_nueva)
            : String(cantExist);

          // Si ya tenía una cantidad modificada distinta del existencial, se muestra ese valor; de lo contrario '0' visualmente
          const visualVal = yaModificado ? String(item.cant_nueva) : '0';

          return {
            key: `${item.idproductolote || idx}`,
            idproductolote: item.idproductolote,
            numeroLote: item.numLote || 'S/L',
            fechaRecepcion: item.fecharecepcion || null,
            fechaValidez: item.fechavalidez || null,
            fechaFabricacion: item.fechafabricacion || null,
            cantidadExistencial: cantExist,
            cantNueva: cantNuevaVal,
            cantInput: visualVal,
            isModified: yaModificado,
            idsucursal: item.idsucursal || user?.sucursalId || 66,
            nombresucursal: item.nombresucursal || user?.sucursalNombre || 'Q. F. DROGUERIA'
          };
        });

        setLotes(lotesCargados);
        // Guardamos copia de los valores iniciales para comparar cambios
        setLotesOriginales(JSON.parse(JSON.stringify(lotesCargados)));
      }
    } catch (error) {
      console.error('❌ Error en loadInitialData:', error);
      Alert.alert('Error', `Ocurrió un problema al cargar los datos para el código "${barcode}": ${error.message}`, [
        { 
          text: 'Volver', 
          onPress: () => navigation.navigate('InventoryDrogueria', {
            user: user,
            inventarioActivo: route.params?.inventarioActivo || { idaperturainventario: idaperturainventario },
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
        (lote.key === keyOrId || lote.idproductolote === keyOrId)
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

        for (const lote of lotes) {
          const cantExist = parseFloat(lote.cantidadExistencial) || 0;
          // Si el usuario modificó el campo, toma el valor ingresado; si no lo tocó (0 visual), guarda igual a la cantidad actual
          const cantNuevaVal = lote.isModified
            ? (lote.cantInput !== '' && !isNaN(parseFloat(lote.cantInput)) ? parseFloat(lote.cantInput) : 0)
            : cantExist;
          const precioc = parseFloat(productInfo.precioc) || 0;

          const payload = {
            codigobarra: productInfo.codigoBarras,
            idProducto: productInfo.idproducto,
            NombreProducto: productInfo.descripcion,
            idlaboratorio: productInfo.idlaboratorio,
            laboratorio: productInfo.laboratorio,
            precioc: precioc,
            idproductolote: lote.idproductolote,
            numLote: lote.numeroLote,
            fecharecepcion: lote.fechaRecepcion,
            fechavalidez: lote.fechaValidez,
            fechafabricacion: lote.fechaFabricacion,
            cantExistencial: cantExist,
            cant_Nueva: cantNuevaVal,
            idsucursal: lote.idsucursal,
            nombresucursal: lote.nombresucursal
          };

          const res = await insertProductoInventariadoDrogueria(payload, user, idaperturainventario);
          if (!res || !res.success) {
            exitoTotal = false;
            errores.push(`Lote ${lote.numeroLote}: ${res?.message || 'Error al guardar'}`);
          }
        }

        if (exitoTotal) {
          Alert.alert('✅ Éxito', 'Lotes registrados correctamente en el inventario.');
          navigation.navigate('InventoryDrogueria', {
            user: user,
            inventarioActivo: route.params?.inventarioActivo || { idaperturainventario: idaperturainventario },
            idaperturainventario: idaperturainventario,
            actualizarLista: true
          });
        } else {
          Alert.alert('⚠️ Advertencia', 'Algunos lotes no pudieron guardarse:\n' + errores.join('\n'));
          navigation.navigate('InventoryDrogueria', {
            user: user,
            inventarioActivo: route.params?.inventarioActivo || { idaperturainventario: idaperturainventario },
            idaperturainventario: idaperturainventario,
            actualizarLista: true
          });
        }
      } else {
        // ==========================================
        // GUARDAR: ACTUALIZACIÓN (EDICIÓN)
        // ==========================================
        console.log('✏️ Droguería - Actualizando filas modificadas...');

        // Identificar qué filas fueron modificadas por el usuario
        const filasModificadas = lotes.filter(lote => lote.isModified);

        if (filasModificadas.length === 0) {
          Alert.alert('Información', 'No se realizaron cambios en las cantidades.');
          navigation.navigate('InventoryDrogueria', { 
            user: user,
            inventarioActivo: route.params?.inventarioActivo || { idaperturainventario: idaperturainventario },
            idaperturainventario: idaperturainventario 
          });
          setSaving(false);
          return;
        }

        let exitoTotal = true;
        let errores = [];

        for (const fila of filasModificadas) {
          const cantNuevaNum = fila.cantInput !== '' && !isNaN(parseFloat(fila.cantInput))
            ? parseFloat(fila.cantInput)
            : (parseFloat(fila.cantidadExistencial) || 0);

          const res = await updateProductoInventariadoDrogueria(
            productInfo.codigoBarras,
            fila.idproductolote,
            cantNuevaNum,
            idaperturainventario
          );

          if (!res || !res.success) {
            exitoTotal = false;
            errores.push(`Lote ${fila.numeroLote}: ${res?.message || 'Error al actualizar'}`);
          }
        }

        if (exitoTotal) {
          Alert.alert('✅ Éxito', 'Cantidades actualizadas correctamente.');
          navigation.navigate('InventoryDrogueria', {
            user: user,
            inventarioActivo: route.params?.inventarioActivo || { idaperturainventario: idaperturainventario },
            idaperturainventario: idaperturainventario,
            actualizarLista: true
          });
        } else {
          Alert.alert('⚠️ Advertencia', 'Algunos lotes no pudieron actualizarse:\n' + errores.join('\n'));
          navigation.navigate('InventoryDrogueria', {
            user: user,
            inventarioActivo: route.params?.inventarioActivo || { idaperturainventario: idaperturainventario },
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
      inventarioActivo: route.params?.inventarioActivo || { idaperturainventario: idaperturainventario },
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
        <Text style={styles.label}>🆔 ID Producto</Text>
        <TextInput
          style={[styles.input, styles.disabledInput]}
          value={productInfo.idproducto}
          editable={false}
          placeholder="ID de Producto"
        />

        <Text style={styles.label}>🏢 Sucursal</Text>
        <TextInput
          style={[styles.input, styles.disabledInput]}
          value={productInfo.sucursal}
          editable={false}
          placeholder="Sucursal"
        />

        <Text style={styles.label}>📝 Descripción</Text>
        <TextInput
          style={[styles.input, styles.disabledInput, styles.textArea]}
          value={productInfo.descripcion}
          editable={false}
          multiline
          numberOfLines={2}
          placeholder="Descripción del producto"
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
                  onChangeText={(text) => handleCantidadChange(text, lote.key || lote.idproductolote)}
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
  label: { fontSize: 13, fontWeight: 'bold', color: '#2c3e50', marginTop: 8, marginBottom: 4 },
  input: { 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    padding: 10, 
    fontSize: 14, 
    backgroundColor: '#fff' 
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
