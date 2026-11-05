export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLES = `
:root { color-scheme: light dark; --bg:#f3f5f9; --card:#ffffff; --text:#14213d; --muted:#5b6475; --brand:#0b3d91;
  --brand-text:#ffffff; --border:#d7dce5; --error-bg:#fdecec; --error:#b42318; --warn-bg:#fff6e0; --warn:#8a5a00; }
@media (prefers-color-scheme: dark) { :root { --bg:#0e1420; --card:#172033; --text:#e8edf7; --muted:#9aa5b8;
  --brand:#4d8dff; --brand-text:#0e1420; --border:#2a3550; --error-bg:#3a1717; --error:#ff8a80; --warn-bg:#3a2e12; --warn:#ffd27a; } }
* { box-sizing: border-box; }
body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:16px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:var(--bg); color:var(--text); }
main { width:100%; max-width:420px; background:var(--card); border:1px solid var(--border); border-radius:16px; padding:28px 22px; }
h1 { font-size:1.35rem; margin:0 0 4px; }
p { line-height:1.5; }
.muted { color:var(--muted); font-size:.92rem; margin-top:0; }
.badge { display:inline-block; font-size:.75rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
  color:var(--brand); margin-bottom:12px; }
label { display:block; font-weight:600; font-size:.9rem; margin:16px 0 6px; }
input { width:100%; font-size:1rem; padding:12px 14px; border-radius:10px; border:1px solid var(--border);
  background:transparent; color:inherit; }
button, .button { display:block; width:100%; margin-top:22px; padding:14px; border:0; border-radius:10px; font-size:1rem;
  font-weight:700; background:var(--brand); color:var(--brand-text); text-align:center; text-decoration:none; cursor:pointer; }
.alert { padding:12px 14px; border-radius:10px; background:var(--error-bg); color:var(--error); font-size:.92rem; margin:12px 0 0; }
.warn { padding:12px 14px; border-radius:10px; background:var(--warn-bg); color:var(--warn); font-size:.88rem; }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; word-break:break-all; }
.secret { font-size:1.4rem; letter-spacing:.12em; text-align:center; margin:8px 0; }
.qr { display:block; margin:16px auto; width:240px; height:240px; background:#fff; padding:12px; border-radius:12px; }
footer { margin-top:18px; font-size:.78rem; color:var(--muted); text-align:center; }
`;

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}
