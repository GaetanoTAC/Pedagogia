// Client per le API JSON del server.

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Connessione assente. Controlla la rete e riprova.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Si è verificato un errore.', res.status, data.fields);
  return data;
}

/** Invio "best effort" durante la chiusura della pagina. */
export function beacon(path, body) {
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  if (!navigator.sendBeacon?.(`/api${path}`, blob)) {
    fetch(`/api${path}`, { method: 'POST', keepalive: true, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  }
}

/** Caricamento file con avanzamento (XHR, perché fetch non espone l'upload progress). */
export function uploadFile(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* risposta non JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(data.error || 'Caricamento non riuscito.', xhr.status));
    };
    xhr.onerror = () => reject(new ApiError('Connessione interrotta durante il caricamento.', 0));
    xhr.send(formData);
  });
}
