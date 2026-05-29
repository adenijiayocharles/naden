export interface Snippet {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSnippetPayload {
  title: string;
  body: string;
}

export interface UpdateSnippetPayload {
  title: string;
  body: string;
}
