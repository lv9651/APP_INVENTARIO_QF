import { View, Text, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_VERSION } from '../utils/appConfig';

export default function GlobalHeader() {
  const insets = useSafeAreaInsets();
  const version = (typeof global !== 'undefined' && global.APP_VERSION) || APP_VERSION;

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        <View style={styles.leftSection}>
          <View style={styles.brandDot} />
          <Text style={styles.brandLabel} numberOfLines={1}>
            QF · INVENTARIO
          </Text>
        </View>

        <View style={styles.rightBadge}>
          <Image
            source={require('../screens/qf_farmacia_magistral_logo.jpg')}
            style={styles.logo}
            resizeMode="cover"
          />
          <Text style={styles.versionText}>v{version}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#d9ede5',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 10,
  },
  container: {
    height: 38,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#78BEA3',
    marginRight: 7,
  },
  brandLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.8,
  },
  rightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4fbf8',
    borderWidth: 1,
    borderColor: '#cde7dd',
    borderRadius: 9,
    paddingVertical: 3,
    paddingLeft: 4,
    paddingRight: 8,
  },
  logo: {
    width: 24,
    height: 24,
    borderRadius: 5,
  },
  versionText: {
    marginLeft: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#2b6e56',
    letterSpacing: 0.3,
  },
});
