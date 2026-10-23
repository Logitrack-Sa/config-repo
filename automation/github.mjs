export class GitHub {
  constructor({ token = process.env.GH_TOKEN, repo = process.env.GITHUB_REPOSITORY,
    fetchImpl = fetch } = {}) {
    if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo || '')) {
      throw new Error('Faltan GH_TOKEN o GITHUB_REPOSITORY válidos.');
    }
    this.token = token;
    this.repo = repo;
    this.fetch = fetchImpl;
    this.changedStatuses = new Set();
  }

  async request(method, path, data) {
    if (!path.startsWith('/')) throw new Error('La ruta debe ser relativa a GitHub.');
    const response = await this.fetch(`https://api.github.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) {
      // No registrar tokens, prompts completos ni cuerpos de respuesta arbitrarios.
      throw new Error(`GitHub ${method} ${path.split('?')[0]}: HTTP ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  }

  path(suffix) { return `/repos/${this.repo}${suffix}`; }
  get(suffix) { return this.request('GET', this.path(suffix)); }
  post(suffix, data) { return this.request('POST', this.path(suffix), data); }
  patch(suffix, data) { return this.request('PATCH', this.path(suffix), data); }

  async all(suffix, maxPages = 10) {
    const result = [];
    for (let page = 1; page <= maxPages; page++) {
      const data = await this.get(`${suffix}${suffix.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      result.push(...data);
      if (data.length < 100) return result;
    }
    throw new Error('Se alcanzó el límite de paginación; se requiere dividir la consulta.');
  }

  async replaceLabels(number, prefix, labels) {
    const issue = await this.get(`/issues/${number}`);
    const kept = issue.labels.map(label => label.name).filter(name => !name.startsWith(prefix));
    await this.request('PUT', this.path(`/issues/${number}/labels`), { labels: [...new Set([...kept, ...labels])] });
    if (prefix === 'status:') this.changedStatuses.add(number);
  }

  async addLabels(number, labels) {
    await this.post(`/issues/${number}/labels`, { labels });
  }

  async comment(number, marker, body) {
    const comments = await this.all(`/issues/${number}/comments`);
    const existing = comments.find(item => item.user.login === 'github-actions[bot]' && item.body.includes(marker));
    const data = { body: `${marker}\n${body}` };
    if (existing) return this.patch(`/issues/comments/${existing.id}`, data);
    return this.post(`/issues/${number}/comments`, data);
  }
}
