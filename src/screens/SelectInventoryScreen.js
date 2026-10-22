import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { getInventarioEstado, exportarExcelDrogueriaPorApertura, obtenerHistoricoTomaInventario } from '../services/api';

export default function SelectInventoryScreen({ navigation, route }) {
  const { user } = route.params;
  const [inventario, setInventario] = useState(null);
  const [inventariosActivos, setInventariosActivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportingId, setExportingId] = useState(null);

  const isAdmin = user?.role === 'ADMINISTRADOR';

  useEffect(() => {
    cargarEstadoInventario();
  }, []);

  const cargarEstadoInventario = async () => {
    try {
      const data = await getInventarioEstado();
      
      if (data && data.success && data.data && Array.isArray(data.data)) {
        setInventariosActivos(data.data);
        
        const nombreSucursal = user?.sucursalNombre || '';
        const inventarioSucursal = data.data.find(item => {
          const nombreInv = (item.nombre_sucursal_inventario || '').toLowerCase().trim();
          const nombreUser = (nombreSucursal || '').toLowerCase().trim();
          return nombreInv === nombreUser || nombreInv.includes(nombreUser) || nombreUser.includes(nombreInv);
        });
        
        if (inventarioSucursal) {
          setInventario(inventarioSucursal);
        } else {
          setInventario(null);
        }
      } else if (data && data.estado) {
        setInventario(data);
        setInventariosActivos(data.estado === 'INICIADO' ? [data] : []);
      } else {
        setInventario(null);
        setInventariosActivos([]);
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'No se pudo cargar el estado del inventario');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // FUNCIÓN PARA FORMATO OFICIAL (NO DROGUERÍA)
  // ==========================================
  const handleExportarExcelFormato = async (inv) => {
    const idApertura = inv?.idaperturainventario || inv?.id;
    if (!idApertura) {
      Alert.alert('Error', 'No se encontró el identificador de apertura.');
      return;
    }

    setExportingId(idApertura);
    try {
      // 👇 AQUÍ ESTÁ EL LOGO DE ALTA CALIDAD DE QF 👇
      const urlLogo = "https://drive.usercontent.google.com/download?id=14E2B3ANYoAygTxZI7iv4K24VNpVue_Ep&export=view&authuser=0"; 

      const dataApi = await obtenerHistoricoTomaInventario(idApertura);

      if (!dataApi || dataApi.length === 0) {
        Alert.alert('Aviso', 'No hay datos en el histórico para exportar');
        setExportingId(null);
        return;
      }

      let filasHtml = '';
      dataApi.forEach((item, index) => {
        const stockSistema = parseFloat(item.cantExistencial) || 0;
        const stockFisico = parseFloat(item.cant_Nueva) || 0;
        const diferencia = stockFisico - stockSistema;
        
        let fechaVcto = '';
        if (item.fechaValidez) {
          const dateStr = String(item.fechaValidez).split('T')[0];
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            fechaVcto = `${parts[2]}/${parts[1]}/${parts[0]}`; 
          } else {
            fechaVcto = dateStr;
          }
        }

        let colorDif = 'black';
        if (diferencia > 0) colorDif = 'blue';
        if (diferencia < 0) colorDif = 'red';

        filasHtml += `
          <tr>
            <td style="border: 1px solid #000; text-align: center; font-size: 10px;">${index + 1}</td>
            <td style="border: 1px solid #000; text-align: center; font-size: 10px;">${item.codigoBarra}</td>
            <td style="border: 1px solid #000; font-size: 10px;">${item.descripcion}</td>
            <td style="border: 1px solid #000; font-size: 10px;">${item.laboratorio || ''}</td>
            <td style="border: 1px solid #000; text-align: center; font-size: 10px;">${fechaVcto}</td>
            <td style="border: 1px solid #000; text-align: center; font-size: 10px;">${item.numLote || ''}</td>
            <td style="border: 1px solid #000; text-align: right; font-size: 10px;">${stockSistema}</td>
            <td style="border: 1px solid #000; text-align: right; font-size: 10px;">${stockFisico}</td>
            <td style="border: 1px solid #000; text-align: right; font-size: 10px; color: ${colorDif}; font-weight: bold;">${diferencia}</td>
            <td style="border: 1px solid #000; font-size: 10px;"></td>
          </tr>
        `;
      });

      const hoy = new Date().toLocaleDateString('es-PE');
      const horaInicio = inv.fecha_inicio ? new Date(inv.fecha_inicio).toLocaleString('es-PE') : hoy;
      const fechaDescarga = new Date().toLocaleString('es-PE');

      const htmlContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
          <style>
            table { border-collapse: collapse; font-family: Arial, sans-serif; }
            .celda-header { border: 1px solid #000; padding: 4px; font-size: 10px; font-weight: bold; background-color: #f2f2f2; }
            .celda-normal { border: 1px solid #000; padding: 4px; font-size: 10px; }
            .cuadro-logo { border: 1px solid #000; text-align: center; vertical-align: middle; height: 80px; }
          </style>
        </head>
        <body>
          <table width="100%">
            <tr>
              <!-- 👇 CUADRO DEL LOGO 👇 -->
              <td rowspan="3" class="cuadro-logo" style="width: 15%; height: 80px;">
                 <img src="${urlLogo}" width="90" height="80" style="display: block; margin: 0 auto; object-fit: contain;" />
              </td>
              
              <td colspan="6" style="border: 1px solid #000; text-align: center; font-weight: bold; font-size: 14px; height: 40px;">
                HOJA DE TOMA DE INVENTARIO
              </td>
              <td colspan="2" class="celda-normal" style="width: 20%;">
                <b>Código:</b> F.QF.GF.003
              </td>
            </tr>
            <tr>
              <td colspan="3" class="celda-header">Tipo de documento:</td>
              <td colspan="3" class="celda-normal">Formato</td>
              <td class="celda-normal"><b>Versión:</b> 01</td>
            </tr>
            <tr>
              <td colspan="3" class="celda-header">Proceso:</td>
              <td colspan="3" class="celda-normal">Gestión Farmacéutica</td>
              <td class="celda-normal"><b>Páginas:</b> 1</td>
            </tr>
            <tr>
              <td colspan="2" class="celda-header" style="text-align: center;">Elaborado por:</td>
              <td colspan="3" class="celda-header" style="text-align: center;">Revisado por:</td>
              <td colspan="4" class="celda-header" style="text-align: center;">Aprobado por:</td>
            </tr>
            <tr>
              <td colspan="2" class="celda-normal" style="text-align: center;">Director Técnico</td>
              <td colspan="3" class="celda-normal" style="text-align: center;">Representante legal</td>
              <td colspan="4" class="celda-normal" style="text-align: center;">Representante legal</td>
            </tr>
            <tr>
              <td colspan="2" class="celda-normal" style="text-align: center;">Fecha: ${hoy}</td>
              <td colspan="3" class="celda-normal" style="text-align: center;">Fecha: ${hoy}</td>
              <td colspan="4" class="celda-normal" style="text-align: center;">Fecha: ${hoy}</td>
            </tr>
            <tr>
              <td colspan="2" class="celda-normal" style="font-weight: bold;">Fecha de Inventario:</td>
              <td colspan="7" class="celda-normal">${horaInicio}</td>
            </tr>
            <tr>
              <td colspan="9" class="celda-normal" style="text-align: right; font-style: italic; font-size: 12px;">
                Fecha de Descarga: ${fechaDescarga}
              </td>
            </tr>
            <tr>
              <td class="celda-header" style="width: 5%; text-align: center;">Ítem</td>
              <td class="celda-header" style="width: 10%; text-align: center;">Código</td>
              <td class="celda-header" style="width: 35%; text-align: center;">Descripción</td>
              <td class="celda-header" style="width: 15%; text-align: center;">Laboratorio</td>
              <td class="celda-header" style="width: 10%; text-align: center;">Fecha de Vcto</td>
              <td class="celda-header" style="width: 10%; text-align: center;">Lote</td>
              <td class="celda-header" style="width: 8%; text-align: center;">Stock sistema (und)</td>
              <td class="celda-header" style="width: 8%; text-align: center;">Stock físico (und)</td>
              <td class="celda-header" style="width: 8%; text-align: center;">Diferencia</td>
              <td class="celda-header" style="width: 15%; text-align: center;">Observaciones</td>
            </tr>
            ${filasHtml}
          </table>
        </body>
        </html>
      `;

      const fileName = `TomaInventario_${idApertura}.xls`;
      const fileUri = FileSystem.documentDirectory + fileName;
      
      await FileSystem.writeAsStringAsync(fileUri, htmlContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.ms-excel',
          dialogTitle: 'Compartir Hoja de Toma de Inventario'
        });
      }

    } catch (error) {
      console.error('Error exportando Excel:', error);
      Alert.alert('Error', 'No se pudo exportar el Excel: ' + error.message);
    } finally {
      setExportingId(null);
    }
  };

  // ==========================================
  // FUNCIÓN PARA DROGUERÍA (INTACTA)
  // ==========================================
  const handleExportarExcel = async (inv) => {
    const idApertura = inv?.idaperturainventario || inv?.id;
    if (!idApertura) {
      Alert.alert('Error', 'No se encontró el identificador de apertura de este inventario.');
      return;
    }

    setExportingId(idApertura);
    try {
      const result = await exportarExcelDrogueriaPorApertura(inv);

      if (result.success && result.fileUri) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(result.fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: `Control Inventarios - ${inv.nombre_sucursal_inventario || 'Droguería'}`
          });
        } else {
          Alert.alert('✅ Éxito', 'Reporte generado correctamente en el dispositivo.');
        }
      } else {
        Alert.alert('Aviso', result.message || 'No se pudo generar el reporte Excel');
      }
    } catch (error) {
      console.error('Error al exportar reporte Excel:', error);
      Alert.alert('Error', 'Ocurrió un error al procesar el reporte');
    } finally {
      setExportingId(null);
    }
  };

  const esSucursalDrogueria = (sucursalId, sucursalNombre) => {
    return Number(sucursalId) === 66 || (sucursalNombre || '').toUpperCase().includes('DROGUERIA');
  };

  const conectarInventario = () => {
    if (!inventario || inventario.estado !== 'INICIADO') {
      Alert.alert('Inventario no disponible', 'No hay un inventario activo en tu sucursal.');
      return;
    }

    if (!isAdmin) {
      const sucursalUsuario = user?.sucursalNombre || '';
      const sucursalInventario = inventario?.nombre_sucursal_inventario || '';

      if (sucursalUsuario !== sucursalInventario) {
        Alert.alert(
          '⛔ Sucursal no coincide',
          `Usted se logueó con: ${sucursalUsuario}\n\nEl inventario activo pertenece a: ${sucursalInventario}\n\nCierre sesión y vuelva a ingresar con la sucursal correcta.`,
          [{ text: 'OK' }]
        );
        return;
      }
    }

    const esDrog = esSucursalDrogueria(user?.sucursalId, user?.sucursalNombre) ||
                   esSucursalDrogueria(inventario?.idsucursal_inventario, inventario?.nombre_sucursal_inventario);
    const targetScreen = esDrog ? 'InventoryDrogueria' : 'Inventory';

    navigation.replace(targetScreen, {
      user: user,
      inventarioActivo: inventario
    });
  };

  const esMismaSucursal = (inv, user) => {
    const esDrogUser = esSucursalDrogueria(user?.sucursalId, user?.sucursalNombre);
    const esDrogInv = esSucursalDrogueria(inv?.idsucursal_inventario, inv?.nombre_sucursal_inventario);
    if (esDrogUser && esDrogInv) return true;

    if (inv?.idsucursal_inventario && user?.sucursalId) {
      if (String(inv.idsucursal_inventario) === String(user.sucursalId)) return true;
    }

    const nombreInv = (inv?.nombre_sucursal_inventario || '').toLowerCase().trim();
    const nombreUser = (user?.sucursalNombre || '').toLowerCase().trim();
    return nombreInv === nombreUser || nombreInv.includes(nombreUser) || nombreUser.includes(nombreInv);
  };

  const crearNuevoInventario = async () => {
    try {
      setLoading(true);
      const data = await getInventarioEstado();
      const lista = data && data.success && Array.isArray(data.data) ? data.data : inventariosActivos;
      
      const invEnProgreso = lista.find(item => item.estado === 'INICIADO' && esMismaSucursal(item, user));
      if (invEnProgreso) {
        setLoading(false);
        const tipoDesc = invEnProgreso.tipo === 'TOTAL' ? 'GENERAL' : (invEnProgreso.tipo || 'CICLICO');
        const sucNombre = invEnProgreso.nombre_sucursal_inventario || user?.sucursalNombre || 'la sucursal';
        Alert.alert(
          '⚠️ Inventario en progreso',
          `Ya existe un inventario en curso (${tipoDesc}) para ${sucNombre}.\n\nDebe finalizarse ese inventario antes de iniciar uno nuevo.`
        );
        return;
      }
    } catch (err) {
      console.log('Error verificando inventario en curso:', err);
    } finally {
      setLoading(false);
    }

    const esDrog = esSucursalDrogueria(user?.sucursalId, user?.sucursalNombre);
    const targetScreen = esDrog ? 'InventoryDrogueria' : 'Inventory';

    navigation.navigate(targetScreen, { 
      user: user,
      crearNuevo: true
    });
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Cargando...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>📋 Estado del Inventario</Text>
      <Text style={styles.subtitle}>👤 Usuario: {user?.empleado || user?.name}</Text>
      <Text style={styles.subtitle}>🏢 Sucursal logueada: {user?.sucursalNombre || 'Sin sucursal'}</Text>
      
      {isAdmin && inventariosActivos.length > 0 && (
        <View style={styles.inventariosContainer}>
          <Text style={styles.inventariosTitle}>📋 INVENTARIOS REGISTRADOS</Text>
          {inventariosActivos.map((inv, index) => {
            const nombreInv = (inv.nombre_sucursal_inventario || '').toLowerCase().trim();
            const nombreUser = (user?.sucursalNombre || '').toLowerCase().trim();
            const esSucursalActual = nombreInv === nombreUser || nombreInv.includes(nombreUser) || nombreUser.includes(nombreInv);
            const esDrog = esSucursalDrogueria(inv?.idsucursal_inventario, inv?.nombre_sucursal_inventario);
            const idApertura = inv.idaperturainventario || inv.id;
            const isExportingThis = exportingId === idApertura;
            
            return (
              <TouchableOpacity 
                key={index} 
                style={[
                  styles.inventarioItem,
                  esSucursalActual && styles.inventarioItemActual
                ]}
                onPress={() => {
                  if (inv.estado === 'INICIADO') {
                    const targetScreen = esDrog ? 'InventoryDrogueria' : 'Inventory';
                    navigation.replace(targetScreen, {
                      user: user,
                      inventarioActivo: inv
                    });
                  }
                }}
                disabled={inv.estado !== 'INICIADO'}
              >
                <View style={styles.inventarioHeader}>
                  <Text style={styles.inventarioNombre}>
                    {esSucursalActual ? '⭐ ' : '🏢 '} {inv.nombre_sucursal_inventario || 'Sin sucursal'}
                  </Text>
                  <Text style={[
                    styles.inventarioEstado,
                    inv.estado === 'INICIADO' && styles.estadoBadgeVerde,
                    inv.estado === 'FINALIZADO' && styles.estadoBadgeRojo,
                    inv.estado === 'PENDIENTE' && styles.estadoBadgeAmarillo
                  ]}>
                    {inv.estado === 'INICIADO' ? '🟢 EN CURSO' : 
                     inv.estado === 'FINALIZADO' ? '🔴 FINALIZADO' : '🟡 PENDIENTE'}
                  </Text>
                </View>
                <View style={styles.inventarioDetalles}>
                  <Text style={styles.inventarioTipo}>📋 {inv.tipo || 'PARCIAL'}</Text>
                  {inv.fecha_inicio && (
                    <Text style={styles.inventarioFecha}>
                      📅 Inicio: {new Date(inv.fecha_inicio).toLocaleString()}
                    </Text>
                  )}
                  {esSucursalActual && (
                    <Text style={styles.inventarioActualTag}>⭐ Sucursal actual</Text>
                  )}
                  {inv.estado === 'INICIADO' && esSucursalActual && (
                    <Text style={styles.inventarioClickTag}>👆 Toca para ingresar</Text>
                  )}
                </View>

                {esDrog && (
                  <View style={styles.cardActionsContainer}>
                    <TouchableOpacity
                      style={styles.exportCardBtn}
                      onPress={() => handleExportarExcel(inv)}
                      disabled={isExportingThis}
                    >
                      {isExportingThis ? (
                        <View style={styles.btnRow}>
                          <ActivityIndicator size="small" color="#fff" />
                          <Text style={styles.exportCardBtnText}> Generando...</Text>
                        </View>
                      ) : (
                        <Text style={styles.exportCardBtnText}>📊 Exportar Excel</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
                 {/* 👇 NUEVO BOTÓN PARA SUCURSALES NORMALES EN LA LISTA 👇 */}
                {!esDrog && (
                  <View style={styles.cardActionsContainer}>
                    <TouchableOpacity
                      style={[styles.exportCardBtn, { backgroundColor: '#2980b9' }]}
                      onPress={() => handleExportarExcelFormato(inv)}
                      disabled={isExportingThis}
                    >
                      {isExportingThis ? (
                        <View style={styles.btnRow}>
                          <ActivityIndicator size="small" color="#fff" />
                          <Text style={styles.exportCardBtnText}> Generando...</Text>
                        </View>
                      ) : (
                        <Text style={styles.exportCardBtnText}>📑 Formato Oficial</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      
      {isAdmin && (
        <TouchableOpacity style={styles.adminButton} onPress={crearNuevoInventario}>
          <Text style={styles.adminButtonText}>🚀 CREAR NUEVO INVENTARIO</Text>
        </TouchableOpacity>
      )}
      
      {inventario && inventario.estado === 'INICIADO' ? (
        <TouchableOpacity style={styles.card} onPress={conectarInventario}>
          <Text style={styles.cardTitle}>📦 Inventario en tu sucursal</Text>
          <Text style={styles.cardInfo}>📋 Tipo: {inventario.tipo || 'PARCIAL'}</Text>
          <Text style={styles.cardInfo}>📅 Inicio: {new Date(inventario.fecha_inicio).toLocaleString()}</Text>
          {inventario.fecha_fin && (
            <Text style={styles.cardInfo}>🏁 Fin: {new Date(inventario.fecha_fin).toLocaleString()}</Text>
          )}
          <Text style={styles.cardInfo}>🏢 Sucursal: {inventario.nombre_sucursal_inventario || 'N/A'}</Text>
          <Text style={styles.cardStatus}>🟢 Estado: {inventario.estado}</Text>
          
          {!isAdmin && (
            <View style={[
              styles.sucursalMatch,
              user?.sucursalNombre === inventario.nombre_sucursal_inventario 
                ? styles.sucursalMatchOk 
                : styles.sucursalMatchError
            ]}>
              <Text style={styles.sucursalMatchText}>
                {user?.sucursalNombre === inventario.nombre_sucursal_inventario 
                  ? '✅ Las sucursales coinciden' 
                  : '❌ Las sucursales NO coinciden'}
              </Text>
            </View>
          )}
          
          <TouchableOpacity 
            style={[
              styles.connectButton,
              !isAdmin && user?.sucursalNombre !== inventario.nombre_sucursal_inventario && styles.connectButtonDisabled
            ]} 
            onPress={conectarInventario}
            disabled={!isAdmin && user?.sucursalNombre !== inventario.nombre_sucursal_inventario}
          >
            <Text style={styles.connectButtonText}>
              {isAdmin ? '🔗 Conectarse (Admin)' : '🔗 Conectarse al Inventario'}
            </Text>
          </TouchableOpacity>

          {esSucursalDrogueria(inventario?.idsucursal_inventario, inventario?.nombre_sucursal_inventario) && (
            <TouchableOpacity 
              style={styles.exportCardBtnGrande} 
              onPress={() => handleExportarExcel(inventario)}
              disabled={exportingId === (inventario.idaperturainventario || inventario.id)}
            >
              {exportingId === (inventario.idaperturainventario || inventario.id) ? (
                <View style={styles.btnRow}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.exportCardBtnText}> Generando Excel...</Text>
                </View>
              ) : (
                <Text style={styles.exportCardBtnText}>📊 Exportar Reporte Excel</Text>
              )}
            </TouchableOpacity>
          )}

         
        </TouchableOpacity>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyTitle}>No hay inventario activo en tu sucursal</Text>
          <Text style={styles.emptyText}>
            {isAdmin 
              ? 'Presione "CREAR NUEVO INVENTARIO" para iniciar uno.'
              : 'Espere a que el administrador inicie un inventario en esta sucursal.'}
          </Text>
        </View>
      )}

      <TouchableOpacity 
        style={styles.logoutButton} 
        onPress={() => {
          Alert.alert(
            'Cerrar Sesión',
            '¿Está seguro de que desea cerrar sesión?',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Sí, salir',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await AsyncStorage.removeItem('@auth_credentials');
                  } catch (e) {
                    console.error('Error limpiando sesión:', e);
                  }
                  navigation.replace('Login');
                }
              }
            ]
          );
        }}
      >
        <Text style={styles.logoutText}>🚪 Cerrar Sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#7f8c8d' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, color: '#2c3e50' },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 5, color: '#7f8c8d' },
  
  inventariosContainer: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#3498db',
  },
  inventariosTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
    textAlign: 'center',
  },
  inventarioItem: {
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  inventarioItemActual: {
    backgroundColor: '#e8f4fd',
    borderLeftColor: '#27ae60',
  },
  inventarioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inventarioNombre: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  inventarioEstado: {
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  inventarioDetalles: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 10,
    flexWrap: 'wrap',
  },
  inventarioTipo: {
    fontSize: 11,
    color: '#7f8c8d',
  },
  inventarioFecha: {
    fontSize: 10,
    color: '#95a5a6',
  },
  inventarioActualTag: {
    fontSize: 9,
    color: '#27ae60',
    fontWeight: 'bold',
    backgroundColor: '#e8f8f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inventarioClickTag: {
    fontSize: 9,
    color: '#3498db',
    fontWeight: 'bold',
    backgroundColor: '#e8f4fd',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  
  adminButton: { backgroundColor: '#27ae60', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 15 },
  adminButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 2 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 10 },
  cardInfo: { fontSize: 14, color: '#7f8c8d', marginTop: 5 },
  cardStatus: { fontSize: 14, fontWeight: 'bold', color: '#27ae60', marginTop: 10 },
  
  sucursalMatch: {
    marginTop: 10,
    padding: 8,
    borderRadius: 5,
    alignItems: 'center',
  },
  sucursalMatchOk: {
    backgroundColor: '#d4edda',
  },
  sucursalMatchError: {
    backgroundColor: '#f8d7da',
  },
  sucursalMatchText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  
  connectButton: { marginTop: 15, backgroundColor: '#3498db', padding: 15, borderRadius: 8, alignItems: 'center' },
  connectButtonDisabled: { backgroundColor: '#95a5a6' },
  connectButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  
  emptyContainer: { justifyContent: 'center', alignItems: 'center', paddingVertical: 30 },
  emptyIcon: { fontSize: 64, marginBottom: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  emptyText: { fontSize: 14, color: '#7f8c8d', textAlign: 'center' },
  
  logoutButton: { marginTop: 20, padding: 15, borderRadius: 10, alignItems: 'center' },
  logoutText: { color: '#e74c3c', fontWeight: 'bold', fontSize: 16 },
  
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
  
  cardActionsContainer: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  exportCardBtn: {
    backgroundColor: '#27ae60',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  exportCardBtnGrande: {
    backgroundColor: '#27ae60',
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportCardBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});