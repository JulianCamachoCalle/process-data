import { GOOGLE_CONFIG } from '../config/google'

export interface GoogleUserProfile {
  email: string
  name: string
  imageUrl: string
}

export interface SpreadsheetMetadata {
  id: string
  title: string
}

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: 'consent' | 'select_account' | '' }) => void
}

type TokenSuccessHandler = (response: TokenResponse) => void

type TokenErrorHandler = (error: unknown) => void

const REQUIRED_ENV = [
  { key: 'VITE_GOOGLE_CLIENT_ID', value: GOOGLE_CONFIG.CLIENT_ID },
  { key: 'VITE_GOOGLE_API_KEY', value: GOOGLE_CONFIG.API_KEY },
  { key: 'VITE_SPREADSHEET_ID', value: GOOGLE_CONFIG.SPREADSHEET_ID },
]

let tokenClient: TokenClient | null = null

export function getMissingEnvVariables(): string[] {
  return REQUIRED_ENV.filter((envVar) => !envVar.value).map((envVar) => envVar.key)
}

export async function waitForGoogleSdk(timeoutMs = 25000): Promise<void> {
  const start = Date.now()

  await new Promise<void>((resolve, reject) => {
    const intervalId = window.setInterval(() => {
      const sdkLoaded = Boolean(window.gapi && window.google)
      if (sdkLoaded) {
        window.clearInterval(intervalId)
        resolve()
        return
      }

      if (Date.now() - start > timeoutMs) {
        window.clearInterval(intervalId)
        reject(new Error('Google SDK no cargo en el tiempo esperado.'))
      }
    }, 120)
  })
}

export async function initGapiClient(): Promise<void> {
  if (!window.gapi) {
    throw new Error('gapi no esta disponible en window.')
  }

  if (!GOOGLE_CONFIG.API_KEY) {
    throw new Error('Falta VITE_GOOGLE_API_KEY en .env')
  }

  await new Promise<void>((resolve, reject) => {
    window.gapi?.load('client', {
      callback: () => resolve(),
      onerror: () => reject(new Error('No se pudo cargar gapi.client')),
      timeout: 8000,
      ontimeout: () => reject(new Error('Timeout cargando gapi.client')),
    })
  })

  await window.gapi.client.init({
    apiKey: GOOGLE_CONFIG.API_KEY,
    discoveryDocs: GOOGLE_CONFIG.DISCOVERY_DOCS,
  })
}

export function initTokenClient(onSuccess: TokenSuccessHandler, onError: TokenErrorHandler): void {
  if (!window.google) {
    throw new Error('Google Identity Services no esta disponible en window.')
  }

  if (!GOOGLE_CONFIG.CLIENT_ID) {
    throw new Error('Falta VITE_GOOGLE_CLIENT_ID en .env')
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CONFIG.CLIENT_ID,
    scope: GOOGLE_CONFIG.SCOPES,
    callback: onSuccess,
    error_callback: onError,
  })
}

export function requestAccessToken(prompt: 'consent' | 'select_account' | '' = 'consent'): void {
  if (!tokenClient) {
    throw new Error('Token client no inicializado.')
  }

  tokenClient.requestAccessToken({ prompt })
}

export function revokeToken(): void {
  const token = window.gapi?.client.getToken()
  if (token?.access_token) {
    window.google?.accounts.oauth2.revoke(token.access_token)
  }

  window.gapi?.client.setToken(null)
}

export async function fetchUserProfile(): Promise<GoogleUserProfile> {
  const token = window.gapi?.client.getToken()
  if (!token?.access_token) {
    throw new Error('No existe token de acceso activo.')
  }

  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
    },
  })

  if (!response.ok) {
    throw new Error('No se pudo leer el perfil de Google del usuario.')
  }

  const data = (await response.json()) as {
    email?: string
    name?: string
    picture?: string
  }

  return {
    email: data.email || '',
    name: data.name || 'Usuario',
    imageUrl: data.picture || '',
  }
}

export async function validateSpreadsheetAccess(): Promise<SpreadsheetMetadata> {
  const spreadsheetId = GOOGLE_CONFIG.SPREADSHEET_ID

  if (!spreadsheetId) {
    throw new Error('Falta VITE_SPREADSHEET_ID en .env')
  }

  if (!window.gapi?.client?.sheets) {
    throw new Error('Google Sheets API no esta disponible en gapi.client.')
  }

  const response = await window.gapi.client.sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
  })

  const title = response.result?.properties?.title || 'Sin titulo'

  return {
    id: spreadsheetId,
    title,
  }
}
