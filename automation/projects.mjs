import { statusFor } from './policy.mjs';

export const PROJECT_STATUSES = {
  backlog: ['Backlog', 'GRAY'], ready: ['Listo', 'BLUE'], doing: ['En curso', 'YELLOW'],
  review: ['En revisión', 'PURPLE'], done: ['Hecho', 'GREEN']
};

export const PROJECT_STATUS_ALIASES = {
  backlog: ['Backlog', 'Todo'], ready: ['Listo', 'Ready', 'Listo para empezar'],
  doing: ['En progreso', 'En curso', 'In progress'], review: ['En review', 'En revisión', 'In review'],
  done: ['Hecho', 'Done']
};

export function statusOption(options, status) {
  return options.find(option => PROJECT_STATUS_ALIASES[status]?.some(name => name.toLowerCase() === option.name.toLowerCase()));
}

export class ProjectSync {
  constructor(github, number) {
    this.github = github;
    this.number = Number(number);
    if (!Number.isSafeInteger(this.number) || this.number < 1) throw new Error('PROJECT_NUMBER inválido.');
  }
  async graphql(query, variables = {}) {
    const result = await this.github.request('POST', '/graphql', { query, variables });
    if (result.errors?.length) throw new Error('GitHub Projects: revisar permisos project/repo del token y número del proyecto.');
    return result.data;
  }
  async load() {
    const data = await this.graphql(`query($owner:String!,$number:Int!) {
      organization(login:$owner) { projectV2(number:$number) { id url fields(first:50) { nodes {
        ... on ProjectV2SingleSelectField { id name options { id name color description } }
      } } } }
    }`, { owner: this.github.repo.split('/')[0], number: this.number });
    this.project = data.organization?.projectV2;
    this.field = this.project?.fields.nodes.find(field => field.name === 'Status');
    if (!this.project || !this.field) throw new Error('GitHub Projects: no existe el proyecto o su campo Status.');
  }
  async sync(item) {
    if (!this.project) await this.load();
    const status = statusFor(item);
    const name = PROJECT_STATUSES[status][0];
    const option = statusOption(this.field.options, status);
    if (!option) throw new Error(`GitHub Projects: falta el estado ${name}; ejecutar setup-project.mjs.`);
    const added = await this.graphql(`mutation($project:ID!,$content:ID!) {
      addProjectV2ItemById(input:{projectId:$project,contentId:$content}) { item { id } }
    }`, { project: this.project.id, content: item.node_id });
    await this.graphql(`mutation($project:ID!,$item:ID!,$field:ID!,$option:String!) {
      updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$option}}) {
        projectV2Item { id }
      }
    }`, { project: this.project.id, item: added.addProjectV2ItemById.item.id, field: this.field.id, option: option.id });
  }
}
