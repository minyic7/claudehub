export interface Project {
  id: string;
  name: string;
  githubUrl: string;
  owner: string;
  repo: string;
  githubToken: string;
  baseBranch: string;
  webhookId?: string;
  webhookSecret: string;
  createdAt: string;
}

export interface CreateProjectInput {
  githubUrl: string;
  name?: string;
  githubToken: string;
  baseBranch: string;
}

export interface UpdateProjectInput {
  name?: string;
  githubToken?: string;
}
