export function extractSpreadsheetId(url: string): string | null {
    const match = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url)
    return match ? (match[1] ?? null) : null
}

export async function fetchSheetCSV(url: string): Promise<string> {
    const id = extractSpreadsheetId(url)
    if (!id) throw new Error("Invalid Google Sheets URL")
    const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
    const res = await fetch(csvUrl)
    if (!res.ok) throw new Error("Failed to fetch Google Sheet")
    return res.text()
}

export function toSnakeCase(str: string): string {
    return str
        .replace(/\s+/g, "_")
        .replace(/-/g, "_")
        .replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
        .replace(/__+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase()
}
