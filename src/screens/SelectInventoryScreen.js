import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { getInventarioEstado } from '../services/api';

export default function SelectInventoryScreen({ navigation, route }) {
  const { user } = route.params;
  const [inventario, setInventario] = useState(null);
  const [inventariosActivos, setInventariosActivos] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === 'ADMINISTRADOR';

  useEffect(() => {
    cargarEstadoInventario();
  }, []);

  const cargarEstadoInventario = async () => {
    try {
      const data = await getInventarioEstado();
      console.log('Estado inventario:', data);
      
      // ✅ NUEVO: La API devuelve { success: true, data: [...] }
      if (data && data.success && data.data && Array.isArray(data.data)) {
        // Guardar todos los inventarios activos
        setInventariosActivos(data.data);
        
        // Buscar el inventario de la sucursal actual
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
        // Fallback para respuesta antigua (un solo objeto)
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

  const conectarInventario = () => {
    if (!inventario || inventario.estado !== 'INICIADO') {
      Alert.alert('Inventario no disponible', 'No hay un inventario activo en tu sucursal.');
      return;
    }

    // 👈 SI ES ADMIN, NO VALIDA SUCURSAL
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

    navigation.replace('Inventory', {
      user: user,
      inventarioActivo: inventario
    });
  };

  const crearNuevoInventario = () => {
    navigation.navigate('Inventory', { 
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
      
      {/* ==========================================
          ⭐ SECCIÓN: TODOS LOS INVENTARIOS ACTIVOS
          ========================================== */}
      {isAdmin && inventariosActivos.length > 0 && (
        <View style={styles.inventariosContainer}>
          <Text style={styles.inventariosTitle}>📋 INVENTARIOS ACTIVOS</Text>
          {inventariosActivos.map((inv, index) => {
            const nombreInv = (inv.nombre_sucursal_inventario || '').toLowerCase().trim();
            const nombreUser = (user?.sucursalNombre || '').toLowerCase().trim();
            const esSucursalActual = nombreInv === nombreUser || nombreInv.includes(nombreUser) || nombreUser.includes(nombreInv);
            
            return (
              <TouchableOpacity 
                key={index} 
                style={[
                  styles.inventarioItem,
                  esSucursalActual && styles.inventarioItemActual
                ]}
                onPress={() => {
                  if (inv.estado === 'INICIADO') {
                    // Si el admin toca un inventario, ir a ese inventario
                    navigation.replace('Inventory', {
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
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      
      {/* ==========================================
          BOTÓN CREAR NUEVO INVENTARIO - SOLO ADMIN
          ========================================== */}
      {isAdmin && (
        <TouchableOpacity style={styles.adminButton} onPress={crearNuevoInventario}>
          <Text style={styles.adminButtonText}>🚀 CREAR NUEVO INVENTARIO</Text>
        </TouchableOpacity>
      )}
      
      {/* ==========================================
          INVENTARIO DE LA SUCURSAL ACTUAL
          ========================================== */}
      {inventario && inventario.estado === 'INICIADO' ? (
        <TouchableOpacity style={styles.card} onPress={conectarInventario}>
          <Text style={styles.cardTitle}>📦 Inventario en tu sucursal</Text>
          <Text style={styles.cardInfo}>📋 Tipo: {inventario.tipo || 'PARCIAL'}</Text>
          <Text style={styles.cardInfo}>📅 Inicio: {new Date(inventario.fecha_inicio).toLocaleString()}</Text>
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

      <TouchableOpacity style={styles.logoutButton} onPress={() => navigation.replace('Login')}>
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
  
  // ⭐ INVENTARIOS ACTIVOS
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
});