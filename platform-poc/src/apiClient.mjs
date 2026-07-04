// Central API client — the single place that knows how to call the mlytics
// public v2 edge. Replaces bulldozer's 15+ duplicated fetch blocks.
//
// Auth model (from investigation): per-tenant `apikey` header via Kong key-auth,
// with the tenant's organizationId threaded into the request. Non-interactive,
// org-scoped, correct ACL group — no portal login / captcha.

export class MlyticsApiClient {
  /**
   * @param {object} cfg
   * @param {string} cfg.baseUrl   e.g. https://openapi2.mlytics.com/api
   * @param {string} cfg.apiKey    tenant API key (Kong key-auth consumer)
   * @param {string} [cfg.organizationId] tenant scoping id
   * @param {number} [cfg.timeoutMs]
   * @param {number} [cfg.retries]
   * @param {(e:object)=>void} [cfg.log]
   */
  constructor(cfg) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, "");
    this.apiKey = cfg.apiKey;
    this.organizationId = cfg.organizationId ?? null;
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
    this.retries = cfg.retries ?? 2;
    this.log = cfg.log ?? (() => {});
  }

  // Fill :params in the path template from args, return [url, leftoverArgs].
  #buildPath(apiVersion, template, args) {
    const used = new Set();
    const path = template.replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
      used.add(name);
      return encodeURIComponent(args[name]);
    });
    const query = {};
    for (const [k, v] of Object.entries(args))
      if (!used.has(k) && k !== "body") query[k] = v;
    const qs = new URLSearchParams(query).toString();
    return `${this.baseUrl}/${apiVersion}${path}${qs ? `?${qs}` : ""}`;
  }

  async call(meta, args = {}) {
    const url = this.#buildPath(meta.apiVersion, meta.pathTemplate, args);
    const headers = {
      apikey: this.apiKey,
      "Content-Type": "application/json",
      ...(this.organizationId ? { "X-Organization-Id": String(this.organizationId) } : {}),
    };
    const init = { method: meta.method, headers };
    if (args.body !== undefined) init.body = JSON.stringify(args.body);

    let lastErr;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const ctrl = AbortSignal.timeout(this.timeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: ctrl });
        const text = await res.text();
        const json = text ? safeJson(text) : null;
        this.log({ event: "api.call", method: meta.method, url, status: res.status, attempt });
        if (res.status === 401 || res.status === 403)
          throw new ApiError(`auth rejected (${res.status}) — check tenant apikey / ACL scope ${JSON.stringify(meta.aclScopes)}`, res.status, json);
        if (res.status >= 500 && attempt < this.retries) { lastErr = new ApiError(`upstream ${res.status}`, res.status, json); await backoff(attempt); continue; }
        if (!res.ok) throw new ApiError(`request failed (${res.status})`, res.status, json);
        return json;
      } catch (e) {
        if (e instanceof ApiError && e.status && e.status < 500) throw e;
        lastErr = e;
        if (attempt < this.retries) { await backoff(attempt); continue; }
      }
    }
    throw lastErr;
  }
}

export class ApiError extends Error {
  constructor(msg, status, body) { super(msg); this.name = "ApiError"; this.status = status; this.body = body; }
}
const safeJson = (t) => { try { return JSON.parse(t); } catch { return { raw: t }; } };
const backoff = (n) => new Promise((r) => setTimeout(r, 2 ** n * 250));
