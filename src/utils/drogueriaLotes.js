/**
 * Normaliza una fecha a formato YYYY-MM-DD para agrupar de forma consistente.
 */
export const normalizarFechaLote = (fecha, emptyValue = 'SIN_FECHA') => {
  if (!fecha) return emptyValue;
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
    return part || emptyValue;
  } catch (e) {
    return String(fecha);
  }
};

/**
 * Formatea una fecha a dd/mm/yyyy para visualización compacta en tarjetas.
 */
export const formatearFechaCorta = (fecha) => {
  if (!fecha) return '';
  try {
    const norm = normalizarFechaLote(fecha, '');
    if (!norm) return '';
    const parts = norm.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const [yyyy, mm, dd] = parts;
      return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
    }
    return norm;
  } catch (e) {
    return String(fecha);
  }
};

/**
 * Obtiene el timestamp numérico de una fecha para ordenar de más reciente a más antigua.
 */
export const obtenerTimestampFecha = (fecha) => {
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
 * Consolida sub-lotes idénticos de Droguería por (opcionalmente código de producto +)
 * numeroLote, fechaValidez e idalmacensucursal.
 * - Suma la existencia del sistema (stockSistema / cantidadExistencial).
 * - Ordena los sub-lotes por fechaRecepcion más reciente primero (desempate por idproductolote desc).
 * - Asigna como stockFisico el conteo del sub-lote más reciente (subLotes[0]).
 */
export const consolidarLotesDrogueria = (
  rawList,
  {
    incluirProductoEnClave = false,
    isEditMode = false,
    defaultSucursalId = 66,
    defaultSucursalNombre = 'Q. F. DROGUERIA',
  } = {}
) => {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const gruposMap = new Map();

  rawList.forEach((item, idx) => {
    const codBarra = String(
      item.CodigoBarra || item.codigobarra || item.codigoBarra || item.codigoBarras || ''
    ).trim();
    const idProducto = String(item.idproducto || item.idProducto || '').trim();
    const numLote = String(item.numeroLote || item.numLote || item.NumLote || 'S/L').trim();
    const fValidezRaw = item.fechaValidez || item.fechavalidez || null;
    const fValidezNorm = normalizarFechaLote(fValidezRaw, 'SIN_FECHA');
    const idAlmSuc =
      item.idalmacensucursal !== null && item.idalmacensucursal !== undefined
        ? String(item.idalmacensucursal).trim()
        : '0';

    const claveBase = `${numLote.toUpperCase()}__${fValidezNorm}__${idAlmSuc}`;
    const groupKey = incluirProductoEnClave
      ? `${codBarra || idProducto}__${claveBase}`
      : claveBase;

    const cantExistNum =
      parseFloat(item.cantidadExistencial ?? item.cantExistencial ?? item.CantExistencial ?? 0) || 0;
    const cantNuevaNum =
      parseFloat(item.cant_nueva ?? item.cantNueva ?? item.Cant_nueva ?? item.cant_Nueva ?? 0) || 0;
    const fRecepcion = item.fechaRecepcion || item.fecharecepcion || null;

    const subLoteObj = {
      key: `${item.idproductolote ?? idx}`,
      idproductolote: item.idproductolote,
      idalmacensucursal: item.idalmacensucursal,
      numeroLote: numLote,
      fechaRecepcion: fRecepcion,
      fechaValidez: fValidezRaw,
      fechaFabricacion: item.fechaFabricacion || item.fechafabricacion || null,
      cantidadExistencial: cantExistNum,
      cantNueva: String(cantNuevaNum),
      cant_nueva: cantNuevaNum,
      idsucursal: item.idsucursal || defaultSucursalId,
      nombresucursal: item.nombresucursal || defaultSucursalNombre,
    };

    if (!gruposMap.has(groupKey)) {
      gruposMap.set(groupKey, {
        key: groupKey,
        groupKey,
        idproducto: idProducto,
        codigoBarra: codBarra,
        codigoBarras: codBarra,
        descripcion: item.Descripcion || item.descripcion || '',
        laboratorio: item.laboratorio || item.Laboratorio || '',
        precioc: parseFloat(item.precioc) || 0,
        empleadoRegistro: item.empleadoRegistro || item.usuarioRegistro || '',
        idaperturainventario: item.idaperturainventario,
        numeroLote: numLote,
        numLote,
        fechaValidez: fValidezRaw,
        fechaVencimiento: fValidezRaw ? normalizarFechaLote(fValidezRaw, '') : '',
        idalmacensucursal: item.idalmacensucursal,
        idsucursal: item.idsucursal || defaultSucursalId,
        nombresucursal: item.nombresucursal || defaultSucursalNombre,
        cantidadExistencial: cantExistNum,
        stockSistema: cantExistNum,
        subLotes: [subLoteObj],
      });
    } else {
      const grupo = gruposMap.get(groupKey);
      if (!grupo.idproducto && idProducto) {
        grupo.idproducto = idProducto;
      }
      if (!grupo.descripcion && (item.Descripcion || item.descripcion)) {
        grupo.descripcion = item.Descripcion || item.descripcion;
      }
      grupo.cantidadExistencial += cantExistNum;
      grupo.stockSistema += cantExistNum;
      grupo.subLotes.push(subLoteObj);
    }
  });

  return Array.from(gruposMap.values()).map((grupo) => {
    // Sub-lote con fechaRecepcion más reciente primero; desempate por idproductolote desc
    grupo.subLotes.sort((a, b) => {
      const tA = obtenerTimestampFecha(a.fechaRecepcion);
      const tB = obtenerTimestampFecha(b.fechaRecepcion);
      if (tB !== tA) return tB - tA;
      return (Number(b.idproductolote) || 0) - (Number(a.idproductolote) || 0);
    });

    const subMasReciente = grupo.subLotes[0];
    const stockFisico = subMasReciente?.cant_nueva !== undefined ? subMasReciente.cant_nueva : 0;

    let cantInputInicial = '0';
    if (isEditMode) {
      const cantMasReciente = subMasReciente?.cantNueva;
      cantInputInicial =
        cantMasReciente !== undefined && cantMasReciente !== null ? String(cantMasReciente) : '0';
    }

    return {
      ...grupo,
      stockFisico,
      cantInput: cantInputInicial,
      cantNueva: cantInputInicial,
      isModified: false,
    };
  });
};

/**
 * Agrupa los lotes ya consolidados en tarjetas por producto para la lista de Droguería.
 * Mantiene todos los lotes aunque tengan 0/0 para permitir edición y eliminación.
 */
export const agruparProductosVistaDrogueria = (rawList) => {
  const lotesConsolidados = consolidarLotesDrogueria(rawList, {
    incluirProductoEnClave: true,
  });

  if (lotesConsolidados.length === 0) return [];

  const mapa = {};

  lotesConsolidados.forEach((lote) => {
    const key = `${lote.codigoBarra}_${lote.idproducto || ''}`;
    if (!mapa[key]) {
      mapa[key] = {
        key,
        codigobarra: lote.codigoBarra,
        idproducto: lote.idproducto,
        name: lote.descripcion || 'Sin descripción',
        usuario: lote.empleadoRegistro || 'Usuario',
        lotes: [],
        totalUnidades: 0,
        idaperturainventario: lote.idaperturainventario,
      };
    }

    mapa[key].lotes.push({
      key: lote.groupKey,
      numLote: lote.numeroLote,
      cantidad: lote.stockFisico,
      stockSistema: lote.stockSistema,
      fechaValidez: lote.fechaValidez,
      fechaVencimiento: lote.fechaVencimiento,
      idproductolote: lote.subLotes[0]?.idproductolote ?? null,
    });
    mapa[key].totalUnidades += lote.stockFisico;
  });

  return Object.values(mapa);
};
