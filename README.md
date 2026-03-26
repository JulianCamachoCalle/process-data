# Storm Finance - Fork Setup Google Sheets

Fork local enfocado solo en el apartado de inicio para conectar Google Sheets.

Este recorte conserva la configuracion base de OAuth 2.0 + Google Sheets API para validar credenciales rapidamente y dejar inicializada la hoja.

## Incluye

- Pantalla unica de inicio con estado de conexion
- Checklist visual de variables de entorno
- Boton para conectar y desconectar Google OAuth
- Inicializacion automatica del spreadsheet al autenticar

## Requisitos

- Node.js 20+
- Proyecto en Google Cloud con Google Sheets API habilitada
- Credencial OAuth 2.0 tipo Web Application
- API Key activa para desarrollo
- Un Spreadsheet creado en tu Google Drive

## Variables de entorno

Crea un archivo .env a partir de .env.example:

VITE_GOOGLE_CLIENT_ID=tu_client_id
VITE_GOOGLE_API_KEY=tu_api_key
VITE_SPREADSHEET_ID=tu_spreadsheet_id

## Correr local

1. npm install
2. npm run dev
3. Abre http://localhost:5173

## Flujo rapido

1. Completa credenciales en .env
2. Inicia la app
3. Pulsa Conectar con Google
4. Acepta permisos
5. Verifica estado Conexion activa

## Notas

- Si falla el inicio, revisa Authorized JavaScript origins y redirect URI en Google Cloud.
- La app intenta crear las pestanas base si no existen.
