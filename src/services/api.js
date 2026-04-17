const API_BASE_URL = 'http://apiqfventas.qf.com.pe';

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
    const result = await response.json();
    console.log('Producto obtenido:', result);
    return result;
  } catch (error) {
    console.error('Error:', error);
    return null;
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
      idproducto:productData.idProducto
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