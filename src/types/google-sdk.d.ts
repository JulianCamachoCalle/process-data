interface GoogleTokenResponse {
  access_token?: string
  [key: string]: unknown
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: 'consent' | 'select_account' | '' | 'none' }) => void
}

interface GapiClient {
  init: (config: { apiKey: string; discoveryDocs: string[] }) => Promise<void>
  getToken: () => GoogleTokenResponse | null
  setToken: (token: GoogleTokenResponse | null) => void
  sheets: {
    spreadsheets: {
      get: (params: {
        spreadsheetId: string
        includeGridData?: boolean
      }) => Promise<{ result: { properties?: { title?: string } } }>
    }
  }
}

interface Gapi {
  load: (
    api: 'client',
    options: {
      callback: () => void
      onerror: () => void
      timeout: number
      ontimeout: () => void
    },
  ) => void
  client: GapiClient
}

interface GoogleAccounts {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: GoogleTokenResponse) => void
        error_callback?: (error: unknown) => void
      }) => TokenClient
      revoke: (token: string) => void
    }
  }
}

declare global {
  interface Window {
    gapi?: Gapi
    google?: GoogleAccounts
  }
}

export {}
