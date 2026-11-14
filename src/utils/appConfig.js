// Variables globales de configuración de la aplicación
export const APP_VERSION = '0.0.1';

if (typeof global !== 'undefined') {
  global.APP_VERSION = APP_VERSION;
}
