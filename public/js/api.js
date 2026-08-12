const Api = (() => {
  async function request(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Erro ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body || {}),
    put: (url, body) => request('PUT', url, body || {}),
    del: (url) => request('DELETE', url)
  };
})();

function toast(message, kind) {
  let host = document.querySelector('.toast');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast';
    document.body.appendChild(host);
  }
  const item = document.createElement('div');
  item.className = 'toast-item' + (kind === 'error' ? ' error' : '');
  item.textContent = message;
  host.appendChild(item);
  setTimeout(() => item.remove(), 4200);
}

function centavosToBRL(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}
