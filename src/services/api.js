const API_BASE_URL = 'http://192.168.23.152:5236';

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


export const actualizarTomaInventario = async (codigoBarra, cantNueva) => {
  try {
    const bodyData = {
      CodigoBarra: codigoBarra,
      CantNueva: cantNueva
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
export const iniciarInventario = async (tipo, usuario) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/iniciar-inventario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tipo: tipo,
        usuario: usuario
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
export const finalizarInventario = async (usuario) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/finalizar-inventario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usuario: usuario
      })
    });
    
    const result = await response.json();
    console.log('Finalizar inventario respuesta:', result);
    return result;
  } catch (error) {
    console.error('Error al finalizar:', error);
    return { success: false, message: error.message };
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







export const insertTomaInventario = async (productData, user) => {
  try {
    const bodyData = {
      CodigoBarra: productData.codigobarra,
      descripcion: productData.descripcion,
      numLote: productData.numLote,
      cantExistencial: productData.cantExistencial,
      fechaFabricacion: productData.fechaFabricacion,
      fechaValidez: productData.fechaValidez,
      fechaRecepcion: productData.fechaRecepcion,
      IdEmpleado: user?.id || 0,   
      usuarioRegistro: user?.username || '',
      empleadoRegistro: user?.name || '',
      idproducto:productData.idProducto,
      nombresucursal:productData.nombresucursal,
            idsucursal: productData.idsucursal,                    // AGREGADO: id sucursal origen
      idsucursal_destino: productData.idsucursal_destino,    // AGREGADO: id sucursal destino
      sucursal_destino: productData.sucursal_destino ,       // AGREGADO: nombre sucursal destino
          idsucursal_logueado: user?.sucursalId || 0,                   // NUEVO: id sucursal del usuario logueado
      nombresucursal_logueado: user?.sucursalNombre || ''           // NUEVO: nombre sucursal del usuario logueado
    };
    
    console.log('Enviando datos:', JSON.stringify(bodyData, null, 2));
    console.log('pro:', JSON.stringify(productData, null, 2));
    
    const response = await fetch(`${API_BASE_URL}/api/Etiqueta/insertar_tomainventario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(bodyData)
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers.get('content-type'));
    
    // Leer como texto primero
    const text = await response.text();
    console.log('Respuesta cruda:', text);
    
    if (!text || text.trim() === '') {
      return { success: false, message: 'Respuesta vacía del servidor' };
    }
    
    const result = JSON.parse(text);
    console.log('Respuesta parseada:', result);
    
    return {
      success: result.Success === 1,
      message: result.Message,
      id: result.IdTomaInventario
    };
  } catch (error) {
    console.error('Error detallado:', error);
    return { success: false, message: error.message };
  }
};