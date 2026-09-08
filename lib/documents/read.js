// Client-side helper for reading a document with the vision model.
//
// Two calls, one for each moment the form might read a scan:
//
//   readFileFields(file)         a File the person just picked, not yet
//                                uploaded. Base64 goes over the wire and
//                                nothing is written to Storage on this path.
//
//   readStoredFields(storagePath) an already-uploaded file, read back through
//                                the same session-bound download the viewer
//                                uses.
//
// Both resolve with the parsed fields, or throw with a short message the form
// can show. Anything the caller does with the returned fields is its own
// decision; nothing is persisted from this file.

async function post(body, signal) {
  const res = await fetch("/api/documents/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    throw new Error(payload?.error || "That scan could not be read.");
  }
  const fields = payload?.fields;
  if (!fields || typeof fields !== "object") {
    throw new Error("The reader returned nothing.");
  }
  return fields;
}

export async function readStoredFields(storagePath, { signal } = {}) {
  if (!storagePath) throw new Error("Missing document path.");
  return post({ path: storagePath }, signal);
}

export async function readFileFields(file, { signal } = {}) {
  if (!file) throw new Error("Missing file.");
  const data = await fileToBase64(file);
  return post({ data, mime: file.type || "application/octet-stream" }, signal);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const result = String(reader.result || "");
      // FileReader returns a data URL: strip the "data:mime;base64," prefix.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
