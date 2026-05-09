export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number | null;
  permissions: number | null;
}

export interface DirListing {
  path: string;
  entries: FileEntry[];
}
