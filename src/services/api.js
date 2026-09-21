import { createWebModule } from "expo-modules-core";
import * as FileSystem from 'expo-file-system';

const API_BASE_URL = 'http://apiqfventas.qf.com.pe';
//const API_BASE_URL = 'http://apiws.qf.com.pe';

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

export const obtenerProductoInfoByCodigoBarras = async (codigoBarras, idubicacion = null) => {
  try {
    if (!codigoBarras) return null;
    const cleanCode = encodeURIComponent(String(codigoBarras).trim());
    let url = `${API_BASE_URL}/api/Inventario/obtenerProductoInfoByCodigoBarras/${cleanCode}`;
    if (idubicacion !== null && idubicacion !== undefined) {
      url += `?idubicacion=${encodeURIComponent(idubicacion)}`;
    }
    const response = await fetch(url);

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

export const obtenerLotesProductoByCodigoBarra = async (codigoBarras, idubicacion = null) => {
  try {
    if (!codigoBarras) return null;
    const cleanCode = encodeURIComponent(String(codigoBarras).trim());
    let url = `${API_BASE_URL}/api/Inventario/obtenerLotesProductoByCodigoBarra/${cleanCode}`;
    if (idubicacion !== null && idubicacion !== undefined) {
      url += `?idubicacion=${encodeURIComponent(idubicacion)}`;
    }
    const response = await fetch(url);

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
      multiplo: productData.multiplo,
      idproductolote: productData.idproductolote,
      idalmacensucursal: productData.idalmacensucursal,
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

export const iniciarInventarioDrogueria = async (tipo, usuario, idsucursal, idubicacion = null) => {
  try {
    const payload = {
      tipo: tipo,
      usuario: usuario,
      idsucursal: String(idsucursal || '')
    };
    if (idubicacion !== null && idubicacion !== undefined) {
      payload.idubicacion = Number(idubicacion);
    }

    const response = await fetch(`${API_BASE_URL}/api/Inventario/iniciarInventarioDrogueria`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
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
      idubicacion: payload.idubicacion,
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
 * Normaliza una fecha a formato YYYY-MM-DD para agrupación consistente en Excel.
 */
const normalizarFechaExcel = (fecha) => {
  if (!fecha) return '';
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
const obtenerTimestampExcel = (fecha) => {
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
 * Agrupa los lotes de Droguería por producto, numLote, fechaValidez e idalmacensucursal para el reporte Excel.
 * - stockSistema: Suma de las cantidades existenciales del grupo de lotes.
 * - stockFisico: Cantidad asignada al lote con la fechaRecepcion más reciente (los otros están en 0).
 * - Excluye del reporte si tanto stockSistema como stockFisico son 0.
 * - diferencia: stockFisico - stockSistema.
 * - valorizado: diferencia * precioc.
 * 
 * @param {Array} rawList Lista plana de registros de productos/lotes.
 * @returns {Array} Lista de filas consolidadas y filtradas listas para el Excel.
 */
export const agruparItemsParaExcelDrogueria = (rawList) => {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const gruposMap = new Map();

  rawList.forEach((item, idx) => {
    const codBarra = String(item.CodigoBarra || item.codigobarra || item.codigoBarra || '').trim();
    const numLote = String(item.NumLote || item.numLote || item.numeroLote || 'S/L').trim();
    const fValidezRaw = item.fechavalidez || item.fechaValidez || null;
    const fValidezNorm = normalizarFechaExcel(fValidezRaw);
    const idAlmSuc = item.idalmacensucursal !== null && item.idalmacensucursal !== undefined
      ? String(item.idalmacensucursal).trim()
      : '0';

    const groupKey = `${codBarra}__${numLote.toUpperCase()}__${fValidezNorm}__${idAlmSuc}`;

    const stockSistema = parseFloat(item.CantExistencial ?? item.cantExistencial ?? item.cantidadExistencial ?? 0) || 0;
    const stockFisico = parseFloat(item.Cant_nueva ?? item.cant_Nueva ?? item.cant_nueva ?? 0) || 0;
    const fRecepcion = item.fecharecepcion || item.fechaRecepcion || null;
    const idProdLote = item.idproductolote ?? idx;

    const subItem = {
      ...item,
      stockSistema,
      stockFisico,
      fechaRecepcion: fRecepcion,
      idproductolote: idProdLote
    };

    if (!gruposMap.has(groupKey)) {
      gruposMap.set(groupKey, {
        groupKey,
        codigoBarras: codBarra,
        descripcion: item.Descripcion || item.descripcion || '',
        laboratorio: item.laboratorio || item.Laboratorio || '',
        numLote: numLote,
        fechaVencimiento: fValidezNorm,
        precioc: parseFloat(item.precioc) || 0,
        subItems: [subItem]
      });
    } else {
      const grupo = gruposMap.get(groupKey);
      grupo.subItems.push(subItem);
    }
  });

  const gruposConsolidados = [];

  for (const grupo of gruposMap.values()) {
    // 1. stockSistema = suma de existencias de todos los registros del grupo
    const totalStockSistema = grupo.subItems.reduce((acc, curr) => acc + curr.stockSistema, 0);

    // 2. Ordenar sublotes para encontrar el que tiene fechaRecepcion más reciente
    grupo.subItems.sort((a, b) => {
      const tA = obtenerTimestampExcel(a.fechaRecepcion);
      const tB = obtenerTimestampExcel(b.fechaRecepcion);
      if (tB !== tA) return tB - tA;
      return (Number(b.idproductolote) || 0) - (Number(a.idproductolote) || 0);
    });

    // 3. stockFisico = cantidad asignada al sublote con fechaRecepcion más reciente (los demás tienen 0)
    const totalStockFisico = grupo.subItems[0]?.stockFisico !== undefined
      ? grupo.subItems[0].stockFisico
      : 0;

    // 4. Filtrar: si stockSistema es 0 y stockFisico también es 0, NO se incluye en el reporte
    const ambosCero = Math.abs(totalStockSistema) < 0.0001 && Math.abs(totalStockFisico) < 0.0001;
    if (ambosCero) {
      continue;
    }

    const diferencia = totalStockFisico - totalStockSistema;
    const valorizado = diferencia * grupo.precioc;

    gruposConsolidados.push({
      codigoBarras: grupo.codigoBarras,
      descripcion: grupo.descripcion,
      laboratorio: grupo.laboratorio,
      numLote: grupo.numLote,
      fechaVencimiento: grupo.fechaVencimiento,
      stockSistema: totalStockSistema,
      stockFisico: totalStockFisico,
      diferencia: diferencia,
      valorizado: valorizado,
      precioc: grupo.precioc
    });
  }

  return gruposConsolidados;
};

/**
 * Función auxiliar para consultar productos de una apertura, filtrar diferencias y generar el Excel
 * @param {Object} inventario Objeto de inventario con idaperturainventario (o id), fecha_inicio, fecha_fin, tipo
 * @returns {Promise<{success: boolean, fileUri?: string, message?: string}>}
 */
export const exportarExcelDrogueriaPorApertura = async (inventario) => {
  try {
    const idApertura = inventario?.idaperturainventario || inventario?.id;
    
    if (!idApertura) {
      return { success: false, message: 'No se encontró el ID de apertura de este inventario.' };
    }
    console.log(`📦 Consultando productos de apertura ${idApertura} para exportar Excel...`);
    const productos = await obtenerTodosProductoInventariadoDrogueria(null, idApertura);

    if (!productos || productos.length === 0) {
      return { success: false, message: 'No hay productos registrados en este inventario.' };
    }

    // Agrupar y filtrar lotes idénticos para el reporte
    const itemsParaReporte = agruparItemsParaExcelDrogueria(productos);

    if (itemsParaReporte.length === 0) {
      return {
        success: false,
        message: 'No se encontraron lotes para incluir en el reporte (ambas cantidades son 0).'
      };
    }

    let idUbicacionVal = inventario?.idubicacion ?? inventario?.idUbicacion ?? null;
    if (idUbicacionVal === null || idUbicacionVal === undefined) {
      try {
        const estadoRes = await getInventarioEstado();
        const lista = Array.isArray(estadoRes?.data) ? estadoRes.data : (estadoRes?.estado ? [estadoRes] : []);
        const encontrado = lista.find(item => 
          String(item.idaperturainventario || item.id) === String(idApertura)
        );
        if (encontrado && (encontrado.idubicacion ?? encontrado.idUbicacion) !== undefined) {
          idUbicacionVal = encontrado.idubicacion ?? encontrado.idUbicacion;
        }
      } catch (e) {
        console.log('No se pudo consultar estado para idubicacion en Excel:', e);
      }
    }

    const payload = {
      fechaInicioInventario: inventario?.fecha_inicio || null,
      fechaFinInventario: inventario?.fecha_fin || null,
      tipoInventario: inventario?.tipo || 'PARCIAL',
      idubicacion: idUbicacionVal !== null && idUbicacionVal !== undefined ? Number(idUbicacionVal) : null,
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

    return await exportarReporteExcelDrogueria(payload);
  } catch (error) {
    console.error('❌ Error en exportarExcelDrogueriaPorApertura:', error);
    return { success: false, message: error.message || 'Error al procesar la exportación del reporte' };
  }
};

export const GuardarEditarSububicacion = async (idproducto, sububicaciones) => {
  try {
    const payload = {
      idproducto: idproducto !== null && idproducto !== undefined ? Number(idproducto) : null,
      sububicaciones: sububicaciones || ''
    };

    console.log('📤 [GuardarEditarSububicacion] Enviando payload:', payload);

    const response = await fetch(`${API_BASE_URL}/api/Inventario/GuardarEditarSububicacion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      return {
        success: false,
        message: 'Ocurrio un error al guardar la sububicacion.'
      };
    }

    const result = await response.json();
    console.log('✅ Resultado GuardarSububicacion:', result);
    return {
      success: result.success !== undefined ? (result.success === true) : response.ok,
      message: result.message || (response.ok ? 'Sububicación procesada correctamente' : 'Error al guardar')
    };
  }
  catch (error) {
    return { success: false, message: error.message };
  }
};

export const ObtenerSububicacion = async (idproducto) => {
  try {
    const url = `${API_BASE_URL}/api/Inventario/ObtenerSububicacion/${idproducto}`;

    console.log('🔍 [ObtenerSububicacion] Consultando:', url);
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    return result;
  }
  catch (error) {
    console.error("Ocurrio un error al obtener la sububicacion del producto: ", idproducto, error);
    return null;
  }
};

export const ObtenerTodosProductosSucursalDrogueria = async (idubicacion = null) => {
  try {
    let url = `${API_BASE_URL}/api/Inventario/ObtenerTodosProductosSucursalDrogueria`;
    if (idubicacion !== null && idubicacion !== undefined) {
      url += `?idubicacion=${encodeURIComponent(idubicacion)}`;
    }
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error("[DROGUERIA] Ocurrio un error en la consulta.");
      return null;
    }

    const result = await response.json();
    return result;
  }
  catch (error) {
    console.error("[DROGUERIA] Ocurrio un error al obtener los producto de la sucursal DROGUERIA:", error);
    return null;
  }
};



export const obtenerLotesGeneral = async (codigoBarras, idsucursal) => {
  try {
    if (!codigoBarras) {
      return {
        success: false,
        message: 'El código de barras (idproductolote) es obligatorio.',
        data: []
      };
    }

    if (!idsucursal || Number(idsucursal) <= 0) {
      return {
        success: false,
        message: 'El id de sucursal debe ser mayor a 0.',
        data: []
      };
    }

    const cleanCode = encodeURIComponent(String(codigoBarras).trim());
    const url = `${API_BASE_URL}/api/Inventario/obtener-lotes?codigoBarras=${cleanCode}&idsucursal=${encodeURIComponent(idsucursal)}`;

    console.log('🔍 [LOTES GENERAL] Consultando:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    const text = await response.text();

    if (!text || text.trim() === '') {
      console.warn('[LOTES GENERAL] Respuesta vacía del servidor.');
      return { success: false, message: 'El servidor devolvió una respuesta vacía.', data: [] };
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch (parseError) {
      console.error('[LOTES GENERAL] Error parseando JSON:', parseError, 'Texto:', text);
      return {
        success: false,
        message: 'Respuesta inválida del servidor.',
        data: []
      };
    }

    console.log('[LOTES GENERAL] Lotes obtenidos:', result);

    return {
      success: result.success === true,
      message: result.message || (result.success ? 'Lotes obtenidos correctamente.' : 'No se encontraron lotes.'),
      total: result.total || (Array.isArray(result.data) ? result.data.length : 0),
      data: Array.isArray(result.data) ? result.data : []
    };

  } catch (error) {
    console.error('❌ [LOTES GENERAL] Error:', error);
    return {
      success: false,
      message: error.message || 'Error al conectar con el servidor.',
      data: []
    };
  }
};