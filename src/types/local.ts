export interface LocalFileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number | null;
  permissions: number;
}
