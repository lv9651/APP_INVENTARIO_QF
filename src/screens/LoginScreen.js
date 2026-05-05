import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Modal, FlatList } from 'react-native';
import { login, listarSucursales } from '../services/api';

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Estados para sucursal
  const [sucursales, setSucursales] = useState([]);
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [cargandoSucursales, setCargandoSucursales] = useState(true);

  // Cargar sucursales al iniciar
  useEffect(() => {
    cargarSucursales();
  }, []);

  const cargarSucursales = async () => {
    try {
      setCargandoSucursales(true);
      const data = await listarSucursales();
      console.log('Sucursales:', data);
      
      if (data && data.length > 0) {
        setSucursales(data);
        setSucursalSeleccionada(data[0]);
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'No se pudieron cargar las sucursales');
    } finally {
      setCargandoSucursales(false);
    }
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
      // Agregar la sucursal seleccionada al objeto user
      const userWithBranch = {
        ...result.user,
        sucursalId: sucursalSeleccionada.idsucursal,
        sucursalNombre: sucursalSeleccionada.nombreSucursal
      };
      navigation.replace('Inventory', { user: userWithBranch });
    } else {
      Alert.alert('Error', result.message);
    }
    
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📦 INVENTARIO ORVIT</Text>
      <Text style={styles.subtitle}>Módulo de Toma de Inventarios</Text>
      
      {/* Selector de Sucursal */}
      <TouchableOpacity 
        style={styles.branchSelector} 
        onPress={() => setModalVisible(true)}
        disabled={cargandoSucursales}
      >
        <Text style={styles.branchSelectorLabel}>🏢 Sucursal</Text>
        <Text style={styles.branchSelectorValue}>
          {cargandoSucursales 
            ? 'Cargando...' 
            : sucursalSeleccionada 
              ? sucursalSeleccionada.nombreSucursal 
              : 'Seleccionar sucursal'}
        </Text>
        <Text style={styles.branchSelectorIcon}>▼</Text>
      </TouchableOpacity>
      
      <TextInput
        style={styles.input}
        placeholder="Usuario"
        placeholderTextColor="#999"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />
      
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
      
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>🚀 Iniciar Sesión</Text>}
      </TouchableOpacity>

      {/* Modal para seleccionar sucursal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Seleccionar Sucursal</Text>
            
            <FlatList
              data={sucursales}
              keyExtractor={(item) => item.idsucursal.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.branchOption,
                    sucursalSeleccionada?.idsucursal === item.idsucursal && styles.branchOptionSelected
                  ]}
                  onPress={() => {
                    setSucursalSeleccionada(item);
                    setModalVisible(false);
                  }}
                >
                  <Text style={[
                    styles.branchOptionText,
                    sucursalSeleccionada?.idsucursal === item.idsucursal && styles.branchOptionTextSelected
                  ]}>
                    {item.nombreSucursal}
                  </Text>
                </TouchableOpacity>
              )}
            />
            
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, color: '#2c3e50' },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 30, color: '#7f8c8d' },
  
  branchSelector: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  branchSelectorLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    position: 'absolute',
    top: -8,
    left: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 5,
    zIndex: 1,
  },
  branchSelectorValue: {
    fontSize: 16,
    color: '#2c3e50',
    flex: 1,
  },
  branchSelectorIcon: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  
  input: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 15, fontSize: 16, borderWidth: 1, borderColor: '#ddd' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
  passwordInput: { flex: 1, padding: 15, fontSize: 16 },
  eyeButton: { padding: 15 },
  button: { backgroundColor: '#3498db', padding: 15, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#2c3e50',
  },
  branchOption: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  branchOptionSelected: {
    backgroundColor: '#3498db',
  },
  branchOptionText: {
    fontSize: 16,
    color: '#2c3e50',
  },
  branchOptionTextSelected: {
    color: '#fff',
  },
  closeButton: {
    marginTop: 15,
    padding: 12,
    backgroundColor: '#e74c3c',
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});