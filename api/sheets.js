import { google } from "googleapis";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));


const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });


export function getTodayColumnLabel(isClockOut = false) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const base = `${dd}/${mm}/${yy}`;
  return isClockOut ? `${base} (clock out)` : `${base} (clock in)`;
}

/**
 * Fetch all header values from row 1
 */
async function getHeaders(spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
  });
  return res.data.values?.[0] ?? [];
}

/**
 * Get the internal sheetId (numeric) for a named tab.
 * Required for batchUpdate operations like InsertDimension and SetDataValidation.
 */
async function getSheetId(spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = res.data.sheets.find(
    (s) => s.properties.title === sheetName
  );
  if (!sheet) {
    throw new Error(
      `Sheet tab "${sheetName}" not found. Available tabs: ` +
      res.data.sheets.map((s) => s.properties.title).join(", ")
    );
  }
  return sheet.properties.sheetId;
}

/**
 * Insert a new column at the end of the sheet, write the header,
 * and add a Present/Absent dropdown data validation for all data rows.
 * Returns the new column index (0-based).
 */
async function appendHeader(spreadsheetId, sheetName, headers, newHeader) {
  const sheetId = await getSheetId(spreadsheetId, sheetName);
  const newColIndex = headers.length; // 0-based index of the new column

  // Step 1: Insert a new blank column at the end (expands grid)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: newColIndex,
              endIndex: newColIndex + 1,
            },
            inheritFromBefore: false,
          },
        },
      ],
    },
  });

  // Step 2: Write the column header in row 1
  const colLetter = columnIndexToLetter(newColIndex);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${colLetter}1`,
    valueInputOption: "RAW",
    requestBody: { values: [[newHeader]] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: 1,       
              endRowIndex: 1000,
              startColumnIndex: newColIndex,
              endColumnIndex: newColIndex + 1,
            },
            rule: {
              condition: {
                type: "ONE_OF_LIST",
                values: [
                  { userEnteredValue: "Present" },
                  { userEnteredValue: "Absent" },
                ],
              },
              showCustomUi: true,  
              strict: false,     
            },
          },
        },
      ],
    },
  });

  return newColIndex;
}


function columnIndexToLetter(index) {
  let letter = "";
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}


async function findStudentRow(spreadsheetId, sheetName, username) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
  });

  const rows = res.data.values ?? [];
  if (rows.length === 0) return null;

  const headers = rows[0].map((h) => h.trim().toLowerCase());

  const giteaCol     = headers.findIndex((h) => h === "gitea username");
  const firstNameCol = headers.findIndex((h) => h === "first name");
  const lastNameCol  = headers.findIndex((h) => h === "last name");

  if (giteaCol === -1) {
    throw new Error(
      `Could not find a "Gitea Username" column. ` +
      `Headers found: [${rows[0].join(", ")}]`
    );
  }

  for (let i = 1; i < rows.length; i++) {
    const gitea = (rows[i][giteaCol] ?? "").trim().toLowerCase();
    if (gitea === username.trim().toLowerCase()) {
      return {
        rowIndex: i + 1, // 1-based sheet row
        firstName: firstNameCol !== -1 ? (rows[i][firstNameCol] ?? "") : "",
        lastName:  lastNameCol  !== -1 ? (rows[i][lastNameCol]  ?? "") : "",
      };
    }
  }

  return null;
}


export async function markAttendance(spreadsheetId, sheetName, username, isClockOut) {
  const columnLabel = getTodayColumnLabel(isClockOut);


  const student = await findStudentRow(spreadsheetId, sheetName, username);
  if (!student) {
    throw new Error(`Username "${username}" not found in the sheet.`);
  }


  let headers = await getHeaders(spreadsheetId, sheetName);
  let colIndex = headers.findIndex(
    (h) => h.trim().toLowerCase() === columnLabel.toLowerCase()
  );

  if (colIndex === -1) {
    colIndex = await appendHeader(spreadsheetId, sheetName, headers, columnLabel);
  }

  const colLetter = columnIndexToLetter(colIndex);
  const cellRange = `${sheetName}!${colLetter}${student.rowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: cellRange,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [["Present"]] },
  });

  return {
    ...student,
    columnLabel,
    colLetter,
    cellRange,
  };
}
