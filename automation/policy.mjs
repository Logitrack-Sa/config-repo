export const STATUSES = ['backlog', 'ready', 'doing', 'review', 'done'];
export const TRUSTED = ['OWNER', 'MEMBER', 'COLLABORATOR'];
export const LABELS = {
  'status:backlog': ['64748b', 'Pendiente de análisis o planificación'],
  'status:ready': ['2563eb', 'Lista para comenzar'],
  'status:doing': ['d97706', 'Implementación en curso'],
  'status:review': ['7c3aed', 'Pull request abierta para revisión'],
  'status:done': ['059669', 'Issue o pull request cerrada'],
  'type:bug': ['dc2626', 'Corrección de un error'],
  'type:feature': ['0891b2', 'Nueva funcionalidad'],
  'type:chore': ['64748b', 'Mantenimiento'],
  'type:docs': ['0284c7', 'Documentación'],
  'priority:high': ['dc2626', 'Prioridad alta sugerida por el PM'],
  'priority:medium': ['d97706', 'Prioridad media sugerida por el PM'],
  'priority:low': ['059669', 'Prioridad baja sugerida por el PM'],
  
  'ai:reviewed': ['0d9488', 'La IA revisó el último commit'],
  'ai:changes-requested': ['dc2626', 'La IA encontró problemas de severidad alta'],
  'ai:unavailable': ['b91c1c', 'No se pudo completar la consulta a la IA'],
  'blocked': ['b91c1c', 'Requiere intervención humana'],
  'demo': ['d946ef', 'Ejemplo para comprobar el flujo']
};

export function command(body = '') {
  const match = body.trim().match(/^\/review(?:\s+(status)\s+(backlog|ready|doing|review))?\s*$/i);
  return match ? (match[1] ? ['status', match[2].toLowerCase()] : ['review']) : null;
}

export function text(value, limit = 3000) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('La IA devolvió texto vacío o inválido.');
  return value.trim().slice(0, limit);
}

function list(value, limit = 10) {
  if (!Array.isArray(value) || value.length > limit) throw new Error('La IA devolvió una lista inválida.');
  return value.map(item => text(item, 1600));
}

export function validateReview(value, files) {
  if (!Array.isArray(value?.findings) || value.findings.length > 12) throw new Error('Hallazgos inválidos.');
  const paths = new Set(files.map(file => file.filename));
  return {
    summary: text(value.summary), tests: list(value.tests),
    findings: value.findings.map(item => {
      if (!['high', 'medium', 'low'].includes(item.severity)) throw new Error('Severidad inválida.');
      if (!paths.has(item.path) || !Number.isInteger(item.line) || item.line < 1) {
        throw new Error('El hallazgo referencia un archivo o línea inválidos.');
      }
      return { severity: item.severity, path: item.path, line: item.line,
        problem: text(item.problem), suggestion: text(item.suggestion) };
    })
  };
}

/** Referencias de cierre del repo actual, incluidos enlaces completos. */
export function closingNumbers(body = '', repo) {
  const references = [...body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:(https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/)(\d+)|(?:([\w.-]+\/[\w.-]+))?#(\d+))/gi)];
  return [...new Set(references.filter(m => !(m[2] || m[4]) || (m[2] || m[4]).toLowerCase() === repo.toLowerCase()).map(m => Number(m[3] || m[5])))];
}

export function statusFor(item) {
  if (item.state === 'closed') return 'done';
  const names = item.labels.map(label => typeof label === 'string' ? label : label.name);
  return STATUSES.find(status => names.includes(`status:${status}`)) || 'backlog';
}

/** Escapa texto del modelo; preserva spans de código que GitHub renderiza literalmente. */
export function markdown(value) {
  const escape = part => part.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/@/g, '@\u200b');
  let output = '', position = 0;
  const runs = [...value.matchAll(/`+/g)];
  for (let index = 0; index < runs.length; index++) {
    const opening = runs[index];
    const closingIndex = runs.findIndex((run, candidate) => candidate > index && run[0].length === opening[0].length);
    if (closingIndex < 0) break;
    const closing = runs[closingIndex];
    output += escape(value.slice(position, opening.index));
    output += value.slice(opening.index, closing.index + closing[0].length);
    position = closing.index + closing[0].length;
    index = closingIndex;
  }
  return output + escape(value.slice(position));
}
