import { createWebModule } from "expo-modules-core";
import * as FileSystem from 'expo-file-system';

//const API_BASE_URL = 'http://apiqfventas.qf.com.pe';
const API_BASE_URL = 'http://apiws.qf.com.pe';

export const login = async (username, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/Principal/UsuarioAutenticacion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username,
        password: password,
        traerDatos: true
      })
    });
    
    const result = await response.json();
    console.log('Respuesta:', result);
    
    if (result.success === true) {
      // Los datos del usuario están en result.data
      const userData = result.data;
      
      return {
        success: true,
        message: result.message,
        user: {
          id: userData.idempleado,
          username: userData.username,
          name: userData.empleado,        // 👈 "empleado" es el nombre
          role: userData.area,            // 👈 "area" es el rol
          documento: userData.documento,
          sucursal: userData.idsucursal,
          data: userData
        }
      };
    } else {
      return {
        success: false,
        message: result.message || 'Error de autenticación'
      };
    }
  } catch (error) {
    console.error('Error:', error);
    return {
      success: false,
      message: `Error de conexión: ${error.message}`
    };
  }
};
export const updateProduct = async (productData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/actualizar`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(productData)
    });
    return await response.json();
  } catch (error) {
    console.error('Error:', error);
    return { success: false };
  }
};
export const listarSucursales = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/AlmacenReporte/ListarSucursales`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Sucursales obtenidas:', result);
    
    // Ajusta el retorno según la estructura de tu API
    // Si la API devuelve { data: [...] }
    if (result.data) {
      return result.data;
    }
    // Si devuelve directamente el array
    if (Array.isArray(result)) {
      return result;
    }
    // Si devuelve { success: true, data: [...] }
    if (result.success && result.data) {
      return result.data;
    }
    
    return [];
  } catch (error) {
    console.error('Error al listar sucursales:', error);
    throw error;
  }
};
// Obtener producto por código de barras
export const getProductByBarcode = async (barcode) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/codigo-barra/${barcode}`);
    const result = await response.json();
    console.log('Producto obtenido:', result);
    return result;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
};


export const actualizarTomaInventario = async (codigoBarra, cantNueva,ubicacion) => {
  try {
    const bodyData = {
      CodigoBarra: codigoBarra,
      CantNueva: cantNueva,
      ubicacion:ubicacion
    };
    
    console.log('Actualizando inventario:', bodyData);
    
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/actualizar_tomainventario`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(bodyData)
    });
    
    const result = await response.json();
    console.log('Respuesta actualizar:', result);
    
    return {
      success: response.ok,
      message: result.mensaje || (response.ok ? 'Actualizado correctamente' : 'Error al actualizar')
    };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, message: error.message };
  }
};


export const getTomaInventario = async (idEmpleado = null) => {
  try {
    let url = `${API_BASE_URL}/api/Etiqueta/obtener-inventario-usuario`;
    if (idEmpleado !== null) {
      url += `?idEmpleado=${idEmpleado}`;
    }
    const response = await fetch(url);
    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error('Error:', error);
    return [];
  }
};
export const getTomaInventarioByBarcode = async (barcode) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/obtener_infoinventario/${barcode}`);
    
    console.log('Response status:', response.status);
    
    // Si la respuesta no es exitosa
    if (!response.ok) {
      console.log('Error en respuesta:', response.status);
      return null;
    }
    
    const text = await response.text();
    console.log('Respuesta cruda obtener_infoinventario:', text);
    
    // Si la respuesta está vacía
    if (!text || text.trim() === '') {
      console.log('Respuesta vacía');
      return null;
    }
    
    // Intentar parsear JSON
    try {
      const result = JSON.parse(text);
      console.log('Producto obtenido:', result);
      return result;
    } catch (parseError) {
      console.error('Error parseando JSON:', parseError);
      console.log('Texto que no es JSON:', text);
      return null;
    }
  } catch (error) {
    console.error('Error en getTomaInventarioByBarcode:', error);
    return null;
  }
};

export const getTomaInventarioByBarcodeAndUbicacion = async (barcode, ubicacion) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/obtener_infoinventarioubicacion/${barcode}/${ubicacion}`);
    if (!response.ok) return null;
    const text = await response.text();
    if (!text || text.trim() === '') return null;
    return JSON.parse(text);
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
};

export const eliminarTomaInventario = async (idtomainventario) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/eliminar_tomainventario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ idtomainventario: idtomainventario })
    });
    
    const result = await response.json();
    console.log('Respuesta eliminar:', result);
    
    return {
      success: result.success === 1 || result.Success === 1 || result.success === true,
      message: result.message || result.Message || 'Producto eliminado'
    };
  } catch (error) {
    console.error('Error al eliminar:', error);
    return { success: false, message: error.message };
  }
};


export const getInventarioEstado = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/estado-inventario`);
    const result = await response.json();
    console.log('Estado inventario:', result);
    return result;
  } catch (error) {
    console.error('Error al obtener estado:', error);
    return { success: true, estado: 'PENDIENTE', tipo: 'PARCIAL' };
  }
};

// Iniciar inventario (solo ADMIN)
export const iniciarInventario = async (tipo, usuario,idsucursal) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/iniciar-inventario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tipo: tipo,
        usuario: usuario,
     idsucursal: String(idsucursal || '')
      })
    });
    
    const result = await response.json();
    console.log('Iniciar inventario respuesta:', result);
    return result;
  } catch (error) {
    console.error('Error al iniciar:', error);
    return { success: false, message: error.message };
  }
};

// Finalizar inventario (solo ADMIN)
export const finalizarInventario = async (idEmpleado, idaperturainventario) => {
  try {
    console.log('📡 Enviando finalizar:', { idEmpleado, idaperturainventario });
    
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/finalizar-inventario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        usuario: idEmpleado,
        idaperturainventario: idaperturainventario  // ✅ SOLO EL ID
      })
    });
    
    const result = await response.json();
    console.log('✅ Resultado finalizar:', result);
    
    return {
      success: result.success === true || result.Success === true || result.Success === 1,
      estado: result.estado || result.Estado || 'FINALIZADO',
      mensaje: result.mensaje || result.Message || result.message || 'Inventario finalizado'
    };
    
  } catch (error) {
    console.error('Error finalizando inventario:', error);
    return { 
      success: false, 
      message: error.message || 'Error al conectar con el servidor' 
    };
  }
};

// Validar si se puede escanear (antes de cada escaneo)
export const validarPuedeEscanear = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/validar-escaneo-inventario`);
    const result = await response.json();
    console.log('Validar escaneo:', result);
    return result;
  } catch (error) {
    console.error('Error al validar:', error);
    return { permitido: false, mensaje: 'Error al validar estado del inventario' };
  }
};




export const insertTomaInventario = async (productData, user,idaperturainventario = null) => {
  try {
    const bodyData = {
      CodigoBarra: productData.codigobarra,
      Descripcion: productData.descripcion,
      NumLote: productData.numLote,
      CantExistencial: productData.cantExistencial || 0,
      FechaFabricacion: productData.fechaFabricacion,
      FechaValidez: productData.fechaValidez,
      FechaRecepcion: productData.fechaRecepcion,
      IdEmpleado: user?.id || 0,
      UsuarioRegistro: user?.username || '',
      EmpleadoRegistro: user?.name || '',
      idproducto: productData.idProducto,
      nombresucursal: productData.nombresucursal,
      idsucursal: productData.idsucursal,
      idsucursal_destino: productData.idsucursal_destino,
      sucursal_destino: productData.sucursal_destino,
      idsucursal_logueado: user?.sucursalId || 0,
      nombresucursal_logueado: user?.sucursalNombre || '',
      ubicacion: productData.ubicacion,
      Cant_nueva: productData.cant_Nueva || 0,
      idaperturainventario: idaperturainventario  
    };
    
    console.log('📤 Enviando datos:', JSON.stringify(bodyData, null, 2));
    
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/insertar_tomainventario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(bodyData)
    });
    
    console.log('📊 Response status:', response.status);
    
    // Leer la respuesta como texto
    const text = await response.text();
    console.log('📥 Respuesta CRUDA del servidor:', text);
    
    // Si la respuesta está vacía
    if (!text || text.trim() === '') {
      console.log('❌ Respuesta vacía');
      return { 
        Success: 0,
        success: false, 
        Message: 'El servidor devolvió una respuesta vacía',
        message: 'El servidor devolvió una respuesta vacía'
      };
    }
    
    // Intentar parsear como JSON
    let result;
    try {
      result = JSON.parse(text);
      console.log('✅ JSON parseado:', result);
    } catch (parseError) {
      console.error('❌ Error parseando JSON:', parseError);
      console.log('📄 Texto que no es JSON:', text);
      
      // Devolver un objeto con el error
      return {
        Success: 0,
        success: false,
        Message: text.substring(0, 200), // Enviar el texto de error
        message: text.substring(0, 200)
      };
    }
    
    // Devolver el resultado con ambos formatos (mayúscula y minúscula)
    return {
      Success: result.Success === 1 ? 1 : 0,
      success: result.Success === 1,
      Message: result.Message || result.message || (result.Success === 1 ? 'Producto insertado' : 'Error al insertar'),
      message: result.Message || result.message || (result.Success === 1 ? 'Producto insertado' : 'Error al insertar'),
      IdTomaInventario: result.IdTomaInventario || result.id
    };
    
  } catch (error) {
    console.error('❌ Error en insertTomaInventario:', error);
    return { 
      Success: 0,
      success: false, 
      Message: error.message,
      message: error.message
    };
  }
};

export const obtenerProductoInfoByCodigoBarras = async (codigoBarras) => {
  try {
    if (!codigoBarras) return null;
    const cleanCode = encodeURIComponent(String(codigoBarras).trim());
    const response = await fetch(`${API_BASE_URL}/api/Inventario/obtenerProductoInfoByCodigoBarras/${cleanCode}`);

    if (!response.ok) {
      console.warn(`[DROGUERIA] HTTP ${response.status} al obtener info para código: ${codigoBarras}`);
      return null;
    }

    const result = await response.json();
    console.log('[DROGUERIA] Producto obtenido:', result);
    return result;
  } catch (error) {
    console.error("❌ [DROGUERIA] Error al obtener información de Producto:", error);
    return null;
  }
};

export const obtenerLotesProductoByCodigoBarra = async (codigoBarras) => {
  try {
    if (!codigoBarras) return null;
    const cleanCode = encodeURIComponent(String(codigoBarras).trim());
    const response = await fetch(`${API_BASE_URL}/api/Inventario/obtenerLotesProductoByCodigoBarra/${cleanCode}`);

    if (!response.ok) {
      console.warn(`[DROGUERIA] HTTP ${response.status} al obtener lotes para código: ${codigoBarras}`);
      return null;
    }

    const result = await response.json();
    console.log('[DROGUERIA] Lotes obtenido:', result);
    return result;
  } catch (error) {
    console.error("❌ [DROGUERIA] Error al obtener lotes de Producto:", error);
    return null;
  }
};

export const insertProductoInventariadoDrogueria = async (productData, user, idaperturainventario = null) => {
  try {
    const idAperturaParsed = idaperturainventario !== null && idaperturainventario !== undefined && !isNaN(Number(idaperturainventario))
      ? Number(idaperturainventario)
      : (productData.idaperturainventario && !isNaN(Number(productData.idaperturainventario)) ? Number(productData.idaperturainventario) : null);

    const bodyData = {
      CodigoBarra: productData.codigobarra || productData.codigoBarras || productData.CodigoBarra,
      idproducto: productData.idProducto || productData.idproducto,
      Descripcion: productData.NombreProducto || productData.descripcion || productData.Descripcion || '',
      idlaboratorio: productData.idlaboratorio,
      laboratorio: productData.laboratorio,
      precioc: productData.precioc,
      idproductolote: productData.idproductolote,
      NumLote: productData.numLote || productData.numeroLote || productData.NumLote,
      fecharecepcion: productData.fecharecepcion,
      fechavalidez: productData.fechavalidez,
      fechafabricacion: productData.fechafabricacion,
      CantExistencial: productData.cantExistencial || productData.cantidadExistencial || productData.CantExistencial || 0,
      Cant_nueva: productData.cant_Nueva || productData.cantNueva || productData.Cant_nueva || 0,
      IdEmpleado: user?.id || 0,
      UsuarioRegistro: user?.username || '',
      EmpleadoRegistro: user?.name || user?.empleado || '',
      idsucursal: productData.idsucursal,
      nombresucursal: productData.nombresucursal,
      idsucursal_logueado: user?.sucursalId || 0,
      nombresucursal_logueado: user?.sucursalNombre || '',
      idaperturainventario: idAperturaParsed  
    };
    
    console.log('📤 [DROGUERIA] Enviando datos:', JSON.stringify(bodyData, null, 2));
    
    const response = await fetch(`${API_BASE_URL}/api/Inventario/insertProductoInventariadoDrogueria`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(bodyData)
    });
    
    console.log('📊 [DROGUERIA] Response status:', response.status);
    
    // Leer la respuesta como texto
    const text = await response.text();
    console.log('📥 [DROGUERIA] Respuesta CRUDA del servidor:', text);
    
    // Si la respuesta está vacía
    if (!text || text.trim() === '') {
      console.log('❌ [DROGUERIA] Respuesta vacía');
      return { 
        success: false, 
        message: 'El servidor devolvió una respuesta vacía'
      };
    }
    
    // Intentar parsear como JSON
    let result;
    try {
      result = JSON.parse(text);
      console.log('✅ [DROGUERIA] JSON parseado:', result);
    } catch (parseError) {
      console.error('❌ [DROGUERIA] Error parseando JSON:', parseError);
      console.log('📄 [DROGUERIA] Texto que no es JSON:', text);
      
      // Devolver un objeto con el error
      return {
        success: false,
        message: text.substring(0, 200)
      };
    }
    
    return {
      success: result.success === 1 || result.success === true,
      message: result.message
    };
  } catch (error){
    return { 
        success: false, 
        message: "Ocurrio un error en el servidor"
      };
  }
}

export const obtenerProductoInventariadoDrogueria = async (codigoBarra, idaperturainventario = null) => {
  try {
    if (!codigoBarra) return null;
    const cleanCode = encodeURIComponent(String(codigoBarra).trim());
    let url = `${API_BASE_URL}/api/Inventario/obtenerProductoInventariadoDrogueria/${cleanCode}`;
    if (idaperturainventario !== null && idaperturainventario !== undefined) {
      url += `?idaperturainventario=${idaperturainventario}`;
    }
    const response = await fetch(url);
    console.log(`Status de obtencion de inventario de drogueria: ${response.ok}`);
    if (!response.ok) return null;
    const text = await response.text();
    if (!text || text.trim() === '') return null;
    return JSON.parse(text);

  } catch (error) {
    console.error(`[DROGUERIA] Error al obtener Inventariado de Producto, Codigo Barras ${codigoBarra}:`, error);
    return null;
  }
};

export const updateProductoInventariadoDrogueria = async (codigoBarra, idproductolote, cantNueva, idaperturainventario = null) => {
  try {
    const idAperturaParsed = idaperturainventario !== null && idaperturainventario !== undefined && !isNaN(Number(idaperturainventario))
      ? Number(idaperturainventario)
      : null;

    const bodyData = {
      CodigoBarra: codigoBarra,
      idproductolote: idproductolote,
      CantNueva: cantNueva,
      idaperturainventario: idAperturaParsed
    };
    
    console.log('[DROGUERIA] Actualizando inventario:', bodyData);
    
    const response = await fetch(`${API_BASE_URL}/api/Inventario/updateProductoInventariadoDrogueria`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(bodyData)
    });
    
    const result = await response.json();
    console.log('[DROGUERIA] Respuesta actualizar:', result);
    
    return {
      success: response.ok,
      message: result.mensaje || (response.ok ? 'Actualizado correctamente' : 'Error al actualizar')
    };
  } catch (error) {
    console.error('[DROGUERIA] Error:', error);
    return { success: false, message: error.message };
  }
};

export const obtenerTodosProductoInventariadoDrogueria = async (idEmpleado = null, idaperturainventario = null) => {
  try {
    let url = `${API_BASE_URL}/api/Inventario/obtenerTodosProductoInventariadoDrogueria`;
    const params = [];
    if (idEmpleado !== null && idEmpleado !== undefined) {
      params.push(`idEmpleado=${idEmpleado}`);
    }
    if (idaperturainventario !== null && idaperturainventario !== undefined) {
      params.push(`idaperturainventario=${idaperturainventario}`);
    }
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }
    const response = await fetch(url);
    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error('Error al obtener Inventariado de Productos (DROGUERIA):', error);
    return [];
  }
};

export const eliminarProductoInventariadoDrogueria = async (codigoBarra, idaperturainventario = null) => {
  try {
    const idAperturaParsed = idaperturainventario !== null && idaperturainventario !== undefined && !isNaN(Number(idaperturainventario))
      ? Number(idaperturainventario)
      : null;

    const bodyData = { 
      CodigoBarra: codigoBarra,
      idaperturainventario: idAperturaParsed
    };

    console.log('[DROGUERIA] Eliminando inventario producto:', bodyData);

    const response = await fetch(`${API_BASE_URL}/api/Inventario/eliminarProductoInventariadoDrogueria`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(bodyData)
    });
    
    const result = await response.json();
    console.log('Respuesta eliminar:', result);
    
    return {
      success: result.success === 1 || result.success === true,
      message: result.message || 'Producto eliminado'
    };
  } catch (error) {
    console.error('Error al eliminar:', error);
    return { success: false, message: error.message };
  }  
};

export const iniciarInventarioDrogueria = async (tipo, usuario, idsucursal) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/Inventario/iniciarInventarioDrogueria`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tipo: tipo,
        usuario: usuario,
        idsucursal: String(idsucursal || '')
      })
    });
    
    const result = await response.json();
    console.log('Iniciar inventario respuesta:', result);
    return result;
  } catch (error) {
    console.error('Error al iniciar:', error);
    return { success: false, message: error.message };
  }
};

export const finalizarInventarioDrogueria = async (idEmpleado, idaperturainventario) => {
  try {
    console.log('📡 [DROGUERIA] Enviando finalizar:', { idEmpleado, idaperturainventario });
    
    const response = await fetch(`${API_BASE_URL}/api/Inventario/finalizarInventarioDrogueria`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        usuario: idEmpleado,
        idaperturainventario: idaperturainventario
      })
    });
    
    const result = await response.json();
    console.log('✅ Resultado finalizar:', result);
    
    return {
      success: result.success === true || result.success === 1,
      mensaje: result.message || 'Inventario finalizado'
    };
    
  } catch (error) {
    console.error('Error finalizando inventario:', error);
    return { 
      success: false, 
      message: error.message || 'Error al conectar con el servidor' 
    };
  }
};

/**
 * Envía los datos modificados al backend para generar el archivo Excel oficial con ClosedXML
 * @param {Object} payload Datos con fechaInicioInventario, fechaFinInventario, tipoInventario, rows
 * @returns {Promise<{success: boolean, fileUri?: string, message?: string}>}
 */
export const exportarReporteExcelDrogueria = async (payload) => {
  try {
    console.log('📤 [DROGUERIA] Enviando solicitud para generar reporte Excel al backend:', {
      fechaInicio: payload.fechaInicioInventario,
      fechaFin: payload.fechaFinInventario,
      tipo: payload.tipoInventario,
      totalFilas: payload.rows?.length || 0
    });

    const response = await fetch(`${API_BASE_URL}/api/Inventario/exportarReporteExcelDrogueria`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json'
      },
      body: JSON.stringify(payload)
    });

    // 1. Manejo de Errores (El servidor responde con HTTP 400/404/500 en formato JSON)
    if (!response.ok) {
      const errorJson = await response.json().catch(() => null);
      const errorMsg = errorJson?.message || `Error del servidor (${response.status}: ${response.statusText})`;
      return { success: false, message: errorMsg };
    }

    // 2. Manejo de Éxito (El servidor responde con HTTP 200 entregando el archivo binario .xlsx)
    const blob = await response.blob();
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const dataUrl = reader.result;
        resolve(dataUrl.split(',')[1]);
      };
      reader.readAsDataURL(blob);
    });

    const fileName = `Control_Inventarios_Drogueria_${Date.now()}.xlsx`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return { success: true, fileUri: fileUri, fileName: fileName };

  } catch (error) {
    console.error('❌ Error al exportar reporte Excel Droguería:', error);
    return { success: false, message: error.message || 'Error al conectar con el servidor' };
  }
};

/**
 * Función auxiliar para consultar productos de una apertura, filtrar diferencias y generar el Excel
 * @param {Object} inventario Objeto de inventario con idaperturainventario (o id), fecha_inicio, fecha_fin, tipo
 * @param {Array} [rawItemsList] Lista opcional de items ya cargados en memoria. Si no se pasa, se consultan de la BD.
 * @returns {Promise<{success: boolean, fileUri?: string, message?: string}>}
 */
export const exportarExcelDrogueriaPorApertura = async (inventario) => {
  try {
    const idApertura = inventario?.idaperturainventario || inventario?.id;
    
    if (!idApertura) {
      return { success: false, message: 'No se encontró el ID de apertura de este inventario.' };
    }
    console.log(`📦 Consultando productos de apertura ${idApertura} para exportar Excel...`);
    productos = await obtenerTodosProductoInventariadoDrogueria(null, idApertura);

    if (!productos || productos.length === 0) {
      return { success: false, message: 'No hay productos registrados en este inventario.' };
    }

    // Filtrar únicamente los registros con diferencias en cantidad (modificados)
    const itemsModificados = productos.filter(item => {
      const stockSistema = parseFloat(item.CantExistencial ?? item.cantExistencial ?? 0) || 0;
      const stockFisico = parseFloat(item.Cant_nueva ?? item.cant_Nueva ?? item.cant_nueva ?? 0) || 0;
      return Math.abs(stockFisico - stockSistema) > 0.0001;
    });

    if (itemsModificados.length === 0) {
      return {
        success: false,
        message: 'No se encontraron lotes con diferencias de cantidad (Stock Físico ≠ Stock Sistema) para incluir en el reporte.'
      };
    }

    const payload = {
      fechaInicioInventario: inventario?.fecha_inicio || null,
      fechaFinInventario: inventario?.fecha_fin || null,
      tipoInventario: inventario?.tipo || 'PARCIAL',
      rows: itemsModificados.map((item, index) => {
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

    return await exportarReporteExcelDrogueria(payload);
  } catch (error) {
    console.error('❌ Error en exportarExcelDrogueriaPorApertura:', error);
    return { success: false, message: error.message || 'Error al procesar la exportación del reporte' };
  }
};

