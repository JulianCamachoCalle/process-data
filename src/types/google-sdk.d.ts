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
        fields?: string
      }) => Promise<{
        result: {
          properties?: { title?: string }
          sheets?: Array<{ properties?: { title?: string; sheetId?: number } }>
        }
      }>
      batchUpdate: (params: {
        spreadsheetId: string
        resource: {
          requests: Array<{
            deleteDimension?: {
              range: {
                sheetId: number
                dimension: 'ROWS' | 'COLUMNS'
                startIndex: number
                endIndex: number
              }
            }
          }>
        }
      }) => Promise<unknown>
      values: {
        get: (params: {
          spreadsheetId: string
          range: string
          majorDimension?: 'ROWS' | 'COLUMNS'
          valueRenderOption?: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA'
          dateTimeRenderOption?: 'SERIAL_NUMBER' | 'FORMATTED_STRING'
        }) => Promise<{ result: { values?: string[][] } }>
        append: (params: {
          spreadsheetId: string
          range: string
          valueInputOption: 'RAW' | 'USER_ENTERED'
          insertDataOption?: 'OVERWRITE' | 'INSERT_ROWS'
          resource: {
            values: string[][]
          }
        }) => Promise<unknown>
        update: (params: {
          spreadsheetId: string
          range: string
          valueInputOption: 'RAW' | 'USER_ENTERED'
          resource: {
            values: string[][]
          }
        }) => Promise<unknown>
      }
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
