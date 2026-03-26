// ===== Configuración de Google Sheets API =====
//
// SETUP:
// 1. Ve a https://console.cloud.google.com/
// 2. Crea un proyecto nuevo
// 3. Habilita "Google Sheets API" en APIs & Services > Library
// 4. Crea credenciales OAuth 2.0:
//    - APIs & Services > Credentials > Create Credentials > OAuth Client ID
//    - Type: Web application
//    - Authorized JS origins: http://localhost:5173 (y tu dominio en prod)
//    - Authorized redirect URIs: http://localhost:5173
// 5. También crea una API Key (sin restricciones para dev)
// 6. Crea una Google Sheet y copia el ID de la URL
//    (https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit)
// 7. Copia los valores al archivo .env

const { VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY, VITE_SPREADSHEET_ID } = import.meta.env

export const GOOGLE_CONFIG = {
  CLIENT_ID: VITE_GOOGLE_CLIENT_ID || '',
  API_KEY: VITE_GOOGLE_API_KEY || '',
  SPREADSHEET_ID: VITE_SPREADSHEET_ID || '',
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets openid email profile',
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
}

