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
  expires_in?: number | string
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: 'consent' | 'select_account' | '' }) => void
}

type TokenSuccessHandler = (response: TokenResponse) => void

type TokenErrorHandler = (error: unknown) => void

export interface PersistedAuthSession {
  accessToken: string
  expiresAt: number
  user: GoogleUserProfile
  spreadsheetTitle: string
}

const REQUIRED_ENV = [
  { key: 'VITE_GOOGLE_CLIENT_ID', value: GOOGLE_CONFIG.CLIENT_ID },
  { key: 'VITE_GOOGLE_API_KEY', value: GOOGLE_CONFIG.API_KEY },
  { key: 'VITE_SPREADSHEET_ID', value: GOOGLE_CONFIG.SPREADSHEET_ID },
]

let tokenClient: TokenClient | null = null

const SESSION_COOKIE_NAME = 'process_data_auth'
const SESSION_STORAGE_KEY = 'process_data_auth'
const DEFAULT_TOKEN_TTL_SECONDS = 3600

function getCookieValue(name: string): string | null {
  const encodedName = `${name}=`
  const cookies = document.cookie.split(';')

  for (const cookiePart of cookies) {
    const cookie = cookiePart.trim()
    if (cookie.startsWith(encodedName)) {
      return cookie.slice(encodedName.length)
    }
  }

  return null
}

function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  const securePart = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${value}; Path=/; Max-Age=${Math.max(0, maxAgeSeconds)}; SameSite=Lax${securePart}`
}

function normalizeExpiresInSeconds(rawValue: number | string | undefined): number {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
    return Math.floor(rawValue)
  }

  if (typeof rawValue === 'string') {
    const parsed = Number.parseInt(rawValue, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return DEFAULT_TOKEN_TTL_SECONDS
}

function clearPersistedCookie(): void {
  document.cookie = `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
}

function writeSessionToStorage(payload: PersistedAuthSession): void {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Si falla localStorage, la cookie sigue siendo respaldo.
  }
}

function clearPersistedStorage(): void {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Evita cortar el flujo por bloqueos del navegador.
  }
}

function parsePersistedSession(rawValue: string): PersistedAuthSession | null {
  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedAuthSession>

    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      !parsed.user ||
      typeof parsed.user.email !== 'string' ||
      typeof parsed.user.name !== 'string' ||
      typeof parsed.user.imageUrl !== 'string' ||
      typeof parsed.spreadsheetTitle !== 'string'
    ) {
      return null
    }

    if (parsed.expiresAt <= Date.now()) {
      return null
    }

    return {
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
      user: parsed.user,
      spreadsheetTitle: parsed.spreadsheetTitle,
    }
  } catch {
    return null
  }
}

function readSessionFromStorage(): PersistedAuthSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = parsePersistedSession(raw)
    if (!parsed) {
      clearPersistedStorage()
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function clearPersistedSession(): void {
  clearPersistedCookie()
  clearPersistedStorage()
}

export function saveSessionToCookie(args: {
  tokenResponse: TokenResponse
  user: GoogleUserProfile
  spreadsheetTitle: string
}): void {
  const accessToken = args.tokenResponse.access_token
  if (!accessToken) {
    return
  }

  const tokenLifetimeSeconds = normalizeExpiresInSeconds(args.tokenResponse.expires_in)
  const safeMaxAge = Math.max(60, tokenLifetimeSeconds - 30)

  const payload: PersistedAuthSession = {
    accessToken,
    expiresAt: Date.now() + safeMaxAge * 1000,
    user: args.user,
    spreadsheetTitle: args.spreadsheetTitle,
  }

  setCookie(SESSION_COOKIE_NAME, encodeURIComponent(JSON.stringify(payload)), safeMaxAge)
  writeSessionToStorage(payload)
}

export function readSessionFromCookie(): PersistedAuthSession | null {
  const rawCookie = getCookieValue(SESSION_COOKIE_NAME)
  if (rawCookie) {
    let decodedCookie = ''

    try {
      decodedCookie = decodeURIComponent(rawCookie)
    } catch {
      clearPersistedCookie()
    }

    const parsedFromCookie = decodedCookie ? parsePersistedSession(decodedCookie) : null
    if (parsedFromCookie) {
      writeSessionToStorage(parsedFromCookie)
      return parsedFromCookie
    }

    clearPersistedCookie()
  }

  const parsedFromStorage = readSessionFromStorage()
  if (parsedFromStorage) {
    const remainingSeconds = Math.max(60, Math.floor((parsedFromStorage.expiresAt - Date.now()) / 1000))
    setCookie(SESSION_COOKIE_NAME, encodeURIComponent(JSON.stringify(parsedFromStorage)), remainingSeconds)
    return parsedFromStorage
  }

  clearPersistedStorage()
  return null
}

export function setActiveAccessToken(accessToken: string): void {
  window.gapi?.client.setToken({ access_token: accessToken })
}

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
  clearPersistedSession()
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
