// ─── GOOGLE SHEETS API ───
// REST API with OAuth refresh token — no SDK.

async function getAccessToken() {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(`Google auth error: ${data.error_description || data.error}`);
  return data.access_token;
}

export async function createSpreadsheet({ title, sheet_name = "Sheet1", headers, data }) {
  const token = await getAccessToken();

  // Step 1: Create the spreadsheet
  const createResp = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: sheet_name } }],
    }),
  });
  const sheet = await createResp.json();
  if (sheet.error) throw new Error(`Sheets API error: ${sheet.error.message}`);

  const spreadsheetId = sheet.spreadsheetId;
  const spreadsheetUrl = sheet.spreadsheetUrl;

  // Step 2: Add headers and data if provided
  const rows = [];
  if (headers) rows.push(headers);
  if (data) rows.push(...data);

  if (rows.length > 0) {
    const range = `${sheet_name}!A1`;
    const appendResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ range: `${sheet_name}!A1`, majorDimension: "ROWS", values: rows }),
      }
    );
    const appendData = await appendResp.json();
    if (appendData.error) throw new Error(`Sheets append error: ${appendData.error.message}`);
  }

  // Step 3: Bold headers if provided
  if (headers) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: { red: 0.2, green: 0.4, blue: 0.65, alpha: 1 },
                },
              },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
              fields: "gridProperties.frozenRowCount",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: headers.length },
            },
          },
        ],
      }),
    });
  }

  return {
    success: true,
    spreadsheet_id: spreadsheetId,
    url: spreadsheetUrl,
    title,
    rows_added: rows.length,
    message: `Spreadsheet "${title}" created. Open it here: ${spreadsheetUrl}`,
  };
}

export async function addRows({ spreadsheet_id, sheet_name = "Sheet1", data }) {
  const token = await getAccessToken();
  const range = `${sheet_name}!A:A`;

  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ majorDimension: "ROWS", values: data }),
    }
  );
  const result = await resp.json();
  if (result.error) throw new Error(`Sheets append error: ${result.error.message}`);

  return {
    success: true,
    rows_added: data.length,
    updated_range: result.updates?.updatedRange,
    message: `Added ${data.length} row(s) to the spreadsheet.`,
  };
}

export async function readSheet({ spreadsheet_id, range }) {
  const token = await getAccessToken();
  const sheetRange = range || "Sheet1";

  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(sheetRange)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  if (data.error) throw new Error(`Sheets read error: ${data.error.message}`);

  const values = data.values || [];
  return {
    range: data.range,
    headers: values.length > 0 ? values[0] : [],
    rows: values.slice(1),
    total_rows: Math.max(0, values.length - 1),
    message: `Read ${values.length} rows from spreadsheet.`,
  };
}
