// 10 MB cap on an uploaded export. Enforced server-side by the upload route
// (413) and advisorily client-side by the wizard before it reads the file into
// memory. A single user's Trakt / MAL / Steam export is comfortably under this.
// Kept dependency-free so the client bundle can import the value directly.
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024
