// ─── GOOGLE DRIVE API ───
// Browse, search, and manage files in Google Drive via REST API.

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

async function driveFetch(path, options = {}) {
  const token = await getAccessToken();
  const baseUrl = "https://www.googleapis.com/drive/v3";
  const url = `${baseUrl}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || "Drive API error");
  return data;
}

// MIME type mapping
const MIME_LABELS = {
  "application/vnd.google-apps.spreadsheet": "Google Sheet",
  "application/vnd.google-apps.document": "Google Doc",
  "application/vnd.google-apps.presentation": "Google Slides",
  "application/vnd.google-apps.folder": "Folder",
  "application/vnd.google-apps.form": "Google Form",
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  "text/csv": "CSV",
  "image/png": "Image (PNG)",
  "image/jpeg": "Image (JPEG)",
};

function getTypeLabel(mimeType) {
  return MIME_LABELS[mimeType] || mimeType.split("/").pop();
}

function formatFile(file) {
  const isFolder = file.mimeType === "application/vnd.google-apps.folder";
  const isSheet = file.mimeType === "application/vnd.google-apps.spreadsheet";
  const isDoc = file.mimeType === "application/vnd.google-apps.document";
  return {
    id: file.id,
    name: file.name,
    type: getTypeLabel(file.mimeType),
    mimeType: file.mimeType,
    isFolder,
    isSheet,
    isDoc,
    size: file.size ? `${(parseInt(file.size) / 1024).toFixed(1)} KB` : null,
    modifiedTime: file.modifiedTime,
    webViewLink: file.webViewLink,
    createdTime: file.createdTime,
    owners: file.owners?.map((o) => o.displayName) || [],
  };
}

// ─── Exported Functions ───

export async function listDriveFiles({ folder_id, max_results, file_type }) {
  const q = [];
  if (folder_id) {
    q.push(`'${folder_id}' in parents`);
  }
  q.push("trashed = false");

  // Filter by type
  if (file_type === "sheets" || file_type === "spreadsheet") {
    q.push("mimeType = 'application/vnd.google-apps.spreadsheet'");
  } else if (file_type === "docs" || file_type === "document") {
    q.push("mimeType = 'application/vnd.google-apps.document'");
  } else if (file_type === "folders") {
    q.push("mimeType = 'application/vnd.google-apps.folder'");
  } else if (file_type === "slides" || file_type === "presentation") {
    q.push("mimeType = 'application/vnd.google-apps.presentation'");
  } else if (file_type === "pdf") {
    q.push("mimeType = 'application/pdf'");
  }

  const params = new URLSearchParams({
    q: q.join(" and "),
    pageSize: String(max_results || 20),
    fields: "files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,owners)",
    orderBy: "modifiedTime desc",
  });

  const data = await driveFetch(`/files?${params}`);
  const files = (data.files || []).map(formatFile);

  return {
    files,
    count: files.length,
    message: files.length > 0
      ? `Found ${files.length} file(s) in Drive.`
      : "No files found matching that criteria.",
  };
}

export async function searchDriveFiles({ query, file_type, max_results }) {
  const q = [];
  q.push("trashed = false");

  // Name search
  if (query) {
    q.push(`name contains '${query.replace(/'/g, "\\'")}'`);
  }

  // Filter by type
  if (file_type === "sheets" || file_type === "spreadsheet") {
    q.push("mimeType = 'application/vnd.google-apps.spreadsheet'");
  } else if (file_type === "docs" || file_type === "document") {
    q.push("mimeType = 'application/vnd.google-apps.document'");
  } else if (file_type === "folders") {
    q.push("mimeType = 'application/vnd.google-apps.folder'");
  } else if (file_type === "pdf") {
    q.push("mimeType = 'application/pdf'");
  }

  const params = new URLSearchParams({
    q: q.join(" and "),
    pageSize: String(max_results || 10),
    fields: "files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,owners)",
    orderBy: "modifiedTime desc",
  });

  const data = await driveFetch(`/files?${params}`);
  const files = (data.files || []).map(formatFile);

  return {
    files,
    count: files.length,
    query,
    message: files.length > 0
      ? `Found ${files.length} file(s) matching "${query}".`
      : `No files found matching "${query}".`,
  };
}

export async function openSpreadsheetByName({ name }) {
  // Search for the spreadsheet by name
  const q = [
    "trashed = false",
    "mimeType = 'application/vnd.google-apps.spreadsheet'",
    `name contains '${name.replace(/'/g, "\\'")}'`,
  ];

  const params = new URLSearchParams({
    q: q.join(" and "),
    pageSize: "5",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink,owners)",
    orderBy: "modifiedTime desc",
  });

  const data = await driveFetch(`/files?${params}`);
  if (!data.files?.length) {
    return { success: false, message: `No spreadsheet found matching "${name}".` };
  }

  // Take the first (most recent) match
  const file = data.files[0];
  const token = await getAccessToken();

  // Read the spreadsheet data
  const sheetResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${file.id}?includeGridData=false`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const sheetMeta = await sheetResp.json();

  // Get data from first sheet
  const firstSheet = sheetMeta.sheets?.[0]?.properties?.title || "Sheet1";
  const dataResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/${encodeURIComponent(firstSheet)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const sheetData = await dataResp.json();

  const values = sheetData.values || [];
  const sheetNames = sheetMeta.sheets?.map((s) => s.properties.title) || [];

  return {
    success: true,
    spreadsheet_id: file.id,
    name: file.name,
    url: file.webViewLink,
    modifiedTime: file.modifiedTime,
    sheet_names: sheetNames,
    active_sheet: firstSheet,
    headers: values.length > 0 ? values[0] : [],
    rows: values.slice(1, 51), // Cap at 50 rows
    total_rows: Math.max(0, values.length - 1),
    message: `Opened "${file.name}" — ${sheetNames.length} sheet(s), ${values.length - 1} rows of data.`,
  };
}

export async function getDriveFileInfo({ file_id }) {
  const data = await driveFetch(
    `/files/${file_id}?fields=id,name,mimeType,size,modifiedTime,createdTime,webViewLink,owners,description,starred`
  );
  return formatFile(data);
}
