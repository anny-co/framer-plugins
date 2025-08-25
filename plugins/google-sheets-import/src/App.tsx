import type { Collection, Field } from "framer-plugin"
import { framer, useIsAllowedTo } from "framer-plugin"
import { useCallback, useEffect, useState } from "react"
import { type CSVRecord, importCSV, parseCSV, processRecords } from "./csv"
import { extractSpreadsheetId, fetchSheetCSV, toSnakeCase } from "./googleSheets"
import "./App.css"

interface Props {
    collection: Collection
}

type Mapping = Record<string, string>

export function App({ collection }: Props) {
    const isAllowedToAddItems = useIsAllowedTo("Collection.addItems")

    const [url, setUrl] = useState("")
    const [records, setRecords] = useState<CSVRecord[] | null>(null)
    const [columns, setColumns] = useState<string[]>([])
    const [fields, setFields] = useState<Field[]>([])
    const [mapping, setMapping] = useState<Mapping>({})
    const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        void framer.showUI({ width: 320, height: 340, resizable: false })
    }, [])

    useEffect(() => {
        void (async () => {
            const saved = await framer.getPluginData(`gs-url-${collection.id}`)
            if (saved) setUrl(saved)
            const fs = await collection.getFields()
            setFields(fs)
        })()
    }, [collection])

    const loadSheet = useCallback(async () => {
        setLoading(true)
        try {
            const csv = await fetchSheetCSV(url)
            const recs = await parseCSV(csv)
            const firstRecord = recs[0]
            if (!firstRecord) {
                throw new Error("No rows found in Google Sheet")
            }
            const headers = Object.keys(firstRecord)
            setRecords(recs)
            setColumns(headers)
            const id = extractSpreadsheetId(url)
            setSpreadsheetId(id)
            const savedMapping = id ? await framer.getPluginData(`gs-mapping-${collection.id}-${id}`) : null
            const initial: Mapping = {}
            let saved: Mapping | null = null
            if (savedMapping) {
                try {
                    saved = JSON.parse(savedMapping) as Mapping
                } catch {
                    // ignore JSON parse errors
                }
            }
            for (const field of fields) {
                const match = headers.find(h => toSnakeCase(h) === toSnakeCase(field.name))
                initial[field.name] = saved?.[field.name] ?? match ?? ""
            }
            setMapping(initial)
            await framer.setPluginData(`gs-url-${collection.id}`, url)
        } catch (e) {
            console.error(e)
            void framer.closePlugin("Failed to load Google Sheet", { variant: "error" })
        } finally {
            setLoading(false)
        }
    }, [collection.id, fields, url])

    const onImport = useCallback(async () => {
        if (!records) return
        try {
            const mappingByColumn: Record<string, string> = {}
            for (const field of fields) {
                const col = mapping[field.name]
                if (col) mappingByColumn[col] = field.name
            }
            const mappedRecords: CSVRecord[] = records.map(record => {
                const newRecord: CSVRecord = {}
                for (const [col, value] of Object.entries(record)) {
                    const fieldName = mappingByColumn[col]
                    if (fieldName) {
                        newRecord[fieldName] = value
                    }
                }
                return newRecord
            })
            const result = await processRecords(collection, mappedRecords)
            result.items = result.items.filter(item => item.action === "add").map(item => ({ ...item, draft: true }))
            if (spreadsheetId) {
                await framer.setPluginData(`gs-mapping-${collection.id}-${spreadsheetId}`, JSON.stringify(mapping))
            }
            await importCSV(collection, result)
        } catch (e) {
            console.error(e)
            void framer.closePlugin("Failed to import items", { variant: "error" })
        }
    }, [collection, fields, mapping, records, spreadsheetId])

    const mappingFields = fields

    if (!records) {
        return (
            <form
                onSubmit={e => {
                    e.preventDefault()
                    void loadSheet()
                }}
                className="gs-form"
            >
                <label htmlFor="url">Google Sheets URL</label>
                <input
                    id="url"
                    type="url"
                    value={url}
                    onChange={e => {
                        setUrl(e.currentTarget.value)
                    }}
                    required
                />
                <button type="submit" className="framer-button-primary" disabled={!isAllowedToAddItems || loading}>
                    {loading ? "Loading…" : "Load"}
                </button>
            </form>
        )
    }

    return (
        <form
            onSubmit={e => {
                e.preventDefault()
                void onImport()
            }}
            className="gs-mapping"
        >
            <div className="content">
                {mappingFields.map(field => (
                    <div key={field.id} className="row">
                        <label>{field.name}</label>
                        <select
                            value={mapping[field.name]}
                            onChange={e => {
                                setMapping(m => ({ ...m, [field.name]: e.currentTarget.value }))
                            }}
                        >
                            <option value="">None</option>
                            {columns.map(col => (
                                <option key={col} value={col}>
                                    {col}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>
            <div className="actions">
                <button type="submit" className="framer-button-primary" disabled={!isAllowedToAddItems}>
                    Import
                </button>
            </div>
        </form>
    )
}
