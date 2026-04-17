import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

export default function ConsolidateScreen({ onClose }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📊 CONSOLIDAR INVENTARIOS</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>✕ Cerrar</Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Función de Consolidación</Text>
          <Text style={styles.infoText}>
            Esta función permite combinar inventarios de múltiples usuarios y sesiones.
          </Text>
        </View>
        
        <View style={styles.featureCard}>
          <Text style={styles.featureTitle}>✅ Características:</Text>
          <Text style={styles.featureItem}>• Consolidar inventarios de diferentes usuarios</Text>
          <Text style={styles.featureItem}>• Agrupar productos por código de barras</Text>
          <Text style={styles.featureItem}>• Sumar cantidades automáticamente</Text>
          <Text style={styles.featureItem}>• Identificar origen de cada producto</Text>
        </View>
        
        {!showInfo ? (
          <TouchableOpacity style={styles.simulateButton} onPress={() => setShowInfo(true)}>
            <Text style={styles.simulateButtonText}>🔄 Simular Consolidación</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>📊 Resultado de Consolidación (Simulación)</Text>
            <Text style={styles.resultText}>• Sesiones consolidadas: 3</Text>
            <Text style={styles.resultText}>• Productos únicos: 15</Text>
            <Text style={styles.resultText}>• Total unidades: 247</Text>
            <Text style={styles.resultText}>• Fecha: {new Date().toLocaleString()}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#ddd' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  closeText: { fontSize: 16, color: '#e74c3c', fontWeight: 'bold' },
  content: { padding: 15 },
  infoCard: { backgroundColor: '#3498db', padding: 20, borderRadius: 10, marginBottom: 15 },
  infoTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  infoText: { fontSize: 14, color: '#fff' },
  featureCard: { backgroundColor: '#fff', padding: 20, borderRadius: 10, marginBottom: 15 },
  featureTitle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50', marginBottom: 10 },
  featureItem: { fontSize: 14, color: '#555', marginBottom: 5 },
  simulateButton: { backgroundColor: '#9b59b6', padding: 15, borderRadius: 10, alignItems: 'center' },
  simulateButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  resultCard: { backgroundColor: '#27ae60', padding: 20, borderRadius: 10, marginTop: 15 },
  resultTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  resultText: { fontSize: 14, color: '#fff', marginBottom: 5 }
});