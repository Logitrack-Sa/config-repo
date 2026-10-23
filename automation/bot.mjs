import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { GitHub } from './github.mjs';
import { askModel } from './model.mjs';
import { ProjectSync } from './projects.mjs';
import { STATUSES, TRUSTED, LABELS, command, validateReview,
  closingNumbers, statusFor, markdown } from './policy.mjs';

const root = new URL('../', import.meta.url);
const prompt = name => readFile(new URL(`.github/prompts/${name}.md`, root), 'utf8');
const bullets = list => list.length ? list.map(item => `- ${markdown(item)}`).join('\n') : '- Ninguna.';
const runUrl = () => `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;

export async function reviewPull(github, number, ask = askModel) {
  const pull = await github.get(`/pulls/${number}`);
  if (pull.state !== 'open' || pull.draft) return;
  const sha = pull.head.sha;
  await github.post(`/statuses/${sha}`, { state: 'pending', context: 'AI / review',
    description: 'La IA está analizando el cambio.', target_url: runUrl() });
  try {
    const allFiles = await github.all(`/pulls/${number}/files`);
    let remaining = 28000;
    const files = allFiles.slice(0, 40).map(file => {
      const patch = (file.patch || '').slice(0, Math.max(0, remaining));
      remaining -= patch.length;
      return { filename: file.filename, status: file.status, additions: file.additions,
        deletions: file.deletions, patch, truncated: !file.patch || patch.length < file.patch.length };
    });
    const checks = await github.get(`/commits/${sha}/check-runs`);
    const linked = [];
    for (const linkedNumber of closingNumbers(pull.body || '', github.repo).slice(0, 10)) {
      const issue = await github.get(`/issues/${linkedNumber}`);
      if (!issue.pull_request) linked.push({ number: linkedNumber, title: issue.title, body: (issue.body || '').slice(0, 3000) });
    }
    const review = validateReview(await ask(await prompt('reviewer'), {
      title: pull.title.slice(0, 500), body: (pull.body || '').slice(0, 6000), sha,
      files, linkedIssues: linked, totalFiles: allFiles.length, checks: (checks.check_runs || []).map(c => ({name:c.name,status:c.status,conclusion:c.conclusion}))
    }), files);
    // Una revisión del commit anterior nunca debe representar al último commit.
    const current = await github.get(`/pulls/${number}`);
    if (current.head.sha !== sha || current.state !== 'open') {
      await github.post(`/statuses/${sha}`, { state: 'error', context: 'AI / review',
        description: 'Revisión descartada: la pull request cambió durante el análisis.' });
      return;
    }
    const high = review.findings.some(item => item.severity === 'high');
    const incomplete = !allFiles.length || allFiles.length > files.length || files.some(file => file.truncated);
    const findings = review.findings.length ? review.findings.map(item => {
      const link = `${pull.html_url}/files`;
      return `- **${item.severity.toUpperCase()}** · [${markdown(item.path)}:${item.line}](${link})\n` +
        `  ${markdown(item.problem)}\n  **Propuesta:** ${markdown(item.suggestion)}`;
    }).join('\n\n') : 'No se encontraron problemas concretos en el material analizado.';
    await github.comment(number, '<!-- ai-code-review -->',
      `## Revisión de código por IA\n\n**Commit:** \`${sha}\`\n\n${markdown(review.summary)}\n\n` +
      `### Hallazgos\n${findings}\n\n### Pruebas recomendadas\n${bullets(review.tests)}\n\n` +
      `**Cobertura:** ${files.length}/${allFiles.length} archivos; ${incomplete ? 'análisis parcial (diff ausente o truncado)' : 'diffs disponibles incluidos'}.\n\n` +
      `Esta revisión no ejecuta pruebas ni sustituye la aprobación humana. [Ejecución](${runUrl()}).`);
    await github.replaceLabels(number, 'ai:', [high ? 'ai:changes-requested' : 'ai:reviewed']);
    await github.post(`/statuses/${sha}`, { state: high || incomplete ? 'failure' : 'success', context: 'AI / review',
      description: incomplete ? 'Cobertura parcial: requiere revisión humana.' : high ? 'La IA encontró problemas de severidad alta.' : 'Análisis completado; revisar comentario de IA.', target_url: runUrl() });
    return review;
  } catch (error) {
    await github.post(`/statuses/${sha}`, { state: 'error', context: 'AI / review',
      description: 'No se completó la revisión. Ver comentario de configuración.', target_url: runUrl() });
    throw error;
  }
}

export async function syncPull(github, number) {
  const pull = await github.get(`/pulls/${number}`);
  await github.replaceLabels(number, 'status:', [`status:${pull.state === 'closed' ? (pull.merged ? 'done' : 'ready') : pull.draft ? 'doing' : 'review'}`]);
  for (const linkedNumber of closingNumbers(pull.body || '', github.repo).slice(0, 20)) {
    const issue = await github.get(`/issues/${linkedNumber}`);
    if (issue.pull_request) continue;
    let status = issue.state === 'closed' ? 'done' : pull.state === 'open' ? (pull.draft ? 'doing' : 'review') : 'doing';
    if (pull.state === 'closed' && issue.state === 'open') {
      const open = await github.all('/pulls?state=open');
      if (open.some(other => closingNumbers(other.body || '', github.repo).includes(linkedNumber))) status = 'review';
    }
    await github.replaceLabels(linkedNumber, 'status:', [`status:${status}`]);
  }
}

export async function runBot({ github, event, eventName, ask = askModel }) {
  const number = event.issue?.number || event.pull_request?.number || Number(event.inputs?.number);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Número de issue/PR inválido.');
  console.log(`Evento de revisión: ${eventName}; acción: ${event.action || 'manual'}; número: ${number}`);
  let review = false;
  if (eventName === 'issue_comment') {
    if (event.comment?.user?.type === 'Bot' || !TRUSTED.includes(event.comment?.author_association)) return;
    const parsed = command(event.comment?.body);
    if (!parsed) return;
    if (parsed[0] === 'status') {
      const item = await github.get(`/issues/${number}`);
      if (item.pull_request || item.state !== 'open') return;
      await github.replaceLabels(number, 'status:', [`status:${parsed[1]}`]);
      return;
    }
    if (!event.issue.pull_request) return;
    review = true;
  } else if (eventName === 'issues') {
    const item = await github.get(`/issues/${number}`);
    // No generar planes ni llamar al modelo por abrir/editar issues.
    const current = statusFor(item);
    await github.replaceLabels(number, 'status:', [`status:${item.state === 'closed' ? (item.state_reason === 'not_planned' ? 'backlog' : 'done') : current === 'done' ? 'backlog' : current}`]);
    return;
  } else if (eventName === 'pull_request_target') {
    const pull = await github.get(`/pulls/${number}`);
    console.log(`Asociación visible del autor: ${pull.author_association}`);
    if (!TRUSTED.includes(pull.author_association) && !TRUSTED.includes(event.pull_request?.author_association)) {
      let permission;
      try { permission = (await github.get(`/collaborators/${encodeURIComponent(pull.user?.login || '')}/permission`)).permission; } catch {}
      if (!['admin','maintain','write'].includes(permission)) { console.log('Revisión omitida: autor sin permiso de escritura verificado.'); return; }
    }
    await syncPull(github, number);
    review = ['opened','reopened','synchronize','ready_for_review','edited'].includes(event.action);
  } else if (eventName === 'workflow_dispatch') {
    const item = await github.get(`/issues/${number}`);
    if (!item.pull_request) throw new Error('La revisión manual requiere un PR.');
    review = true;
  }
  if (!review) return;
  try {
    await syncPull(github, number);
    return await reviewPull(github, number, ask);
  } catch (error) {
    console.error(error.message); // Mensajes sanitizados por GitHub/model, nunca stderr/prompt/token.
    await github.replaceLabels(number, 'ai:', ['ai:unavailable']);
    await github.comment(number, '<!-- ai-configuration -->',
      '## Revisión IA no disponible\n\nNo se completó el análisis; no equivale a una aprobación. Revisar acceso Copilot/políticas de la organización o secreto COPILOT_GITHUB_TOKEN. ' +
      `Consultar [ejecución](${runUrl()}) y [workflow](https://github.com/Logitrack-Sa/shipment-service/blob/main/docs/sprint2/WORKFLOW.md). No pegar tokens en issues. Comentar \`/review\` para reintentar.`);
    throw new Error('No se completó la revisión IA; configuración o respuesta inválida.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let github;
  try {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    github = new GitHub();
    await runBot({ github, event, eventName: process.env.GITHUB_EVENT_NAME });
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  } finally {
    if (github && github.changedStatuses.size) {
      if (!process.env.PROJECT_TOKEN) {
        console.log('Etiquetas actualizadas. El flujo normal del tablero usa automatizaciones nativas; /review status solo mueve tarjetas si se configura PROJECT_TOKEN.');
      } else {
        try {
          const projects = new ProjectSync(new GitHub({ token: process.env.PROJECT_TOKEN }), process.env.PROJECT_NUMBER || '2');
          for (const number of github.changedStatuses) {
            const item = await github.get(`/issues/${number}`);
            // El tablero muestra tareas, no duplica PR como tarjetas de trabajo.
            if (!item.pull_request && item.labels.some(l => l.name === 'sprint:2')) await projects.sync(item);
          }
          console.log('GitHub Projects sincronizado.');
        } catch { console.error('No se pudo sincronizar GitHub Projects; revisar permiso del PROJECT_TOKEN.'); process.exitCode = 1; }
      }
    }
  }
}
