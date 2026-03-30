import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

let cachedDoc: GoogleSpreadsheet | null = null;

export async function getRawSheet(sheetName: string) {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
    throw new Error('Faltan credenciales de Google Service Account o el ID de hoja en variables de entorno');
  }

  const privateKey = GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

  if (!cachedDoc) {
    const jwt = new JWT({
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: privateKey,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ],
    });

    cachedDoc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, jwt);
    await cachedDoc.loadInfo(); 
  } else {
    // Reload info to ensure we have up-to-date structure
    await cachedDoc.loadInfo();
  }

  const sheet = cachedDoc.sheetsByTitle[sheetName];
  if (!sheet) {
    throw new Error(`No se encontró una hoja con el nombre "${sheetName}" en el documento`);
  }

  return sheet;
}

export async function getGoogleSheet(sheetName: string) {
  const sheet = await getRawSheet(sheetName);
  const rows = await sheet.getRows();
  
  return {
    columns: sheet.headerValues,
    rows: rows.map((row, index) => {
      const obj = row.toObject();
      return { ...obj, _rowIndex: index }; // Inject index for frontend matching
    }),
  };
}
