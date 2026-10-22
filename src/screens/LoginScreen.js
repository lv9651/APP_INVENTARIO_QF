import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login, listarSucursales, obtenerInfoUsuario } from '../services/api';

export default function LoginScreen({ navigation, route }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [sucursales, setSucursales] = useState([]);
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState(null);
  const [cargandoSucursales, setCargandoSucursales] = useState(false);
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const [autoLoginLoading, setAutoLoginLoading] = useState(true);

  useEffect(() => {
    inicializar();
  }, []);

  // Cargar sucursales al escribir el username (SIN contraseña)
  useEffect(() => {
    if (!username || username.trim().length < 3) {
      setSucursales([]);
      setSucursalSeleccionada(null);
      setDropdownAbierto(false);
      return;
    }

    const timer = setTimeout(async () => {
      await cargarSucursalesPorUsuario(username.trim());
    }, 600);

    return () => clearTimeout(timer);
  }, [username]);

  const cargarSucursalesPorUsuario = async (userName) => {
    try {
      setCargandoSucursales(true);

      const info = await obtenerInfoUsuario(userName);

      if (!info || !info.area) {
        setSucursales([]);
        setSucursalSeleccionada(null);
        setCargandoSucursales(false);
        return;
      }

      const esAdminUser = (info.area || '').toUpperCase().includes('ADMIN');
      const todas = await listarSucursales();

      let listaFinal;
      if (esAdminUser) {
        listaFinal = todas;
      } else {
        listaFinal = todas.filter(s => s.idsucursal === info.idsucursal);
        if (listaFinal.length === 0 && info.idsucursal) {
          listaFinal = [{ idsucursal: info.idsucursal, nombreSucursal: 'Mi sucursal' }];
        }
      }

      setSucursales(listaFinal);

      if (listaFinal.length === 1) {
        setSucursalSeleccionada(listaFinal[0]);
      } else {
        setSucursalSeleccionada(null);
      }

      setCargandoSucursales(false);
    } catch (error) {
      console.error('Error cargando sucursales:', error);
      setSucursales([]);
      setSucursalSeleccionada(null);
      setCargandoSucursales(false);
    }
  };

  const inicializar = async () => {
    try {
      setAutoLoginLoading(true);
      const storedCredsRaw = await AsyncStorage.getItem('@auth_credentials').catch(() => null);

      if (storedCredsRaw) {
        const creds = JSON.parse(storedCredsRaw);
        if (creds?.username && creds?.password) {
          setUsername(creds.username);
          setPassword(creds.password);

          const result = await login(creds.username, creds.password);
          if (result.success) {
            const info = await obtenerInfoUsuario(creds.username).catch(() => null);
            const todas = await listarSucursales().catch(() => []);
            const esAdminUser = (info?.area || result.user?.role || '').toUpperCase().includes('ADMIN');
            const listaFinal = esAdminUser
              ? todas
              : todas.filter(s => s.idsucursal === (info?.idsucursal || result.user?.sucursal));

            let sucursalToUse = listaFinal.find(s => s.idsucursal === creds.sucursal?.idsucursal) || listaFinal[0];
            if (sucursalToUse) {
              navigation.replace('SelectInventory', {
                user: {
                  ...result.user,
                  sucursalId: sucursalToUse.idsucursal,
                  sucursalNombre: sucursalToUse.nombreSucursal,
                },
              });
              return;
            }
          }
        }
      }
    } catch (e) {
      console.error('Error en auto-login:', e);
    } finally {
      setAutoLoginLoading(false);
    }
  };

  const cancelarAutoLogin = async () => {
    await AsyncStorage.removeItem('@auth_credentials').catch(() => {});
    setAutoLoginLoading(false);
  };

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Ingrese usuario y contraseña');
      return;
    }
    if (!sucursalSeleccionada) {
      Alert.alert('Error', 'Seleccione una sucursal');
      return;
    }

    setLoading(true);
    const result = await login(username, password);

    if (result.success) {
      try {
        await AsyncStorage.setItem('@auth_credentials', JSON.stringify({
          username: username.trim(),
          password,
          sucursal: sucursalSeleccionada,
        }));
      } catch (e) { console.error(e); }

      navigation.replace('SelectInventory', {
        user: {
          ...result.user,
          sucursalId: sucursalSeleccionada.idsucursal,
          sucursalNombre: sucursalSeleccionada.nombreSucursal,
        },
      });
    } else {
      Alert.alert('Error', result.message);
    }
    setLoading(false);
  };

  if (autoLoginLoading) {
    return (
      <View style={styles.loadingScreenContainer}>
        <Text style={styles.title}>📦 INVENTARIO QF</Text>
        <Text style={styles.subtitle}>Módulo de Toma de Inventarios</Text>
        <ActivityIndicator size="large" color="#3498db" style={{ marginVertical: 20 }} />
        <Text style={styles.autoLoginText}>Iniciando sesión automáticamente...</Text>
        <TouchableOpacity style={styles.cancelAutoLoginButton} onPress={cancelarAutoLogin}>
          <Text style={styles.cancelAutoLoginText}>Cancelar e ingresar manualmente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>📦 INVENTARIO QF</Text>
      <Text style={styles.subtitle}>Módulo de Toma de Inventarios</Text>

      {/* 1. Usuario */}
      <TextInput
        style={styles.input}
        placeholder="Usuario"
        placeholderTextColor="#999"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      {/* 2. Contraseña */}
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Contraseña"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
          <Text>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
        </TouchableOpacity>
      </View>

      {/* 3. Sucursal - aparece DEBAJO de la contraseña */}
      {username.trim().length >= 3 && (
        <View style={styles.branchContainer}>
          <TouchableOpacity
            style={styles.branchSelector}
            onPress={() => setDropdownAbierto(!dropdownAbierto)}
            disabled={cargandoSucursales || sucursales.length === 0}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.branchSelectorLabel}>🏢 Sucursal</Text>
              <Text style={styles.branchSelectorValue}>
                {cargandoSucursales
                  ? 'Cargando...'
                  : sucursalSeleccionada
                    ? sucursalSeleccionada.nombreSucursal
                    : sucursales.length === 0
                      ? 'Usuario no encontrado'
                      : 'Seleccionar sucursal'}
              </Text>
            </View>
            <Text style={styles.branchSelectorIcon}>{dropdownAbierto ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {/* Lista desplegable inline */}
          {dropdownAbierto && sucursales.length > 0 && (
            <View style={styles.dropdownList}>
              <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                {sucursales.map((item) => (
                  <TouchableOpacity
                    key={item.idsucursal.toString()}
                    style={[
                      styles.branchOption,
                      sucursalSeleccionada?.idsucursal === item.idsucursal && styles.branchOptionSelected,
                    ]}
                    onPress={() => {
                      setSucursalSeleccionada(item);
                      setDropdownAbierto(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.branchOptionText,
                        sucursalSeleccionada?.idsucursal === item.idsucursal && styles.branchOptionTextSelected,
                      ]}
                    >
                      {item.nombreSucursal}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* 4. Botón Iniciar Sesión */}
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>🚀 Iniciar Sesión</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, color: '#2c3e50' },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 30, color: '#7f8c8d' },

  input: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 15, fontSize: 16, borderWidth: 1, borderColor: '#ddd' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
  passwordInput: { flex: 1, padding: 15, fontSize: 16 },
  eyeButton: { padding: 15 },
  button: { backgroundColor: '#3498db', padding: 15, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  branchContainer: { marginBottom: 15, position: 'relative' },
  branchSelector: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 15,
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', position: 'relative',
  },
  branchSelectorLabel: {
    fontSize: 12, color: '#7f8c8d', position: 'absolute', top: -8,
    left: 10, backgroundColor: '#fff', paddingHorizontal: 5, zIndex: 1,
  },
  branchSelectorValue: { fontSize: 16, color: '#2c3e50', flex: 1, marginTop: 4 },
  branchSelectorIcon: { fontSize: 14, color: '#7f8c8d', marginLeft: 8 },

  dropdownList: {
    marginTop: 5,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  branchOption: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  branchOptionSelected: { backgroundColor: '#3498db' },
  branchOptionText: { fontSize: 16, color: '#2c3e50' },
  branchOptionTextSelected: { color: '#fff' },

  loadingScreenContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#f5f5f5' },
  autoLoginText: { fontSize: 16, color: '#2c3e50', fontWeight: '600', marginTop: 10, textAlign: 'center' },
  cancelAutoLoginButton: { marginTop: 25, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#e74c3c' },
  cancelAutoLoginText: { color: '#e74c3c', fontSize: 14, fontWeight: 'bold' },
});